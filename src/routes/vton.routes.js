// src/routes/vton.routes.js
const express = require('express');
const router = express.Router();
const { submitTryOn, getStatus, getResult, submitFeedback, getHistory } = require('../controllers/vton.controller');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { vtonLimiter } = require('../middleware/rateLimit');

router.use(protect);
router.post('/try-on', vtonLimiter, upload.single('userImage'), submitTryOn);
router.get('/status/:sessionId', getStatus);
router.get('/result/:sessionId', getResult);
router.post('/feedback/:sessionId', submitFeedback);
router.get('/history', getHistory);

module.exports = router;
