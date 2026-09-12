// src/routes/payment.routes.js
const express = require('express');
const router = express.Router();
const { initiateJazzCash, jazzCashReturn, confirmJazzCash, initiateEasyPaisa, confirmEasyPaisa, createCardPaymentIntent, confirmCardPayment, confirmCOD } = require('../controllers/payment.controller');
const { protect } = require('../middleware/auth');

router.post('/jazzcash/initiate', protect, initiateJazzCash);
router.post('/jazzcash/return', jazzCashReturn);
router.post('/jazzcash/confirm', protect, confirmJazzCash);
router.post('/easypaisa/initiate', protect, initiateEasyPaisa);
router.post('/easypaisa/confirm', protect, confirmEasyPaisa);
router.post('/card/create-intent', protect, createCardPaymentIntent);
router.post('/card/confirm', protect, confirmCardPayment);
router.post('/cod/confirm', protect, confirmCOD);

module.exports = router;