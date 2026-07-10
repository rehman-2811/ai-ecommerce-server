// src/controllers/vton.controller.js
const { prisma } = require('../config/database');
const { fashnService } = require('../services/fashn.service');
const { uploadBuffer } = require('../config/cloudinary');
const { logger } = require('../utils/logger');

// @desc    Submit try-on job
// @route   POST /api/vton/try-on
const submitTryOn = async (req, res) => {
  try {
    const { productId } = req.body;
    const userImageFile = req.file;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    if (!userImageFile) {
      return res.status(400).json({ success: false, message: 'User image is required' });
    }

    // Get product
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, garmentImageUrl: true }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    if (!product.garmentImageUrl) {
      return res.status(400).json({ success: false, message: 'Product does not support virtual try-on' });
    }

    // Upload user image to Cloudinary
    const uploadResult = await uploadBuffer(userImageFile.buffer, userImageFile.mimetype, 'tryon/users');
    const userImageUrl = uploadResult.secure_url;

    // Create try-on session
    const session = await prisma.tryOnSession.create({
      data: {
        userId: req.user.id,
        productId,
        userImageUrl,
        status: 'PROCESSING'
      }
    });

    // Submit to Colab (async)
    processTryOn(session.id, userImageUrl, product.garmentImageUrl);

    // Track interaction
    await prisma.interaction.create({
      data: { userId: req.user.id, productId, type: 'TRY_ON', weight: 5 }
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Try-on submitted successfully',
      sessionId: session.id,
      status: 'PROCESSING'
    });
  } catch (error) {
    logger.error('VTON submit error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit try-on' });
  }
};

// Background processing function
const processTryOn = async (sessionId, userImageUrl, garmentImageUrl) => {
  const startTime = Date.now();
  let retries = 0;

  while (retries < 3) {
    try {
      const result = await fashnService.submitTryOn(userImageUrl, garmentImageUrl);
      
      const processingTime = Math.round((Date.now() - startTime) / 1000);

      await prisma.tryOnSession.update({
        where: { id: sessionId },
        data: {
          resultImageUrl: result.resultImageUrl,
          jobId: result.jobId,
          status: 'COMPLETED',
          processingTime
        }
      });

      logger.info(`Try-on ${sessionId} completed in ${processingTime}s`);
      return;
    } catch (error) {
      retries++;
      logger.warn(`Try-on attempt ${retries} failed for ${sessionId}:`, error.message);
      if (retries >= 3) {
        await prisma.tryOnSession.update({
          where: { id: sessionId },
          data: { status: 'FAILED', errorMessage: error.message }
        });
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000 * retries));
      }
    }
  }
};

// @desc    Get try-on status
// @route   GET /api/vton/status/:sessionId
const getStatus = async (req, res) => {
  try {
    const session = await prisma.tryOnSession.findFirst({
      where: { id: req.params.sessionId, userId: req.user.id },
      include: {
        product: { select: { name: true, images: true } }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get status' });
  }
};

// @desc    Get try-on result
// @route   GET /api/vton/result/:sessionId
const getResult = async (req, res) => {
  try {
    const session = await prisma.tryOnSession.findFirst({
      where: { id: req.params.sessionId, userId: req.user.id },
      include: {
        product: { select: { id: true, name: true, price: true, images: true, category: true } }
      }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get result' });
  }
};

// @desc    Submit feedback (like/dislike)
// @route   POST /api/vton/feedback/:sessionId
const submitFeedback = async (req, res) => {
  try {
    const { liked } = req.body;
    const { sessionId } = req.params;

    const session = await prisma.tryOnSession.findFirst({
      where: { id: sessionId, userId: req.user.id }
    });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    await prisma.tryOnSession.update({
      where: { id: sessionId },
      data: { liked }
    });

    // If liked, create a LIKE interaction for recommendations
    if (liked) {
      await prisma.interaction.create({
        data: { userId: req.user.id, productId: session.productId, type: 'LIKE', weight: 7 }
      }).catch(() => {});

      // Increment product popularity
      await prisma.product.update({
        where: { id: session.productId },
        data: { popularity: { increment: 3 } }
      });
    }

    res.json({ success: true, message: 'Feedback recorded' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  }
};

// @desc    Get try-on history
// @route   GET /api/vton/history
const getHistory = async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [sessions, total] = await Promise.all([
      prisma.tryOnSession.findMany({
        where: { userId: req.user.id },
        include: {
          product: { select: { id: true, name: true, price: true, images: true, category: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip, take: parseInt(limit)
      }),
      prisma.tryOnSession.count({ where: { userId: req.user.id } })
    ]);

    res.json({ success: true, sessions, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get history' });
  }
};

module.exports = { submitTryOn, getStatus, getResult, submitFeedback, getHistory };
