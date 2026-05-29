const multer = require('multer');

const storage = multer.memoryStorage();

const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const avatarUpload = multer({
  storage,
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

const attachmentUpload = multer({
  storage,
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'
    ];
    cb(null, allowed.includes(file.mimetype));
  }
});

module.exports = { avatarUpload, attachmentUpload };