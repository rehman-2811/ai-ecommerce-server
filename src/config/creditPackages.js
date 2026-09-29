// src/config/creditPackages.js
//
// Single source of truth for the try-on credit economy.
//
// TRY_ON_COST_CREDITS must match the default value given to new users in
// prisma/schema.prisma (User.tryOnCredits @default(8)) — 8 / 4 = 2 free
// try-ons for every new signup. If you change one, change the other.

const TRY_ON_COST_CREDITS = 4;      // credits deducted per try-on
const SIGNUP_BONUS_CREDITS = 8;     // must match schema.prisma default

// Prices are illustrative — tune them against your real FASHN API cost
// (2 of *their* credits per image) plus margin.
const CREDIT_PACKAGES = [
  { id: 'starter', label: 'Starter', credits: 20, tryOns: 5, price: 499 },
  { id: 'popular', label: 'Popular', credits: 60, tryOns: 15, price: 1499, mostPopular: true },
  { id: 'pro', label: 'Pro', credits: 200, tryOns: 50, price: 2499 },
];

function getPackageById(id) {
  return CREDIT_PACKAGES.find(p => p.id === id) || null;
}

module.exports = { TRY_ON_COST_CREDITS, SIGNUP_BONUS_CREDITS, CREDIT_PACKAGES, getPackageById };
