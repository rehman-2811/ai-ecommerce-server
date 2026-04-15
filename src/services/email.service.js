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
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:20px;font-family:Arial,sans-serif">
  <tr>
    <td align="center">

      <!-- Main Container -->
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border:1px solid #2c2c2c">

        <!-- Header -->
        <tr>
          <td style="background:#000;padding:20px;text-align:center">
            <h1 style="color:#d8a20e;margin:0;letter-spacing:1px">
              AI Ecommerce
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:25px;color:#e0e0e0">

            <h2 style="color:#ffffff;margin-bottom:10px">
              🎉 Order Confirmed!
            </h2>

            <p style="color:#ccc;font-size:14px">
              Hello <strong>${user.name}</strong>, your order has been successfully placed.
            </p>

            <!-- Order Box -->
            <div style="background:#111;border:1px solid #333;padding:12px;margin:15px 0">
              <p style="margin:0;color:#d8a20e">
                <strong>Order #:</strong> ${order.orderNumber}
              </p>
            </div>

            <!-- Items Table -->
            <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin-top:15px;font-size:14px">
              <tr style="background:#222;color:#d8a20e">
                <th align="left">Product</th>
                <th align="center">Qty</th>
                <th align="right">Price</th>
              </tr>
              ${itemsHtml}
            </table>

            <!-- Totals -->
            <div style="margin-top:20px;text-align:right;border-top:1px solid #333;padding-top:10px">
              <p style="margin:5px 0"><strong>Subtotal:</strong> PKR ${order.subtotal.toLocaleString()}</p>
              <p style="margin:5px 0"><strong>Shipping:</strong> PKR ${order.shippingCost.toLocaleString()}</p>
              <p style="margin:8px 0;color:#d8a20e;font-size:16px">
                <strong>Total: PKR ${order.total.toLocaleString()}</strong>
              </p>
            </div>

            <!-- Button -->
            <div style="text-align:center;margin:25px 0">
              <a href="#"
                 style="background:#d8a20e;color:#000;padding:12px 25px;text-decoration:none;
                 font-weight:bold;display:inline-block;border-radius:4px">
                 View Order
              </a>
            </div>

            <!-- Footer text -->
            <p style="text-align:center;color:#888;font-size:13px">
              We'll notify you when your order ships 🚚
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#000;color:#777;text-align:center;padding:12px;font-size:12px">
            © 2026 AI Ecommerce • Premium Experience
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
`
  });
};

module.exports = { sendEmail, sendOrderConfirmation };
