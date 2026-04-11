// src/controllers/order.controller.js
const { prisma } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { sendEmail } = require('../services/email.service');
const { logger } = require('../utils/logger');

const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

// @desc    Create order
// @route   POST /api/orders/create
const createOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod, couponCode, notes } = req.body;

    // Get cart
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.id },
      include: {
        items: {
          include: { product: true }
        }
      }
    });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Validate stock
    for (const item of cart.items) {
      if (item.product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.product.name}`
        });
      }
    }

    // Calculate totals
    const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.0; // Can add tax logic
    const shippingCost = subtotal > 2000 ? 0 : 150; // Free shipping over 2000 PKR
    let discount = 0;

    // Simple coupon logic
    if (couponCode === 'FIRST10') discount = subtotal * 0.1;
    if (couponCode === 'SAVE50') discount = Math.min(50, subtotal * 0.05);

    const total = subtotal + tax + shippingCost - discount;

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userId: req.user.id,
        subtotal,
        tax,
        shippingCost,
        discount,
        total,
        couponCode,
        paymentMethod,
        shippingAddress,
        notes,
        status: 'PENDING',
        paymentStatus: paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
        items: {
          create: cart.items.map(item => ({
            productId: item.productId,
            name: item.product.name,
            price: item.price,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
            image: item.product.images?.[0]?.url || null
          }))
        }
      },
      include: { items: true }
    });

    // Update stock
    for (const item of cart.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
          popularity: { increment: 5 }
        }
      });

      // Track purchase interaction
      await prisma.interaction.create({
        data: { userId: req.user.id, productId: item.productId, type: 'PURCHASE', weight: 10 }
      }).catch(() => {});
    }

    // Clear cart
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    // Send order confirmation email
    sendEmail({
      to: req.user.email,
      subject: `Order Confirmed - ${order.orderNumber}`,
      html: `
        <h2>Order Confirmed!</h2>
        <p>Thank you for your order, ${req.user.name}!</p>
        <p><strong>Order Number:</strong> ${order.orderNumber}</p>
        <p><strong>Total:</strong> PKR ${total.toLocaleString()}</p>
        <p><strong>Payment:</strong> ${paymentMethod}</p>
        <p>We'll notify you when your order is shipped.</p>
      `
    }).catch(err => logger.warn('Order email failed:', err.message));

    res.status(201).json({ success: true, order });
  } catch (error) {
    logger.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

// @desc    Get my orders
// @route   GET /api/orders/my-orders
const getMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: req.user.id },
        include: {
          items: {
            include: { product: { select: { name: true, images: true } } }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip, take: parseInt(limit)
      }),
      prisma.order.count({ where: { userId: req.user.id } })
    ]);

    res.json({ success: true, orders, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get orders' });
  }
};

// @desc    Get order by ID
// @route   GET /api/orders/:id
const getOrderById = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        items: {
          include: { product: { select: { name: true, images: true, garmentImageUrl: true } } }
        }
      }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get order' });
  }
};

// @desc    Cancel order
// @route   POST /api/orders/:id/cancel
const cancelOrder = async (req, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: true }
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['PENDING', 'PROCESSING'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CANCELLED' }
    });

    // Restore stock
    for (const item of order.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } }
      });
    }

    res.json({ success: true, message: 'Order cancelled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
};

module.exports = { createOrder, getMyOrders, getOrderById, cancelOrder };
