/**
 * __tests__/client/visual.regressions.test.js
 *
 * Single combined regression file for all 5 visual/interaction defects.
 * Run with: npx jest --no-coverage __tests__/client/visual.regressions.test.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const css   = readFile('public/css/style.css');
const appJs = readFile('public/js/app.js');
const uiJs  = readFile('public/js/modules/ui.js');
const stateJs = readFile('public/js/modules/state.js');
const apiJs = readFile('public/js/modules/api.js');

// ── Helpers ─────────────────────────────────────────────────────────────────

/** WCAG relative luminance for sRGB */
function luminance([r, g, b]) {
  const toLinear = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return [0.2126, 0.7152, 0.0722].reduce((acc, coeff, i) => acc + coeff * toLinear([r, g, b][i]), 0);
}

/** WCAG contrast ratio between two RGB colors */
function contrast(rgb1, rgb2) {
  const l1 = luminance(rgb1);
  const l2 = luminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Fake jsdom-like getComputedStyle: parse CSS variable references against
 * the :root / [data-theme="dark"] variable tables extracted from the stylesheet.
 */
function parseCSSVariables(cssText, theme) {
  const vars = {};
  const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  // :root block
  const rootBlock = cssText.match(/:root\s*\{([^}]*)\}/)?.[1] || '';
  while ((m = regex.exec(rootBlock)) !== null) vars[m[1]] = m[2].trim();
  if (theme === 'dark') {
    const darkBlock = cssText.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] || '';
    while ((m = regex.exec(darkBlock)) !== null) vars[m[1]] = m[2].trim();
  }
  return vars;
}

function resolveVar(str, vars) {
  if (!str.startsWith('var(')) return str;
  const name = str.match(/var\(--([\w-]+)\)/)?.[1];
  return name ? (vars[name] || str) : str;
}

function hexToRGB(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

function parseRGB(str) {
  const m = str.match(/(\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT 1 (Phase 1): Status <select> text color in dark mode
// ═════════════════════════════════════════════════════════════════════════════

describe('Defect 1 — Status <select> readable in dark mode', () => {
  const vars = parseCSSVariables(css, 'dark');

  // Extract the combined input/select/textarea rule block that contains "select"
  const ruleMatch = [...css.matchAll(
    /#profile-panel\s+\.profile-field\s+(?:input|select|textarea)[^}]*\{([^}]*)\}/g
  )].find(m => m[0].includes('select'));

  const ruleBody = ruleMatch ? ruleMatch[1] : '';

  test('select has an explicit `color` declaration', () => {
    expect(ruleBody).toMatch(/\bcolor\s*:\s*var\(--text\)/);
  });

  test('select has a dark-friendly background', () => {
    expect(ruleBody).toMatch(/background\s*:\s*var\(--panel\)/);
  });

  test('select declares `color-scheme: light dark` for native theming', () => {
    expect(ruleBody).toMatch(/color-scheme\s*:\s*light dark/);
  });

  test('select option elements are styled with --panel bg and --text fg', () => {
    const optRule = css.match(
      /#profile-panel\s+\.profile-field\s+select\s+option\s*\{([^}]*)\}/
    );
    expect(optRule).not.toBeNull();
    expect(optRule[1]).toMatch(/background\s*:\s*var\(--panel\)/);
    expect(optRule[1]).toMatch(/color\s*:\s*var\(--text\)/);
  });

  test('contrast ratio between select fg and bg >= 4.5:1 in dark mode', () => {
    const fgVar = ruleBody.match(/color\s*:\s*var\(--([\w-]+)\)/)?.[1];
    const bgVar = ruleBody.match(/background\s*:\s*var\(--([\w-]+)\)/)?.[1];
    expect(fgVar).toBeDefined();
    expect(bgVar).toBeDefined();

    const fgHex = vars[fgVar];
    const bgHex = vars[bgVar];
    expect(fgHex).toBeDefined();
    expect(bgHex).toBeDefined();

    const ratio = contrast(hexToRGB(fgHex), hexToRGB(bgHex));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT 2 (Phase 1): Edit Profile click-twice preserves in-flight edits
// ═════════════════════════════════════════════════════════════════════════════

describe('Defect 2 — Edit Profile toggle preserves in-flight edits', () => {
  test('state.js exports getPendingProfileEdits / setPendingProfileEdits / clearPendingProfileEdits', () => {
    expect(stateJs).toMatch(/export function getPendingProfileEdits/);
    expect(stateJs).toMatch(/export function setPendingProfileEdits/);
    expect(stateJs).toMatch(/export function clearPendingProfileEdits/);
  });

  test('state.js resetAllState clears pendingProfileEdits', () => {
    const resetBlock = stateJs.match(/export function resetAllState\(\)\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(resetBlock).not.toBeNull();
    expect(resetBlock).toMatch(/pendingProfileEdits\s*=\s*null/);
  });

  test('app.js openProfileEditor is a toggle that writes/reads staging', () => {
    const fnBlock = appJs.match(/function openProfileEditor\(\)\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(fnBlock).not.toBeNull();
    expect(fnBlock).toMatch(/setPendingProfileEdits/);
    // The toggle closes via ui.hideProfileEditor() which adds 'hidden', or directly via classList
    expect(fnBlock).toMatch(/hideProfileEditor|classList\.(add|remove)\(["']hidden["']\)/);
  });

  test('app.js closeProfileEditor clears pendingProfileEdits', () => {
    const fnBlock = appJs.match(/function closeProfileEditor\(\)\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(fnBlock).not.toBeNull();
    expect(fnBlock).toMatch(/clearPendingProfileEdits/);
  });

  test('ui.js showProfileEditor reads pending edits before falling back to state', () => {
    const fnBlock = uiJs.match(/export function showProfileEditor\(\)\s*\{([\s\S]*?)\n\}/)?.[1];
    expect(fnBlock).not.toBeNull();
    expect(fnBlock).toMatch(/getPendingProfileEdits/);
    expect(fnBlock).toMatch(/pending\?\.\w+ \?\?/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT 3 (Phase 2): Avatar preview visible while uploading
// ═════════════════════════════════════════════════════════════════════════════

describe('Defect 3 — Avatar preview shows image during upload', () => {
  test('app.js avatar handler calls ui.showAvatarPreview, not raw innerHTML', () => {
    const handler = appJs.match(
      /dom\.avatarFileInput\.addEventListener\(\s*["']change["']\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n  \}\);/
    )?.[1];
    expect(handler).not.toBeNull();
    expect(handler).toMatch(/ui\.showAvatarPreview/);
    expect(handler).not.toMatch(/preview\.innerHTML\s*=/);
  });

  test('ui.js showAvatarPreview mutates in place (no replaceWith)', () => {
    const fnBlock = uiJs.match(/export function showAvatarPreview\([\s\S]*?\n\}/)?.[0];
    expect(fnBlock).not.toBeNull();
    expect(fnBlock).not.toMatch(/replaceWith/);
    expect(fnBlock).toMatch(/el\.appendChild/);
  });

  test('ui.js showAvatarPreview inserts <img class="avatar-img">', () => {
    const fnBlock = uiJs.match(/export function showAvatarPreview\([\s\S]*?\n\}/)?.[0];
    expect(fnBlock).toMatch(/img\.className\s*=\s*["']avatar-img["']/);
  });

  test('CSS: .avatar-upload-wrapper .avatar has explicit width/height', () => {
    const rule = css.match(
      /#profile-panel\s+\.avatar-upload-wrapper\s+\.avatar\s*\{([^}]*)\}/
    );
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/width\s*:\s*56px/);
    expect(rule[1]).toMatch(/height\s*:\s*56px/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT 4 (Phase 3): Global upload sends isGlobal + room
// ═════════════════════════════════════════════════════════════════════════════

describe('Defect 4 — Global file upload includes isGlobal and room', () => {
  const messagesJs = readFile('routes/messages.js');

  test('api.js appends isGlobal to FormData unconditionally', () => {
    const fnBlock = apiJs.match(/export async function uploadAttachment[\s\S]*?\n\}/)?.[0];
    expect(fnBlock).not.toBeNull();
    expect(fnBlock).toMatch(/formData\.append\(\s*["']isGlobal["']/);
  });

  test('api.js appends room unconditionally (global → "global", private → room)', () => {
    const fnBlock = apiJs.match(/export async function uploadAttachment[\s\S]*?\n\}/)?.[0];
    expect(fnBlock).not.toBeNull();
    expect(fnBlock).toMatch(/formData\.append\(\s*["']room["']/);
  });

  test('api.js only appends receiver inside if (!isGlobal)', () => {
    const fnBlock = apiJs.match(/export async function uploadAttachment[\s\S]*?\n\}/)?.[0];
    expect(fnBlock).not.toBeNull();
    expect(fnBlock).toMatch(/if\s*\(\s*!isGlobal\s*\)\s*\{[\s\S]*?formData\.append\(\s*["']receiver["']/);
  });

  test('server requires room field on upload (400 if missing)', () => {
    expect(messagesJs).toMatch(/if\s*\(\s*!room\s*\)/);
  });

  test('server uses isGlobal !== "true" to branch private vs global', () => {
    expect(messagesJs).toMatch(/isGlobal\s*!==\s*["']true["']/);
  });

  test('server error strings match the user-reported messages', () => {
    expect(messagesJs).toContain('No file provided');
    expect(messagesJs).toContain('Room is required');
    expect(messagesJs).toContain('Forbidden');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DEFECT 5 (Phase 4): Voice record button styled and functional
// ═════════════════════════════════════════════════════════════════════════════

describe('Defect 5 — Voice record button has CSS rules (no animation)', () => {
  test('.voice-btn rule exists with 34×34 size', () => {
    const rule = css.match(/\.voice-btn\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/width\s*:\s*34px/);
    expect(rule[1]).toMatch(/height\s*:\s*34px/);
    expect(rule[1]).toMatch(/border-radius\s*:\s*50%/);
  });

  test('.voice-btn:hover rule exists', () => {
    const rule = css.match(/\.voice-btn:hover\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
  });

  test('.voice-btn:disabled rule exists', () => {
    const rule = css.match(/\.voice-btn:disabled\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
  });

  test('.voice-recording rule exists with danger color', () => {
    const rule = css.match(/\.voice-btn\.voice-recording\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/background\s*:\s*var\(--danger\)/);
    expect(rule[1]).toMatch(/color\s*:\s*#fff/);
  });

  test('.voice-sending rule exists with primary color', () => {
    const rule = css.match(/\.voice-btn\.voice-sending\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/background\s*:\s*var\(--primary\)/);
    expect(rule[1]).toMatch(/color\s*:\s*#fff/);
  });

  test('no @keyframes pulse animation (static red-dot per preference)', () => {
    expect(css).not.toMatch(/@keyframes\s+pulse/);
  });

  test('setupVoiceRecording is called for both channels', () => {
    const calls = [...appJs.matchAll(/setupVoiceRecording\((['"])(global|private)\1\)/g)];
    expect(calls).toHaveLength(2);
  });
});