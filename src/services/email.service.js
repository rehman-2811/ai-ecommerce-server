// src/services/email.service.js
const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

let transporter = null;

const createTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
  });

  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn('Email credentials not configured - skipping email');
      return;
    }

    const transport = createTransporter();

    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || '"AI Ecommerce" <noreply@aiecommerce.com>',
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, '')
    });

    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Email send error:', error.message);
    throw error;
  }
};

const sendOrderConfirmation = async (user, order) => {
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${item.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">PKR ${item.price.toLocaleString()}</td>
    </tr>
  `).join('');

  return sendEmail({
    to: user.email,
    subject: `Order Confirmed #${order.orderNumber}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1a1a1a;padding:20px;text-align:center">
          <h1 style="color:white;margin:0">AI Ecommerce</h1>
        </div>
        <div style="padding:30px;background:#f9f9f9">
          <h2 style="color:#1a1a1a">Order Confirmed!</h2>
          <p>Hello ${user.name}, your order has been confirmed.</p>
          <p><strong>Order #:</strong> ${order.orderNumber}</p>
          
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <thead>
              <tr style="background:#1a1a1a;color:white">
                <th style="padding:10px;text-align:left">Product</th>
                <th style="padding:10px;text-align:center">Qty</th>
                <th style="padding:10px;text-align:right">Price</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          
          <div style="text-align:right;border-top:2px solid #1a1a1a;padding-top:10px">
            <p><strong>Subtotal:</strong> PKR ${order.subtotal.toLocaleString()}</p>
            <p><strong>Shipping:</strong> PKR ${order.shippingCost.toLocaleString()}</p>
            <p style="font-size:1.2em;color:#8B4513"><strong>Total: PKR ${order.total.toLocaleString()}</strong></p>
          </div>
          
          <p><strong>Payment:</strong> ${order.paymentMethod}</p>
          <p>We'll notify you when your order ships!</p>
        </div>
      </div>
    `
  });
};

module.exports = { sendEmail, sendOrderConfirmation };
