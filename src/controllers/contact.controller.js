// src/controllers/contact.controller.js
const { prisma } = require('../config/database');
const { sendEmail } = require('../services/email.service');
const { contactNotificationEmailTemplate,contactReplyEmailTemplate } = require('../utils/emailTemplates');
const { logger } = require('../utils/logger');

// @desc    Submit contact form (public)
// @route   POST /api/contact
const submitContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email and message are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    if (message.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Message is too short' });
    }

    const contactMessage = await prisma.contactMessage.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        subject: subject?.trim() || null,
        message: message.trim(),
        userId: req.user?.id || null
      }
    });

    // if (process.env.ADMIN_EMAIL || process.env.EMAIL_USER) {
    //   sendEmail({
    //     to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    //     subject: `New Contact Message: ${subject || 'General Inquiry'}`,
    //     html: `
    //       <h2>New Contact Form Submission</h2>
    //       <p><strong>Name:</strong> ${contactMessage.name}</p>
    //       <p><strong>Email:</strong> ${contactMessage.email}</p>
    //       <p><strong>Subject:</strong> ${contactMessage.subject || 'N/A'}</p>
    //       <p><strong>Message:</strong></p>
    //       <p>${contactMessage.message.replace(/\n/g, '<br/>')}</p>
    //     `
    //   }).catch(err => logger.warn('Contact notification email failed:', err.message));
    // }

    // Notify admin via email (non-blocking — form still succeeds if email fails/unconfigured)
    if (process.env.ADMIN_EMAIL || process.env.EMAIL_USER) {
      const notifyMail = contactNotificationEmailTemplate(contactMessage);
      sendEmail({
        to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
        subject: notifyMail.subject,
        html: notifyMail.html
      }).catch(err => logger.warn('Contact notification email failed:', err.message));
    }

    res.status(201).json({
      success: true,
      message: "Message sent! We'll get back to you within 24 hours."
    });
  } catch (error) {
    logger.error('Contact submit error:', error);
    res.status(500).json({ success: false, message: 'Failed to send message. Please try again.' });
  }
};

// @desc    Get all contact messages (admin)
// @route   GET /api/admin/contact-messages
const getContactMessages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status, search } = req.query;

    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [messages, total, newCount] = await Promise.all([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.contactMessage.count({ where }),
      prisma.contactMessage.count({ where: { status: 'NEW' } })
    ]);

    res.json({ success: true, messages, total, newCount, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('Get contact messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
};

// @desc    Update a contact message's status (admin)
// @route   PUT /api/admin/contact-messages/:id
const updateContactMessageStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['NEW', 'READ', 'REPLIED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const message = await prisma.contactMessage.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json({ success: true, message });
  } catch (error) {
    logger.error('Update contact message error:', error);
    res.status(500).json({ success: false, message: 'Failed to update message' });
  }
};



const getUnreadMessageCount = async (req, res) => {
  try {
    const count = await prisma.contactMessage.count({ where: { status: 'NEW' } });
    res.json({ success: true, count });
  } catch (error) {
    logger.error('Get unread message count error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count' });
  }
};

const replyToContactMessage = async (req, res) => {
  try {
    const { reply } = req.body;
    if (!reply || !reply.trim()) {
      return res.status(400).json({ success: false, message: 'Reply message cannot be empty' });
    }

    const existing = await prisma.contactMessage.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    const trimmedReply = reply.trim();

    const message = await prisma.contactMessage.update({
      where: { id: req.params.id },
      data: { adminReply: trimmedReply, repliedAt: new Date(), status: 'REPLIED' }
    });

    const replyMail = contactReplyEmailTemplate(existing, trimmedReply);
    const emailResult = await sendEmail({
      to: existing.email,
      subject: replyMail.subject,
      html: replyMail.html
    });

    res.json({ success: true, message, emailSent: !!emailResult });
  } catch (error) {
    logger.error('Reply to contact message error:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply' });
  }
};

// @desc    Delete a contact message (admin)
// @route   DELETE /api/admin/contact-messages/:id
const deleteContactMessage = async (req, res) => {
  try {
    await prisma.contactMessage.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Message deleted' });
  } catch (error) {
    logger.error('Delete contact message error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete message' });
  }
};

module.exports = {
  submitContactMessage,
  getContactMessages,
  updateContactMessageStatus,
  deleteContactMessage,
   getUnreadMessageCount,  
  replyToContactMessage
};