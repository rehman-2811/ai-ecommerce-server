// src/services/email.service.js

const nodemailer = require('nodemailer');

const { logger } = require('../utils/logger');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  console.log('EMAIL_USER:', process.env.EMAIL_USER);
  console.log(
    'EMAIL_PASS EXISTS:',
    !!process.env.EMAIL_PASS
  );

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });

  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      logger.warn(
        'EMAIL_USER / EMAIL_PASS not configured — skipping email'
      );

      return null;
    }

    const transport = getTransporter();

    // Test SMTP connection
    await transport.verify();

    console.log('SMTP CONNECTION SUCCESS');

    const info = await transport.sendMail({
      from:
        process.env.EMAIL_FROM ||
        `"Aqua Fits" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, '')
    });

    logger.info(`Email sent: ${info.messageId}`);

    return info;

  } catch (error) {
    console.error(
      'EMAIL SEND ERROR:',
      error.stack || error.message || error
    );

    logger.error(
      `Email send error: ${error.stack || error.message || error}`
    );

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