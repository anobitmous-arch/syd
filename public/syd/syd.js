// SYD API client — shared across all pages
const API = '/api/syd';

// Inject mobile CSS (light theme, bottom nav)
(function () {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = '/syd/syd-mobile.css';
  document.head.appendChild(l);
})();

async function req(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error'), { status: res.status, data });
  return data;
}

const syd = {
  me: () => req('GET', '/auth/me'),
  register: (b) => req('POST', '/auth/register', b),
  login: (b) => req('POST', '/auth/login', b),
  logout: () => req('POST', '/auth/logout'),
  selectPole: (b) => req('POST', '/auth/select', b),
  poles: () => req('GET', '/poles'),
  pole: (id) => req('GET', `/poles/${id}`),
  campaign: (id) => req('GET', `/campaigns/${id}`),
  mission: (id) => req('GET', `/missions/${id}`),
  completeSubmission: (b) => req('POST', '/progress', b),
  progress: () => req('GET', '/progress'),
  checkinStatus: () => req('GET', '/daily-checkin'),
  dailyCheckin: () => req('POST', '/daily-checkin'),
  newsLatest: () => req('GET', '/news/latest'),
  recentProgress: () => req('GET', '/progress/recent'),
  wallet: () => req('GET', '/wallet'),
  wishTradeToday:   ()  => req('GET',  '/wish-trade/today'),
  wishTradeTrade:   (b) => req('POST', '/wish-trade/trade', b),
  wishTradeHistory: ()  => req('GET',  '/wish-trade/history'),
  nextLesson: () => req('GET', '/progress/next'),
  referrals: () => req('GET', '/auth/referrals'),
};

// Redirect to home if already logged in
async function redirectIfAuth(dest = '/syd/home.html') {
  try {
    await syd.me();
    location.href = dest;
    return true;
  } catch { return false; }
}

// Redirect to login if not authenticated
async function requireAuth(loginPage = '/syd/login.html') {
  try {
    const { user } = await syd.me();
    initBottomNav(user.pole_id);
    return user;
  } catch {
    location.href = loginPage;
    return null;
  }
}

// Inject bottom nav + set data-pole for mobile CSS
function initBottomNav(poleId) {
  if (document.querySelector('.syd-bottom-nav')) return;
  document.documentElement.setAttribute('data-pole', poleId || '1');
  const p = location.pathname;
  const a = (path) => p.includes(path) ? ' active' : '';
  const nav = document.createElement('nav');
  nav.className = 'syd-bottom-nav';
  nav.innerHTML = `
    <a href="/syd/home.html" class="syd-bnav-item${a('home')}">
      <span class="syd-bnav-icon">🏠</span><span>Inicio</span>
    </a>
    <a href="/syd/missions.html" class="syd-bnav-item${a('missions')}">
      <span class="syd-bnav-icon">📚</span><span>Aprende</span>
    </a>
    <a href="/syd/wish-trade.html" class="syd-bnav-item syd-bnav-center${a('wish-trade')}">
      <span class="syd-bnav-icon">⚡</span><span class="syd-bnav-label">Trade</span>
    </a>
    <a href="/syd/community.html" class="syd-bnav-item${a('community')}">
      <span class="syd-bnav-icon">👥</span><span>Polo</span>
    </a>
    <a href="/syd/profile.html" class="syd-bnav-item${a('profile')}">
      <span class="syd-bnav-icon">👤</span><span>Perfil</span>
    </a>
  `;
  document.body.appendChild(nav);
}

// Pole metadata (colors, icons, descriptions)
const POLES = {
  1: { name: 'Norte',  color: '#2ee59d', icon: '🦙', label: 'Ahorro & Bases' },
  2: { name: 'Sur',    color: '#5baeff', icon: '🦅', label: 'Inversión & Crecimiento' },
  3: { name: 'Este',   color: '#ff9f43', icon: '🐯', label: 'Innovación & Mercados' },
  4: { name: 'Oeste',  color: '#c77aff', icon: '🦉', label: 'Seguridad & Patrimonio' },
  5: { name: 'Jardín', color: '#2ee59d', icon: '🌱', label: 'Primeros pasos' },
  6: { name: 'Cielo',  color: '#5baeff', icon: '🦅', label: 'Nivel Avanzado' },
};

function poleById(id) { return POLES[id] || POLES[1]; }

// XP → level (100 XP per level)
function xpToLevel(xp) {
  const level = Math.floor(xp / 100) + 1;
  const progress = xp % 100;
  return { level, progress };
}

function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError(el) { el.style.display = 'none'; }
