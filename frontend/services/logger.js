/**
 * logger.js - Production log suppressor
 * Only allows console.log, console.info, and console.debug in development environment.
 * In production builds (import.meta.env.PROD), non-error console outputs are silenced.
 */
if (typeof window !== 'undefined' && import.meta.env && !import.meta.env.DEV) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
}
