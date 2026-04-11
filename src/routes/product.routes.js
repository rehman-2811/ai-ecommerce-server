// src/routes/product.routes.js
const express = require('express');
const router = express.Router();
const { getProducts, getProductById, trackView, getByCategory, searchProducts, getCategories, addReview } = require('../controllers/product.controller');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/', getProducts);
router.get('/search', searchProducts);
router.get('/categories', getCategories);
router.get('/category/:category', getByCategory);
router.get('/:id', optionalAuth, getProductById);
router.post('/:id/view', optionalAuth, trackView);
router.post('/:id/reviews', protect, addReview);

module.exports = router;
