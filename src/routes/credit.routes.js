// src/routes/credit.routes.js
const express = require('express');
const router = express.Router();
const {
  getPackages, getMyBalance, getMyHistory,
  createCardIntent, confirmCardPurchase,
  initiateJazzCashPurchase, jazzCashCreditReturn, confirmJazzCashPurchase,
  initiateEasyPaisaPurchase, confirmEasyPaisaPurchase,
} = require('../controllers/credit.controller');
const { protect } = require('../middleware/auth');

router.get('/packages', getPackages); // public — shown even before login, e.g. on a pricing section

// Gateway callback: not a logged-in user, trusted via secure-hash verification
router.post('/jazzcash/return', jazzCashCreditReturn);

router.use(protect);
router.get('/balance', getMyBalance);
router.get('/history', getMyHistory);

router.post('/card/create-intent', createCardIntent);
router.post('/card/confirm', confirmCardPurchase);

router.post('/jazzcash/initiate', initiateJazzCashPurchase);
router.post('/jazzcash/confirm', confirmJazzCashPurchase);

router.post('/easypaisa/initiate', initiateEasyPaisaPurchase);
router.post('/easypaisa/confirm', confirmEasyPaisaPurchase);

module.exports = router;
