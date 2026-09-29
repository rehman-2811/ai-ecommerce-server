// src/services/credit.service.js
//
// All try-on credit balance changes go through here, so there is exactly
// one place that can add or remove credits and exactly one audit trail
// (CreditTransaction) recording why.
//
// IMPORTANT: deductCredits uses a *conditional atomic update*
// (`updateMany` with a `gte` guard) instead of "read balance, then write"
// or a Prisma `$transaction`. This is deliberate:
//   - MongoDB transactions require a replica set, which many local/dev
//     MongoDB setups don't have — this works on a plain standalone Mongo too.
//   - A single document update in MongoDB is always atomic, so this fully
//     closes the race condition where two simultaneous try-on requests
//     could otherwise both read "balance = 4" and both be allowed through,
//     letting the balance go negative.

const { prisma } = require('../config/database');
const { logger } = require('../utils/logger');

/** Adds credits to a user's balance (purchase, signup bonus, or refund) and logs it. */
async function addCredits(userId, credits, meta = {}) {
  if (!credits || credits <= 0) throw new Error('credits must be a positive number');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { tryOnCredits: { increment: credits } },
    select: { tryOnCredits: true },
  });

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: meta.type || 'PURCHASE',
      credits,
      balanceAfter: updated.tryOnCredits,
      amountPaid: meta.amountPaid,
      paymentMethod: meta.paymentMethod,
      transactionId: meta.transactionId,
      description: meta.description,
    },
  }).catch(err => logger.error('Failed to log credit transaction (addCredits):', err));

  return updated.tryOnCredits;
}

/**
 * Atomically deducts credits if (and only if) the user currently has
 * enough. Throws a 402 error with code INSUFFICIENT_CREDITS otherwise —
 * nothing is ever deducted on a failed attempt.
 */
async function deductCredits(userId, credits, meta = {}) {
  if (!credits || credits <= 0) throw new Error('credits must be a positive number');

  const result = await prisma.user.updateMany({
    where: { id: userId, tryOnCredits: { gte: credits } },
    data: { tryOnCredits: { decrement: credits } },
  });

  if (result.count === 0) {
    const err = new Error('Insufficient try-on credits. Please purchase more credits to continue.');
    err.statusCode = 402; // Payment Required
    err.code = 'INSUFFICIENT_CREDITS';
    throw err;
  }

  const updated = await prisma.user.findUnique({ where: { id: userId }, select: { tryOnCredits: true } });

  await prisma.creditTransaction.create({
    data: {
      userId,
      type: 'DEDUCT',
      credits: -credits,
      balanceAfter: updated.tryOnCredits,
      description: meta.description || 'Virtual try-on',
    },
  }).catch(err => logger.error('Failed to log credit transaction (deductCredits):', err));

  return updated.tryOnCredits;
}

async function getBalance(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { tryOnCredits: true } });
  return user?.tryOnCredits ?? 0;
}

async function getHistory(userId, { page = 1, limit = 20 } = {}) {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [transactions, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip, take: parseInt(limit),
    }),
    prisma.creditTransaction.count({ where: { userId } }),
  ]);
  return { transactions, total, pages: Math.ceil(total / parseInt(limit)) };
}

/**
 * Grants the credits for a purchase EXACTLY ONCE, no matter how many times
 * it is called (client confirm + gateway webhook + gateway retries).
 *
 * The guard is an atomic claim: updateMany({status:'PENDING'} -> 'PROCESSING').
 * A single-document update in MongoDB is atomic, so if 5 requests race,
 * exactly one gets count === 1 and grants credits; the other 4 get count === 0
 * and return without crediting. (A findFirst-then-write check would NOT be
 * safe here — two requests could both pass it.)
 *
 * Callers MUST verify the payment with the gateway BEFORE calling this.
 */
async function fulfillPurchase(providerTxnId) {
  const claim = await prisma.creditPurchase.updateMany({
    where: { providerTxnId, status: 'PENDING' },
    data: { status: 'PROCESSING' },
  });

  const purchase = await prisma.creditPurchase.findUnique({ where: { providerTxnId } });
  if (!purchase) {
    const err = new Error('Purchase not found');
    err.statusCode = 404;
    throw err;
  }

  if (claim.count === 0) {
    // Already granted (PAID), being granted by a concurrent request (PROCESSING), or FAILED.
    return { credited: false, status: purchase.status, userId: purchase.userId };
  }

  try {
    const balance = await addCredits(purchase.userId, purchase.credits, {
      type: 'PURCHASE',
      amountPaid: purchase.amount,
      paymentMethod: purchase.method,
      transactionId: providerTxnId,
      description: `Purchased ${purchase.credits} credits (${purchase.packageId})`,
    });
    await prisma.creditPurchase.update({
      where: { providerTxnId },
      data: { status: 'PAID', paidAt: new Date() },
    });
    return { credited: true, status: 'PAID', balance, userId: purchase.userId };
  } catch (err) {
    // Credits were not added — release the claim so a retry can succeed.
    await prisma.creditPurchase.updateMany({
      where: { providerTxnId, status: 'PROCESSING' },
      data: { status: 'PENDING' },
    }).catch(() => {});
    throw err;
  }
}

async function markPurchaseFailed(providerTxnId) {
  await prisma.creditPurchase.updateMany({
    where: { providerTxnId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
}

module.exports = { addCredits, deductCredits, getBalance, getHistory, fulfillPurchase, markPurchaseFailed };
