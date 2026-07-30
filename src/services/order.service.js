// src/services/order.service.js
const { prisma } = require('../config/database');
const { sendEmail } = require('../services/email.service');
const { orderConfirmationEmailTemplate } = require('../utils/emailTemplates');
const { logger } = require('../utils/logger');

const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
};

/**
 * Calculates totals for a user's current cart, applying the same shipping/coupon
 * rules used at checkout. Throws an Error with a user-facing message on failure
 * (empty cart, insufficient stock).
 */
const calculateCartTotals = async (userId) => {
    const cart = await prisma.cart.findUnique({
        where: { userId },
        include: { items: { include: { product: true } } }
    });

    if (!cart || cart.items.length === 0) {
        const err = new Error('Cart is empty');
        err.statusCode = 400;
        throw err;
    }

    for (const item of cart.items) {
        if (item.product.stock < item.quantity) {
            const err = new Error(`Insufficient stock for ${item.product.name}`);
            err.statusCode = 400;
            throw err;
        }
    }

    const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = subtotal * 0.0;
    const shippingCost = subtotal > 2000 ? 0 : 150;
    let discount = 0;
    // (couponCode is applied by the caller since it isn't stored on the cart)

    return { cart, subtotal, tax, shippingCost, discount };
};

const applyCoupon = (couponCode, subtotal) => {
    if (couponCode === 'FIRST10') return subtotal * 0.1;
    if (couponCode === 'SAVE50') return Math.min(50, subtotal * 0.05);
    return 0;
};

/**
 * Actually places the order: creates the Order + OrderItems, decrements stock,
 * records purchase interactions, clears the cart, and emails a confirmation.
 * This should only ever be called once payment is either not required upfront
 * (COD/wallet-initiate) or has already succeeded (card payments).
 */
const placeOrderFromCart = async ({ userId, userEmail, userName, shippingAddress, paymentMethod, couponCode, notes, paymentStatus = 'PENDING', status = 'PENDING', transactionId = null }) => {
    const { cart, subtotal, tax, shippingCost } = await calculateCartTotals(userId);
    const discount = applyCoupon(couponCode, subtotal);
    const total = subtotal + tax + shippingCost - discount;

    const order = await prisma.order.create({
        data: {
            orderNumber: generateOrderNumber(),
            userId,
            subtotal,
            tax,
            shippingCost,
            discount,
            total,
            couponCode,
            paymentMethod,
            shippingAddress,
            notes,
            status,
            paymentStatus,
            transactionId,
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

    for (const item of cart.items) {
        await prisma.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity }, popularity: { increment: 5 } }
        });
        await prisma.interaction.create({
            data: { userId, productId: item.productId, type: 'PURCHASE', weight: 10 }
        }).catch(() => { });
    }

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    //   sendEmail({
    //     to: userEmail,
    //     subject: `Order Confirmed - ${order.orderNumber}`,
    //     html: `
    //       <h2>Order Confirmed!</h2>
    //       <p>Thank you for your order, ${userName}!</p>
    //       <p><strong>Order Number:</strong> ${order.orderNumber}</p>
    //       <p><strong>Total:</strong> PKR ${total.toLocaleString()}</p>
    //       <p><strong>Payment:</strong> ${paymentMethod}</p>
    //       <p>We'll notify you when your order is shipped.</p>
    //     `
    //   }).catch(err => logger.warn('Order email failed:', err.message));

    const orderMail = orderConfirmationEmailTemplate({ name: userName }, order);
    sendEmail({
        to: userEmail,
        subject: orderMail.subject,
        html: orderMail.html
    }).catch(err => logger.warn('Order email failed:', err.message));

    return order;
};

module.exports = { calculateCartTotals, applyCoupon, placeOrderFromCart, generateOrderNumber };