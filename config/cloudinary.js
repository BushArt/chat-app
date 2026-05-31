const cloudinary = require('cloudinary').v2;

// Configure from CLOUDINARY_URL environment variable
cloudinary.config();

/**
 * Upload a buffer to Cloudinary.
 * Returns a Promise that resolves with the Cloudinary upload result.
 */
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

module.exports = cloudinary;
module.exports.uploadToCloudinary = uploadToCloudinary;