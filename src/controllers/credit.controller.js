// src/controllers/credit.controller.js
//
// RULE FOR EVERYTHING IN THIS FILE:
//   1. Verify the payment with the gateway itself (never trust the browser).
//   2. Only then call fulfillPurchase(), which grants credits exactly once.
// Credits/price always come from the CreditPurchase row the SERVER created
// at initiate time — never from anything the client sends back later.

const crypto = require('crypto');
const { prisma } = require('../config/database');
const stripe = require('../config/stripe');
const { logger } = require('../utils/logger');
const { getBalance, getHistory, fulfillPurchase, markPurchaseFailed } = require('../services/credit.service');
const { CREDIT_PACKAGES, TRY_ON_COST_CREDITS, getPackageById } = require('../config/creditPackages');

// Sandbox-only shortcut for JazzCash/EasyPaisa (see confirm handlers). Never on in production.
const sandboxConfirmAllowed = () =>
  process.env.NODE_ENV !== 'production' || process.env.ALLOW_SANDBOX_PAYMENT_CONFIRM === 'true';

const getPackages = async (req, res) => {
  res.json({ success: true, packages: CREDIT_PACKAGES, tryOnCost: TRY_ON_COST_CREDITS, enableLocalWallets: process.env.ENABLE_LOCAL_WALLETS === 'true' });
};

const getMyBalance = async (req, res) => {
  const credits = await getBalance(req.user.id);
  res.json({ success: true, credits, tryOnCost: TRY_ON_COST_CREDITS, tryOnsRemaining: Math.floor(credits / TRY_ON_COST_CREDITS) });
};

const getMyHistory = async (req, res) => {
  const { page, limit } = req.query;
  const result = await getHistory(req.user.id, { page, limit });
  res.json({ success: true, ...result });
};

// ======================= CARD (Stripe) =======================

// Verifies a PaymentIntent against OUR stored purchase, then fulfils it once.
async function verifyAndFulfillStripe(paymentIntentId, expectedUserId) {
  const purchase = await prisma.creditPurchase.findUnique({ where: { providerTxnId: paymentIntentId } });
  if (!purchase || (expectedUserId && purchase.userId !== expectedUserId)) {
    const err = new Error('No matching credit purchase for this payment');
    err.statusCode = 404;
    throw err;
  }

  // Ask Stripe directly — this is the actual proof of payment.
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status !== 'succeeded') {
    const err = new Error(`Payment was not completed (status: ${pi.status}) — no credits were granted`);
    err.statusCode = 400;
    throw err;
  }
  // Amount/currency must match what the server priced, so a cheaper intent can't buy a bigger package.
  if (pi.amount_received !== Math.round(purchase.amount * 100) || pi.currency !== 'pkr') {
    logger.error(`Credit purchase amount mismatch for ${paymentIntentId}: got ${pi.amount_received} ${pi.currency}`);
    const err = new Error('Payment amount does not match the selected package');
    err.statusCode = 400;
    throw err;
  }
  if (pi.metadata?.userId !== purchase.userId) {
    const err = new Error('Payment does not belong to this account');
    err.statusCode = 403;
    throw err;
  }

  return fulfillPurchase(paymentIntentId);
}

// POST /api/credits/card/create-intent
const createCardIntent = async (req, res) => {
  try {
    const pkg = getPackageById(req.body.packageId);
    if (!pkg) return res.status(400).json({ success: false, message: 'Invalid credit package' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(pkg.price * 100),
      currency: 'pkr',
      metadata: { purpose: 'CREDIT_TOPUP', userId: req.user.id, packageId: pkg.id },
      description: `${pkg.credits} try-on credits (${pkg.label}) for ${req.user.email}`,
      automatic_payment_methods: { enabled: true },
    });

    await prisma.creditPurchase.create({
      data: {
        userId: req.user.id, providerTxnId: paymentIntent.id, method: 'CARD',
        packageId: pkg.id, credits: pkg.credits, amount: pkg.price,
      },
    });

    res.json({ success: true, clientSecret: paymentIntent.client_secret, package: pkg });
  } catch (error) {
    logger.error('Create credit intent error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to start payment' });
  }
};

// POST /api/credits/card/confirm  (called by the browser after Stripe confirms)
const confirmCardPurchase = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    if (!paymentIntentId) return res.status(400).json({ success: false, message: 'paymentIntentId is required' });

    const result = await verifyAndFulfillStripe(paymentIntentId, req.user.id);
    const credits = await getBalance(req.user.id);
    res.json({
      success: true,
      message: result.credited ? 'Credits added successfully' : 'Payment already processed',
      credits,
    });
  } catch (error) {
    logger.error('Confirm credit purchase error:', error);
    res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Failed to confirm payment' });
  }
};

// POST /api/credits/stripe/webhook  — Stripe -> our server, signature-verified.
// Mounted in server.js BEFORE express.json() because the signature is computed
// over the raw request body. Stripe re-sends events on timeouts/errors; the
// atomic claim in fulfillPurchase makes every repeat delivery harmless.
const stripeCreditWebhook = async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send('Invalid signature');
  }

  try {
    const pi = event.data.object;
    // The same Stripe account also takes order payments — ignore anything that isn't a credit top-up.
    if (pi?.metadata?.purpose === 'CREDIT_TOPUP') {
      if (event.type === 'payment_intent.succeeded') {
        await verifyAndFulfillStripe(pi.id);
      } else if (event.type === 'payment_intent.payment_failed') {
        await markPurchaseFailed(pi.id);
      }
    }
    res.json({ received: true });
  } catch (error) {
    logger.error('Stripe credit webhook processing error:', error);
    // 500 => Stripe retries later, which is safe because fulfilment is idempotent.
    res.status(500).json({ received: false });
  }
};

// ======================= JAZZCASH =======================

// JazzCash signs callbacks: HMAC-SHA256 of (integritySalt & every non-empty pp_* value,
// ordered by field name), keyed with the integrity salt. Confirm the exact ordering
// against your JazzCash merchant documentation before going live.
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

// POST /api/credits/jazzcash/initiate
const initiateJazzCashPurchase = async (req, res) => {
  try {
    if (process.env.ENABLE_LOCAL_WALLETS !== 'true') {
      return res.status(503).json({ success: false, message: 'This payment method is temporarily unavailable. Please use Card.' });
    }
    const pkg = getPackageById(req.body.packageId);
    if (!pkg) return res.status(400).json({ success: false, message: 'Invalid credit package' });

    const merchantId = process.env.JAZZCASH_MERCHANT_ID;
    const password = process.env.JAZZCASH_PASSWORD;
    const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT;
    const returnUrl = process.env.JAZZCASH_CREDIT_RETURN_URL || process.env.JAZZCASH_RETURN_URL;

    const txnRefNo = `TC${Date.now()}`;
    const txnDateTime = new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
    const txnExpiryDateTime = new Date(Date.now() + 30 * 60000).toISOString().replace(/[-:T.Z]/g, '').substring(0, 14);
    const amountStr = Math.round(pkg.price * 100).toString();

    const hashString = `${integritySalt}&${amountStr}&MWALLET&${merchantId}&${txnDateTime}&${txnExpiryDateTime}&PKR&${txnRefNo}&${returnUrl}&Sale`;
    const secureHash = crypto.createHmac('sha256', integritySalt).update(hashString).digest('hex').toUpperCase();

    await prisma.creditPurchase.create({
      data: {
        userId: req.user.id, providerTxnId: txnRefNo, method: 'JAZZCASH',
        packageId: pkg.id, credits: pkg.credits, amount: pkg.price,
      },
    });

    res.json({
      success: true,
      paymentUrl: 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
      paymentData: {
        pp_Version: '1.1', pp_TxnType: 'MWALLET', pp_Language: 'EN',
        pp_MerchantID: merchantId, pp_Password: password, pp_TxnRefNo: txnRefNo,
        pp_Amount: amountStr, pp_TxnCurrency: 'PKR', pp_TxnDateTime: txnDateTime,
        pp_TxnExpiryDateTime: txnExpiryDateTime, pp_ReturnURL: returnUrl,
        pp_Description: `${pkg.credits} try-on credits`, pp_SecureHash: secureHash,
      },
    });
  } catch (error) {
    logger.error('JazzCash credit initiate error:', error);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
};

// POST /api/credits/jazzcash/return  — JazzCash -> our server. NOT behind login
// (the gateway isn't a logged-in user); trust comes from the secure-hash check.
// If JazzCash posts the same callback twice, the second one credits nothing.
const jazzCashCreditReturn = async (req, res) => {
  const clientUrl = process.env.CLIENT_URL;
  try {
    const body = req.body || {};
    const txnRefNo = body.pp_TxnRefNo;

    if (!verifyJazzCashHash(body)) {
      logger.warn(`JazzCash credit callback with INVALID hash for ${txnRefNo}`);
      return res.redirect(`${clientUrl}/try-on?credits=failed`);
    }

    const purchase = await prisma.creditPurchase.findUnique({ where: { providerTxnId: txnRefNo } });
    if (!purchase) return res.redirect(`${clientUrl}/try-on?credits=failed`);

    const amountOk = String(body.pp_Amount) === String(Math.round(purchase.amount * 100));
    if (body.pp_ResponseCode === '000' && amountOk) {
      await fulfillPurchase(txnRefNo);
      return res.redirect(`${clientUrl}/try-on?credits=success`);
    }

    await markPurchaseFailed(txnRefNo);
    res.redirect(`${clientUrl}/try-on?credits=failed`);
  } catch (error) {
    logger.error('JazzCash credit return error:', error);
    res.redirect(`${clientUrl}/try-on?credits=failed`);
  }
};

// POST /api/credits/jazzcash/confirm  (browser-triggered)
// The browser is NOT proof of payment. In production this only *reports* the
// state set by the verified callback above. The immediate-grant path exists
// solely so the sandbox demo works, mirroring the existing order flow.
const confirmJazzCashPurchase = async (req, res) => {
  try {
    const purchase = await prisma.creditPurchase.findFirst({
      where: { providerTxnId: req.body.txnRefNo, userId: req.user.id, method: 'JAZZCASH' },
    });
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });

    if (purchase.status !== 'PAID' && sandboxConfirmAllowed()) await fulfillPurchase(purchase.providerTxnId);

    const fresh = await prisma.creditPurchase.findUnique({ where: { providerTxnId: purchase.providerTxnId } });
    if (fresh.status !== 'PAID') {
      return res.status(409).json({ success: false, pending: true, message: 'Payment not verified yet. Credits are added once JazzCash confirms.' });
    }
    res.json({ success: true, message: 'JazzCash payment confirmed', credits: await getBalance(req.user.id) });
  } catch (error) {
    logger.error('JazzCash credit confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
};

// ======================= EASYPAISA =======================

// POST /api/credits/easypaisa/initiate
const initiateEasyPaisaPurchase = async (req, res) => {
  try {
    if (process.env.ENABLE_LOCAL_WALLETS !== 'true') {
      return res.status(503).json({ success: false, message: 'This payment method is temporarily unavailable. Please use Card.' });
    }
    const { packageId, mobileNumber } = req.body;
    const pkg = getPackageById(packageId);
    if (!pkg) return res.status(400).json({ success: false, message: 'Invalid credit package' });

    const storeId = process.env.EASYPAISA_STORE_ID;
    const hashKey = process.env.EASYPAISA_HASH_KEY;
    const ordNum = `EPC${Date.now()}`;
    const expiryDate = new Date(Date.now() + 30 * 60000).toISOString().replace('T', ' ').substring(0, 19);

    const hashStr = `amount=${pkg.price}&expiryDate=${expiryDate}&mobileAccountNo=${mobileNumber}&orderRefNum=${ordNum}&storeId=${storeId}&transactionType=MA${hashKey}`;
    const hash = crypto.createHash('md5').update(hashStr).digest('hex').toUpperCase();

    await prisma.creditPurchase.create({
      data: {
        userId: req.user.id, providerTxnId: ordNum, method: 'EASYPAISA',
        packageId: pkg.id, credits: pkg.credits, amount: pkg.price,
      },
    });

    res.json({
      success: true,
      paymentUrl: 'https://easypaisaacquiringapi.telenor.com.pk/api/Payment/InitiateTransaction',
      paymentData: {
        storeId, amount: pkg.price.toFixed(2), orderRefNum: ordNum, expiryDate,
        mobileAccountNo: mobileNumber, transactionType: 'MA', bankIdentityCode: 'EPBL',
        encryptedHashRequest: hash,
      },
    });
  } catch (error) {
    logger.error('EasyPaisa credit initiate error:', error);
    res.status(500).json({ success: false, message: 'Payment initiation failed' });
  }
};

// POST /api/credits/easypaisa/confirm
// No verified gateway callback exists for EasyPaisa in this codebase (its
// callback format must come from your EasyPaisa merchant docs), so outside
// the sandbox this refuses to grant credits rather than grant unverified ones.
const confirmEasyPaisaPurchase = async (req, res) => {
  try {
    const purchase = await prisma.creditPurchase.findFirst({
      where: { providerTxnId: req.body.orderRefNum, userId: req.user.id, method: 'EASYPAISA' },
    });
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });

    if (purchase.status !== 'PAID' && sandboxConfirmAllowed()) await fulfillPurchase(purchase.providerTxnId);

    const fresh = await prisma.creditPurchase.findUnique({ where: { providerTxnId: purchase.providerTxnId } });
    if (fresh.status !== 'PAID') {
      return res.status(409).json({ success: false, pending: true, message: 'Payment not verified yet. Credits are added once EasyPaisa confirms.' });
    }
    res.json({ success: true, message: 'EasyPaisa payment confirmed', credits: await getBalance(req.user.id) });
  } catch (error) {
    logger.error('EasyPaisa credit confirm error:', error);
    res.status(500).json({ success: false, message: 'Failed to confirm payment' });
  }
};

module.exports = {
  getPackages, getMyBalance, getMyHistory,
  createCardIntent, confirmCardPurchase, stripeCreditWebhook,
  initiateJazzCashPurchase, jazzCashCreditReturn, confirmJazzCashPurchase,
  initiateEasyPaisaPurchase, confirmEasyPaisaPurchase,
};
