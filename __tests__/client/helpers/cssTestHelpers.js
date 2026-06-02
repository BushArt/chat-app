/**
 * Shared CSS parsing helpers for behavioral UI tests.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');

function readStylesheet() {
  return fs.readFileSync(path.join(ROOT, 'public/css/style.css'), 'utf8');
}

function parseCSSVariables(cssText, theme) {
  const vars = {};
  const regex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  const rootBlock = cssText.match(/:root\s*\{([^}]*)\}/)?.[1] || '';
  while ((m = regex.exec(rootBlock)) !== null) vars[m[1]] = m[2].trim();
  if (theme === 'dark') {
    const darkBlock = cssText.match(/\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] || '';
    while ((m = regex.exec(darkBlock)) !== null) vars[m[1]] = m[2].trim();
  }
  return vars;
}

function resolveSelectColors(cssText, theme) {
  const vars = parseCSSVariables(cssText, theme);
  const ruleMatch = [...cssText.matchAll(
    /#profile-panel\s+\.profile-field\s+(?:input|select|textarea)[^}]*\{([^}]*)\}/g
  )].find(m => m[0].includes('select'));
  const ruleBody = ruleMatch ? ruleMatch[1] : '';
  const fgVar = ruleBody.match(/color\s*:\s*var\(--([\w-]+)\)/)?.[1];
  const bgVar = ruleBody.match(/background\s*:\s*var\(--([\w-]+)\)/)?.[1];
  return {
    color: fgVar ? vars[fgVar] : null,
    background: bgVar ? vars[bgVar] : null,
    hasExplicitColor: /\bcolor\s*:/.test(ruleBody),
    hasColorScheme: /color-scheme\s*:\s*light dark/.test(ruleBody),
  };
}

function injectStylesheet(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

module.exports = {
  readStylesheet,
  parseCSSVariables,
  resolveSelectColors,
  injectStylesheet,
};
