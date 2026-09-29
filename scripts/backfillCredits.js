// scripts/backfillCredits.js
//
// Run ONCE after adding User.tryOnCredits to the schema:
//   node scripts/backfillCredits.js
//
// Why: MongoDB documents created before the field existed simply don't
// have it, and Prisma errors on a required Int that is missing. This sets
// the starting balance (8 credits = 2 free try-ons) on every user that
// doesn't have the field yet. Safe to re-run — it never touches users that
// already have a balance.

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { SIGNUP_BONUS_CREDITS } = require('../src/config/creditPackages');

const prisma = new PrismaClient();

(async () => {
  try {
    const result = await prisma.$runCommandRaw({
      update: 'User',
      updates: [{
        q: { tryOnCredits: { $exists: false } },
        u: { $set: { tryOnCredits: SIGNUP_BONUS_CREDITS } },
        multi: true,
      }],
    });
    console.log(`Backfill done. Users updated: ${result.nModified ?? 0}`);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
