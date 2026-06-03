const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const filePath = path.resolve('tmp/photo.png');
  if (!fs.existsSync(filePath)) {
    console.error('Fixture not found:', filePath);
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    const username = 'node_repro_' + Date.now();
    const password = 'password';
    // register
    const res = await page.request.post('http://localhost:3000/auth/register', { data: { username, password } });
    if (res.status() !== 200 && res.status() !== 201) {
      const body = await res.text();
      console.error('Register failed', res.status(), body);
    } else {
      const body = await res.json();
      if (body && body.token) {
        await page.evaluate((t, u) => {
          localStorage.setItem('chat_token', t);
          localStorage.setItem('chat_user', u);
        }, body.token, username);
        await page.reload({ waitUntil: 'networkidle' });
      }
    }

    // interception
    let wrote = false;
    await page.route('**/messages/upload', async (route) => {
      try {
        const req = route.request();
        let buf = Buffer.alloc(0);
        try {
          buf = req.postDataBuffer();
        } catch (e) {
          const s = req.postData();
          if (s) buf = Buffer.from(s, 'utf8');
        }
        fs.writeFileSync(path.resolve('tmp/captured-upload.bin'), buf);
        wrote = true;
      } catch (e) {
        // ignore
      }
      await route.continue();
    });

    await page.waitForSelector('#chat-screen', { timeout: 5000 });

    const input = await page.$('#global-file-input');
    const buffer = fs.readFileSync(filePath);
    await input.setInputFiles([{ name: 'photo.png', mimeType: 'image/png', buffer }]);

    const start = Date.now();
    while (!wrote && Date.now() - start < 5000) {
      await new Promise(r => setTimeout(r, 100));
    }

    const capturedPath = path.resolve('tmp/captured-upload.bin');
    if (fs.existsSync(capturedPath)) {
      const size = fs.statSync(capturedPath).size;
      console.log('Captured upload saved:', capturedPath, 'size=', size);
      await page.screenshot({ path: path.resolve('tmp/repro-screenshot.png') });
      await browser.close();
      process.exit(0);
    } else {
      console.error('No upload captured');
      await browser.close();
      process.exit(3);
    }
  } catch (err) {
    console.error('Error during repro:', err);
    await browser.close();
    process.exit(4);
  }
})();