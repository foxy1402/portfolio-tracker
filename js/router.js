// Hash router for the persistent app shell (GitHub Pages-safe).
(function () {
  const TITLES = {
    dashboard: 'Portfolio Tracker | Dashboard',
    manage: 'Portfolio Tracker | Admin',
    rebalance: 'Portfolio Tracker | Rebalance Calculator'
  };

  const HASH = {
    dashboard: '#/',
    manage: '#/manage',
    rebalance: '#/rebalance'
  };

  function parseRoute(hash) {
    const raw = (hash != null ? hash : location.hash || '#/').replace(/^#/, '');
    const path = (raw.split('?')[0] || '/').replace(/\/+$/, '') || '/';
    if (path === '/manage' || path === 'manage') return 'manage';
    if (path === '/rebalance' || path === 'rebalance') return 'rebalance';
    return 'dashboard';
  }

  function setChrome(name) {
    document.body.dataset.route = name;
    document.title = TITLES[name] || TITLES.dashboard;

    document.querySelectorAll('.nav-link[data-route]').forEach((el) => {
      el.classList.toggle('active', el.dataset.route === name);
    });

    document.querySelectorAll('.bottom-nav-item').forEach((el) => {
      const route = el.dataset.route || 'dashboard';
      if (name === 'dashboard') {
        el.classList.toggle('active', route === 'dashboard' && el.dataset.view === (window.Dashboard?.lastSubview || 'assets'));
      } else {
        el.classList.toggle('active', route === name);
      }
    });
  }

  let lastApplied = null;

  function apply(name) {
    if (lastApplied === name && document.body.dataset.route === name) {
      return;
    }
    lastApplied = name;
    document.documentElement.removeAttribute('data-boot-route');

    document.querySelectorAll('.app-view').forEach((view) => {
      const active = view.dataset.view === name;
      view.classList.toggle('is-active', active);
      view.toggleAttribute('inert', !active);
      if (active) {
        view.removeAttribute('hidden');
      } else {
        view.setAttribute('hidden', '');
      }
      view.setAttribute('aria-hidden', String(!active));
    });

    setChrome(name);

    if (name === 'dashboard') {
      window.Dashboard?.onShow?.();
    } else if (name === 'manage') {
      window.AdminPage?.onShow?.();
    } else if (name === 'rebalance') {
      window.RebalancePage?.onShow?.();
    }
  }

  function showView(name, { replace = false } = {}) {
    const next = HASH[name] || HASH.dashboard;
    const current = parseRoute();
    if (replace || !location.hash) {
      history.replaceState({ view: name }, '', next);
    } else if (current !== name) {
      history.pushState({ view: name }, '', next);
    }

    const run = () => apply(name);
    if (typeof document.startViewTransition === 'function') {
      document.startViewTransition(run);
    } else {
      run();
    }
  }

  function routeFromHref(href) {
    if (!href) return null;
    if (href === '#/' || href === '#/dashboard') return 'dashboard';
    if (href.startsWith('#/manage')) return 'manage';
    if (href.startsWith('#/rebalance')) return 'rebalance';
    if (/admin\.html(?:$|#)/.test(href)) return 'manage';
    if (/rebalance\.html(?:$|#)/.test(href)) return 'rebalance';
    if (/index\.html(?:$|#)/.test(href) || href === './' || href === '/') return 'dashboard';
    return null;
  }

  function onDocumentClick(e) {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    const name = routeFromHref(href);
    if (!name) return;
    e.preventDefault();
    if (parseRoute() !== name) showView(name);
  }

  function boot() {
    window.Dashboard?.bootChrome?.();
    document.body.addEventListener('click', onDocumentClick);
    window.addEventListener('hashchange', () => apply(parseRoute()));
    window.addEventListener('popstate', () => apply(parseRoute()));

    const initial = parseRoute();
    if (!location.hash) {
      history.replaceState({ view: initial }, '', HASH[initial]);
    }
    apply(initial);
  }

  window.Router = { showView, parseRoute };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
