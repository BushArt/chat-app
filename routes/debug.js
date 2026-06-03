const express = require('express');
const fs = require('fs');
const path = require('path');
const { attachmentUpload } = require('../middleware/upload');

const router = express.Router();

// Debug-only endpoint: capture the uploaded file bytes to /tmp for inspection.
// Expects a multipart form with field `file`.
router.post('/capture', attachmentUpload.single('file'), (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'no_file' });
    const outPath = path.resolve('/tmp/captured-upload-client.bin');
    fs.writeFile(outPath, req.file.buffer, (err) => {
      if (err) return next(err);
      res.json({ ok: true, path: outPath });
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
