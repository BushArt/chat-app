const { test, expect } = require('@playwright/test');
const fs = require('fs');

// This test reproduces the reported image-with-text corruption by
// uploading a problematic image from fixtures, capturing the client-sent
// bytes via the debug endpoint, and asserting the server-stored URL returns
// identical bytes.

test('upload repro: client -> server -> cloudinary bytes match', async ({ page, request }) => {
  // Load token from tmp (created by local helper) if available
  let token = '';
  try { token = fs.readFileSync('/tmp/cli_token.txt','utf8').trim(); } catch (e) {}

  // Authenticate the page if token available
  if (token) {
    await page.goto('http://localhost:3000/');
    await page.evaluate((t) => { localStorage.setItem('chat_token', t); localStorage.setItem('chat_user', 'cli_repro'); }, token);
    await page.reload();
  } else {
    await page.goto('http://localhost:3000/');
  }

  // Enable debug capture on the client so server writes /tmp/captured-upload-client.bin
  await page.evaluate(() => { window.__debugCaptureUploads = true; });

  // Attach test fixture (place your problematic files under tmp/fixtures)
  const fixture = 'tmp/photo.png';
  await page.setInputFiles('#global-file-input', fixture);

  // Wait for upload to complete
  await page.waitForTimeout(1500);

  // Fetch server-stored messages to find the attachment URL
  const resp = await request.get('/messages/global', { headers: { Authorization: `Bearer ${token}` } });
  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.messages.length).toBeGreaterThan(0);
  const latest = body.messages[body.messages.length-1];
  expect(latest.attachment).toBeTruthy();

  // Download server-stored attachment
  const attUrl = latest.attachment.url;
  const cloud = await request.get(attUrl);
  const cloudBuf = Buffer.from(await cloud.body());

  // Read the client-captured file and original fixture
  const clientBuf = fs.existsSync('/tmp/captured-upload-client.bin') ? fs.readFileSync('/tmp/captured-upload-client.bin') : null;
  const original = fs.readFileSync(fixture);

  // Assertions: at minimum, client-sent bytes should match original
  if (clientBuf) expect(Buffer.compare(clientBuf, original)).toBe(0);
  // And server/cloud bytes should match original
  expect(Buffer.compare(cloudBuf, original)).toBe(0);
});
