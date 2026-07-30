// src/routes/contact.routes.js
const express = require('express');
const router = express.Router();
const { submitContactMessage } = require('../controllers/contact.controller');
const { authLimiter } = require('../middleware/rateLimit');

router.post('/', authLimiter, submitContactMessage);

module.exports = router;