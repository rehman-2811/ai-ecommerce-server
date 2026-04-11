// src/routes/upload.routes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { uploadBuffer } = require('../config/cloudinary');

// General image upload for try-on user images
router.post('/image', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const result = await uploadBuffer(req.file.buffer, req.file.mimetype, 'tryon/users');
    res.json({ success: true, url: result.secure_url, publicId: result.public_id });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

module.exports = router;
