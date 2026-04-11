// src/controllers/payment.controller.js
const { prisma } = require('../config/database');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

// @desc    Initiate JazzCash payment
// @route   POST /api/payments/jazzcash/initiate
const initiateJazzCash = async (req, res) => {
  try {
    const { orderId, amount } = req.body;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const merchantId = process.env.JAZZCASH_MERCHANT_ID;
    const password = process.env.JAZZCASH_PASSWORD;
    const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT;
    const returnUrl = process.env.JAZZCASH_RETURN_URL;

    const txnRefNo = `T${Date.now()}`;
    const txnDateTime = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
    const txnExpiryDateTime = new Date(Date.now() + 30 * 60000).toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
    const amountStr = Math.round(amount * 100).toString(); // In paisas

    const hashString = `${integritySalt}&${amountStr}&MWALLET&${merchantId}&${txnDateTime}&${txnExpiryDateTime}&PKR&${txnRefNo}&${returnUrl}&Sale`;
    const secureHash = crypto.createHmac('sha256', integritySalt).update(hashString).digest('hex').toUpperCase();

    const paymentData = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: merchantId,
      pp_Password: password,
      pp_TxnRefNo: txnRefNo,
      pp_Amount: amountStr,
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: txnDateTime,
      pp_TxnExpiryDateTime: txnExpiryDateTime,
      pp_ReturnURL: returnUrl,
      pp_Description: `Order ${order.orderNumber}`,
      pp_SecureHash: secureHash,
      ppmpf_1: orderId
    };

    // Update order with transaction reference
    await prisma.order.update({
      where: { id: orderId },
      data: { transactionId: txnRefNo }
    });

    res.json({
      success: true,
      paymentUrl: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
      paymentData
    });
  } catch (error) {
    logger.error('JazzCash initiate error:', error);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
};

// @desc    JazzCash webhook/return
// @route   POST /api/payments/jazzcash/return
const jazzCashReturn = async (req, res) => {
  try {
    const { pp_ResponseCode, ppmpf_1: orderId, pp_TxnRefNo } = req.body;

    if (pp_ResponseCode === '000') {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'PAID', status: 'PROCESSING', transactionId: pp_TxnRefNo }
      });
    } else {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: 'FAILED' }
      });
    }

    res.redirect(`${process.env.CLIENT_URL}/order-confirmation/${orderId}`);
  } catch (error) {
    logger.error('JazzCash return error:', error);
    res.redirect(`${process.env.CLIENT_URL}/payment-failed`);
  }
};

// @desc    Initiate EasyPaisa payment
// @route   POST /api/payments/easypaisa/initiate
const initiateEasyPaisa = async (req, res) => {
  try {
    const { orderId, amount, mobileNumber } = req.body;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const storeId = process.env.EASYPAISA_STORE_ID;
    const hashKey = process.env.EASYPAISA_HASH_KEY;
    const ordNum = `EP${Date.now()}`;
    const expiryDate = new Date(Date.now() + 30 * 60000).toISOString().replace('T', ' ').substring(0, 19);

    const hashStr = `amount=${amount}&expiryDate=${expiryDate}&mobileAccountNo=${mobileNumber}&orderRefNum=${ordNum}&storeId=${storeId}&transactionType=MA${hashKey}`;
    const hash = crypto.createHash('md5').update(hashStr).digest('hex').toUpperCase();

    await prisma.order.update({
      where: { id: orderId },
      data: { transactionId: ordNum }
    });

    res.json({
      success: true,
      paymentData: {
        storeId,
        amount: amount.toFixed(2),
        orderRefNum: ordNum,
        expiryDate,
        mobileAccountNo: mobileNumber,
        transactionType: 'MA',
        bankIdentityCode: 'EPBL',
        encryptedHashRequest: hash
      },
      paymentUrl: 'https://easypaisaacquiringapi.telenor.com.pk/api/Payment/InitiateTransaction'
    });
  } catch (error) {
    logger.error('EasyPaisa initiate error:', error);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
};

// @desc    Process card payment (mock - integrate with real gateway)
// @route   POST /api/payments/card/process
const processCard = async (req, res) => {
  try {
    const { orderId, cardNumber, expiryMonth, expiryYear, cvv, cardholderName } = req.body;

    // Validate card (basic)
    if (!cardNumber || cardNumber.replace(/\s/g, '').length < 16) {
      return res.status(400).json({ success: false, message: 'Invalid card number' });
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // In production, integrate with Stripe/PayFast/etc
    // Mock successful payment
    const transactionId = `CARD-${Date.now()}`;

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: 'PAID', status: 'PROCESSING', transactionId }
    });

    res.json({
      success: true,
      message: 'Payment processed successfully',
      transactionId
    });
  } catch (error) {
    logger.error('Card payment error:', error);
    res.status(500).json({ success: false, message: 'Payment processing failed' });
  }
};

// @desc    Confirm COD order
// @route   POST /api/payments/cod/confirm
const confirmCOD = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id, paymentMethod: 'COD' }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PROCESSING' }
    });

    res.json({ success: true, message: 'Cash on delivery order confirmed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to confirm order' });
  }
};

module.exports = { initiateJazzCash, jazzCashReturn, initiateEasyPaisa, processCard, confirmCOD };
