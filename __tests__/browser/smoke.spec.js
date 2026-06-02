const { test, expect } = require('@playwright/test');

async function registerAndEnterChat(page, prefix) {
  const username = `${prefix}_${Date.now()}`;
  await page.fill('#username-input', username);
  await page.fill('#password-input', 'password123');
  await page.click('#btn-register');
  await expect(page.locator('#chat-screen')).toBeVisible({ timeout: 15000 });
  return username;
}

test.describe('browser smoke tests', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('Chat App');
    await expect(page.locator('#btn-login')).toBeVisible();
    await expect(page.locator('#btn-register')).toBeVisible();
  });

  test('dark-mode status select has readable text color', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

    await registerAndEnterChat(page, 'pw_dark');

    await page.click('#btn-edit-profile');
    await expect(page.locator('#edit-status')).toBeVisible();

    const color = await page.locator('#edit-status').evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toBe('');
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('edit-profile double-click preserves staged edits', async ({ page }) => {
    await page.goto('/');
    await registerAndEnterChat(page, 'pw_edit');

    await page.click('#btn-edit-profile');
    await page.fill('#edit-display-name', 'Staged Browser Name');
    await page.fill('#edit-bio', 'Staged browser bio');
    await page.click('#btn-edit-profile');
    await expect(page.locator('#profile-panel')).toBeHidden();

    await page.click('#btn-edit-profile');
    await expect(page.locator('#edit-display-name')).toHaveValue('Staged Browser Name');
    await expect(page.locator('#edit-bio')).toHaveValue('Staged browser bio');
  });

  test('avatar preview shows image after file selection', async ({ page }) => {
    await page.goto('/');
    await registerAndEnterChat(page, 'pw_avatar');

    await page.click('#btn-edit-profile');
    await page.locator('#avatar-file-input').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex'),
    });

    await expect(page.locator('#editor-avatar-preview img.avatar-img')).toBeVisible();
  });

  test('voice button shows recording class while recording', async ({ page }) => {
    await page.goto('/');
    await registerAndEnterChat(page, 'pw_voice');

    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const track = { stop: () => {} };
        return {
          getTracks: () => [track],
          getAudioTracks: () => [track],
        };
      };
      window.MediaRecorder = class MockMediaRecorder {
        static isTypeSupported() {
          return true;
        }
        constructor(stream, options) {
          this.stream = stream;
          this.state = 'inactive';
          this.ondataavailable = null;
          this.onstop = null;
        }
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          if (this.onstop) this.onstop();
        }
      };
    });

    await page.click('#global-voice-btn');
    await expect(page.locator('#global-voice-btn')).toHaveClass(/voice-recording/, { timeout: 10000 });
  });
});
