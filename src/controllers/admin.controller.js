// src/controllers/admin.controller.js
const { prisma } = require('../config/database');
const { uploadBuffer, deleteImage } = require('../config/cloudinary');
const { delCachePattern } = require('../config/redis');
const { logger } = require('../utils/logger');

// ==================== DASHBOARD ====================

const getDashboard = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers, totalProducts, totalOrders, revenueData,
      recentOrders, lowStockProducts, ordersByStatus, dailySales
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { total: true }
      }),
      prisma.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { name: true, email: true } }, items: true }
      }),
      prisma.product.findMany({
        where: { stock: { lte: 10 }, isActive: true },
        select: { id: true, name: true, stock: true, images: true, category: true },
        orderBy: { stock: 'asc' },
        take: 10
      }),
      prisma.order.groupBy({
        by: ['status'],
        _count: true
      }),
      // Daily sales for last 30 days
      prisma.order.findMany({
        where: { createdAt: { gte: thirtyDaysAgo }, paymentStatus: 'PAID' },
        select: { createdAt: true, total: true }
      })
    ]);

    // Process daily sales into chart data
    const salesMap = {};
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = date.toISOString().split('T')[0];
      salesMap[key] = 0;
    }

    for (const order of dailySales) {
      const key = order.createdAt.toISOString().split('T')[0];
      if (salesMap[key] !== undefined) {
        salesMap[key] += order.total;
      }
    }

    const chartData = Object.entries(salesMap).map(([date, revenue]) => ({ date, revenue }));

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: revenueData._sum.total || 0
      },
      recentOrders,
      lowStockProducts,
      ordersByStatus,
      chartData
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
};

// ==================== PRODUCTS ====================

const getAllProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } }
      ];
    }
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    res.json({ success: true, products, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get products' });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      name, description, price, comparePrice, 
      brand, colors, sizes, material, pattern, stock, tags
    } = req.body;

    if (!name || !description || !price) {
      return res.status(400).json({ success: false, message: 'Name, description, price, and category are required' });
    }

    // Handle image uploads
    let images = [];
    let garmentImageUrl = null;

    if (req.files) {
      const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
      for (const file of files) {
        const result = await uploadBuffer(file.buffer, file.mimetype, 'products');
        if (file.fieldname === 'garmentImage') {
          garmentImageUrl = result.secure_url;
        } else {
          images.push({ url: result.secure_url, publicId: result.public_id, alt: name });
        }
      }
    }

    const product = await prisma.product.create({
      data: {
        name, description,
        price: parseFloat(price),
        comparePrice: comparePrice ? parseFloat(comparePrice) : null,
        brand, material, pattern,
        colors: Array.isArray(colors) ? colors : (colors ? colors.split(',').map(c => c.trim()) : []),
        sizes: Array.isArray(sizes) ? sizes : (sizes ? sizes.split(',').map(s => s.trim()) : []),
        stock: parseInt(stock) || 0,
        tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
        images,
        garmentImageUrl,
        imageEmbedding: [],
        textEmbedding: []
      }
    });

    await delCachePattern('products:*');

    res.status(201).json({ success: true, product });
  } catch (error) {
    logger.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, description, price, comparePrice,
      brand, colors, sizes, material, pattern, stock, tags, isActive
    } = req.body;

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    let updateData = {
      name, description, category, subCategory, brand, material, pattern, isActive: isActive === 'true',
      price: price ? parseFloat(price) : existing.price,
      comparePrice: comparePrice ? parseFloat(comparePrice) : existing.comparePrice,
      stock: stock ? parseInt(stock) : existing.stock,
      colors: Array.isArray(colors) ? colors : (colors ? colors.split(',').map(c => c.trim()) : existing.colors),
      sizes: Array.isArray(sizes) ? sizes : (sizes ? sizes.split(',').map(s => s.trim()) : existing.sizes),
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : existing.tags)
    };

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const newImages = [];
      for (const file of req.files) {
        const result = await uploadBuffer(file.buffer, file.mimetype, 'products');
        if (file.fieldname === 'garmentImage') {
          updateData.garmentImageUrl = result.secure_url;
        } else {
          newImages.push({ url: result.secure_url, publicId: result.public_id, alt: name });
        }
      }
      if (newImages.length > 0) {
        const existingImages = existing.images || [];
        updateData.images = [...existingImages, ...newImages];
      }
    }

    const product = await prisma.product.update({ where: { id }, data: updateData });

    await delCachePattern('products:*');
    await delCachePattern(`product:${id}`);

    res.json({ success: true, product });
  } catch (error) {
    logger.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.update({ where: { id }, data: { isActive: false } });

    await delCachePattern('products:*');
    await delCachePattern(`product:${id}`);

    res.json({ success: true, message: 'Product deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
};

// ==================== ORDERS ====================

const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, paymentStatus, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { name: true, email: true } },
          items: { include: { product: { select: { name: true, images: true } } } }
        }
      }),
      prisma.order.count({ where })
    ]);

    res.json({ success: true, orders, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get orders' });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;

    const order = await prisma.order.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(paymentStatus && { paymentStatus })
      },
      include: { user: { select: { email: true, name: true } } }
    });

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update order' });
  }
};

// ==================== USERS ====================

const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, role: true,
          isActive: true, isVerified: true, createdAt: true, avatar: true,
          _count: { select: { orders: true, tryOnSessions: true } }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({ success: true, users, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get users' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive, role } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: { ...(isActive !== undefined && { isActive }), ...(role && { role }) },
      select: { id: true, name: true, email: true, role: true, isActive: true }
    });

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

// ==================== VTON ANALYTICS ====================

const getVTONAnalytics = async (req, res) => {
  try {
    const [
      totalSessions, completedSessions, likedSessions, failedSessions,
      avgProcessingTime, mostTriedProducts
    ] = await Promise.all([
      prisma.tryOnSession.count(),
      prisma.tryOnSession.count({ where: { status: 'COMPLETED' } }),
      prisma.tryOnSession.count({ where: { liked: true } }),
      prisma.tryOnSession.count({ where: { status: 'FAILED' } }),
      prisma.tryOnSession.aggregate({
        where: { status: 'COMPLETED', processingTime: { not: null } },
        _avg: { processingTime: true }
      }),
      prisma.tryOnSession.groupBy({
        by: ['productId'],
        _count: true,
        orderBy: { _count: { productId: 'desc' } },
        take: 10
      })
    ]);

    // Fetch product details for most tried
    const productIds = mostTriedProducts.map(p => p.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, images: true, category: true }
    });

    const mostTriedWithDetails = mostTriedProducts.map(stat => ({
      ...stat,
      product: products.find(p => p.id === stat.productId)
    }));

    res.json({
      success: true,
      stats: {
        totalSessions,
        completedSessions,
        likedSessions,
        failedSessions,
        successRate: totalSessions > 0 ? ((completedSessions / totalSessions) * 100).toFixed(1) : 0,
        likeRate: completedSessions > 0 ? ((likedSessions / completedSessions) * 100).toFixed(1) : 0,
        avgProcessingTime: avgProcessingTime._avg.processingTime?.toFixed(1) || 0
      },
      mostTriedProducts: mostTriedWithDetails
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get analytics' });
  }
};

// ==================== REPORTS ====================

const getReports = async (req, res) => {
  try {
    const { type = 'monthly' } = req.query;
    let startDate;

    if (type === 'daily') startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    else if (type === 'weekly') startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    else startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [orders, topProducts, userGrowth] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: startDate } },
        select: { total: true, status: true, paymentStatus: true, createdAt: true }
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        _count: true,
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: startDate }, role: 'CUSTOMER' },
        select: { createdAt: true }
      })
    ]);

    const totalRevenue = orders
      .filter(o => o.paymentStatus === 'PAID')
      .reduce((sum, o) => sum + o.total, 0);

    const productIds = topProducts.map(p => p.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, images: true, price: true }
    });

    res.json({
      success: true,
      report: {
        period: type,
        totalOrders: orders.length,
        totalRevenue,
        topProducts: topProducts.map(stat => ({
          ...stat,
          product: products.find(p => p.id === stat.productId)
        })),
        newUsers: userGrowth.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};

module.exports = {
  getDashboard, getAllProducts, createProduct, updateProduct, deleteProduct,
  getAllOrders, updateOrderStatus, getAllUsers, updateUser,
  getVTONAnalytics, getReports
};
