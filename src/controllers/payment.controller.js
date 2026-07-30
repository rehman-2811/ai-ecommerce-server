// src/controllers/payment.controller.js
const { prisma } = require('../config/database');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const stripe = require('../config/stripe');
const { calculateCartTotals, applyCoupon, placeOrderFromCart } = require('../services/order.service');

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
// @desc    Create a Stripe PaymentIntent for card payment
// @route   POST /api/payments/card/create-intent
// @desc    Create a Stripe PaymentIntent for card payment — computed directly
//          from the user's current cart. No order exists yet at this point.
// @route   POST /api/payments/card/create-intent
const createCardPaymentIntent = async (req, res) => {
  try {
    const { shippingAddress, couponCode, notes } = req.body;

    if (!shippingAddress?.name || !shippingAddress?.phone || !shippingAddress?.street || !shippingAddress?.city) {
      return res.status(400).json({ success: false, message: 'Complete shipping address is required' });
    }

    const { subtotal, tax, shippingCost } = await calculateCartTotals(req.user.id);
    const discount = applyCoupon(couponCode, subtotal);
    const total = subtotal + tax + shippingCost - discount;

    // Amount must be sent to Stripe in the smallest currency unit (e.g. paisa for PKR)
    const amountInSmallestUnit = Math.round(total * 100);

    // Stash everything needed to place the order later in the PaymentIntent's
    // metadata (Stripe is the source of truth here — nothing is written to our
    // own database until the charge actually succeeds).
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInSmallestUnit,
      currency: 'pkr',
      metadata: {
        userId: req.user.id,
        shippingAddress: JSON.stringify(shippingAddress),
        couponCode: couponCode || '',
        notes: notes || ''
      },
      description: `Order payment for ${req.user.email}`,
      automatic_payment_methods: { enabled: true }
    });

    res.json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (error) {
    logger.error('Create payment intent error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to initiate card payment' });
  }
};

// @desc    Confirm a card payment after Stripe has processed it client-side.
//          The order is only ever created here, and only if Stripe confirms
//          the charge actually succeeded — a declined/failed card never
//          results in an order, stock deduction, or cleared cart.
// @route   POST /api/payments/card/confirm
const confirmCardPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: 'paymentIntentId is required' });
    }

    // Always re-verify the payment status directly with Stripe — never trust
    // the client's word alone that a payment "succeeded".
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata?.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'This payment does not belong to your account' });
    }

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: `Payment was not completed (status: ${paymentIntent.status}) — no order was placed`
      });
    }

    // Guard against double-processing (e.g. duplicate confirm calls) by
    // checking whether an order already used this transactionId.
    const existing = await prisma.order.findFirst({ where: { transactionId: paymentIntentId } });
    if (existing) {
      return res.json({ success: true, message: 'Payment already confirmed', order: existing });
    }

    const shippingAddress = JSON.parse(paymentIntent.metadata.shippingAddress);
    const couponCode = paymentIntent.metadata.couponCode || undefined;
    const notes = paymentIntent.metadata.notes || undefined;

    const order = await placeOrderFromCart({
      userId: req.user.id,
      userEmail: req.user.email,
      userName: req.user.name,
      shippingAddress,
      paymentMethod: 'CARD',
      couponCode,
      notes,
      paymentStatus: 'PAID',
      status: 'PROCESSING',
      transactionId: paymentIntent.id
    });

    res.json({ success: true, message: 'Payment confirmed, order placed', order });
  } catch (error) {
    logger.error('Confirm card payment error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to confirm payment' });
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

module.exports = { initiateJazzCash, jazzCashReturn, initiateEasyPaisa, createCardPaymentIntent, confirmCardPayment, confirmCOD };