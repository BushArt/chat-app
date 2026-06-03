const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('capture upload multipart body for attachment upload', async ({ page, request }) => {
  const filePath = path.resolve('tmp/photo.png');
  if (!fs.existsSync(filePath)) throw new Error('Fixture not found: ' + filePath);

  // Register a test user and set token in localStorage before page load
  const username = 'play_repro';
  const password = 'password';
  const res = await request.post('http://localhost:3000/auth/register', { data: { username, password } });
  const payload = await res.json();
  const token = payload && payload.token;
  await page.addInitScript((t, u) => {
    localStorage.setItem('chat_token', t);
    localStorage.setItem('chat_user', u);
  }, token, username);

  await page.goto('http://localhost:3000');
  await page.waitForSelector('#chat-screen');

  // Intercept the upload request and save the raw multipart body
  await page.route('**/messages/upload', async (route) => {
    const req = route.request();
    let buf = Buffer.alloc(0);
    try {
      buf = req.postDataBuffer();
    } catch (e) {
      try { buf = Buffer.from(req.postData() || '', 'utf8'); } catch (e2) { buf = Buffer.alloc(0); }
    }
    fs.writeFileSync(path.resolve('tmp/captured-upload.bin'), buf);
    await route.continue();
  });

  const input = await page.$('#global-file-input');
  const buffer = fs.readFileSync(filePath);
  await input.setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer }]);

  // Wait for the route handler to run and file to be written
  await page.waitForTimeout(1000);

  const capturedPath = path.resolve('tmp/captured-upload.bin');
  expect(fs.existsSync(capturedPath)).toBeTruthy();
  const stat = fs.statSync(capturedPath);
  expect(stat.size).toBeGreaterThan(0);
});
