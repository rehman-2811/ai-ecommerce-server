// src/services/email.service.js
const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
  });

  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn('EMAIL_USER / EMAIL_PASS not configured — skipping email');
      return null;
    }

    const transport = getTransporter();

    const info = await transport.sendMail({
      from: process.env.EMAIL_FROM || `"Aqua Fits" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, '')
    });

    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Email send error:', error.message);
    return null;
  }
};

module.exports = { sendEmail };


// src/services/email.service.js

// const { Resend } = require('resend');
// const { logger } = require('../utils/logger');

// let resendClient;


// const getResendClient = () => {

//     if (!resendClient) {

//         if (!process.env.RESEND_API_KEY) {
//             throw new Error(
//                 "RESEND_API_KEY missing"
//             );
//         }

//         resendClient = new Resend(
//             process.env.RESEND_API_KEY
//         );
//     }

//     return resendClient;
// };



// const sendEmail = async ({
//     to,
//     subject,
//     html,
//     text
// }) => {

//     try {

//         const resend = getResendClient();


//         const result = await resend.emails.send({

//             from:
//             process.env.EMAIL_FROM ||
//             "Aqua Fits <onboarding@resend.dev>",

//             to: [to],

//             subject,

//             html,

//             text:
//             text ||
//             html.replace(/<[^>]*>/g, "")

//         });


//         logger.info(
//             `Email sent ${result.data?.id}`
//         );


//         return result;


//     } catch(error) {


//         logger.error(
//             "Email failed:",
//             error.message
//         );


//         // email fail hone ki wajah se order fail nahi hoga
//         return null;

//     }

// };


// module.exports = {
//     sendEmail
// };