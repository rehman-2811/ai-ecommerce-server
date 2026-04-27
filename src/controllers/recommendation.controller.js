// // src/controllers/recommendation.controller.js
// const { prisma } = require('../config/database');
// const { getCache, setCache } = require('../config/redis');
// const { logger } = require('../utils/logger');

// // Hybrid recommendation: collaborative filtering + content-based
// const getPersonalized = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { limit = 8 } = req.query;

//     const cacheKey = `recommendations:personalized:${userId}`;
//     const cached = await getCache(cacheKey);
//     if (cached) return res.json(cached);

//     // Get user interactions
//     const interactions = await prisma.interaction.findMany({
//       where: { userId },
//       include: { product: { select: { category: true, tags: true, subCategory: true } } },
//       orderBy: { createdAt: 'desc' },
//       take: 50
//     });

//     if (interactions.length === 0) {
//       // Cold start: return trending products
//       return getTrending(req, res);
//     }

//     // Build user preference profile
//     const categoryWeights = {};
//     const tagWeights = {};

//     for (const interaction of interactions) {
//       const weight = interaction.weight;
//       const cat = interaction.product.category;
//       categoryWeights[cat] = (categoryWeights[cat] || 0) + weight;
//       for (const tag of interaction.product.tags) {
//         tagWeights[tag] = (tagWeights[tag] || 0) + weight;
//       }
//     }

//     // Get top categories and tags
//     const topCategories = Object.entries(categoryWeights)
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 3)
//       .map(([cat]) => cat);

//     const topTags = Object.entries(tagWeights)
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 5)
//       .map(([tag]) => tag);

//     // Get already interacted product IDs
//     const interactedProductIds = [...new Set(interactions.map(i => i.productId))];

//     // Fetch recommended products
//     const products = await prisma.product.findMany({
//       where: {
//         isActive: true,
//         id: { notIn: interactedProductIds },
//         OR: [
//           { category: { in: topCategories } },
//           { tags: { hasSome: topTags } }
//         ]
//       },
//       orderBy: [{ popularity: 'desc' }, { rating: 'desc' }],
//       take: parseInt(limit),
//       select: {
//         id: true, name: true, price: true, comparePrice: true,
//         category: true, images: true, rating: true, stock: true,
//         garmentImageUrl: true, tags: true
//       }
//     });

//     const result = { success: true, products, type: 'personalized' };
//     await setCache(cacheKey, result, 300);
//     res.json(result);
//   } catch (error) {
//     logger.error('Personalized recommendation error:', error);
//     res.status(500).json({ success: false, message: 'Failed to get recommendations' });
//   }
// };

// // Similar products (content-based)
// const getSimilar = async (req, res) => {
//   try {
//     const { productId } = req.params;
//     const { limit = 6 } = req.query;

//     const cacheKey = `recommendations:similar:${productId}`;
//     const cached = await getCache(cacheKey);
//     if (cached) return res.json(cached);

//     const product = await prisma.product.findUnique({
//       where: { id: productId },
//       select: { category: true, subCategory: true, tags: true, brand: true, price: true }
//     });

//     if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

//     const priceRange = product.price * 0.4;

//     const products = await prisma.product.findMany({
//       where: {
//         isActive: true,
//         id: { not: productId },
//         OR: [
//           { category: product.category, subCategory: product.subCategory },
//           { tags: { hasSome: product.tags } },
//           { brand: product.brand }
//         ],
//         price: {
//           gte: product.price - priceRange,
//           lte: product.price + priceRange
//         }
//       },
//       orderBy: { rating: 'desc' },
//       take: parseInt(limit),
//       select: {
//         id: true, name: true, price: true, comparePrice: true,
//         category: true, images: true, rating: true, stock: true, garmentImageUrl: true
//       }
//     });

//     const result = { success: true, products };
//     await setCache(cacheKey, result, 600);
//     res.json(result);
//   } catch (error) {
//     res.status(500).json({ success: false, message: 'Failed to get similar products' });
//   }
// };

// // Try-on based recommendations
// const getTryOnBased = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { limit = 6 } = req.query;

//     // Get liked try-on sessions
//     const likedSessions = await prisma.tryOnSession.findMany({
//       where: { userId, liked: true },
//       include: {
//         product: { select: { category: true, tags: true, subCategory: true } }
//       },
//       orderBy: { createdAt: 'desc' },
//       take: 10
//     });

//     if (likedSessions.length === 0) {
//       return res.json({ success: true, products: [], message: 'No liked try-ons yet' });
//     }

//     const categories = [...new Set(likedSessions.map(s => s.product.category))];
//     const tags = [...new Set(likedSessions.flatMap(s => s.product.tags))];
//     const triedProductIds = likedSessions.map(s => s.productId);

//     const products = await prisma.product.findMany({
//       where: {
//         isActive: true,
//         id: { notIn: triedProductIds },
//         OR: [
//           { category: { in: categories } },
//           { tags: { hasSome: tags } }
//         ]
//       },
//       orderBy: { popularity: 'desc' },
//       take: parseInt(limit),
//       select: {
//         id: true, name: true, price: true, comparePrice: true,
//         category: true, images: true, rating: true, stock: true, garmentImageUrl: true
//       }
//     });

//     res.json({ success: true, products, type: 'try-on-based' });
//   } catch (error) {
//     res.status(500).json({ success: false, message: 'Failed to get try-on recommendations' });
//   }
// };

// // Trending products
// const getTrending = async (req, res) => {
//   try {
//     const { limit = 8 } = req.query;

//     const cacheKey = `recommendations:trending:${limit}`;
//     const cached = await getCache(cacheKey);
//     if (cached) return res.json(cached);

//     const products = await prisma.product.findMany({
//       where: { isActive: true, stock: { gt: 0 } },
//       orderBy: [{ popularity: 'desc' }, { rating: 'desc' }],
//       take: parseInt(limit),
//       select: {
//         id: true, name: true, price: true, comparePrice: true,
//         category: true, images: true, rating: true, numReviews: true,
//         stock: true, garmentImageUrl: true, popularity: true
//       }
//     });

//     const result = { success: true, products, type: 'trending' };
//     await setCache(cacheKey, result, 300);
//     res.json(result);
//   } catch (error) {
//     res.status(500).json({ success: false, message: 'Failed to get trending products' });
//   }
// };

// // Track interaction
// const trackInteraction = async (req, res) => {
//   try {
//     const { productId, type } = req.body;
//     const weights = { VIEW: 1, LIKE: 7, TRY_ON: 5, ADD_TO_CART: 3, PURCHASE: 10 };

//     await prisma.interaction.create({
//       data: {
//         userId: req.user.id,
//         productId,
//         type,
//         weight: weights[type] || 1
//       }
//     });

//     res.json({ success: true });
//   } catch (error) {
//     res.json({ success: true }); // Non-critical
//   }
// };

// module.exports = { getPersonalized, getSimilar, getTryOnBased, getTrending, trackInteraction };





// src/controllers/recommendation.controller.js

const { prisma } = require('../config/database');
const { getCache, setCache } = require('../config/redis');
const { logger } = require('../utils/logger');

// 🔥 Cosine similarity for embeddings
const cosineSimilarity = (a, b) => {
  if (!a || !b || a.length !== b.length) return 0;

  let dot = 0, magA = 0, magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
};

// ==============================
// 🔥 PERSONALIZED (HYBRID CORE)
// ==============================
const getPersonalized = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 8 } = req.query;

    const cacheKey = `recommendations:personalized:${userId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    // 1. Get user interactions
    const interactions = await prisma.interaction.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Cold start
    // if (!interactions.length) {
    //   return getTrending(req, res);
    // }


    if (!interactions.length) {
      const randomProducts = await prisma.product.findMany({
        where: { isActive: true, stock: { gt: 0 } },
        take: 50
      });

      const shuffled = randomProducts.sort(() => 0.5 - Math.random());

      return res.json({
        success: true,
        type: 'cold-start',
        products: shuffled.slice(0, parseInt(limit))
      });
    }

    // 2. Build user profile
    const tagWeights = {};
    let userEmbedding = null;

    for (const interaction of interactions) {
      const daysAgo = (Date.now() - interaction.createdAt) / (1000 * 60 * 60 * 24);
      const decay = Math.exp(-0.05 * daysAgo);
      const weight = interaction.weight * decay;

      // tag preferences
      for (const tag of interaction.product.tags || []) {
        tagWeights[tag] = (tagWeights[tag] || 0) + weight;
      }

      // embedding profile
      // if (interaction.product.textEmbedding?.length) {
      //   if (!userEmbedding) {
      //     userEmbedding = [...interaction.product.textEmbedding];
      //   } else {
      //     userEmbedding = userEmbedding.map(
      //       (v, i) => v + interaction.product.textEmbedding[i]
      //     );
      //   }
      // }
      if (interaction.product.textEmbedding?.length) {
        if (!userEmbedding) {
          userEmbedding = interaction.product.textEmbedding.map(
            v => v * weight
          );
        } else {
          userEmbedding = userEmbedding.map(
            (v, i) => v + (interaction.product.textEmbedding[i] * weight)
          );
        }
      }




    }

    // normalize embedding
    const totalWeight = interactions.reduce((sum, i) => {
      const daysAgo = (Date.now() - i.createdAt) / (1000 * 60 * 60 * 24);
      return sum + (i.weight * Math.exp(-0.05 * daysAgo));
    }, 0);

    if (userEmbedding && totalWeight > 0) {
      userEmbedding = userEmbedding.map(v => v / totalWeight);
    }

    const interactedIds = interactions.map(i => i.productId);

    // 3. Collaborative filtering
    // const similarUsers = await prisma.interaction.findMany({
    //   where: {
    //     productId: { in: interactedIds },
    //     userId: { not: userId }
    //   },
    //   select: { userId: true },
    //   take: 100
    // });

    // const similarUserIds = [...new Set(similarUsers.map(u => u.userId))];

    // let collaborativeMap = new Set();

    // if (similarUserIds.length) {
    //   const collaborativeInteractions = await prisma.interaction.findMany({
    //     where: {
    //       userId: { in: similarUserIds }
    //     },
    //     select: { productId: true },
    //     take: 200
    //   });

    //   collaborativeMap = new Set(collaborativeInteractions.map(i => i.productId));
    // }


    // current user ke products
    const userProductSet = new Set(interactedIds);

    // sab users ke interactions (excluding current user)
    const userInteractions = await prisma.interaction.findMany({
      where: {
        productId: { in: interactedIds },
        userId: { not: userId }
      },
      select: { userId: true, productId: true }
    });

    // similarity calculate karna
    const userSimilarity = {};

    for (const ui of userInteractions) {
      if (userProductSet.has(ui.productId)) {
        userSimilarity[ui.userId] = (userSimilarity[ui.userId] || 0) + 1;
      }
    }

    // top similar users nikalna
    const topUsers = Object.entries(userSimilarity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id]) => id);

    // unke products lena
    const collaborativeInteractions = await prisma.interaction.findMany({
      where: {
        userId: { in: topUsers }
      },
      select: { productId: true }
    });

    // final set
    const collaborativeMap = new Set(
      collaborativeInteractions.map(i => i.productId)
    );




    // 4. Candidate pool
    const candidates = await prisma.product.findMany({
      where: {
        isActive: true,
        id: { notIn: interactedIds },
        stock: { gt: 0 }
      },
      take: 200
    });

    // 5. Scoring
    const maxTagWeight = Math.max(...Object.values(tagWeights), 1);
    const scored = candidates.map(product => {
      let score = 0;

      // tag score
      for (const tag of product.tags || []) {
        if (tagWeights[tag]) {
          score += (tagWeights[tag] / maxTagWeight) * 5;
        }
      }

      // embedding similarity
      if (userEmbedding && product.textEmbedding?.length) {
        score += cosineSimilarity(userEmbedding, product.textEmbedding) * 10;
      }

      // collaborative boost
      if (collaborativeMap.has(product.id)) {
        // score += 5;
        score += 3;
      }

      // popularity + rating
      score += (product.popularity || 0) * 0.1;
      score += (product.rating || 0) * 2;

      // small randomness
      score += Math.random() * 0.5;
      return { ...product, score };
    });

    const products = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit));

    const result = {
      success: true,
      type: 'hybrid',
      products
    };

    await setCache(cacheKey, result, 300);

    res.json(result);

  } catch (error) {
    logger.error('Personalized recommendation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recommendations'
    });
  }
};

// ==============================
// 🔥 SIMILAR PRODUCTS
// ==============================
const getSimilar = async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 6 } = req.query;

    const cacheKey = `recommendations:similar:${productId}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const baseProduct = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!baseProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const candidates = await prisma.product.findMany({
      where: {
        id: { not: productId },
        isActive: true,
        stock: { gt: 0 }
      },
      take: 100
    });

    const scored = candidates.map(p => {
      let score = 0;

      // tag similarity
      const commonTags = (p.tags || []).filter(t =>
        (baseProduct.tags || []).includes(t)
      );
      score += commonTags.length * 3;

      // embedding similarity
      score += cosineSimilarity(
        baseProduct.textEmbedding,
        p.textEmbedding
      ) * 10;

      // price similarity
      const diff = Math.abs((baseProduct.price || 0) - (p.price || 0));
      score += Math.max(0, 5 - diff / 1000);

      return { ...p, score };
    });

    const products = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, parseInt(limit));

    const result = { success: true, products };

    await setCache(cacheKey, result, 600);

    res.json(result);

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get similar products' });
  }
};

// ==============================
// 🔥 TRENDING
// ==============================
const getTrending = async (req, res) => {
  try {
    const { limit = 8 } = req.query;

    const cacheKey = `recommendations:trending:${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 }
      },
      orderBy: [
        { popularity: 'desc' },
        { rating: 'desc' }
      ],
      take: parseInt(limit)
    });

    const result = {
      success: true,
      type: 'trending',
      products
    };

    await setCache(cacheKey, result, 300);

    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get trending products'
    });
  }
};

// ==============================
// 🔥 TRACK INTERACTION
// ==============================
const trackInteraction = async (req, res) => {
  try {
    const { productId, type } = req.body;

    const weights = {
      VIEW: 1,
      LIKE: 7,
      TRY_ON: 5,
      ADD_TO_CART: 3,
      PURCHASE: 10
    };

    // await prisma.interaction.create({
    //   data: {
    //     userId: req.user.id,
    //     productId,
    //     type,
    //     weight: weights[type] || 1
    //   }
    // });


    await prisma.interaction.upsert({
      where: {
        userId_productId_type: {
          userId: req.user.id,
          productId,
          type
        }
      },
      update: {
        weight: { increment: 1 },
        createdAt: new Date()
      },
      create: {
        userId: req.user.id,
        productId,
        type,
        weight: weights[type] || 1
      }
    });

    // 🔥 invalidate personalized cache
    await setCache(`recommendations:personalized:${req.user.id}`, null, 1);

    res.json({ success: true });

  } catch (error) {
    res.json({ success: true }); // non-blocking
  }
};

module.exports = {
  getPersonalized,
  getSimilar,
  getTrending,
  trackInteraction
};