// Bertrader: carga los datos, elige la vista por el fragmento de la URL y repinta.
(function () {
  'use strict';
  const R = window.BTRender;
  const view = document.getElementById('view');
  const status = document.getElementById('status');
  const nav = document.getElementById('nav');
  let data = null;
  let rules = null;
  let error = null;

  async function load() {
    try {
      const res = await fetch('/bertrader/data.json', { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error(res.status === 503 ? 'sin_datos' : 'http_' + res.status);
      data = await res.json();
      error = null;
    } catch (e) {
      error = (e && e.message) || 'red';
    }
  }

  async function loadRules() {
    try {
      const res = await fetch('/bertrader/reglas.md', { cache: 'no-store', credentials: 'same-origin' });
      rules = res.ok ? await res.text() : '';
    } catch (e) {
      rules = '';
    }
  }

  function paint() {
    const now = Date.now();
    nav.innerHTML = R.renderNav(R.route(location.hash).view);
    status.innerHTML = data ? R.renderStatus(data, now) : '';
    view.innerHTML = R.render({ data, error, rules, hash: location.hash, nowMs: now });
  }

  window.addEventListener('hashchange', () => { paint(); window.scrollTo(0, 0); });
  Promise.all([load(), loadRules()]).then(paint);
  // El export corre cada 5 minutos; la antigüedad del dato se refresca cada minuto.
  setInterval(() => load().then(paint), 5 * 60 * 1000);
  setInterval(() => { if (data) status.innerHTML = R.renderStatus(data, Date.now()); }, 60 * 1000);
})();
