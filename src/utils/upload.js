// src/utils/upload.js — compatible with cloudinary v2

const { v2: cloudinary } = require('cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

console.log('[Cloudinary] configured:', !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET));
console.log('[Cloudinary] cloud_name:', process.env.CLOUDINARY_CLOUD_NAME || 'NOT SET');

// Memory storage — no disk needed, works on Railway
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se permiten imágenes'));
  },
});

// Upload buffer to Cloudinary v2
async function uploadToCloudinary(buffer, folder = 'karel') {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] upload error:', error.message);
          reject(error);
        } else {
          console.log('[Cloudinary] uploaded:', result.secure_url);
          resolve(result.secure_url);
        }
      }
    ).end(buffer);
  });
}

function isCloudinaryConfigured() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

module.exports = { upload, uploadToCloudinary, isCloudinaryConfigured };
