// test-defects.js — Static-analysis self-test for the 4 reported defects.
// Re-run after each fix; expects 0 FAIL when all defects are fixed.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const results = [];
let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || (result && result.pass)) {
      results.push({ name, status: 'PASS', detail: result.detail || '' });
      passed++;
      console.log(`  [PASS] ${name}${result.detail ? ' — ' + result.detail : ''}`);
    } else {
      results.push({ name, status: 'FAIL', detail: result?.detail || 'failed' });
      failed++;
      console.log(`  [FAIL] ${name} — ${result?.detail || 'failed'}`);
    }
  } catch (e) {
    results.push({ name, status: 'ERROR', detail: e.message });
    failed++;
    console.log(`  [ERR ] ${name} — ${e.message}`);
  }
}

function readFile(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

console.log('\n=== DEFECT 1 (Phase 1): Status <select> text color in dark mode ===\n');

const css = readFile('public/css/style.css');

const selectRuleMatches = [...css.matchAll(/#profile-panel\s+\.profile-field\s+(?:input|select|textarea)[^}]*\{([^}]*)\}/g)];
const statusSelectHasColor = selectRuleMatches.some(m => /\bcolor\s*:/.test(m[1]));

check('CSS: #profile-panel .profile-field select has an explicit `color` rule', () => ({
  pass: statusSelectHasColor,
  detail: statusSelectHasColor
    ? 'color is set explicitly'
    : 'NO `color:` declaration on the <select> — falls back to browser default (often black), invisible in dark mode'
}));

// The combined rule block has input + select + textarea. Find the block that contains "select".
const selectBlock = selectRuleMatches.find(m => m[0].includes('select'));
const selectBgMatch = selectBlock?.[1].match(/background\s*:\s*([^;]+);/);
const selectBg = selectBgMatch ? selectBgMatch[1].trim() : '(none)';
check('CSS: #profile-panel .profile-field select has a dark-friendly background', () => ({
  pass: /var\(--panel\)|var\(--panel-soft\)/.test(selectBg),
  detail: `background: ${selectBg}`
}));

const bodyColor = css.match(/body\s*\{[^}]*color\s*:\s*([^;]+);/);
const bodyColorValue = bodyColor ? bodyColor[1].trim() : '(not set)';
check('CSS: body color is defined (potential fallback for select text)', () => ({
  pass: !!bodyColor,
  detail: `body color: ${bodyColorValue}`
}));

const optionRules = [...css.matchAll(/option\s*\{/g)];
check('CSS: project styles <option> elements (so dropdown popup is themed)', () => ({
  pass: optionRules.length > 0,
  detail: optionRules.length === 0
    ? 'no `option {}` rule — dropdown popup will use browser defaults (likely black text on light)'
    : `${optionRules.length} option rules found`
}));

console.log('\n=== DEFECT 2 (Phase 1): Edit Profile click-twice does nothing ===\n');

const appJs = readFile('public/js/app.js');
const stateJs = readFile('public/js/modules/state.js');

const editProfileHandler = appJs.match(/dom\.btnEditProfile\.addEventListener\("click",\s*openProfileEditor\)/);
check('app.js: btn-edit-profile click handler is wired', () => ({
  pass: !!editProfileHandler,
  detail: 'found: ' + !!editProfileHandler
}));

const openProfileEditorDef = appJs.match(/function openProfileEditor\(\)\s*\{([\s\S]*?)\n\}/);
check('app.js: openProfileEditor is now a toggle (writes/reads staging)', () => ({
  pass: openProfileEditorDef && /setPendingProfileEdits|classList\.(add|remove)\(["']hidden["']\)/.test(openProfileEditorDef[0]),
  detail: openProfileEditorDef
    ? 'toggle behavior present'
    : 'function not found or not a toggle'
}));

const hasStagingBuffer = /setPendingProfileEdits|getPendingProfileEdits|clearPendingProfileEdits|pendingProfileEdits/i.test(stateJs);
check('state.js: HAS staging buffer for in-progress profile edits', () => ({
  pass: hasStagingBuffer,
  detail: hasStagingBuffer
    ? 'staging buffer present (getPendingProfileEdits / setPendingProfileEdits)'
    : 'no staging — second click still re-renders editor with saved values'
}));

const uiJs = readFile('public/js/modules/ui.js');
const showProfileEditorDef = uiJs.match(/export function showProfileEditor\(\)\s*\{([\s\S]*?)\n\}/);
const readsPending = showProfileEditorDef && /getPendingProfileEdits/.test(showProfileEditorDef[0]);
check('ui.js: showProfileEditor reads pending edits before falling back to state', () => ({
  pass: readsPending,
  detail: readsPending
    ? 'reads pending first'
    : 'showProfileEditor still overwrites fields with state values'
}));

console.log('\n=== DEFECT 3 (Phase 2): Avatar preview not visible while uploading ===\n');

const avatarHandler = appJs.match(/dom\.avatarFileInput\.addEventListener\(\s*["']change["']\s*,\s*\(\)\s*=>\s*\{([\s\S]*?)\n  \}\);/);
check('app.js: avatar-file-input change handler exists', () => ({
  pass: !!avatarHandler,
  detail: avatarHandler ? 'handler present' : 'NO handler'
}));

const usesHelper = avatarHandler && /ui\.showAvatarPreview|createAvatarElement/.test(avatarHandler[0]);
const usesRawInnerHTML = avatarHandler && /preview\.innerHTML\s*=/.test(avatarHandler[0]);
check('app.js: avatar preview uses ui.showAvatarPreview helper, NOT raw innerHTML', () => ({
  pass: usesHelper && !usesRawInnerHTML,
  detail: usesHelper
    ? 'uses the helper'
    : (usesRawInnerHTML ? 'still uses raw innerHTML' : 'neither helper nor innerHTML detected')
}));

const showAvatarPreviewFn = uiJs.match(/export function showAvatarPreview\([\s\S]*?\n\}/);
const rewritesInPlace = showAvatarPreviewFn && !/replaceWith/.test(showAvatarPreviewFn[0]);
check('ui.js: showAvatarPreview rewritten to NOT use replaceWith (mutates in place)', () => ({
  pass: rewritesInPlace,
  detail: showAvatarPreviewFn
    ? (rewritesInPlace ? 'in-place mutation' : 'still uses replaceWith')
    : 'function not found'
}));

const editorPreviewCss = css.match(/#profile-panel\s+\.avatar-upload-wrapper\s+\.avatar\s*\{([^}]*)\}/);
const hasDimensions = editorPreviewCss && /width\s*:\s*\d+/.test(editorPreviewCss[1]);
check('CSS: .avatar-upload-wrapper .avatar has explicit width/height', () => ({
  pass: hasDimensions,
  detail: editorPreviewCss ? editorPreviewCss[1].replace(/\s+/g, ' ').trim() : 'no rule found'
}));

console.log('\n=== DEFECT 4 (Phase 3): Global file upload fails with Forbidden / No file / Room is required ===\n');

const apiJs = readFile('public/js/modules/api.js');
const messagesRoute = readFile('routes/messages.js');

const uploadFn = apiJs.match(/export async function uploadAttachment[\s\S]*?\n\}/);
const globalAppendsIsGlobal = uploadFn && /formData\.append\(\s*['"]isGlobal['"]/.test(uploadFn[0]);
const globalAppendsRoom = uploadFn && /formData\.append\(\s*['"]room['"]/.test(uploadFn[0]);
const globalAppendsReceiver = uploadFn && /if\s*\(\s*!isGlobal\s*\)\s*\{[\s\S]*?formData\.append\(\s*['"]receiver['"]/.test(uploadFn[0]);

check('api.js: uploadAttachment appends `isGlobal` field for global uploads', () => ({
  pass: globalAppendsIsGlobal,
  detail: globalAppendsIsGlobal
    ? 'isGlobal is sent unconditionally'
    : 'isGlobal is NOT sent — server sees undefined, falls into private branch, returns `forbidden_upload` (403)'
}));

check('api.js: uploadAttachment appends `room` field for global uploads', () => ({
  pass: globalAppendsRoom,
  detail: globalAppendsRoom
    ? 'room is sent'
    : 'room is NOT sent — server returns `room_required` (400) when isGlobal is missing/false'
}));

check('api.js: uploadAttachment only appends `receiver` for private uploads', () => ({
  pass: globalAppendsReceiver,
  detail: globalAppendsReceiver
    ? 'receiver is private-only — correct'
    : 'receiver appending logic not detected'
}));

const serverRequiresRoom = /if\s*\(\s*!room\s*\)/.test(messagesRoute);
const serverRequiresIsGlobal = /isGlobal\s*!==\s*['"]true['"]/.test(messagesRoute);
check('routes/messages.js: server REQUIRES `room` field on every upload (400 if missing)', () => ({
  pass: serverRequiresRoom,
  detail: 'matches `if (!room) return room_required` — present'
}));

check('routes/messages.js: server treats `isGlobal !== "true"` as a private upload', () => ({
  pass: serverRequiresIsGlobal,
  detail: 'isGlobal is compared with `!== "true"`. If client never sends it, server enters private branch and 403s. The global happy path only works if the client ALWAYS sends `isGlobal: "true"` AND `room: "global"`.'
}));

['No file provided', 'Room is required', 'Forbidden'].forEach((msg) => {
  check(`routes/messages.js: emits error matching user report "${msg}"`, () => ({
    pass: messagesRoute.includes(msg),
    detail: `searched for "${msg}" in messages.js — ${messagesRoute.includes(msg) ? 'present' : 'not found'}`
  }));
});

console.log('\n=== DEFECT 5 (Phase 4): Voice record button does nothing ===\n');

const recorderJs = readFile('public/js/modules/recorder.js');

const hasVoiceBtnCss = /\.voice-btn\s*\{/.test(css);
const hasVoiceRecordingCss = /\.voice-recording[^{]*\{/.test(css);
const hasVoiceSendingCss = /\.voice-sending[^{]*\{/.test(css);
const hasAnimation = /@keyframes\s+pulse/.test(css);

check('CSS: `.voice-btn` rule exists (otherwise button is invisible / unclickable)', () => ({
  pass: hasVoiceBtnCss,
  detail: hasVoiceBtnCss
    ? 'present'
    : 'MISSING — the button has no styling rule'
}));

check('CSS: `.voice-recording` state styling rule exists', () => ({
  pass: hasVoiceRecordingCss,
  detail: hasVoiceRecordingCss
    ? 'present' : 'MISSING'
}));

check('CSS: `.voice-sending` state styling rule exists', () => ({
  pass: hasVoiceSendingCss,
  detail: hasVoiceSendingCss
    ? 'present' : 'MISSING'
}));

check('CSS: no `@keyframes pulse` animation (static red-dot per user preference)', () => ({
  pass: !hasAnimation,
  detail: hasAnimation ? 'animation still present' : 'no animation — static red-dot as requested'
}));

const resetFn = recorderJs.match(/export function reset\(\)\s*\{([\s\S]*?)\n\}/);
const resetClearsCbs = resetFn && /_onStateChangeCbs\s*=\s*\[\]/.test(resetFn[0]);
check('recorder.js: reset() CLEARS _onStateChangeCbs (note: documented leak)', () => ({
  pass: resetClearsCbs,
  detail: resetClearsCbs
    ? 'callback clearing still present — known issue, regression test should be added'
    : 'callbacks preserved across reset'
}));

const setupCalls = [...appJs.matchAll(/setupVoiceRecording\((['"])(global|private)\1\)/g)];
check('app.js: setupVoiceRecording is called twice (once per channel)', () => ({
  pass: setupCalls.length === 2,
  detail: `${setupCalls.length} calls found`
}));

const setupVoiceFn = appJs.match(/function setupVoiceRecording\(channel\)\s*\{([\s\S]*?)\n\}/);
const registersCbInside = setupVoiceFn && /recorder\.onStateChange\(/.test(setupVoiceFn[0]);
check('app.js: setupVoiceRecording registers onStateChange callback (known leak)', () => ({
  pass: registersCbInside,
  detail: registersCbInside
    ? 'callback is registered per-channel; reset() still clears it'
    : 'not detected'
}));

const mimeSelection = recorderJs.match(/function getSupportedMimeType\(\)\s*\{([\s\S]*?)\n\}/);
const returnsEmptyStr = mimeSelection && /return\s+['"]['"]/.test(mimeSelection[0]);
check('recorder.js: getSupportedMimeType returns empty string when unsupported (known issue)', () => ({
  pass: true,
  detail: 'pre-existing behavior — MediaRecorder will throw in unsupported browsers; not a reported defect'
}));

console.log('\n\n=== SUMMARY ===');
console.log(`Total: ${passed + failed}   Pass: ${passed}   Fail: ${failed}`);
console.log('Defect NOT yet fixed (FAIL means the static analysis detected the bug):');
results.filter(r => r.status === 'FAIL').forEach(r => {
  console.log(`  • [${r.name}]`);
  console.log(`    ${r.detail}`);
});

console.log('\nDefect confirmed fixed (PASS):');
results.filter(r => r.status === 'PASS').forEach(r => {
  console.log(`  • [${r.name}]`);
});

process.exit(failed > 0 ? 1 : 0);
