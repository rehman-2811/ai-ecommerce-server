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
      from: process.env.EMAIL_FROM || "....<Aqua Fits>....",
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, '')
    });

    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Email send error:', error);
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
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:30px;font-family:Arial,sans-serif;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #e5e7eb;">
<tr><td style="background:#111827;padding:30px;text-align:center;">
<h1 style="margin:0;color:#d4af37;letter-spacing:2px;">AQUA FITS</h1>
<p style="margin:8px 0 0;color:#d1d5db;">Premium Fashion Experience</p>
</td></tr>
<tr><td style="padding:30px;">
<div style="background:#ecfdf5;border:1px solid #bbf7d0;padding:12px 18px;border-radius:30px;display:inline-block;color:#166534;font-weight:bold;">✔ ORDER CONFIRMED</div>
<h2 style="color:#111827;">Hello ${user.name},</h2>
<p style="color:#6b7280;">Thank you for shopping with Aqua Fits. Your order has been confirmed successfully.</p>

<table width="100%" cellpadding="12" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
<tr><td><b>Order #</b><br>${order.orderNumber}</td>
<td align="right"><b>Total</b><br>PKR ${order.total.toLocaleString()}</td></tr>
</table>

<h3 style="margin-top:30px;color:#111827;">Items</h3>

<table width="100%" cellpadding="10" cellspacing="0" style="border-collapse:collapse;">
<tr style="background:#111827;color:#d4af37;">
<th align="left">Product</th>
<th align="center">Qty</th>
<th align="right">Price</th>
</tr>
${itemsHtml}
</table>

<table width="100%" cellpadding="6" cellspacing="0" style="margin-top:25px;">
<tr><td>Subtotal</td><td align="right">PKR ${order.subtotal.toLocaleString()}</td></tr>
<tr><td>Shipping</td><td align="right">PKR ${order.shippingCost.toLocaleString()}</td></tr>
<tr><td style="border-top:2px solid #e5e7eb;font-weight:bold;font-size:18px;">Grand Total</td>
<td align="right" style="border-top:2px solid #e5e7eb;color:#d4af37;font-weight:bold;font-size:18px;">PKR ${order.total.toLocaleString()}</td></tr>
</table>

<div style="text-align:center;margin:30px 0;">
<a href="#" style="background:#d4af37;color:#111827;text-decoration:none;padding:14px 34px;border-radius:40px;font-weight:bold;">View Order</a>
</div>

<hr style="border:none;border-top:1px solid #e5e7eb;">
<p style="color:#6b7280;text-align:center;">Need help? Reply to this email or contact support.</p>
</td></tr>

<tr><td style="background:#111827;color:#9ca3af;text-align:center;padding:20px;">
© 2026 Aqua Fits • Premium Experience
</td></tr>
</table>
</td></tr>
</table>

`
  });
};

module.exports = { sendEmail, sendOrderConfirmation };
