const multer = require('multer');

const storage = multer.memoryStorage();

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Normalize MIME type by stripping codec parameters and lowercasing.
 * e.g. 'audio/webm;codecs=opus' → 'audio/webm'
 */
function normalizeMime(mimetype) {
  return mimetype.split(';')[0].trim().toLowerCase();
}

const avatarUpload = multer({
  storage,
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(normalizeMime(file.mimetype)));
  }
});

const attachmentUpload = multer({
  storage,
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      // Audio
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Archives
      'application/zip', 'application/x-zip-compressed',
      // Text
      'text/plain', 'text/csv',
      // Video
      'video/mp4', 'video/webm'
    ];
    cb(null, allowed.includes(normalizeMime(file.mimetype)));
  }
});

module.exports = { avatarUpload, attachmentUpload, normalizeMime };
