// src/controllers/product.controller.js
const { prisma } = require('../config/database');
const { getCache, setCache, delCachePattern } = require('../config/redis');
const { logger } = require('../utils/logger');

// @desc    Get all products with filters/pagination
// @route   GET /api/products
const getProducts = async (req, res) => {
  try {
    const {
      page = 1, limit = 12, brand,
      minPrice, maxPrice, color, size, sort = 'newest',
      search, tags, isActive = 'true'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build cache key
    const cacheKey = `products:${JSON.stringify(req.query)}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    // Build filter
    const where = {
      isActive: isActive === 'true'
    };

   
    if (brand) where.brand = { equals: brand, mode: 'insensitive' };
    if (color) where.colors = { has: color };
    if (size) where.sizes = { has: size };
    if (tags) where.tags = { hasSome: Array.isArray(tags) ? tags : [tags] };

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = parseFloat(minPrice);
      if (maxPrice) where.price.lte = parseFloat(maxPrice);
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { tags: { hasSome: [search] } }
      ];
    }

    // Build sort
    let orderBy = {};
    switch (sort) {
      case 'price_asc': orderBy = { price: 'asc' }; break;
      case 'price_desc': orderBy = { price: 'desc' }; break;
      case 'popular': orderBy = { popularity: 'desc' }; break;
      case 'rating': orderBy = { rating: 'desc' }; break;
      case 'oldest': orderBy = { createdAt: 'asc' }; break;
      default: orderBy = { createdAt: 'desc' };
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, orderBy, skip, take: limitNum,
        select: {
          id: true, name: true, price: true, comparePrice: true,
           brand: true,
          colors: true, sizes: true, stock: true, rating: true,
          numReviews: true, images: true, garmentImageUrl: true,
          popularity: true, tags: true, isActive: true, createdAt: true
        }
      }),
      prisma.product.count({ where })
    ]);

    const result = {
      success: true,
      products,
      pagination: {
        page: pageNum, limit: limitNum, total,
        pages: Math.ceil(total / limitNum)
      }
    };

    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (error) {
    logger.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

// @desc    Get product by ID
// @route   GET /api/products/:id
const getProductById = async (req, res) => {
  try {
    const cacheKey = `product:${req.params.id}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        reviews: {
          include: { user: { select: { name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const result = { success: true, product };
    await setCache(cacheKey, result, 600);
    res.json(result);
  } catch (error) {
    logger.error('Get product error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
};

// @desc    Track product view
// @route   POST /api/products/:id/view
const trackView = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.product.update({
      where: { id },
      data: { popularity: { increment: 1 } }
    });

    if (req.user) {
      await prisma.interaction.create({
        data: { userId: req.user.id, productId: id, type: 'VIEW', weight: 1 }
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.json({ success: true }); // Non-critical
  }
};

// @desc    Get products by category
// @route   GET /api/products/category/:category
const getByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 12 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { category: { equals: category, mode: 'insensitive' }, isActive: true },
        orderBy: { popularity: 'desc' },
        skip, take: parseInt(limit),
        select: {
          id: true, name: true, price: true, comparePrice: true,
          category: true, images: true, rating: true, stock: true, garmentImageUrl: true
        }
      }),
      prisma.product.count({ where: { category: { equals: category, mode: 'insensitive' }, isActive: true } })
    ]);

    res.json({
      success: true, products,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
};

// @desc    Search products
// @route   GET /api/products/search
const searchProducts = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q) return res.json({ success: true, products: [] });

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } }
        ]
      },
      take: parseInt(limit),
      select: { id: true, name: true, price: true, images: true, category: true, rating: true }
    });

    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Search failed' });
  }
};

// @desc    Get categories
// @route   GET /api/products/categories
const getCategories = async (req, res) => {
  try {
    const cacheKey = 'categories';
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const categories = await prisma.product.findMany({
      where: { isActive: true },
      select: { category: true, subCategory: true },
      distinct: ['category']
    });

    const result = { success: true, categories: [...new Set(categories.map(c => c.category))] };
    await setCache(cacheKey, result, 600);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get categories' });
  }
};

// @desc    Add review
// @route   POST /api/products/:id/reviews
const addReview = async (req, res) => {
  try {
    const { rating, title, comment } = req.body;
    const productId = req.params.id;

    // Check if already reviewed
    const existing = await prisma.review.findFirst({
      where: { userId: req.user.id, productId }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'You already reviewed this product' });
    }

    const review = await prisma.review.create({
      data: { userId: req.user.id, productId, rating: parseInt(rating), title, comment },
      include: { user: { select: { name: true, avatar: true } } }
    });

    // Update product rating
    const reviews = await prisma.review.findMany({ where: { productId }, select: { rating: true } });
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    await prisma.product.update({
      where: { id: productId },
      data: { rating: Math.round(avgRating * 10) / 10, numReviews: reviews.length }
    });

    await delCachePattern(`product:${productId}`);

    res.status(201).json({ success: true, review });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add review' });
  }
};

module.exports = { getProducts, getProductById, trackView, getByCategory, searchProducts, getCategories, addReview };
