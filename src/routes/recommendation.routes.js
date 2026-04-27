// src/routes/recommendation.routes.js
const express = require('express');
const router = express.Router();
const { getPersonalized, getSimilar, getTryOnBased, getTrending, trackInteraction } = require('../controllers/recommendation.controller');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/trending', getTrending);
router.get('/similar/:productId', getSimilar);
router.get('/personalized', protect, getPersonalized);
// router.get('/try-on-based', protect, getTryOnBased);
router.post('/track', protect, trackInteraction);

module.exports = router;
