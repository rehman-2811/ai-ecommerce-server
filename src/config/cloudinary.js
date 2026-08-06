// src/config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { logger } = require('../utils/logger');
const axios = require('axios');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const uploadImage = async (filePath, folder = 'products') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `ai-ecommerce/${folder}`,
      transformation: [
        { quality: 'auto', fetch_format: 'auto' },
        { width: 800, height: 800, crop: 'limit' }
      ]
    });
    return result;
  } catch (error) {
    logger.error('Cloudinary upload error:', error);
    throw error;
  }
};

// new function


const uploadFromUrl = async (remoteUrl, folder = 'tryon/results') => {
  if (!remoteUrl) {
    throw new Error('No image URL provided for Cloudinary upload');
  }
  try {
    const response = await axios.get(remoteUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    const buffer = Buffer.from(response.data);
    const mimetype = response.headers['content-type'] || 'image/png';
    return await uploadBuffer(buffer, mimetype, folder);
  } catch (error) {
    logger.error(`Cloudinary uploadFromUrl error for ${remoteUrl}:`, error.message);
    throw new Error(`Failed to persist generated image to Cloudinary: ${error.message}`);
  }
};

const uploadBuffer = async (buffer, mimetype, folder = 'products') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `ai-ecommerce/${folder}`,
        resource_type: 'image',
        transformation: [
          { quality: 'auto', fetch_format: 'auto' },
          { width: 1200, height: 1200, crop: 'limit' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

const deleteImage = async (publicId) => {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    logger.error('Cloudinary delete error:', error);
    throw error;
  }
};

module.exports = { cloudinary, uploadImage, uploadBuffer, uploadFromUrl ,deleteImage };
