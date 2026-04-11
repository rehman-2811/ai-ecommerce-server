// src/middleware/upload.js
const multer = require('multer');
const path = require('path');
const { uploadBuffer } = require('../config/cloudinary');

// Use memory storage for direct Cloudinary upload
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware to upload files to Cloudinary after multer
const uploadToCloudinary = (folder = 'products') => async (req, res, next) => {
  try {
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer, req.file.mimetype, folder);
      req.cloudinaryUrl = result.secure_url;
      req.cloudinaryPublicId = result.public_id;
    }

    if (req.files && Array.isArray(req.files)) {
      const uploadPromises = req.files.map(file => 
        uploadBuffer(file.buffer, file.mimetype, folder)
      );
      const results = await Promise.all(uploadPromises);
      req.cloudinaryUrls = results.map(r => ({
        url: r.secure_url,
        publicId: r.public_id
      }));
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { upload, uploadToCloudinary };
