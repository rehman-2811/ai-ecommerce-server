// src/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const {
  getDashboard, getAllProducts, createProduct, updateProduct, deleteProduct,
  getAllOrders, updateOrderStatus, getAllUsers, updateUser,
  getVTONAnalytics, getReports
} = require('../controllers/admin.controller');
const { protect, adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.use(protect, adminOnly);

// Dashboard
router.get('/dashboard', getDashboard);

// Products
router.get('/products', getAllProducts);
router.post('/products', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'garmentImage', maxCount: 1 }
]), createProduct);
router.put('/products/:id', upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'garmentImage', maxCount: 1 }
]), updateProduct);
router.delete('/products/:id', deleteProduct);

// Orders
router.get('/orders', getAllOrders);
router.put('/orders/:id/status', updateOrderStatus);

// Users
router.get('/users', getAllUsers);
router.put('/users/:id', updateUser);

// Analytics & Reports
router.get('/vton-analytics', getVTONAnalytics);
router.get('/reports', getReports);

module.exports = router;
