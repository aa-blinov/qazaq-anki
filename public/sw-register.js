/*
  Service worker registration.

  This used to be an inline <script> block in index.html. The production
  stack serves `script-src 'self'` from nginx
  (web/default.conf.template:87), and an inline block violates it — so
  the registration never ran in the deployed app. Verified on a running
  container before this change: 0 registrations, 1 CSP violation in the
  console.

  It survived because the e2e test called `navigator.serviceWorker
  .register('/sw.js')` itself instead of checking that the page did, so
  the suite went green over a dead feature. Both the structural check
  and the behavioural one now live in e2e/study-p0.spec.ts, and the
  deployed stack was re-measured after the fix: 1 registration, scope at
  the app root, 0 CSP violations, and the offline cache populated.

  The file exists for the same reason theme-init.js does: it is external,
  so `script-src 'self'` allows it without 'unsafe-inline'. The CSP is not
  weakened anywhere to accommodate this.

  Registering after `load` keeps the SW install from competing with the
  first paint. A failure here is not fatal: the app works without the
  offline shell.
*/
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (err) {
      // eslint-disable-next-line no-console
      console.warn('[sw] registration failed:', err);
    });
  });
})();
