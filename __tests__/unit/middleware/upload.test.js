const { avatarUpload, attachmentUpload } = require('../../../middleware/upload');

/**
 * Helper: call the fileFilter of a multer instance with a given mimetype.
 * Returns true if accepted, false if rejected.
 */
function testFileFilter(uploadMiddleware, mimetype, cb) {
  return new Promise((resolve) => {
    const req = {};
    const file = { mimetype, originalname: 'test.' + mimetype.split('/').pop() };
    uploadMiddleware.processSingle(req, file, (result) => {
      resolve(result);
    });
  });
}

describe('avatarUpload file filter', () => {
  test('accepts image/jpeg', () => {
    const req = {};
    const file = { mimetype: 'image/jpeg' };
    const cb = jest.fn();
    avatarUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts image/png', () => {
    const req = {};
    const file = { mimetype: 'image/png' };
    const cb = jest.fn();
    avatarUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts image/gif', () => {
    const req = {};
    const file = { mimetype: 'image/gif' };
    const cb = jest.fn();
    avatarUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts image/webp', () => {
    const req = {};
    const file = { mimetype: 'image/webp' };
    const cb = jest.fn();
    avatarUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('rejects application/pdf', () => {
    const req = {};
    const file = { mimetype: 'application/pdf' };
    const cb = jest.fn();
    avatarUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });

  test('rejects text/html', () => {
    const req = {};
    const file = { mimetype: 'text/html' };
    const cb = jest.fn();
    avatarUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });
});

describe('attachmentUpload file filter', () => {
  test('accepts image/jpeg', () => {
    const req = {};
    const file = { mimetype: 'image/jpeg' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts image/png', () => {
    const req = {};
    const file = { mimetype: 'image/png' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts audio/webm', () => {
    const req = {};
    const file = { mimetype: 'audio/webm' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts audio/mpeg', () => {
    const req = {};
    const file = { mimetype: 'audio/mpeg' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts audio/ogg', () => {
    const req = {};
    const file = { mimetype: 'audio/ogg' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('accepts application/pdf', () => {
    const req = {};
    const file = { mimetype: 'application/pdf' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test('rejects text/html', () => {
    const req = {};
    const file = { mimetype: 'text/html' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });

  test('accepts audio/mp4', () => {
    const req = {};
    const file = { mimetype: 'audio/mp4' };
    const cb = jest.fn();
    attachmentUpload.fileFilter(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true); // audio/mp4 is in the allowed list
  });
});