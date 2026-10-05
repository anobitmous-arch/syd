// Bertrader · termómetro de monedas calientes: termometro.json → HTML. Funciones puras, sin DOM (node --test).
// En el navegador quedan en `window.BTTermo`; render.js las usa.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BTTermo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA = 1;
  const STALE_MS = 60 * 60 * 1000;
  const FUTURE_MS = 60 * 1000;
  const MAX_ROWS = 10;
  const GROUPS = [['caliente', '🔥 Calientes'], ['euforia', '🌋 Euforia'], ['temprana', '🌱 Tempranas']];
  const SOURCES = [['x', 'X'], ['trending', 'trending'], ['hl', 'HL']];
  const HEAD = '<h2>🌡️ Termómetro <span class="muted">· sin validar · solo información</span></h2>';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function es(n, digits) {
    return Number(n).toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  function pct(n) { return n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + es(Math.abs(n), 0) + ' %'; }
  function ratio(n) { return n == null ? '—' : '×' + es(n, 1); }
  function fund(n) { return n == null ? '—' : es(n * 100, 4) + ' %'; }
  function clock(iso, tz) {
    try {
      return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'UTC' });
    } catch (e) {
      return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    }
  }
  function ago(iso, nowMs) {
    const h = Math.floor((nowMs - Date.parse(iso)) / 3600000);
    return h < 1 ? 'hace <1 h' : `hace ${h} h`;
  }
  function trim(text, max) { return text.length > max ? text.slice(0, max - 1) + '…' : text; }

  function isValid(t) { return !!t && t.schema === SCHEMA && t.kind === 'termometro' && Array.isArray(t.coins); }
  function isFresh(t, nowMs) {
    if (!isValid(t)) return false;
    const g = Date.parse(t.generated_at);
    return Number.isFinite(g) && nowMs - g < STALE_MS && g - nowMs < FUTURE_MS;
  }

  function tweetHtml(tw, tz) {
    const who = /^https:\/\/x\.com\//.test(tw.url || '')
      ? `<a href="${esc(tw.url)}" target="_blank" rel="noopener noreferrer">@${esc(tw.account)}</a>`
      : `@${esc(tw.account)}`;
    return `<li>${who} <span class="muted">${esc(clock(tw.ts, tz))}</span> ${esc(trim(String(tw.text || ''), 200))}</li>`;
  }

  function rowHtml(c, tz, nowMs) {
    const n = (c.accounts || []).length;
    const who = `${n} cuenta${n === 1 ? '' : 's'}` + (c.trending_rank ? ` · trending #${c.trending_rank}` : '') + (c.is_new ? ' · nueva' : '');
    const nums = `OI ${pct(c.oi_chg_24h)} · vol ${ratio(c.vol_ratio)} · fund ${fund(c.funding)} · ${pct(c.px_chg_24h)}`;
    const tweets = (c.tweets || []).length
      ? `<ul class="termo-tweets">${c.tweets.map((tw) => tweetHtml(tw, tz)).join('')}</ul>`
      : '<p class="hint">Sin tuits: entra por trending.</p>';
    return `<details class="termo-row"><summary><b>${esc(c.symbol)}</b> <span class="muted">${esc(who)}</span>` +
      `<span class="termo-nums">${esc(nums)}</span><span class="muted">${esc(ago(c.since, nowMs))}</span></summary>${tweets}</details>`;
  }

  function footHtml(t, tz) {
    return '<p class="termo-foot">' + SOURCES.map(([key, label]) => {
      const s = (t.sources || {})[key];
      const text = `${label} ${s && s.last_ok ? clock(s.last_ok, tz) : 'sin datos'}`;
      return !s || s.stale ? `<span class="stale">${esc(text)}</span>` : `<span>${esc(text)}</span>`;
    }).join(' · ') + '</p>';
  }

  function html(t, tz, nowMs) {
    if (!isFresh(t, nowMs)) return `<section>${HEAD}<p class="empty">Termómetro sin datos ahora mismo.</p></section>`;
    if (!t.coins.length) return `<section>${HEAD}<p class="empty">Nada caliente ahora mismo.</p>${footHtml(t, tz)}</section>`;
    const shown = t.coins.slice(0, MAX_ROWS);
    const groups = GROUPS.map(([state, label]) => {
      const rows = shown.filter((c) => c.state === state);
      return rows.length ? `<h3>${label}</h3>${rows.map((c) => rowHtml(c, tz, nowMs)).join('')}` : '';
    }).join('');
    const rest = t.coins.length - shown.length;
    return `<section>${HEAD}${groups}${rest > 0 ? `<p class="hint">…y ${rest} más</p>` : ''}${footHtml(t, tz)}</section>`;
  }

  return { isValid, isFresh, html, rowHtml };
});
