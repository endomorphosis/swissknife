// Playwright serves `web/` directly, while production builds copy
// `web/public/service-worker.js` to `/service-worker.js`.
importScripts('/public/service-worker.js');
