// src/config/stripe.js
const Stripe = require('stripe');
const { logger } = require('../utils/logger');

if (!process.env.STRIPE_SECRET_KEY) {
  logger.warn('STRIPE_SECRET_KEY is not set — card payments will fail until it is configured in .env');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2023-10-16'
});

module.exports = stripe;