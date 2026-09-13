// src/services/email.service.js
const axios = require('axios');
const { logger } = require('../utils/logger');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!process.env.BREVO_API_KEY || !process.env.EMAIL_FROM_ADDRESS) {
      logger.warn('BREVO_API_KEY / EMAIL_FROM_ADDRESS not configured — skipping email');
      return null;
    }

    const response = await axios.post(
      BREVO_API_URL,
      {
        sender: {
          name: process.env.EMAIL_FROM_NAME || 'Aqua Fits',
          email: process.env.EMAIL_FROM_ADDRESS
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || html.replace(/<[^>]+>/g, '')
      },
      {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: 15000
      }
    );

    logger.info(`Email sent via Brevo: ${response.data?.messageId}`);
    return response.data;
  } catch (error) {
    logger.error('Email send error:', error.response?.data || error.message);
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