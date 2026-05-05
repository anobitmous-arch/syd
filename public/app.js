let RAW = null;
let ITEMS = [];
let activeId = null;
const testAnswers = new Map(); // lessonId -> { selected: number }

const $levels = document.getElementById('levels');
const $lesson = document.getElementById('lesson');
const $status = document.getElementById('status');
const $search = document.getElementById('searchInput');
const $reload = document.getElementById('reloadBtn');

/* ── Data helpers ─────────────────────────────────── */
function flatten(data) {
  const out = [];
  for (const nivel of data) {
    for (const leccion of (nivel.lecciones || [])) {
      out.push({ nivel: nivel.nivel, nivelTitulo: nivel.titulo, ...leccion });
    }
  }
  return out;
}

function byNivel(items) {
  const map = new Map();
  for (const it of items) {
    const key = `${it.nivel}||${it.nivelTitulo}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(it);
  }
  return [...map.entries()]
    .map(([k, arr]) => {
      const [nivel, nivelTitulo] = k.split('||');
      return { nivel: Number(nivel), nivelTitulo, arr };
    })
    .sort((a, b) => a.nivel - b.nivel);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/* ── Sidebar ──────────────────────────────────────── */
function renderList() {
  const q = ($search.value || '').trim().toLowerCase();
  const filtered = !q ? ITEMS : ITEMS.filter(it => {
    const blob = [it.id, it.titulo, it.resumen, it.explicacion, it.ejemplo, it.nivelTitulo]
      .filter(Boolean).join(' | ').toLowerCase();
    return blob.includes(q);
  });

  const groups = byNivel(filtered);
  $levels.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'status';
    empty.textContent = 'Sin resultados.';
    $levels.appendChild(empty);
    return;
  }

  for (const g of groups) {
    const wrap = document.createElement('div');
    wrap.className = 'level';

    const title = document.createElement('div');
    title.className = 'levelTitle';
    title.textContent = `Nivel ${g.nivel} — ${g.nivelTitulo}`;
    wrap.appendChild(title);

    for (const it of g.arr) {
      const btn = document.createElement('button');
      btn.className = 'item' + (it.id === activeId ? ' active' : '');
      btn.onclick = () => selectLesson(it.id);

      const top = document.createElement('div');
      top.className = 'item-top';
      top.innerHTML = `<span class="id">${it.id}</span><span class="title">${escapeHtml(it.titulo)}</span>`;
      btn.appendChild(top);

      if (it.resumen) {
        const sum = document.createElement('div');
        sum.className = 'summary';
        sum.textContent = it.resumen;
        btn.appendChild(sum);
      }

      wrap.appendChild(btn);
    }

    $levels.appendChild(wrap);
  }
}

/* ── Test section ─────────────────────────────────── */
function renderTest(it) {
  const test = it.test;
  if (!test) return '';

  const state = testAnswers.get(it.id);
  const answered = state !== undefined;
  const correctIdx = Number(test.respuesta_correcta);

  const optsHtml = (test.opciones || []).map((op, idx) => {
    let cls = 'test-opt';
    if (answered) {
      if (idx === correctIdx) cls += ' opt-correct';
      else if (idx === state.selected) cls += ' opt-wrong';
      else cls += ' opt-disabled';
    }
    return `<button class="${cls}" data-lesson="${escapeHtml(it.id)}" data-idx="${idx}" ${answered ? 'disabled' : ''}>${escapeHtml(op)}</button>`;
  }).join('');

  let feedback = '';
  if (answered) {
    if (state.selected === correctIdx) {
      feedback = '<div class="test-feedback correct">✓ Correcto</div>';
    } else {
      feedback = `<div class="test-feedback wrong">✗ Incorrecto — la respuesta era: <strong>${escapeHtml(test.opciones[correctIdx])}</strong></div>`;
    }
  }

  return `
    <div class="card test">
      <h3>Test</h3>
      <p class="test-pregunta">${escapeHtml(test.pregunta || '')}</p>
      <div class="test-opts">${optsHtml}</div>
      ${feedback}
    </div>
  `;
}

/* ── Lesson content ───────────────────────────────── */
function renderLesson(it) {
  if (!it) { $lesson.innerHTML = ''; return; }

  $lesson.innerHTML = `
    <h2>${escapeHtml(it.titulo)}</h2>
    <div class="meta">
      <span class="badge">ID ${escapeHtml(it.id)}</span>
      <span class="badge">Nivel ${it.nivel} — ${escapeHtml(it.nivelTitulo)}</span>
      <span class="badge">+${it.puntos_recompensa ?? 0} pts</span>
    </div>

    <div class="card">
      <h3>Resumen</h3>
      <p>${escapeHtml(it.resumen || '')}</p>
    </div>

    <div class="card">
      <h3>Explicación</h3>
      <p>${escapeHtml(it.explicacion || '')}</p>
    </div>

    <div class="card">
      <h3>Ejemplo</h3>
      <p>${escapeHtml(it.ejemplo || '')}</p>
    </div>

    ${renderTest(it)}
  `;
}

/* ── Test click (event delegation) ───────────────── */
$lesson.addEventListener('click', e => {
  const btn = e.target.closest('.test-opt');
  if (!btn || btn.disabled) return;

  const lessonId = btn.dataset.lesson;
  const idx = Number(btn.dataset.idx);
  const it = ITEMS.find(x => x.id === lessonId);
  if (!it || !it.test) return;

  testAnswers.set(lessonId, { selected: idx });
  renderLesson(it);
});

/* ── Selection ────────────────────────────────────── */
function selectLesson(id) {
  activeId = id;
  const it = ITEMS.find(x => x.id === id);
  renderList();
  renderLesson(it);
  if (it) $status.textContent = `${it.id} — ${it.titulo}`;
}

/* ── Load ─────────────────────────────────────────── */
async function load() {
  $status.textContent = 'Cargando lecciones…';
  $lesson.innerHTML = '';
  $levels.innerHTML = '';

  const res = await fetch('/api/lecciones', { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  RAW = await res.json();
  ITEMS = flatten(RAW);
  $status.textContent = `${ITEMS.length} lecciones cargadas`;

  activeId = ITEMS[0]?.id || null;
  renderList();
  selectLesson(activeId);
}

function showError(err) {
  console.error(err);
  $status.textContent = 'Error al cargar.';
  $lesson.innerHTML = `
    <div class="card">
      <h3>Error</h3>
      <p>${escapeHtml(err.message || String(err))}</p>
    </div>
  `;
}

$search.addEventListener('input', renderList);
$reload.addEventListener('click', () => load().catch(showError));

load().catch(showError);
