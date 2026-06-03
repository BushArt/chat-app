const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const filePath = path.resolve('tmp/photo.png');
  const username = 'repro_user_term';
  const password = 'password';
  const out = { errors: [], console: [], fetchCalls: [], route: false };

  page.on('console', (msg) => {
    out.console.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', (err) => {
    out.errors.push(err.message);
  });
  page.on('request', (request) => {
    if (request.url().includes('/messages/upload')) {
      out.fetchCalls.push({ url: request.url(), method: request.method() });
    }
  });

  try {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#username-input', { timeout: 5000 });
    await page.fill('#username-input', username);
    await page.fill('#password-input', password);
    await page.click('#btn-register');
    await page.waitForSelector('#chat-screen', { timeout: 10000 });

    await page.route('**/messages/upload', async (route) => {
      out.route = true;
      const req = route.request();
      let buf = Buffer.alloc(0);
      try {
        buf = req.postDataBuffer();
      } catch {
        try { buf = Buffer.from(req.postData() || '', 'utf8'); } catch { buf = Buffer.alloc(0); }
      }
      fs.writeFileSync(path.resolve('tmp/captured-upload.bin'), buf);
      await route.continue();
    });

    const input = await page.$('#global-file-input');
    const buffer = fs.readFileSync(filePath);
    await input.setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer }]);
    await page.evaluate(() => {
      const input = document.getElementById('global-file-input');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await page.waitForTimeout(2000);
    const exists = fs.existsSync(path.resolve('tmp/captured-upload.bin'));
    const size = exists ? fs.statSync(path.resolve('tmp/captured-upload.bin')).size : 0;
    const chatMessages = await page.$eval('#global-messages', el => el.innerText);
    console.log('route', out.route, 'fetchCalls', out.fetchCalls, 'errors', out.errors, 'console', out.console.slice(-10));
    console.log('capturedExists', exists, 'size', size);
    console.log('chatMessages', chatMessages.slice(0, 300));
  } catch (err) {
    console.error('script-error', err);
  } finally {
    await browser.close();
  }
})();