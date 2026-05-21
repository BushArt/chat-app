/* eslint-env browser */
// Lightweight client-side logger wrapper. In `test` environment we forward
// to console to keep test behavior unchanged.
const isTest = typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test';

export function info(...args) {
  if (isTest) return console.log(...args);
  console.log(new Date().toISOString(), ...args);
}

export function warn(...args) { if (isTest) return console.warn(...args); console.warn(new Date().toISOString(), ...args); }
export function error(...args) { if (isTest) return console.error(...args); console.error(new Date().toISOString(), ...args); }
export function debug(...args) { if (isTest) return console.debug ? console.debug(...args) : console.log(...args); console.debug(new Date().toISOString(), ...args); }

export default { info, warn, error, debug };
