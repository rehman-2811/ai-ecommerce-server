// src/utils/emailTemplates.js
// Shared, brand-consistent HTML email templates. All templates use inline
// styles and table-based layout (required for reliable rendering across
// email clients like Outlook/Gmail) and share the same brown/gold palette
// used across the Aqua Fits storefront.

const BRAND = {
  name: 'Aqua Fits',
  primary: '#8B4513',      // saddle brown
  accent: '#D2691E',       // chocolate/orange
  gradient: 'linear-gradient(135deg, #8B4513, #D2691E)',
  bg: '#f9f6f3',           // cream page background
  card: '#ffffff',
  text: '#2b2b2b',
  muted: '#7a7a7a',
  border: '#eee2d8',
  success: '#1e7e34',
  successBg: '#e9f7ef',
  danger: '#c0392b',
  dangerBg: '#fdecea'
};

const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

/**
 * Wraps any content block in the shared header/footer shell.
 */
const emailLayout = ({ preheader = '', bodyHtml }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <span style="display:none;font-size:1px;color:${BRAND.bg};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:${BRAND.card};border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(139,69,19,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND.gradient};padding:28px 32px;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,0.2);line-height:48px;text-align:center;font-size:22px;margin-bottom:10px;">👗</div>
                    <h1 style="margin:0;color:#ffffff;font-size:24px;letter-spacing:2px;font-weight:700;text-transform:uppercase;">${BRAND.name}</h1>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:1px;text-transform:uppercase;">Fashion, Fitted Perfectly</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#faf7f4;padding:22px 32px;text-align:center;border-top:1px solid ${BRAND.border};">
              <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;">
                Need help? Email us at <a href="mailto:support@AquaFits.pk" style="color:${BRAND.primary};text-decoration:none;font-weight:600;">support@AquaFits.pk</a>
              </p>
              <p style="margin:0;color:#b3a89c;font-size:11px;">
                © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const button = (href, label) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr>
      <td align="center" style="background:${BRAND.gradient};border-radius:8px;">
        <a href="${href}" style="display:inline-block;padding:13px 32px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.3px;">${label}</a>
      </td>
    </tr>
  </table>
`;

const statusBadge = (label, kind = 'success') => {
  const bg = kind === 'success' ? BRAND.successBg : BRAND.dangerBg;
  const color = kind === 'success' ? BRAND.success : BRAND.danger;
  return `<span style="display:inline-block;background:${bg};color:${color};font-size:12px;font-weight:700;padding:5px 12px;border-radius:20px;letter-spacing:0.3px;">${label}</span>`;
};
const PAYMENT_METHOD_LABELS = {
  COD: '💵 Cash on Delivery',
  CARD: '💳 Credit / Debit Card',
  JAZZCASH: '📱 JazzCash',
  EASYPAISA: '📲 EasyPaisa'
};
const paymentMethodLabel = (method) => PAYMENT_METHOD_LABELS[method] || method || 'N/A';

// ---------------------------------------------------------------------------

const welcomeEmailTemplate = (user) => ({
  subject: `Welcome to ${BRAND.name}, ${user.name.split(' ')[0]}! 🎉`,
  html: emailLayout({
    preheader: `Your ${BRAND.name} account is ready — start exploring.`,
    bodyHtml: `
      <h2 style="margin:0 0 12px;color:${BRAND.text};font-size:22px;">Welcome aboard, ${user.name.split(' ')[0]}! 👋</h2>
      <p style="margin:0 0 16px;color:${BRAND.muted};font-size:14.5px;line-height:1.7;">
        Your account has been created successfully. You're all set to explore our collection,
        try on styles virtually with our AI-powered fitting room, and enjoy a personalized
        shopping experience made just for you.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px;margin:20px 0;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 10px;color:${BRAND.text};font-size:13.5px;font-weight:700;">What you can do next:</p>
            <p style="margin:0 0 6px;color:${BRAND.muted};font-size:13.5px;">🛍️ &nbsp;Browse our latest collection</p>
            <p style="margin:0 0 6px;color:${BRAND.muted};font-size:13.5px;">✨ &nbsp;Try on outfits virtually before buying</p>
            <p style="margin:0;color:${BRAND.muted};font-size:13.5px;">💛 &nbsp;Get recommendations picked just for you</p>
          </td>
        </tr>
      </table>

      ${button(clientUrl(), 'Start Shopping')}

      <p style="margin:20px 0 0;color:${BRAND.muted};font-size:12.5px;text-align:center;">
        If you didn't create this account, you can safely ignore this email.
      </p>
    `
  })
});

const passwordResetEmailTemplate = (user, resetUrl) => ({
  subject: `Reset your ${BRAND.name} password`,
  html: emailLayout({
    preheader: 'This password reset link expires in 30 minutes.',
    bodyHtml: `
      <h2 style="margin:0 0 12px;color:${BRAND.text};font-size:22px;">Password Reset Request 🔒</h2>
      <p style="margin:0 0 8px;color:${BRAND.muted};font-size:14.5px;line-height:1.7;">
        Hi ${user.name.split(' ')[0]}, we received a request to reset your ${BRAND.name} password.
        Click the button below to choose a new one — this link is valid for <strong style="color:${BRAND.text};">30 minutes</strong>.
      </p>

      ${button(resetUrl, 'Reset My Password')}

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0;color:${BRAND.muted};font-size:12.5px;line-height:1.6;">
              If the button doesn't work, copy and paste this link into your browser:<br/>
              <a href="${resetUrl}" style="color:${BRAND.primary};word-break:break-all;">${resetUrl}</a>
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:18px 0 0;color:${BRAND.muted};font-size:12.5px;">
        Didn't request this? No action is needed — your password will remain unchanged.
      </p>
    `
  })
});

const orderConfirmationEmailTemplate = (user, order) => {
  const itemsHtml = order.items.map((item, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fbf8f5'};">
      <td style="padding:12px 10px;border-bottom:1px solid ${BRAND.border};">
        <p style="margin:0;color:${BRAND.text};font-size:13.5px;font-weight:600;">${item.name}</p>
        <p style="margin:2px 0 0;color:${BRAND.muted};font-size:11.5px;">
          ${item.size ? `Size: ${item.size} ` : ''}${item.color ? `• Color: ${item.color}` : ''}
        </p>
      </td>
      <td style="padding:12px 10px;border-bottom:1px solid ${BRAND.border};text-align:center;color:${BRAND.muted};font-size:13px;">× ${item.quantity}</td>
      <td style="padding:12px 10px;border-bottom:1px solid ${BRAND.border};text-align:right;color:${BRAND.text};font-size:13.5px;font-weight:700;">PKR ${(item.price * item.quantity).toLocaleString()}</td>
    </tr>
  `).join('');

  const addr = order.shippingAddress || {};

  return {
    subject: `Order Confirmed #${order.orderNumber} — ${BRAND.name}`,
    html: emailLayout({
      preheader: `Your order #${order.orderNumber} is confirmed. Total: PKR ${order.total.toLocaleString()}`,
      bodyHtml: `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <h2 style="margin:0 0 4px;color:${BRAND.text};font-size:22px;">Order Confirmed! </h2>
              <p style="margin:0 0 18px;color:${BRAND.muted};font-size:14.5px;">Thank you, ${user.name.split(' ')[0]} — we're getting your order ready.</p>
            </td>
            <td align="right" style="vertical-align:top;">
              ${statusBadge('PROCESSING', 'success')}
            </td>
          </tr>
        </table>

       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px;margin-bottom:20px;">
          <tr>
            <td style="padding:14px 18px;width:50%;">
              <p style="margin:0;color:${BRAND.muted};font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;">Order Number</p>
              <p style="margin:2px 0 0;color:${BRAND.primary};font-size:16px;font-weight:800;">${order.orderNumber}</p>
            </td>
            <td style="padding:14px 18px;width:50%;border-left:1px solid ${BRAND.border};">
              <p style="margin:0;color:${BRAND.muted};font-size:11.5px;text-transform:uppercase;letter-spacing:0.5px;">Payment Method</p>
              <p style="margin:2px 0 0;color:${BRAND.text};font-size:14px;font-weight:700;">${paymentMethodLabel(order.paymentMethod)}</p>
            </td>
          </tr>
        </table>

        <!-- Items table -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
          <tr style="background:${BRAND.gradient};">
            <th align="left" style="padding:11px 10px;color:#ffffff;font-size:12px;letter-spacing:0.3px;">PRODUCT</th>
            <th align="center" style="padding:11px 10px;color:#ffffff;font-size:12px;letter-spacing:0.3px;">QTY</th>
            <th align="right" style="padding:11px 10px;color:#ffffff;font-size:12px;letter-spacing:0.3px;">AMOUNT</th>
          </tr>
          ${itemsHtml}
        </table>

        <!-- Totals -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
          <tr>
            <td style="padding:4px 0;color:${BRAND.muted};font-size:13px;">Subtotal</td>
            <td align="right" style="padding:4px 0;color:${BRAND.text};font-size:13px;">PKR ${order.subtotal.toLocaleString()}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:${BRAND.muted};font-size:13px;">Shipping</td>
            <td align="right" style="padding:4px 0;color:${BRAND.text};font-size:13px;">${order.shippingCost === 0 ? 'FREE' : `PKR ${order.shippingCost.toLocaleString()}`}</td>
          </tr>
          ${order.discount > 0 ? `
          <tr>
            <td style="padding:4px 0;color:${BRAND.success};font-size:13px;">Discount</td>
            <td align="right" style="padding:4px 0;color:${BRAND.success};font-size:13px;">-PKR ${Math.round(order.discount).toLocaleString()}</td>
          </tr>` : ''}
          <tr>
            <td colspan="2" style="border-top:1px solid ${BRAND.border};padding-top:10px;"></td>
          </tr>
          <tr>
            <td style="padding:4px 0;color:${BRAND.text};font-size:15px;font-weight:800;">Total</td>
            <td align="right" style="padding:4px 0;color:${BRAND.primary};font-size:17px;font-weight:800;">PKR ${order.total.toLocaleString()}</td>
          </tr>
        </table>

        <!-- Shipping address -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px;margin-top:22px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0 0 6px;color:${BRAND.text};font-size:13px;font-weight:700;">📍 Shipping To</p>
              <p style="margin:0;color:${BRAND.muted};font-size:13px;line-height:1.7;">
                <strong style="color:${BRAND.text};">${addr.name || ''}</strong> ${addr.phone ? `• ${addr.phone}` : ''}<br/>
                ${[addr.street, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ')}
              </p>
            </td>
          </tr>
        </table>


        <p style="margin:16px 0 0;color:${BRAND.muted};font-size:12.5px;text-align:center;">
          We'll email you again once your order ships 
        </p>
      `
    })
  };
};

const contactNotificationEmailTemplate = (contactMessage) => ({
  subject: `New Contact Message: ${contactMessage.subject || 'General Inquiry'}`,
  html: emailLayout({
    preheader: `New message from ${contactMessage.name}`,
    bodyHtml: `
      <h2 style="margin:0 0 16px;color:${BRAND.text};font-size:20px;">📩 New Contact Form Submission</h2>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;">
        <tr style="background:${BRAND.bg};">
          <td style="padding:10px 16px;color:${BRAND.muted};font-size:12px;font-weight:700;width:100px;">FROM</td>
          <td style="padding:10px 16px;color:${BRAND.text};font-size:13.5px;">${contactMessage.name}</td>
        </tr>
        <tr>
          <td style="padding:10px 16px;color:${BRAND.muted};font-size:12px;font-weight:700;">EMAIL</td>
          <td style="padding:10px 16px;color:${BRAND.primary};font-size:13.5px;"><a href="mailto:${contactMessage.email}" style="color:${BRAND.primary};text-decoration:none;">${contactMessage.email}</a></td>
        </tr>
        <tr style="background:${BRAND.bg};">
          <td style="padding:10px 16px;color:${BRAND.muted};font-size:12px;font-weight:700;">SUBJECT</td>
          <td style="padding:10px 16px;color:${BRAND.text};font-size:13.5px;">${contactMessage.subject || 'N/A'}</td>
        </tr>
      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px;margin-top:14px;">
        <tr>
          <td style="padding:16px 18px;">
            <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;font-weight:700;text-transform:uppercase;">Message</p>
            <p style="margin:0;color:${BRAND.text};font-size:14px;line-height:1.7;white-space:pre-wrap;">${contactMessage.message}</p>
          </td>
        </tr>
      </table>

      ${button(`mailto:${contactMessage.email}`, 'Reply to Customer')}
    `
  })
});
const contactReplyEmailTemplate = (contactMessage, replyText) => ({
  subject: `Re: ${contactMessage.subject || 'Your message to ' + BRAND.name}`,
  html: emailLayout({
    preheader: `${BRAND.name} replied to your message`,
    bodyHtml: `
      <h2 style="margin:0 0 12px;color:${BRAND.text};font-size:20px;">Hi ${contactMessage.name.split(' ')[0]}, we've replied 💬</h2>
      <p style="margin:0 0 16px;color:${BRAND.muted};font-size:14.5px;line-height:1.7;">
        Thanks for reaching out to ${BRAND.name}. Here's our response to your message:
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border-radius:10px;margin-bottom:18px;">
        <tr>
          <td style="padding:16px 18px;border-left:4px solid ${BRAND.primary};">
            <p style="margin:0;color:${BRAND.text};font-size:14px;line-height:1.7;white-space:pre-wrap;">${replyText}</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.border};border-radius:10px;">
        <tr>
          <td style="padding:14px 18px;">
            <p style="margin:0 0 4px;color:${BRAND.muted};font-size:11.5px;text-transform:uppercase;font-weight:700;">Your original message</p>
            <p style="margin:0;color:${BRAND.muted};font-size:13px;line-height:1.6;white-space:pre-wrap;">${contactMessage.message}</p>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0;color:${BRAND.muted};font-size:12.5px;">
        Need anything else? Just reply to this email or send us a new message anytime.
      </p>
    `
  })
});

module.exports = {
  welcomeEmailTemplate,
  passwordResetEmailTemplate,
  orderConfirmationEmailTemplate,
  contactNotificationEmailTemplate,
  contactReplyEmailTemplate
};