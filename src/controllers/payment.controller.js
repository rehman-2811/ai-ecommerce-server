// src/controllers/payment.controller.js
//
// RULE FOR EVERYTHING IN THIS FILE:
//   1. Verify the payment with the gateway itself (never trust the browser).
//   2. Guard order creation/finalization so it can only ever happen once
//      per real payment, no matter how many times a callback or confirm
//      call is repeated (network retries, double-clicks, replayed callbacks).

const { prisma } = require('../config/database');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const stripe = require('../config/stripe');
const { calculateCartTotals, applyCoupon, placeOrderFromCart, finalizeOrderPayment } = require('../services/order.service');

const LOCAL_WALLETS_ENABLED = () => process.env.ENABLE_LOCAL_WALLETS === 'true';
const localWalletDisabledResponse = (res) =>
  res.status(503).json({
    success: false,
    message: 'This payment method is temporarily unavailable. Please use Card or Cash on Delivery.'
  });

// Sandbox-only shortcut: lets confirmJazzCash/confirmEasyPaisa finalize an
// order directly (as the current sandbox UI does right after "initiate"),
// standing in for the verified gateway callback while there's no real
// merchant account to receive it on. NEVER true in production.
const sandboxConfirmAllowed = () =>
  process.env.NODE_ENV !== 'production' || process.env.ALLOW_SANDBOX_PAYMENT_CONFIRM === 'true';

// @desc    Public payment config the frontend uses to show/hide payment methods
// @route   GET /api/payments/config
const getPaymentConfig = async (req, res) => {
  res.json({ success: true, enableLocalWallets: LOCAL_WALLETS_ENABLED() });
};

// JazzCash signs callbacks: HMAC-SHA256 of (integritySalt & every non-empty
// pp_* value, sorted by field name), keyed with the integrity salt. Confirm
// this exact ordering against your JazzCash merchant documentation before
// going live — this mirrors the same check used for credit purchases.
function verifyJazzCashHash(body) {
  const salt = process.env.JAZZCASH_INTEGRITY_SALT;
  const received = (body.pp_SecureHash || '').toUpperCase();
  if (!salt || !received) return false;
  const values = Object.keys(body)
    .filter(k => k.startsWith('pp_') && k !== 'pp_SecureHash' && body[k] !== '' && body[k] != null)
    .sort()
    .map(k => body[k]);
  const expected = crypto.createHmac('sha256', salt).update([salt, ...values].join('&')).digest('hex').toUpperCase();
  const a = Buffer.from(expected), b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// @desc    Initiate JazzCash payment
// @route   POST /api/payments/jazzcash/initiate
const initiateJazzCash = async (req, res) => {
  try {
    if (!LOCAL_WALLETS_ENABLED()) return localWalletDisabledResponse(res);

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

// @desc    JazzCash webhook/return — the ACTUAL proof of payment. Not behind
//          login (JazzCash's servers aren't a logged-in user); trust comes
//          from the secure-hash check, not from req.user.
// @route   POST /api/payments/jazzcash/return
const jazzCashReturn = async (req, res) => {
  const clientUrl = process.env.CLIENT_URL;
  try {
    const body = req.body || {};
    const { ppmpf_1: orderId, pp_TxnRefNo, pp_ResponseCode } = body;

    if (!verifyJazzCashHash(body)) {
      logger.warn(`JazzCash order callback with INVALID hash for order ${orderId}`);
      return res.redirect(`${clientUrl}/payment-failed`);
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.redirect(`${clientUrl}/payment-failed`);

    const amountOk = String(body.pp_Amount) === String(Math.round(order.total * 100));

    if (pp_ResponseCode === '000' && amountOk) {
      // finalizeOrderPayment itself no-ops if the order is already PAID,
      // so a replayed callback here is harmless.
      await finalizeOrderPayment(orderId, { paymentStatus: 'PAID', status: 'PROCESSING', transactionId: pp_TxnRefNo });
      return res.redirect(`${clientUrl}/order-confirmation/${orderId}`);
    }

    if (!amountOk) logger.warn(`JazzCash amount mismatch for order ${orderId}: got ${body.pp_Amount}`);
    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'FAILED' } });
    res.redirect(`${clientUrl}/payment-failed`);
  } catch (error) {
    logger.error('JazzCash return error:', error);
    res.redirect(`${clientUrl}/payment-failed`);
  }
};

// @desc    Confirm a JazzCash order payment (browser-triggered)
// @route   POST /api/payments/jazzcash/confirm
//
// The browser is NOT proof of payment — only jazzCashReturn's verified,
// hash-checked callback is. This endpoint now only ever reports that
// verified state (order.paymentStatus === 'PAID'); it never sets PAID
// itself outside of local/sandbox testing, where there is no real
// JazzCash sandbox account to deliver the callback above.
const confirmJazzCash = async (req, res) => {
  try {
    if (!LOCAL_WALLETS_ENABLED()) return localWalletDisabledResponse(res);

    const { orderId } = req.body;
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id, paymentMethod: 'JAZZCASH' }
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentStatus !== 'PAID' && sandboxConfirmAllowed()) {
      await finalizeOrderPayment(orderId, { paymentStatus: 'PAID', status: 'PROCESSING' });
    }

    const fresh = await prisma.order.findUnique({ where: { id: orderId } });
    if (fresh.paymentStatus !== 'PAID') {
      return res.status(409).json({
        success: false, pending: true,
        message: 'Payment not verified yet. Your order confirms automatically once JazzCash verifies it.'
      });
    }
    res.json({ success: true, message: 'JazzCash payment confirmed', order: fresh });
  } catch (error) {
    logger.error('JazzCash confirm error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to confirm payment' });
  }
};

// @desc    Initiate EasyPaisa payment
// @route   POST /api/payments/easypaisa/initiate
const initiateEasyPaisa = async (req, res) => {
  try {
    if (!LOCAL_WALLETS_ENABLED()) return localWalletDisabledResponse(res);

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

// @desc    EasyPaisa webhook/return
// @route   POST /api/payments/easypaisa/return
//
// CAVEAT: unlike JazzCash, this codebase has never had a confirmed
// EasyPaisa callback payload/signature format from their merchant docs.
// This checks the response fields their API commonly uses, but you MUST
// verify the exact field names and signature scheme against your actual
// EasyPaisa merchant documentation before relying on this in production —
// do not assume this is correct without checking.
const easyPaisaReturn = async (req, res) => {
  const clientUrl = process.env.CLIENT_URL;
  try {
    const body = req.body || {};
    const orderRefNum = body.orderRefNum || body.orderId;
    const responseCode = body.transactionStatus || body.responseCode;

    const order = await prisma.order.findFirst({ where: { transactionId: orderRefNum } });
    if (!order) return res.redirect(`${clientUrl}/payment-failed`);

    const amountOk = !body.amount || Number(body.amount) === order.total;

    if (responseCode === '0000' && amountOk) {
      await finalizeOrderPayment(order.id, { paymentStatus: 'PAID', status: 'PROCESSING' });
      return res.redirect(`${clientUrl}/order-confirmation/${order.id}`);
    }

    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
    res.redirect(`${clientUrl}/payment-failed`);
  } catch (error) {
    logger.error('EasyPaisa return error:', error);
    res.redirect(`${clientUrl}/payment-failed`);
  }
};

// @desc    Confirm an EasyPaisa order payment (browser-triggered) — see the
//          same caveat as confirmJazzCash: the browser is not proof of
//          payment, only easyPaisaReturn's callback is (in production).
// @route   POST /api/payments/easypaisa/confirm
const confirmEasyPaisa = async (req, res) => {
  try {
    if (!LOCAL_WALLETS_ENABLED()) return localWalletDisabledResponse(res);

    const { orderId } = req.body;
    const order = await prisma.order.findFirst({
      where: { id: orderId, userId: req.user.id, paymentMethod: 'EASYPAISA' }
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.paymentStatus !== 'PAID' && sandboxConfirmAllowed()) {
      await finalizeOrderPayment(orderId, { paymentStatus: 'PAID', status: 'PROCESSING' });
    }

    const fresh = await prisma.order.findUnique({ where: { id: orderId } });
    if (fresh.paymentStatus !== 'PAID') {
      return res.status(409).json({
        success: false, pending: true,
        message: 'Payment not verified yet. Your order confirms automatically once EasyPaisa verifies it.'
      });
    }
    res.json({ success: true, message: 'EasyPaisa payment confirmed', order: fresh });
  } catch (error) {
    logger.error('EasyPaisa confirm error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to confirm payment' });
  }
};

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

    const amountInSmallestUnit = Math.round(total * 100);

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
//          The order is only ever created here, only if Stripe confirms the
//          charge actually succeeded, and — via the atomic claim below —
//          only ONCE even if this endpoint is called multiple times
//          concurrently for the same PaymentIntent.
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

    // Fast path: this payment was already fully processed by an earlier call.
    const existing = await prisma.order.findFirst({ where: { transactionId: paymentIntentId } });
    if (existing) {
      return res.json({ success: true, message: 'Payment already confirmed', order: existing });
    }

    // Atomic claim: paymentIntentId is unique, so if two requests race here,
    // exactly one create() succeeds and proceeds to place the order; the
    // other gets a unique-constraint error and backs off instead of also
    // creating an order.
    try {
      await prisma.paymentIntentClaim.create({ data: { paymentIntentId } });
    } catch (err) {
      if (err.code === 'P2002') {
        const created = await prisma.order.findFirst({ where: { transactionId: paymentIntentId } });
        if (created) return res.json({ success: true, message: 'Payment already confirmed', order: created });
        return res.status(409).json({
          success: false, pending: true,
          message: 'This payment is already being processed. Please wait a moment and refresh.'
        });
      }
      throw err;
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

    await prisma.paymentIntentClaim.update({
      where: { paymentIntentId }, data: { orderId: order.id }
    }).catch(() => {});

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

module.exports = {
  getPaymentConfig,
  initiateJazzCash, jazzCashReturn, confirmJazzCash,
  initiateEasyPaisa, easyPaisaReturn, confirmEasyPaisa,
  createCardPaymentIntent, confirmCardPayment, confirmCOD
};
