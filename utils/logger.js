/**
 * Production-safe logger utility.
 * In production: only logs errors and warnings.
 * In development: logs everything.
 */

const isDev = process.env.NODE_ENV !== 'production';

const logger = {
  log: (...args) => { if (isDev) console.log(...args); },
  info: (...args) => { if (isDev) console.log('[INFO]', ...args); },
  warn: (...args) => console.warn('[WARN]', ...args),       // always shown
  error: (...args) => console.error('[ERROR]', ...args),   // always shown
};

module.exports = logger;
