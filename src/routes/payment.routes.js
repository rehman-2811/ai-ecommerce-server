// src/routes/payment.routes.js
const express = require('express');
const router = express.Router();
const {
  getPaymentConfig,
  initiateJazzCash, jazzCashReturn, confirmJazzCash,
  initiateEasyPaisa, easyPaisaReturn, confirmEasyPaisa,
  createCardPaymentIntent, confirmCardPayment, confirmCOD
} = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth');

router.get('/config', getPaymentConfig);

// Gateway callbacks: not a logged-in user, trusted via signature/response-code verification
router.post('/jazzcash/return', jazzCashReturn);
router.post('/easypaisa/return', easyPaisaReturn);

router.post('/jazzcash/initiate', protect, initiateJazzCash);
router.post('/jazzcash/confirm', protect, confirmJazzCash);
router.post('/easypaisa/initiate', protect, initiateEasyPaisa);
router.post('/easypaisa/confirm', protect, confirmEasyPaisa);
router.post('/card/create-intent', protect, createCardPaymentIntent);
router.post('/card/confirm', protect, confirmCardPayment);
router.post('/cod/confirm', protect, confirmCOD);

module.exports = router;
