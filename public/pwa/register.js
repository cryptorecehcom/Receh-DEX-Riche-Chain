(() => {
  if (!('serviceWorker' in navigator)) return;

  let deferredPrompt = null;
  let refreshing = false;
  const hadController = !!navigator.serviceWorker.controller;

  const installButton = () => document.getElementById('pwaInstallFloat');

  const setInstallVisible = (visible) => {
    const btn = installButton();
    if (!btn) return;
    btn.hidden = !visible;
    btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
  };

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setInstallVisible(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallVisible(false);
  });

  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('#pwaInstallTutup, #pwaInstallClose');
    if (!close) return;
    deferredPrompt = null;
    setInstallVisible(false);
  });

  document.addEventListener('click', async (event) => {
    const btn = event.target.closest?.('#pwaInstallBtn');
    if (!btn || !deferredPrompt) return;

    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {}
    deferredPrompt = null;
    setInstallVisible(false);
  });

  window.addEventListener('load', async () => {
    try {
      // Never register the production service worker on a Vite dev server.
      // A SW can serve stale index/app assets and interfere with HMR (/\@vite/client).
      const isViteDev =
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' ||
        location.hostname === '::1' ||
        location.port === '5173';
      if (isViteDev) {
        const devRegistrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(devRegistrations.map((reg) => reg.unregister()));
        window.__RECEH_PWA__ = { registration: null, dev: true };
        return;
      }
      // The service worker lives at the site root so it can control the entire DEX scope.
      // Remove the previous /pwa/ registration from older builds to avoid overlapping scopes.
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((reg) => reg.scope.endsWith('/dex/pwa/'))
          .map((reg) => reg.unregister())
      );

      const registration = await navigator.serviceWorker.register('/dex/sw.js', { scope: '/dex/' });

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          window.dispatchEvent(new CustomEvent('receh:pwa-update', { detail: { registration } }));
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      window.__RECEH_PWA__ = { registration };
    } catch (error) {
      console.warn('PWA registration failed:', error);
    }
  });
})();
