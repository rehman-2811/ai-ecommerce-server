// src/controllers/cart.controller.js
const { prisma } = require('../config/database');

// @desc    Get user cart
// @route   GET /api/cart
const getCart = async (req, res) => {
  try {
    let cart = await prisma.cart.findUnique({
      where: { userId: req.user.id },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, price: true, images: true, stock: true, sizes: true, colors: true }
            }
          }
        }
      }
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: req.user.id },
        include: { items: { include: { product: true } } }
      });
    }

    const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    res.json({ success: true, cart, subtotal, itemCount: cart.items.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get cart' });
  }
};

// @desc    Add item to cart
// @route   POST /api/cart/add
const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, size, color } = req.body;

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ success: false, message: 'Insufficient stock' });

    let cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId: req.user.id } });
    }

    // Check if item already in cart
    const existingItem = await prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId, size: size || null, color: color || null }
    });

    let item;
    if (existingItem) {
      item = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + quantity }
      });
    } else {
      item = await prisma.cartItem.create({
        data: { cartId: cart.id, productId, quantity, size, color, price: product.price }
      });
    }

    // Track interaction
    await prisma.interaction.create({
      data: { userId: req.user.id, productId, type: 'ADD_TO_CART', weight: 3 }
    }).catch(() => {});

    res.json({ success: true, message: 'Item added to cart', item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add to cart' });
  }
};

// @desc    Update cart item quantity
// @route   PUT /api/cart/update
const updateCart = async (req, res) => {
  try {
    const { itemId, quantity } = req.body;

    if (quantity < 1) {
      await prisma.cartItem.delete({ where: { id: itemId } });
      return res.json({ success: true, message: 'Item removed' });
    }

    const item = await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity }
    });

    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update cart' });
  }
};

// @desc    Remove cart item
// @route   DELETE /api/cart/remove/:itemId
const removeFromCart = async (req, res) => {
  try {
    await prisma.cartItem.delete({ where: { id: req.params.itemId } });
    res.json({ success: true, message: 'Item removed from cart' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to remove item' });
  }
};

// @desc    Clear cart
// @route   DELETE /api/cart/clear
const clearCart = async (req, res) => {
  try {
    const cart = await prisma.cart.findUnique({ where: { userId: req.user.id } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    res.json({ success: true, message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to clear cart' });
  }
};

module.exports = { getCart, addToCart, updateCart, removeFromCart, clearCart };
