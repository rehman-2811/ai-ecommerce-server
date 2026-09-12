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

    return { cart, subtotal, tax, shippingCost, discount };
};

const applyCoupon = (couponCode, subtotal) => {
    if (couponCode === 'FIRST10') return subtotal * 0.1;
    if (couponCode === 'SAVE50') return Math.min(50, subtotal * 0.05);
    return 0;
};

const createPendingOrderFromCart = async ({ userId, shippingAddress, paymentMethod, couponCode, notes, paymentStatus = 'PENDING', status = 'PENDING', transactionId = null }) => {
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

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    return order;
};

const finalizeOrderPayment = async (orderId, { paymentStatus = 'PAID', status = 'PROCESSING', transactionId } = {}) => {
    const order = await prisma.$transaction(async (tx) => {
        const existingOrder = await tx.order.findUnique({
            where: { id: orderId },
            include: { items: true }
        });

        if (!existingOrder) {
            const err = new Error('Order not found');
            err.statusCode = 404;
            throw err;
        }

        if (existingOrder.paymentStatus === 'PAID') {
            return existingOrder;
        }

        for (const item of existingOrder.items) {
            const result = await tx.product.updateMany({
                where: { id: item.productId, stock: { gte: item.quantity } },
                data: { stock: { decrement: item.quantity }, popularity: { increment: 5 } }
            });

            if (result.count === 0) {
                await tx.product.updateMany({
                    where: { id: item.productId },
                    data: { stock: 0, popularity: { increment: 5 } }
                });
                logger.warn(`Stock ran out for product ${item.productId} while finalizing paid order ${orderId} — clamped to 0, please review.`);
            }
        }

        return tx.order.update({
            where: { id: orderId },
            data: {
                paymentStatus,
                status,
                ...(transactionId ? { transactionId } : {})
            },
            include: { items: true }
        });
    });

    for (const item of order.items) {
        await prisma.interaction.upsert({
            where: { userId_productId_type: { userId: order.userId, productId: item.productId, type: 'PURCHASE' } },
            update: { weight: { increment: 10 }, createdAt: new Date() },
            create: { userId: order.userId, productId: item.productId, type: 'PURCHASE', weight: 10 }
        }).catch(() => { });
    }

    const user = await prisma.user.findUnique({ where: { id: order.userId }, select: { name: true, email: true } });
    if (user) {
        const orderMail = orderConfirmationEmailTemplate(user, order);
        sendEmail({ to: user.email, subject: orderMail.subject, html: orderMail.html })
            .catch(err => logger.warn('Order email failed:', err.message));
    }

    return order;
};

const placeOrderFromCart = async (params) => {
    const pendingOrder = await createPendingOrderFromCart({
        ...params,
        paymentStatus: params.paymentStatus === 'PAID' ? 'PENDING' : params.paymentStatus,
        status: 'PENDING'
    });

    return finalizeOrderPayment(pendingOrder.id, {
        paymentStatus: params.paymentStatus === 'PAID' ? 'PAID' : 'PENDING',
        status: params.status || 'PROCESSING',
        transactionId: params.transactionId
    });
};

module.exports = {
    calculateCartTotals,
    applyCoupon,
    createPendingOrderFromCart,
    finalizeOrderPayment,
    placeOrderFromCart,
    generateOrderNumber
};