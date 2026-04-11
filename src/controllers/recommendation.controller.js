// src/controllers/recommendation.controller.js
const { prisma } = require('../config/database');
const { getCache, setCache } = require('../config/redis');
const { logger } = require('../utils/logger');

// Hybrid recommendation: collaborative filtering + content-based
const getPersonalized = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 8 } = req.query;

    const cacheKey = `recommendations:personalized:${userId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    // Get user interactions
    const interactions = await prisma.interaction.findMany({
      where: { userId },
      include: { product: { select: { category: true, tags: true, subCategory: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    if (interactions.length === 0) {
      // Cold start: return trending products
      return getTrending(req, res);
    }

    // Build user preference profile
    const categoryWeights = {};
    const tagWeights = {};

    for (const interaction of interactions) {
      const weight = interaction.weight;
      const cat = interaction.product.category;
      categoryWeights[cat] = (categoryWeights[cat] || 0) + weight;
      for (const tag of interaction.product.tags) {
        tagWeights[tag] = (tagWeights[tag] || 0) + weight;
      }
    }

    // Get top categories and tags
    const topCategories = Object.entries(categoryWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);

    const topTags = Object.entries(tagWeights)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // Get already interacted product IDs
    const interactedProductIds = [...new Set(interactions.map(i => i.productId))];

    // Fetch recommended products
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { notIn: interactedProductIds },
        OR: [
          { category: { in: topCategories } },
          { tags: { hasSome: topTags } }
        ]
      },
      orderBy: [{ popularity: 'desc' }, { rating: 'desc' }],
      take: parseInt(limit),
      select: {
        id: true, name: true, price: true, comparePrice: true,
        category: true, images: true, rating: true, stock: true,
        garmentImageUrl: true, tags: true
      }
    });

    const result = { success: true, products, type: 'personalized' };
    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (error) {
    logger.error('Personalized recommendation error:', error);
    res.status(500).json({ success: false, message: 'Failed to get recommendations' });
  }
};

// Similar products (content-based)
const getSimilar = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 6 } = req.query;

    const cacheKey = `recommendations:similar:${productId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { category: true, subCategory: true, tags: true, brand: true, price: true }
    });

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const priceRange = product.price * 0.4;

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { not: productId },
        OR: [
          { category: product.category, subCategory: product.subCategory },
          { tags: { hasSome: product.tags } },
          { brand: product.brand }
        ],
        price: {
          gte: product.price - priceRange,
          lte: product.price + priceRange
        }
      },
      orderBy: { rating: 'desc' },
      take: parseInt(limit),
      select: {
        id: true, name: true, price: true, comparePrice: true,
        category: true, images: true, rating: true, stock: true, garmentImageUrl: true
      }
    });

    const result = { success: true, products };
    await setCache(cacheKey, result, 600);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get similar products' });
  }
};

// Try-on based recommendations
const getTryOnBased = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 6 } = req.query;

    // Get liked try-on sessions
    const likedSessions = await prisma.tryOnSession.findMany({
      where: { userId, liked: true },
      include: {
        product: { select: { category: true, tags: true, subCategory: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (likedSessions.length === 0) {
      return res.json({ success: true, products: [], message: 'No liked try-ons yet' });
    }

    const categories = [...new Set(likedSessions.map(s => s.product.category))];
    const tags = [...new Set(likedSessions.flatMap(s => s.product.tags))];
    const triedProductIds = likedSessions.map(s => s.productId);

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { notIn: triedProductIds },
        OR: [
          { category: { in: categories } },
          { tags: { hasSome: tags } }
        ]
      },
      orderBy: { popularity: 'desc' },
      take: parseInt(limit),
      select: {
        id: true, name: true, price: true, comparePrice: true,
        category: true, images: true, rating: true, stock: true, garmentImageUrl: true
      }
    });

    res.json({ success: true, products, type: 'try-on-based' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get try-on recommendations' });
  }
};

// Trending products
const getTrending = async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const cacheKey = `recommendations:trending:${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const products = await prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0 } },
      orderBy: [{ popularity: 'desc' }, { rating: 'desc' }],
      take: parseInt(limit),
      select: {
        id: true, name: true, price: true, comparePrice: true,
        category: true, images: true, rating: true, numReviews: true,
        stock: true, garmentImageUrl: true, popularity: true
      }
    });

    const result = { success: true, products, type: 'trending' };
    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get trending products' });
  }
};

// Track interaction
const trackInteraction = async (req, res) => {
  try {
    const { productId, type } = req.body;
    const weights = { VIEW: 1, LIKE: 7, TRY_ON: 5, ADD_TO_CART: 3, PURCHASE: 10 };

    await prisma.interaction.create({
      data: {
        userId: req.user.id,
        productId,
        type,
        weight: weights[type] || 1
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.json({ success: true }); // Non-critical
  }
};

module.exports = { getPersonalized, getSimilar, getTryOnBased, getTrending, trackInteraction };
