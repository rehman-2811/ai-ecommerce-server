// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { register, login, logout, refreshToken, getMe, forgotPassword, resetPassword, updateProfile, changePassword, googleAuth, googleAuthUserInfo } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', protect, logout);
router.post('/refresh-token', refreshToken);
router.get('/me', protect, getMe);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.put('/update-profile', protect, updateProfile);
router.post('/change-password', protect, changePassword);
router.post('/google', authLimiter, googleAuth);
router.post('/google-userinfo', authLimiter, googleAuthUserInfo);

module.exports = router;
