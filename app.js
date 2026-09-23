/* Sistema para óptica — pacientes, medidas, órdenes, inventario y caja diaria.
   Todo se guarda en este navegador (localStorage). Respaldo con Ajustes → Exportar. */
'use strict';

// ---------- Utilidades ----------
const KEY = 'optica-db-v1';
const SESSION = 'optica-user';
const METODOS = ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia'];
const METODO_COLOR = { Efectivo: '#2f7d4f', Yape: '#742284', Plin: '#1aa3c9', Tarjeta: '#14263f', Transferencia: '#b98a4b' };
const ESTADOS = { pendiente: ['En laboratorio', 'pend'], listo: ['Listo', 'listo'], entregado: ['Entregado', 'entr'] };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const round2 = n => Math.round(n * 100) / 100;
const money = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n, l = 4) => String(n).padStart(l, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
const hoy = () => ymd(new Date());
const addDays = (s, k) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + k); return ymd(d); };
const fdate = (s, opt = { day: 'numeric', month: 'short', year: 'numeric' }) => s ? new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-PE', opt) : '—';
const flong = s => fdate(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const rxv = (v, dec = 2) => (v === '' || v == null || isNaN(v)) ? '—' : (dec === 0 ? String(Math.round(v)) : (v > 0 ? '+' : '') + Number(v).toFixed(dec));
const rx2 = (v, dec) => (v === '' || v == null) ? '—' : rxv(num(v), dec);
const hashPin = pin => { let h = 5381; for (const c of 'opt1ca:' + pin) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const phoneWa = t => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 9) d = '51' + d; return d; };

const waLink = (tel, txt) => `https://wa.me/${phoneWa(tel)}${txt ? '?text=' + encodeURIComponent(txt) : ''}`;
const EN_CLAUDE = !!(window.claude && window.claude.use);
let dlApi = null;
const dlReady = (async () => { try { if (EN_CLAUDE) dlApi = await window.claude.use('downloads'); } catch (e) { } })();
// Guarda un archivo: en la página publicada pide confirmación al usuario; en el equipo descarga directo.
async function saveFile(filename, data) {
  await dlReady;
  if (dlApi) {
    try { await dlApi.save({ filename, data }); toast('Archivo guardado'); return true; }
    catch (e) {
      if (e && e.code === 'declined') return false;
      if (e && e.code === 'rate_limited') { toast('Espera un momento y vuelve a intentarlo'); return false; }
    }
  }
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove(); toast('Descargando ' + filename); return true;
  } catch (e) { toast('No se pudo guardar el archivo'); return false; }
}

const I = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  wa: '<path d="M3 21l1.65-4.8A9 9 0 1 1 7.8 19.4z"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  up: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
};
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

// ---------- Datos ----------
const FACT_DEF = () => ({
  ruc: '', razon: '', direccion: '', distrito: '', provincia: '', departamento: '', email: '', web: '',
  igv: true, igvPct: 18, serieB: 'B001', numB: 1, serieF: 'F001', numF: 1, formato: 'A4', medida: true,
  pie: 'Gracias por su preferencia. Presente este documento para recoger sus lentes.', cuentas: '', logo: '', logoRatio: 1,
});
let db = load();
let user = null;
try { user = sessionStorage.getItem(SESSION); } catch (e) { }

function blank() {
  return {
    config: { nombre: '', ruc: '', direccion: '', telefono: '', recordatorioMeses: 12, nextOrden: 1, socios: [], fact: FACT_DEF() },
    pacientes: [], medidas: [], monturas: [], cristales: [], ordenes: [], pagos: [], gastos: [], vales: [], cierres: [], log: [], comprobantes: [],
  };
}
function load() {
  try { const r = localStorage.getItem(KEY); if (r) return normDb(Object.assign(blank(), JSON.parse(r))); } catch (e) { }
  return null;
}
// Completa los datos guardados con versiones anteriores del sistema.
function normDb(d) {
  d.config.fact = Object.assign(FACT_DEF(), d.config.fact || {});
  if (!d.config.fact.ruc && d.config.ruc) d.config.fact.ruc = d.config.ruc;
  if (!d.config.fact.direccion && d.config.direccion) d.config.fact.direccion = d.config.direccion;
  d.comprobantes = d.comprobantes || [];
  return d;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('No se pudo guardar: ' + e.message); }
}
const socio = id => db.config.socios.find(s => s.id === id);
const socioName = id => socio(id)?.nombre || '—';
const me = () => socio(user);
const paciente = id => db.pacientes.find(p => p.id === id);
const orden = id => db.ordenes.find(o => o.id === id);
const medidasDe = pid => db.medidas.filter(m => m.pacienteId === pid).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
const ordenesDe = pid => db.ordenes.filter(o => o.pacienteId === pid).sort((a, b) => b.numero - a.numero);
const pagosDe = oid => db.pagos.filter(p => p.ordenId === oid).sort((a, b) => a.fecha.localeCompare(b.fecha));
const totalOrden = o => round2(o.items.reduce((s, i) => s + num(i.cant) * num(i.precio), 0) - num(o.descuento));
const pagadoOrden = o => round2(pagosDe(o.id).reduce((s, p) => s + num(p.monto), 0));
const saldoOrden = o => round2(totalOrden(o) - pagadoOrden(o));
const cerrado = f => db.cierres.some(c => c.fecha === f);
const ultimaMedida = pid => medidasDe(pid)[0];
const addLog = (accion, autoriza) => { db.log.unshift({ ts: new Date().toISOString(), accion, por: user, autoriza: autoriza || null }); db.log = db.log.slice(0, 500); };

// Diagnóstico sencillo a partir de la medida, en palabras que entiende el paciente.
function diagnostico(m) {
  const out = [];
  const eyes = [m.od, m.oi];
  if (eyes.some(e => num(e.esf) < 0)) out.push(['Miopía', 'Ve borroso de lejos; de cerca ve bien.']);
  if (eyes.some(e => num(e.esf) > 0)) out.push(['Hipermetropía', 'Hace más esfuerzo para enfocar, sobre todo de cerca.']);
  if (eyes.some(e => num(e.cil) !== 0)) out.push(['Astigmatismo', 'La imagen se ve algo distorsionada o sombreada a cualquier distancia.']);
  if (eyes.some(e => num(e.add) > 0)) out.push(['Presbicia', 'Con la edad cuesta enfocar de cerca (leer, el celular).']);
  return out;
}

// ---------- UI base ----------
function toast(msg) {
  $('.toast')?.remove();
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function modal({ title, body, foot = '', wide = false, onMount }) {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h3>${title}</h3><button class="btn ghost icon" data-close aria-label="Cerrar">${icon('x')}</button></div>
    <div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}</div>`;
  bg.addEventListener('mousedown', e => { if (e.target === bg) closeModal(); });
  $$('[data-close]', bg).forEach(b => b.onclick = closeModal);
  document.body.appendChild(bg);
  const first = $('input:not([type=hidden]):not([readonly]),select,textarea', bg); if (first && !('ontouchstart' in window)) first.focus();
  onMount && onMount(bg);
  return bg;
}
function closeModal() { $('.modal-bg')?.remove(); }
function confirmBox(msg, ok, label = 'Confirmar') {
  modal({ title: 'Confirmar', body: `<p style="margin:0">${msg}</p>`, foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="okc">${label}</button>`,
    onMount: bg => { $('#okc', bg).onclick = () => { closeModal(); ok(); }; } });
}

// Autorización con la clave de los dos socios para cambios delicados.
function dual(motivo, cb) {
  const socios = db.config.socios;
  if (socios.length < 2) { cb(); return; }
  modal({
    title: 'Autorización de los socios',
    body: `<div class="lock-note">${icon('lock')}<div><b>${esc(motivo)}</b><br>Este cambio necesita la clave de los dos socios.</div></div>
      <div class="form">${socios.map(s => `<label class="f">Clave de ${esc(s.nombre)}<input class="inp pin" type="password" inputmode="numeric" autocomplete="off" data-s="${s.id}" maxlength="8"></label>`).join('')}
      <div class="err" id="derr"></div></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="dok">${icon('unlock')} Autorizar</button>`,
    onMount: bg => {
      const go = () => {
        const bad = $$('[data-s]', bg).filter(i => hashPin(i.value) !== socio(i.dataset.s).pin);
        if (bad.length) { $('#derr', bg).textContent = 'Clave incorrecta de ' + bad.map(i => socioName(i.dataset.s)).join(' y '); return; }
        closeModal(); addLog(motivo, socios.map(s => s.id)); cb();
      };
      $('#dok', bg).onclick = go;
      $$('input', bg).forEach(i => i.addEventListener('keydown', e => e.key === 'Enter' && go()));
    },
  });
}

function readForm(form) {
  const o = {};
  for (const [k, v] of new FormData(form)) o[k] = typeof v === 'string' ? v.trim() : v;
  return o;
}

// ---------- Enrutado ----------
const routes = {};
// Navegación interna (sin depender del # de la dirección, que en la página publicada no se puede usar).
let route = '/inicio', lastRoute = '';
function go(h, push = true) {
  route = String(h || '').replace(/^#/, '') || '/inicio';
  if (push) { try { history.pushState({ route }, ''); } catch (e) { } }
  render();
}
window.addEventListener('popstate', e => { if (e.state && e.state.route) go(e.state.route, false); });
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#/"]');
  if (!a || e.defaultPrevented) return;
  e.preventDefault(); closeModal(); go(a.getAttribute('href'));
});
document.addEventListener('click', e => { if (!e.target.closest('.search')) $$('.sr').forEach(r => r.hidden = true); });

function render() {
  const root = $('#root');
  if (!db) { root.innerHTML = setupView(); bindSetup(); return; }
  if (!user || !me()) { root.innerHTML = loginView(); bindLogin(); return; }
  const [path, qs] = route.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs || '');
  const key = parts[0] || 'inicio';
  const view = routes[key] || routes.inicio;
  root.innerHTML = shell(key, view.html(parts[1], q));
  bindShell();
  view.bind && view.bind(parts[1], q);
  if (route !== lastRoute) { window.scrollTo(0, 0); lastRoute = route; }
}

function shell(key, content) {
  const nav = [
    ['inicio', 'Inicio', 'home'], ['pacientes', 'Pacientes', 'users'], ['ordenes', 'Órdenes', 'file'],
    ['caja', 'Caja diaria', 'cash'], ['inventario', 'Inventario', 'box'], ['recordatorios', 'Recordatorios', 'bell'], ['ajustes', 'Ajustes', 'gear'],
  ];
  const recs = recordatoriosData().total;
  const pend = db.ordenes.filter(o => o.estado !== 'entregado').length;
  const badge = k => k === 'recordatorios' && recs ? `<span class="badge">${recs}</span>` : k === 'ordenes' && pend ? `<span class="badge">${pend}</span>` : '';
  const active = k => (k === key || (k === 'pacientes' && key === 'paciente') || (k === 'ordenes' && (key === 'orden' || key === 'nueva-orden'))) ? 'on' : '';
  const u = me();
  return `<div class="app">
    <aside class="side">
      <div class="brand"><div class="logo">${icon('eye')}</div><div><b>${esc(db.config.nombre || 'Mi Óptica')}</b><small>Sistema de gestión</small></div></div>
      <nav class="nav">${nav.map(([k, t, i]) => `<a href="#/${k}" class="${active(k)}">${icon(i)}<span>${t}</span>${badge(k)}</a>`).join('')}</nav>
      <div class="me"><div class="avatar">${initials(u.nombre)}</div><div><b>${esc(u.nombre)}</b><small>Socio</small></div><button id="logout" title="Cambiar de usuario">${icon('logout')}</button></div>
    </aside>
    <div class="main">
      <header class="top">
        <div class="search">${icon('search')}<input id="gsearch" placeholder="Buscar paciente, teléfono o N° de orden…" autocomplete="off"><div class="sr" id="gres" hidden></div></div>
        <div class="date cap">${flong(hoy())}</div>
        <button class="btn ghost icon me-m" id="logout2" title="Salir">${icon('logout')}</button>
      </header>
      <main class="content">${content}</main>
    </div>
    <nav class="mobile-bar">${[nav[0], nav[1], nav[2], nav[3], ['mas', 'Más', 'menu']].map(([k, t, i]) =>
      `<a href="${k === 'mas' ? '#' : '#/' + k}" ${k === 'mas' ? 'id="mas"' : ''} class="${active(k)}">${icon(i)}<span>${t}</span>${k === 'mas' && recs ? `<span class="badge">${recs}</span>` : badge(k)}</a>`).join('')}</nav>
  </div>`;
}

function bindShell() {
  const out = () => { try { sessionStorage.removeItem(SESSION); } catch (e) { } user = null; render(); };
  $('#logout').onclick = out; $('#logout2').onclick = out;
  // En tablet horizontal la barra lateral es compacta: tocar el avatar cambia de usuario.
  $('.side .me').onclick = e => { if (innerWidth <= 1180 && !e.target.closest('#logout')) confirmBox(`¿Salir de la cuenta de ${esc(me().nombre)}?`, out, 'Cambiar de usuario'); };
  $('#mas').onclick = e => {
    e.preventDefault();
    modal({ title: 'Más opciones', body: `<div class="card" style="box-shadow:none">${[['inventario', 'Inventario', 'box'], ['recordatorios', 'Recordatorios', 'bell'], ['ajustes', 'Ajustes', 'gear']]
      .map(([k, t, i]) => `<a class="list-item link" href="#/${k}" data-close><span class="ini">${icon(i)}</span><span class="grow t">${t}</span></a>`).join('')}
      <a class="list-item link" href="#" id="out3"><span class="ini">${icon('logout')}</span><span class="grow t">Cambiar de usuario</span></a></div>`,
      onMount: bg => { $$('a[data-close]', bg).forEach(a => a.onclick = closeModal); $('#out3', bg).onclick = e => { e.preventDefault(); closeModal(); out(); }; } });
  };
  const inp = $('#gsearch'), res = $('#gres');
  inp.addEventListener('input', () => {
    const q = inp.value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!q) { res.hidden = true; return; }
    const digits = q.replace(/\D/g, '');
    const ps = db.pacientes.filter(p => p.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q) || (digits.length >= 3 && String(p.telefono).replace(/\D/g, '').includes(digits)) || (p.dni && p.dni.includes(q))).slice(0, 6);
    const os = db.ordenes.filter(o => (digits && String(o.numero).includes(String(+digits))) || paciente(o.pacienteId)?.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)).sort((a, b) => b.numero - a.numero).slice(0, 6);
    res.innerHTML = (ps.length ? `<div class="grp">Pacientes</div>` + ps.map(p => `<a href="#/paciente/${p.id}"><span class="ini" style="width:30px;height:30px;font-size:12px">${initials(p.nombre)}</span><span class="grow"><b>${esc(p.nombre)}</b><br><span class="muted small">${esc(p.telefono || '')}</span></span></a>`).join('') : '')
      + (os.length ? `<div class="grp">Órdenes</div>` + os.map(o => `<a href="#/orden/${o.id}"><span class="ordnum">N° ${pad(o.numero)}</span><span class="grow small">${esc(paciente(o.pacienteId)?.nombre)}</span>${estadoChip(o)}</a>`).join('') : '')
      || `<div class="empty small">Sin resultados para “${esc(inp.value)}”</div>`;
    res.hidden = false;
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const a = $('a', res); if (a) { res.hidden = true; inp.value = ''; go(a.getAttribute('href')); } } if (e.key === 'Escape') { inp.value = ''; res.hidden = true; } });
  res.addEventListener('click', () => { res.hidden = true; inp.value = ''; });
}

const estadoChip = o => {
  const [t, c] = ESTADOS[o.estado] || ESTADOS.pendiente;
  return `<span class="chip ${c}">${t}</span>`;
};
const deudaChip = o => { const s = saldoOrden(o); return s > 0.009 ? `<span class="chip deuda">Debe ${money(s)}</span>` : `<span class="chip entr">Pagado</span>`; };

// ---------- Primera configuración ----------
function setupView() {
  return `<div class="login"><div class="box wide">
    <div class="logo">${icon('eye')}</div>
    <h1>Bienvenido</h1><p class="muted" style="margin:6px 0 20px">Configuremos la óptica. Solo toma un minuto.</p>
    <form id="setup" class="form">
      <div class="fg"><label class="f full">Nombre de la óptica<input class="inp" name="nombre" required value="Glooptic"></label>
      <label class="f">Teléfono<input class="inp" name="telefono" inputmode="tel"></label><label class="f">RUC <span class="hint">(opcional)</span><input class="inp" name="ruc" inputmode="numeric"></label>
      <label class="f full">Dirección<input class="inp" name="direccion"></label></div>
      <div class="fg"><label class="f">Socio 1<input class="inp" name="s1" required value="Jorge"></label><label class="f">Clave socio 1<input class="inp" name="p1" type="password" inputmode="numeric" required minlength="4" maxlength="8" placeholder="4 a 8 dígitos"></label>
      <label class="f">Socio 2<input class="inp" name="s2" required value="Juan"></label><label class="f">Clave socio 2<input class="inp" name="p2" type="password" inputmode="numeric" required minlength="4" maxlength="8" placeholder="4 a 8 dígitos"></label></div>
      <label class="row small" style="gap:8px"><input type="checkbox" name="demo" checked> Cargar datos de ejemplo para probar el sistema</label>
      <button class="btn primary" style="padding:12px">Empezar</button>
    </form></div></div>`;
}
function bindSetup() {
  $('#setup').onsubmit = e => {
    e.preventDefault();
    const f = readForm(e.target);
    db = blank();
    Object.assign(db.config, { nombre: f.nombre, telefono: f.telefono, ruc: f.ruc, direccion: f.direccion });
    Object.assign(db.config.fact, { ruc: f.ruc, direccion: f.direccion });
    db.config.socios = [{ id: 's1', nombre: f.s1, pin: hashPin(f.p1), pct: 50 }, { id: 's2', nombre: f.s2, pin: hashPin(f.p2), pct: 50 }];
    if (f.demo) seedDemo();
    save(); render();
  };
}

// ---------- Ingreso ----------
let loginSel = null;
function loginView() {
  const ss = db.config.socios;
  loginSel = loginSel || ss[0]?.id;
  return `<div class="login"><div class="box">
    <div class="logo">${icon('eye')}</div>
    <h1>${esc(db.config.nombre || 'Mi Óptica')}</h1><p class="muted" style="margin:6px 0 0">¿Quién ingresa?</p>
    <div class="who">${ss.map(s => `<button type="button" data-u="${s.id}" class="${s.id === loginSel ? 'on' : ''}"><span class="avatar">${initials(s.nombre)}</span>${esc(s.nombre)}</button>`).join('')}</div>
    <form id="login" class="form"><input class="inp pin" id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="Clave" maxlength="8">
    <div class="err" id="lerr"></div><button class="btn primary" style="padding:12px">Ingresar</button></form></div></div>`;
}
function bindLogin() {
  $$('[data-u]').forEach(b => b.onclick = () => { loginSel = b.dataset.u; $$('[data-u]').forEach(x => x.classList.toggle('on', x === b)); $('#pin').focus(); });
  $('#pin').focus();
  $('#login').onsubmit = e => {
    e.preventDefault();
    const s = socio(loginSel);
    if (!s || hashPin($('#pin').value) !== s.pin) { $('#lerr').textContent = 'Clave incorrecta'; $('#pin').value = ''; return; }
    user = s.id; try { sessionStorage.setItem(SESSION, user); } catch (err) { }
    render();
  };
}

// ---------- Inicio ----------
routes.inicio = {
  html() {
    const d = hoy();
    const ventasHoy = db.ordenes.filter(o => o.fecha === d);
    const pagosHoy = db.pagos.filter(p => p.fecha === d);
    const cobrado = pagosHoy.reduce((s, p) => s + num(p.monto), 0);
    const gastos = db.gastos.filter(g => g.fecha === d).reduce((s, g) => s + num(g.monto), 0);
    const porCobrar = db.ordenes.reduce((s, o) => s + Math.max(0, saldoOrden(o)), 0);
    const pend = db.ordenes.filter(o => o.estado !== 'entregado').sort((a, b) => (a.entrega || '9').localeCompare(b.entrega || '9'));
    const rec = recordatoriosData();
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    return `<div class="page-head"><div><h1>${saludo}, ${esc(me().nombre)}</h1><p>Así va la óptica hoy.</p></div>
      <div class="actions"><a class="btn" href="#/pacientes?nuevo=1">${icon('users')} Nuevo paciente</a><a class="btn primary" href="#/nueva-orden">${icon('plus')} Nueva venta</a></div></div>
      <div class="grid g4">
        <div class="card kpi"><div class="l"><i>${icon('trend')}</i>Vendido hoy</div><div class="v num">${money(ventasHoy.reduce((s, o) => s + totalOrden(o), 0))}</div><div class="s">${ventasHoy.length} ${ventasHoy.length === 1 ? 'orden' : 'órdenes'}</div></div>
        <div class="card kpi ink"><div class="l"><i>${icon('wallet')}</i>Cobrado hoy</div><div class="v num">${money(cobrado)}</div><div class="s">Gastos: ${money(gastos)}</div></div>
        <div class="card kpi warn"><div class="l"><i>${icon('clock')}</i>Por cobrar</div><div class="v num">${money(porCobrar)}</div><div class="s">Saldos de todas las órdenes</div></div>
        <div class="card kpi gold"><div class="l"><i>${icon('file')}</i>Por entregar</div><div class="v num">${pend.length}</div><div class="s">${(n => n === 1 ? '1 lista' : n + ' listas')(pend.filter(o => o.estado === 'listo').length)} para entregar</div></div>
      </div>
      <div class="split mt">
        <div class="card"><div class="card-h"><h3>Órdenes pendientes</h3><a class="btn sm ghost" href="#/ordenes">Ver todas</a></div>
          <div class="card-b" style="padding:10px 0 6px">${pend.length ? pend.slice(0, 7).map(ordenRow).join('') : `<div class="empty">No hay órdenes pendientes.</div>`}</div></div>
        <div class="grid" style="gap:18px">
          <div class="card"><div class="card-h"><h3>Caja de hoy</h3><a class="btn sm ghost" href="#/caja">Abrir caja</a></div>
            <div class="card-b">${metodoResumen(pagosHoy)}</div></div>
          <div class="card"><div class="card-h"><h3>Recordatorios</h3><a class="btn sm ghost" href="#/recordatorios">Ver</a></div>
            <div class="card-b"><div class="cash-sum">
              <div class="line"><span>Lentes listos sin avisar</span><b>${rec.listos.length}</b></div>
              <div class="line"><span>Control anual pendiente</span><b>${rec.control.length}</b></div>
              <div class="line"><span>Clientes con saldo</span><b>${rec.deudas.length}</b></div></div></div></div>
        </div>
      </div>`;
  },
};
function ordenRow(o) {
  const p = paciente(o.pacienteId);
  const atras = o.entrega && o.entrega < hoy() && o.estado === 'pendiente';
  return `<a class="list-item link" href="#/orden/${o.id}">
    <span class="ordnum" style="min-width:64px">N° ${pad(o.numero)}</span>
    <span class="grow"><span class="t">${esc(p?.nombre)}</span><span class="d">${esc(o.items.map(i => i.desc).join(' · '))}</span></span>
    <span class="hide-sm small ${atras ? '' : 'muted'}" style="${atras ? 'color:var(--danger);font-weight:600' : ''}">${o.entrega ? 'Entrega ' + fdate(o.entrega, { day: 'numeric', month: 'short' }) : ''}</span>
    <span style="display:grid;gap:4px;justify-items:end">${estadoChip(o)}${saldoOrden(o) > 0.009 ? `<span class="small" style="color:var(--danger);font-weight:600">Debe ${money(saldoOrden(o))}</span>` : ''}</span></a>`;
}
function metodoResumen(pagos) {
  const tot = pagos.reduce((s, p) => s + num(p.monto), 0);
  const by = METODOS.map(m => [m, pagos.filter(p => p.metodo === m).reduce((s, p) => s + num(p.monto), 0)]).filter(x => x[1] > 0);
  if (!tot) return `<div class="empty" style="padding:14px">Aún no hay cobros hoy.</div>`;
  return `<div class="row between" style="margin-bottom:10px"><span class="muted small">Total cobrado</span><b class="num" style="font-family:var(--serif);font-size:22px">${money(tot)}</b></div>
    <div class="method-bar">${by.map(([m, v]) => `<span style="width:${v / tot * 100}%;background:${METODO_COLOR[m]}"></span>`).join('')}</div>
    <div class="legend">${by.map(([m, v]) => `<span><i style="background:${METODO_COLOR[m]}"></i>${m} <b class="num">${money(v)}</b></span>`).join('')}</div>`;
}

// ---------- Pacientes ----------
routes.pacientes = {
  html(_, q) {
    return `<div class="page-head"><div><h1>Pacientes</h1><p>${db.pacientes.length} registrados</p></div>
      <div class="actions"><button class="btn primary" id="newp">${icon('plus')} Nuevo paciente</button></div></div>
      <div class="card"><div class="card-b" style="padding-bottom:6px"><input class="inp" id="pf" placeholder="Filtrar por nombre, DNI o teléfono…" value="${esc(q.get('q') || '')}"></div>
      <div id="plist"></div></div>`;
  },
  bind(_, q) {
    const draw = () => {
      const f = $('#pf').value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const list = db.pacientes.filter(p => !f || p.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f) || String(p.telefono).includes(f) || String(p.dni || '').includes(f))
        .map(p => ({ p, m: ultimaMedida(p.id), n: ordenesDe(p.id).length }))
        .sort((a, b) => (b.m?.fecha || b.p.creadoF || '').localeCompare(a.m?.fecha || a.p.creadoF || ''));
      $('#plist').innerHTML = list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Paciente</th><th class="hide-sm">Teléfono</th><th>Última medida</th><th class="c hide-sm">Órdenes</th></tr></thead><tbody>
        ${list.map(({ p, m, n }) => `<tr class="link" data-h="#/paciente/${p.id}"><td><div class="row"><span class="ini">${initials(p.nombre)}</span><div><b>${esc(p.nombre)}</b>${p.dni ? `<div class="muted small">DNI ${esc(p.dni)}</div>` : ''}</div></div></td>
        <td class="hide-sm">${esc(p.telefono || '—')}</td><td>${m ? fdate(m.fecha) : '<span class="muted">Sin medida</span>'}</td><td class="c hide-sm">${n}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty">${icon('users')}<div>No hay pacientes${f ? ' con ese filtro' : ''}.</div></div>`;
      $$('[data-h]').forEach(r => r.onclick = () => go(r.dataset.h));
    };
    $('#pf').oninput = draw; draw();
    $('#newp').onclick = () => pacienteForm();
    if (q.get('nuevo')) pacienteForm();
  },
};
function pacienteForm(p) {
  const e = p || {};
  modal({
    title: p ? 'Editar paciente' : 'Nuevo paciente',
    body: `<form id="pform" class="form"><div class="fg">
      <label class="f full">Nombre completo<input class="inp" name="nombre" required value="${esc(e.nombre)}"></label>
      <label class="f">Celular<input class="inp" name="telefono" inputmode="tel" value="${esc(e.telefono)}" placeholder="9XX XXX XXX"></label>
      <label class="f">DNI<input class="inp" name="dni" inputmode="numeric" value="${esc(e.dni)}"></label>
      <label class="f">Fecha de nacimiento<input class="inp" type="date" name="nacimiento" value="${esc(e.nacimiento)}"></label>
      <label class="f">Ocupación<input class="inp" name="ocupacion" value="${esc(e.ocupacion)}"></label>
      <label class="f full">Notas<textarea class="inp" name="notas">${esc(e.notas)}</textarea></label></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="pform">Guardar</button>`,
    onMount: bg => {
      $('#pform', bg).onsubmit = ev => {
        ev.preventDefault();
        const f = readForm(ev.target);
        const dup = !p && db.pacientes.find(x => f.telefono && String(x.telefono || '').replace(/\D/g, '') === f.telefono.replace(/\D/g, ''));
        if (dup && !ev.target.dataset.ok) {
          const warn = $('#dupw', bg) || ev.target.insertAdjacentElement('afterbegin', Object.assign(document.createElement('div'), { id: 'dupw', className: 'lock-note' }));
          warn.innerHTML = `${icon('users')}<div>Ya existe <a class="strong" href="#/paciente/${dup.id}">${esc(dup.nombre)}</a> con ese celular. Si es otra persona, pulsa Guardar otra vez.</div>`;
          ev.target.dataset.ok = '1'; return;
        }
        if (p) Object.assign(p, f);
        else { p = { id: uid(), creado: Date.now(), creadoF: hoy(), por: user, ...f }; db.pacientes.push(p); }
        save(); closeModal(); toast('Paciente guardado'); go('#/paciente/' + p.id);
      };
    },
  });
}

routes.paciente = {
  html(id) {
    const p = paciente(id);
    if (!p) return `<div class="empty">Paciente no encontrado. <a href="#/pacientes" class="strong">Volver</a></div>`;
    const ms = medidasDe(id), os = ordenesDe(id);
    const edad = p.nacimiento ? Math.floor(daysBetween(p.nacimiento, hoy()) / 365.25) : null;
    return `<a class="crumb" href="#/pacientes">${icon('back')} Pacientes</a>
      <div class="page-head"><div class="row"><span class="ini" style="width:56px;height:56px;border-radius:16px;font-size:20px">${initials(p.nombre)}</span>
        <div><h1>${esc(p.nombre)}</h1><p>${[p.telefono, p.dni && 'DNI ' + p.dni, edad != null && edad + ' años', p.ocupacion].filter(Boolean).map(esc).join(' · ') || 'Sin datos de contacto'}</p></div></div>
        <div class="actions"><button class="btn" id="pedit">${icon('edit')} Editar</button>${p.telefono ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(p.telefono)}">${icon('wa')} WhatsApp</a>` : ''}
        <button class="btn accent" id="newm">${icon('plus')} Nueva medida</button><a class="btn primary" href="#/nueva-orden?p=${p.id}">${icon('file')} Nueva venta</a></div></div>
      ${p.notas ? `<div class="card card-b" style="margin-bottom:18px"><span class="muted small strong">NOTAS</span><div>${esc(p.notas)}</div></div>` : ''}
      <div class="split">
        <div class="card"><div class="card-h"><div><h3>Historial de medidas</h3><div class="sub">${ms.length ? 'Cada examen se guarda; nada se sobrescribe.' : ''}</div></div>${ms.length > 1 ? `<button class="btn sm" id="evo">${icon('chart')} Evolución</button>` : ''}</div>
          <div class="card-b">${ms.length ? ms.map((m, i) => medidaCard(m, p, i === 0)).join('') : `<div class="empty">${icon('eye')}<div>Aún no tiene medidas registradas.</div></div>`}</div></div>
        <div class="card"><div class="card-h"><h3>Compras</h3><span class="sub">${os.length} orden${os.length === 1 ? '' : 'es'}</span></div>
          <div class="card-b" style="padding:10px 0 6px">${os.length ? os.map(o => `<a class="list-item link" href="#/orden/${o.id}"><span class="ordnum">N° ${pad(o.numero)}</span>
            <span class="grow"><span class="t num">${money(totalOrden(o))}</span><span class="d">${fdate(o.fecha)}</span></span><span style="display:grid;gap:4px;justify-items:end">${estadoChip(o)}${deudaChip(o)}</span></a>`).join('') : `<div class="empty">Sin compras.</div>`}</div></div>
      </div>`;
  },
  bind(id) {
    const p = paciente(id); if (!p) return;
    $('#pedit').onclick = () => pacienteForm(p);
    $('#newm').onclick = () => medidaForm(p);
    $('#evo') && ($('#evo').onclick = () => evolucion(p));
    $$('[data-mimg]').forEach(b => b.onclick = () => medidaImagen(db.medidas.find(m => m.id === b.dataset.mimg), p));
    $$('[data-medit]').forEach(b => b.onclick = () => {
      const m = db.medidas.find(x => x.id === b.dataset.medit);
      if (m.fecha === hoy()) medidaForm(p, m); else dual(`Corregir la medida del ${fdate(m.fecha)} de ${p.nombre}`, () => medidaForm(p, m));
    });
  },
};
function rxTable(m, prev) {
  const cell = (eye, k, dec) => {
    const v = m[eye][k], changed = prev && String(prev[eye][k] ?? '') !== String(v ?? '') && !(v === '' && prev[eye][k] === '');
    return `<td class="${changed ? 'chg' : ''}">${k === 'av' ? esc(v || '—') : rxv(v === '' ? null : num(v), dec)}</td>`;
  };
  return `<div class="tbl-wrap"><table class="rx"><thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th><th>AV</th></tr></thead><tbody>
    ${['od', 'oi'].map(e => `<tr><td>${e.toUpperCase()}</td>${cell(e, 'esf')}${cell(e, 'cil')}${cell(e, 'eje', 0)}${cell(e, 'add')}${cell(e, 'av')}</tr>`).join('')}</tbody></table></div>`;
}
function medidaCard(m, p, latest) {
  const dx = diagnostico(m);
  return `<div class="rx-card ${latest ? 'latest' : ''}">
    <div class="row between wrap" style="margin-bottom:12px"><div><b>${fdate(m.fecha, { day: 'numeric', month: 'long', year: 'numeric' })}</b> ${latest ? '<span class="chip listo" style="margin-left:6px">Más reciente</span>' : ''}
      <div class="muted small">DIP ${m.dip ? esc(m.dip) + ' mm' : '—'}${m.altura ? ' · Altura ' + esc(m.altura) + ' mm' : ''}${m.lente ? ' · ' + esc(m.lente) : ''} · Examinó ${esc(socioName(m.por))}</div></div>
      <div class="actions"><button class="btn sm ghost" data-medit="${m.id}" title="Corregir">${icon('edit')}</button><button class="btn sm" data-mimg="${m.id}">${icon('img')} Imagen</button>${p.telefono ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(p.telefono, medidaTexto(m, p))}">${icon('wa')} Enviar</a>` : ''}</div></div>
    ${rxTable(m)}
    ${dx.length ? `<div class="dx">${dx.map(d => `<span class="tag" title="${esc(d[1])}">${d[0]}</span>`).join('')}</div>` : ''}
    ${m.obs ? `<div class="small mt-s"><span class="muted">Obs.:</span> ${esc(m.obs)}</div>` : ''}</div>`;
}
function medidaForm(p, m) {
  const e = m || { fecha: hoy(), od: {}, oi: {} };
  const prev = !m && ultimaMedida(p.id);
  const eyeRow = eye => `<tr><td>${eye.toUpperCase()}</td>${['esf', 'cil', 'eje', 'add'].map(k => `<td><input class="inp" name="${eye}_${k}" inputmode="decimal" value="${esc(e[eye][k])}" placeholder="${k === 'eje' ? '0–180' : '0.00'}"></td>`).join('')}<td><input class="inp" name="${eye}_av" value="${esc(e[eye].av)}" placeholder="20/20"></td></tr>`;
  modal({
    title: m ? 'Corregir medida' : 'Nueva medida', wide: true,
    body: `<form id="mform" class="form">
      <div class="fg fg3"><label class="f">Fecha del examen<input class="inp" type="date" name="fecha" value="${esc(e.fecha)}" required></label>
      <label class="f">DIP (mm)<input class="inp" name="dip" inputmode="decimal" value="${esc(e.dip)}" placeholder="62"></label>
      <label class="f">Altura (mm) <span class="hint">multifocal</span><input class="inp" name="altura" inputmode="decimal" value="${esc(e.altura)}"></label></div>
      <div class="tbl-wrap"><table class="rx-in"><thead><tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th><th>AV</th></tr></thead><tbody>${eyeRow('od')}${eyeRow('oi')}</tbody></table></div>
      ${prev ? `<div class="small muted">Medida anterior (${fdate(prev.fecha)}): OD ${rx2((prev.od.esf))} ${rx2((prev.od.cil))} × ${rx2((prev.od.eje), 0)} · OI ${rx2((prev.oi.esf))} ${rx2((prev.oi.cil))} × ${rx2((prev.oi.eje), 0)} <button type="button" class="btn sm ghost" id="copyprev">Copiar</button></div>` : ''}
      <div class="fg"><label class="f">Lente recomendado<select class="inp" name="lente">${['', 'Monofocal', 'Bifocal', 'Multifocal / Progresivo', 'Ocupacional', 'Lentes de contacto'].map(x => `<option ${x === (e.lente || '') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="f">Filtros / tratamientos<input class="inp" name="filtros" value="${esc(e.filtros)}" placeholder="Antirreflejo, blue cut, fotocromático…"></label>
      <label class="f full">Observaciones<textarea class="inp" name="obs">${esc(e.obs)}</textarea></label></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="mform">Guardar medida</button>`,
    onMount: bg => {
      $('#copyprev', bg) && ($('#copyprev', bg).onclick = () => {
        ['od', 'oi'].forEach(eye => ['esf', 'cil', 'eje', 'add', 'av'].forEach(k => { $(`[name=${eye}_${k}]`, bg).value = prev[eye][k] ?? ''; }));
        $('[name=dip]', bg).value = prev.dip || '';
      });
      $('#mform', bg).onsubmit = ev => {
        ev.preventDefault();
        const f = readForm(ev.target);
        const eye = k => ({ esf: f[k + '_esf'], cil: f[k + '_cil'], eje: f[k + '_eje'], add: f[k + '_add'], av: f[k + '_av'] });
        const data = { fecha: f.fecha, dip: f.dip, altura: f.altura, lente: f.lente, filtros: f.filtros, obs: f.obs, od: eye('od'), oi: eye('oi') };
        if (m) Object.assign(m, data);
        else db.medidas.push({ id: uid(), pacienteId: p.id, creado: Date.now(), por: user, ...data });
        save(); closeModal(); toast('Medida guardada'); render();
      };
    },
  });
}
function evolucion(p) {
  const ms = medidasDe(p.id).slice().reverse();
  const row = (eye, k, lab, dec) => `<tr><td>${eye.toUpperCase()} ${lab}</td>${ms.map((m, i) => {
    const v = m[eye][k], pv = i ? ms[i - 1][eye][k] : v; const ch = num(v) !== num(pv);
    return `<td class="${ch ? 'chg' : ''}">${rxv(v === '' ? null : num(v), dec)}</td>`;
  }).join('')}</tr>`;
  modal({
    title: 'Evolución de la medida · ' + esc(p.nombre), wide: true,
    body: `<p class="muted small" style="margin-top:0">En rojo, lo que cambió respecto al examen anterior.</p><div class="tbl-wrap"><table class="rx"><thead><tr><th></th>${ms.map(m => `<th>${fdate(m.fecha, { month: 'short', year: 'numeric' })}</th>`).join('')}</tr></thead><tbody>
      ${['od', 'oi'].map(e => row(e, 'esf', 'Esf') + row(e, 'cil', 'Cil') + row(e, 'eje', 'Eje', 0) + row(e, 'add', 'Add')).join('')}</tbody></table></div>`,
  });
}
function medidaTexto(m, p) {
  const f = e => `${rx2((m[e].esf))} ${num(m[e].cil) ? rx2((m[e].cil)) + ' × ' + rx2((m[e].eje), 0) + '°' : ''}${num(m[e].add) ? ' Add ' + rx2((m[e].add)) : ''}`;
  const dx = diagnostico(m);
  return `Hola ${p.nombre.split(' ')[0]} 👋, te saluda *${db.config.nombre}*.\n\nEstos son los resultados de tu examen visual del ${fdate(m.fecha, { day: 'numeric', month: 'long', year: 'numeric' })}:\n\n👁 *Ojo derecho (OD):* ${f('od')}\n👁 *Ojo izquierdo (OI):* ${f('oi')}${m.dip ? `\n↔ *Distancia pupilar:* ${m.dip} mm` : ''}\n`
    + (dx.length ? `\n*¿Qué significa?*\n${dx.map(d => `• *${d[0]}:* ${d[1]}`).join('\n')}\n` : '')
    + `${m.lente ? `\nLente recomendado: ${m.lente}${m.filtros ? ' (' + m.filtros + ')' : ''}.\n` : ''}\nTe recomendamos un control cada ${db.config.recordatorioMeses} meses. ¡Gracias por tu confianza!`;
}
function medidaImagen(m, p) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const serif = '"Fraunces", Georgia, serif', sans = '"Inter", Segoe UI, sans-serif';
  x.fillStyle = '#f5f3ee'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#14263f'; x.fillRect(0, 0, W, 300);
  const g = x.createLinearGradient(80, 80, 180, 180); g.addColorStop(0, '#2aa39c'); g.addColorStop(1, '#1c6f8c');
  x.fillStyle = g; roundRect(x, 80, 80, 96, 96, 26); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.ellipse(128, 128, 30, 18, 0, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(128, 128, 8, 0, Math.PI * 2); x.stroke();
  x.fillStyle = '#fff'; x.font = `600 52px ${serif}`; x.fillText(db.config.nombre || 'Óptica', 206, 128);
  x.fillStyle = '#9fb0c6'; x.font = `400 28px ${sans}`; x.fillText([db.config.telefono, db.config.direccion].filter(Boolean).join('  ·  ') || 'Examen visual', 206, 170);
  x.fillStyle = '#fff'; x.font = `500 30px ${sans}`; x.fillText('Resultado de examen visual', 80, 250);
  x.fillStyle = '#14263f'; x.font = `600 58px ${serif}`; x.fillText(p.nombre, 80, 400);
  x.fillStyle = '#6c7689'; x.font = `400 30px ${sans}`; x.fillText(fdate(m.fecha, { day: 'numeric', month: 'long', year: 'numeric' }) + (m.dip ? `   ·   DIP ${m.dip} mm` : ''), 80, 450);
  // tabla
  const cols = ['', 'Esfera', 'Cilindro', 'Eje', 'Adición'], cx = [80, 300, 500, 700, 860];
  x.fillStyle = '#fff'; roundRect(x, 60, 510, W - 120, 330, 28); x.fill(); x.strokeStyle = '#e8e4db'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#6c7689'; x.font = `600 24px ${sans}`; cols.forEach((t, i) => x.fillText(t.toUpperCase(), cx[i] + 20, 580));
  [['OD', 'od', 680], ['OI', 'oi', 790]].forEach(([lab, e, y]) => {
    x.fillStyle = '#14263f'; x.font = `600 44px ${serif}`; x.fillText(lab, cx[0] + 20, y);
    x.font = `500 40px ${sans}`; x.fillStyle = '#14263f';
    [rx2((m[e].esf)), rx2((m[e].cil)), (m[e].eje === '' ? '—' : rx2((m[e].eje), 0) + '°'), num(m[e].add) ? rx2((m[e].add)) : '—'].forEach((t, i) => x.fillText(t, cx[i + 1] + 20, y));
  });
  x.strokeStyle = '#f0ede6'; x.beginPath(); x.moveTo(80, 720); x.lineTo(W - 80, 720); x.stroke();
  // diagnóstico
  let y = 920; const dx = diagnostico(m);
  if (dx.length) {
    x.fillStyle = '#1c8c86'; x.font = `600 26px ${sans}`; x.fillText('¿QUÉ SIGNIFICA?', 80, y); y += 50;
    dx.forEach(([t, d]) => { x.fillStyle = '#14263f'; x.font = `600 32px ${sans}`; x.fillText(t, 80, y); x.fillStyle = '#34425a'; x.font = `400 28px ${sans}`; y = wrapText(x, d, 80, y + 42, W - 160, 36) + 66; });
  }
  if (m.lente) { x.fillStyle = '#34425a'; x.font = `400 28px ${sans}`; x.fillText('Lente recomendado: ' + m.lente + (m.filtros ? ' · ' + m.filtros : ''), 80, Math.min(y + 10, H - 150)); }
  x.fillStyle = '#b98a4b'; x.fillRect(0, H - 90, W, 90);
  x.fillStyle = '#fff'; x.font = `500 28px ${sans}`; x.fillText(`Próximo control recomendado: ${fdate(addDays(m.fecha, Math.round(db.config.recordatorioMeses * 30.4)), { month: 'long', year: 'numeric' })}`, 80, H - 35);
  c.toBlob(blob => {
    const name = `Medida ${p.nombre} ${m.fecha}.png`;
    const url = URL.createObjectURL(blob);
    modal({ title: 'Imagen de la medida', body: `<img src="${url}" alt="Medida de ${esc(p.nombre)}" style="width:100%;border-radius:12px;border:1px solid var(--line)">
      <p class="hint" style="margin:10px 0 0">Guárdala y envíala al paciente por WhatsApp como foto.</p>`,
      foot: `${p.telefono ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(p.telefono)}">${icon('wa')} Abrir chat</a>` : ''}<button class="btn primary" id="saveimg">${icon('down')} Guardar imagen</button>`,
      onMount: bg => { $('#saveimg', bg).onclick = () => saveFile(name, blob); } });
  }, 'image/png');
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function wrapText(x, t, a, y, max, lh) { let line = ''; for (const w of t.split(' ')) { const test = line + w + ' '; if (x.measureText(test).width > max && line) { x.fillText(line, a, y); line = w + ' '; y += lh; } else line = test; } x.fillText(line, a, y); return y; }

// ---------- Órdenes ----------
let ordFiltro = 'activas';
routes.ordenes = {
  html() {
    return `<div class="page-head"><div><h1>Órdenes</h1><p>Busca por número, nombre o teléfono.</p></div>
      <div class="actions"><a class="btn primary" href="#/nueva-orden">${icon('plus')} Nueva venta</a></div></div>
      <div class="card"><div class="card-b row wrap" style="padding-bottom:8px"><div class="seg" id="oseg">${[['activas', 'Por entregar'], ['listo', 'Listas'], ['deuda', 'Con saldo'], ['todas', 'Todas']].map(([k, t]) => `<button data-k="${k}" class="${k === ordFiltro ? 'on' : ''}">${t}</button>`).join('')}</div>
      <input class="inp" id="of" style="flex:1;min-width:200px" placeholder="N° de orden, nombre o teléfono…"></div><div id="olist"></div></div>`;
  },
  bind() {
    const draw = () => {
      const f = $('#of').value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), d = f.replace(/\D/g, '');
      const list = db.ordenes.filter(o => ordFiltro === 'todas' || (ordFiltro === 'activas' && o.estado !== 'entregado') || (ordFiltro === 'listo' && o.estado === 'listo') || (ordFiltro === 'deuda' && saldoOrden(o) > 0.009))
        .filter(o => { if (!f) return true; const p = paciente(o.pacienteId); return (d && (String(o.numero) === String(+d) || pad(o.numero).includes(d) || String(p?.telefono).replace(/\D/g, '').includes(d))) || p?.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f); })
        .sort((a, b) => b.numero - a.numero);
      $('#olist').innerHTML = list.length ? `<div class="tbl-wrap"><table><thead><tr><th>N°</th><th>Paciente</th><th class="hide-sm">Fecha</th><th class="hide-sm">Entrega</th><th class="r">Total</th><th class="r">Saldo</th><th>Estado</th></tr></thead><tbody>
        ${list.map(o => { const s = saldoOrden(o); return `<tr class="link" data-h="#/orden/${o.id}"><td class="ordnum">${pad(o.numero)}</td><td><b>${esc(paciente(o.pacienteId)?.nombre)}</b><div class="muted small">${esc(o.items.map(i => i.desc).join(' · ')).slice(0, 60)}</div></td>
        <td class="hide-sm">${fdate(o.fecha)}</td><td class="hide-sm">${o.entrega ? fdate(o.entrega) : '—'}</td><td class="r num">${money(totalOrden(o))}</td><td class="r num" style="${s > 0.009 ? 'color:var(--danger);font-weight:600' : ''}">${s > 0.009 ? money(s) : '—'}</td><td>${estadoChip(o)}</td></tr>`; }).join('')}</tbody></table></div>`
        : `<div class="empty">${icon('file')}<div>No hay órdenes aquí.</div></div>`;
      $$('[data-h]').forEach(r => r.onclick = () => go(r.dataset.h));
    };
    $$('#oseg button').forEach(b => b.onclick = () => { ordFiltro = b.dataset.k; $$('#oseg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#of').oninput = draw; draw();
  },
};

// Nueva venta / orden
let draft = null;
routes['nueva-orden'] = {
  html(_, q) {
    const pid = q.get('p');
    if (!draft || draft.pacienteId !== (pid || draft.pacienteId)) draft = { pacienteId: pid || '', medidaId: '', items: [], descuento: '', entrega: addDays(hoy(), 3), notas: '' };
    const p = paciente(draft.pacienteId);
    const ms = p ? medidasDe(p.id) : [];
    if (p && !draft.medidaId && ms[0]) draft.medidaId = ms[0].id;
    return `<a class="crumb" href="#/ordenes">${icon('back')} Órdenes</a>
      <div class="page-head"><div><h1>Nueva venta</h1><p>Se generará la orden N° ${pad(db.config.nextOrden)}</p></div></div>
      <div class="split">
        <div class="grid" style="gap:18px">
          <div class="card"><div class="card-h"><h3>1 · Paciente</h3>${p ? `<button class="btn sm ghost" id="chp">Cambiar</button>` : ''}</div><div class="card-b">
            ${p ? `<div class="row"><span class="ini">${initials(p.nombre)}</span><div class="grow"><b>${esc(p.nombre)}</b><div class="muted small">${esc(p.telefono || '')}</div></div></div>
              <label class="f mt">Medida para esta orden<select class="inp" id="msel">${ms.length ? ms.map(m => `<option value="${m.id}" ${m.id === draft.medidaId ? 'selected' : ''}>${fdate(m.fecha)} — OD ${rx2((m.od.esf))} ${rx2((m.od.cil))} · OI ${rx2((m.oi.esf))} ${rx2((m.oi.cil))}</option>`).join('') : ''}<option value="" ${!draft.medidaId ? 'selected' : ''}>Sin medida (solo venta)</option></select></label>
              <button class="btn sm mt-s" id="addm">${icon('plus')} Registrar medida ahora</button>`
      : `<div class="search" style="max-width:none">${icon('search')}<input id="psearch" placeholder="Buscar paciente por nombre o teléfono…" autocomplete="off"><div class="sr" id="pres" hidden></div></div>
              <button class="btn sm mt-s" id="newp2">${icon('plus')} Paciente nuevo</button>`}
          </div></div>
          <div class="card"><div class="card-h"><h3>2 · Productos</h3></div><div class="card-b">
            <div class="fg"><label class="f">Montura por código<input class="inp" id="mcode" list="mlist" placeholder="Escribe el código…" autocomplete="off"><datalist id="mlist">${db.monturas.map(m => `<option value="${esc(m.codigo)}">${esc(m.marca)} ${esc(m.modelo)} · ${money(m.precio)} · stock ${m.stock}</option>`).join('')}</datalist></label>
            <label class="f">Cristales<select class="inp" id="csel"><option value="">Elegir de la lista de precios…</option>${db.cristales.map(c => `<option value="${c.id}">${esc(c.nombre)} — ${money(c.precio)}</option>`).join('')}</select></label></div>
            <div class="tbl-wrap mt"><table class="items"><thead><tr><th>Descripción</th><th class="c" style="width:70px">Cant.</th><th class="r" style="width:120px">Precio</th><th class="r" style="width:110px">Subtotal</th><th style="width:40px"></th></tr></thead><tbody id="itbody"></tbody></table></div>
            <button class="btn sm mt-s" id="addo">${icon('plus')} Otro producto o servicio</button>
          </div></div>
        </div>
        <div class="card" style="position:sticky;top:90px"><div class="card-h"><h3>3 · Pago</h3></div><div class="card-b">
          <form id="oform" class="form">
            <div class="totals"><div><span class="muted">Subtotal</span><b class="num" id="tsub">S/ 0.00</b></div>
            <div><span class="muted">Descuento</span><input class="inp sm num" name="descuento" id="tdesc" inputmode="decimal" style="width:110px;text-align:right" value="${esc(draft.descuento)}" placeholder="0.00"></div>
            <div class="big"><span>Total</span><span class="num" id="ttot">S/ 0.00</span></div></div>
            <label class="f">A cuenta (abono)<input class="inp" name="abono" id="abono" inputmode="decimal" placeholder="0.00"></label>
            <div class="pay-opts">${METODOS.map((m, i) => `<label><input type="radio" name="metodo" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>
            <div class="row between"><span class="muted">Resta</span><b class="num" id="tresta" style="font-size:18px">S/ 0.00</b></div>
            <label class="f">Fecha de entrega<input class="inp" type="date" name="entrega" value="${esc(draft.entrega)}"></label>
            <label class="f">Notas para el laboratorio<textarea class="inp" name="notas" placeholder="Tipo de armado, altura, observaciones…">${esc(draft.notas)}</textarea></label>
            <label class="f">Comprobante<select class="inp" name="cptipo">${[['nota', 'Nota de venta'], ['boleta', 'Boleta de venta'], ['factura', 'Factura'], ['', 'Ninguno por ahora']].map(([v, t]) => `<option value="${v}" ${v === (fact().ruc ? 'boleta' : 'nota') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <button class="btn primary" style="padding:13px">${icon('check')} Registrar venta</button>
          </form></div></div>
      </div>`;
  },
  bind() {
    const p = paciente(draft.pacienteId);
    const drawItems = () => {
      $('#itbody').innerHTML = draft.items.length ? draft.items.map((it, i) => `<tr><td><input class="inp" data-i="${i}" data-k="desc" value="${esc(it.desc)}"></td>
        <td><input class="inp c" data-i="${i}" data-k="cant" inputmode="numeric" value="${esc(it.cant)}"></td><td><input class="inp r num" data-i="${i}" data-k="precio" inputmode="decimal" value="${esc(it.precio)}"></td>
        <td class="r num" id="st${i}">${money(num(it.cant) * num(it.precio))}</td><td><button type="button" class="btn ghost icon sm" data-del="${i}" aria-label="Quitar">${icon('x')}</button></td></tr>`).join('')
        : `<tr><td colspan="5" class="empty" style="padding:18px">Agrega una montura, cristales u otro producto.</td></tr>`;
      $$('#itbody [data-k]').forEach(inp => inp.oninput = () => { draft.items[inp.dataset.i][inp.dataset.k] = inp.value; const it = draft.items[inp.dataset.i]; $('#st' + inp.dataset.i).textContent = money(num(it.cant) * num(it.precio)); calc(); });
      $$('#itbody [data-del]').forEach(b => b.onclick = () => { draft.items.splice(+b.dataset.del, 1); drawItems(); });
      calc();
    };
    const calc = () => {
      const sub = draft.items.reduce((s, i) => s + num(i.cant) * num(i.precio), 0);
      draft.descuento = $('#tdesc').value;
      const tot = round2(sub - num(draft.descuento));
      $('#tsub').textContent = money(sub); $('#ttot').textContent = money(tot);
      $('#tresta').textContent = money(Math.max(0, tot - num($('#abono').value)));
    };
    $('#tdesc').oninput = calc; $('#abono').oninput = calc;
    $('#mcode').onchange = () => {
      const code = $('#mcode').value.trim().toLowerCase();
      const m = db.monturas.find(x => x.codigo.toLowerCase() === code);
      if (!m) { toast('No hay montura con ese código'); return; }
      if (num(m.stock) <= 0) toast('Atención: esta montura figura sin stock');
      draft.items.push({ tipo: 'montura', ref: m.id, desc: `Montura ${m.codigo} · ${m.marca} ${m.modelo}${m.color ? ' ' + m.color : ''}`, cant: 1, precio: m.precio });
      $('#mcode').value = ''; drawItems();
    };
    $('#csel').onchange = () => {
      const c = db.cristales.find(x => x.id === $('#csel').value); if (!c) return;
      draft.items.push({ tipo: 'cristal', ref: c.id, desc: 'Cristales ' + c.nombre, cant: 1, precio: c.precio });
      $('#csel').value = ''; drawItems();
    };
    $('#addo').onclick = () => { draft.items.push({ tipo: 'otro', desc: '', cant: 1, precio: '' }); drawItems(); $$('#itbody [data-k=desc]').pop().focus(); };
    if (p) {
      $('#chp').onclick = () => { draft.pacienteId = ''; draft.medidaId = ''; go('#/nueva-orden'); render(); };
      $('#msel') && ($('#msel').onchange = e => draft.medidaId = e.target.value);
      $('#addm').onclick = () => medidaForm(p);
    } else {
      const inp = $('#psearch'), res = $('#pres');
      inp.oninput = () => {
        const q = inp.value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); if (!q) { res.hidden = true; return; }
        const ps = db.pacientes.filter(x => x.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q) || String(x.telefono).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 8);
        res.innerHTML = ps.map(x => `<a href="#" data-p="${x.id}"><span class="ini" style="width:30px;height:30px;font-size:12px">${initials(x.nombre)}</span><span><b>${esc(x.nombre)}</b><br><span class="muted small">${esc(x.telefono)}</span></span></a>`).join('') || `<div class="empty small">Sin resultados</div>`;
        res.hidden = false;
        $$('[data-p]', res).forEach(a => a.onclick = e => { e.preventDefault(); draft.pacienteId = a.dataset.p; draft.medidaId = ''; render(); });
      };
      inp.focus();
      $('#newp2').onclick = () => pacienteFormForOrder();
    }
    $('#oform').onsubmit = e => {
      e.preventDefault();
      const f = readForm(e.target);
      if (!draft.pacienteId) { toast('Elige un paciente'); return; }
      const items = draft.items.filter(i => i.desc && num(i.precio) >= 0 && num(i.cant) > 0).map(i => ({ ...i, cant: num(i.cant), precio: num(i.precio) }));
      if (!items.length) { toast('Agrega al menos un producto'); return; }
      const o = { id: uid(), numero: db.config.nextOrden++, pacienteId: draft.pacienteId, medidaId: draft.medidaId, fecha: hoy(), items, descuento: num(f.descuento), entrega: f.entrega, notas: f.notas, estado: 'pendiente', por: user, creado: Date.now() };
      const tot = totalOrden(o), ab = Math.min(num(f.abono), tot);
      db.ordenes.push(o);
      if (ab > 0) db.pagos.push({ id: uid(), ordenId: o.id, fecha: hoy(), monto: round2(ab), metodo: f.metodo, por: user, ts: Date.now(), tipo: 'abono' });
      items.filter(i => i.tipo === 'montura').forEach(i => { const m = db.monturas.find(x => x.id === i.ref); if (m) m.stock = num(m.stock) - i.cant; });
      save(); draft = null; toast(`Orden N° ${pad(o.numero)} registrada`); go('#/orden/' + o.id);
      if (f.cptipo) emitirForm(o, f.cptipo);
    };
    drawItems();
  },
};
function pacienteFormForOrder() {
  modal({
    title: 'Paciente nuevo',
    body: `<form id="pq" class="form"><label class="f">Nombre completo<input class="inp" name="nombre" required></label><label class="f">Celular<input class="inp" name="telefono" inputmode="tel"></label><label class="f">DNI<input class="inp" name="dni" inputmode="numeric"></label></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="pq">Guardar</button>`,
    onMount: bg => { $('#pq', bg).onsubmit = e => { e.preventDefault(); const f = readForm(e.target); const p = { id: uid(), creado: Date.now(), creadoF: hoy(), por: user, ...f }; db.pacientes.push(p); save(); draft.pacienteId = p.id; closeModal(); render(); }; },
  });
}

routes.orden = {
  html(id) {
    const o = orden(id);
    if (!o) return `<div class="empty">Orden no encontrada. <a class="strong" href="#/ordenes">Volver</a></div>`;
    const p = paciente(o.pacienteId), m = db.medidas.find(x => x.id === o.medidaId);
    const tot = totalOrden(o), pag = pagadoOrden(o), sal = round2(tot - pag), pagos = pagosDe(o.id), cp = comprobanteDe(o.id);
    return `<a class="crumb" href="#/ordenes">${icon('back')} Órdenes</a>
      <div class="page-head"><div><h1>Orden N° ${pad(o.numero)}</h1><p>${fdate(o.fecha, { day: 'numeric', month: 'long', year: 'numeric' })} · Atendió ${esc(socioName(o.por))}</p></div>
        <div class="actions"><button class="btn ${cp ? '' : 'primary'}" id="ocp">${icon('file')} ${cp ? `${TIPOS_CP[cp.tipo]} ${esc(cpNum(cp))}` : 'Boleta / Factura'}</button>${p?.telefono ? `<a class="btn wa" id="owa" target="_blank" rel="noopener" href="${waLink(p.telefono, ordenWaTexto(o, p))}">${icon('wa')} ${o.estado === 'listo' ? 'Avisar que está listo' : 'WhatsApp'}</a>` : ''}
        <button class="btn ghost icon" id="odel" title="Anular orden">${icon('trash')}</button></div></div>
      <div class="card card-b" style="margin-bottom:18px"><div class="row between wrap"><div class="row wrap"><span class="muted small strong">ESTADO</span>
        <div class="seg" id="est">${Object.entries(ESTADOS).map(([k, [t]]) => `<button data-e="${k}" class="${o.estado === k ? 'on' : ''}">${t}</button>`).join('')}</div></div>
        <div class="row">${o.entrega ? `<span class="muted small">Entrega: <b>${fdate(o.entrega)}</b></span>` : ''}${o.entregado ? `<span class="muted small">· Entregado ${fdate(o.entregado)}</span>` : ''}</div></div></div>
      <div class="split">
        <div class="grid" style="gap:18px">
          <div class="card"><div class="card-h"><h3>Detalle</h3><button class="btn sm ghost" id="oedit">${icon('edit')} Corregir</button></div><div class="card-b"><div class="tbl-wrap"><table><thead><tr><th>Producto</th><th class="c">Cant.</th><th class="r hide-sm">Precio</th><th class="r">Subtotal</th></tr></thead>
            <tbody>${o.items.map(i => `<tr><td>${esc(i.desc)}</td><td class="c">${i.cant}</td><td class="r num hide-sm">${money(i.precio)}</td><td class="r num">${money(i.cant * i.precio)}</td></tr>`).join('')}</tbody>
            <tfoot>${o.descuento ? `<tr><td colspan="2" class="r muted" style="font-weight:500">Descuento</td><td class="hide-sm"></td><td class="r num">− ${money(o.descuento)}</td></tr>` : ''}<tr><td colspan="2" class="r">Total</td><td class="hide-sm"></td><td class="r num">${money(tot)}</td></tr></tfoot></table></div>
            ${o.notas ? `<div class="small mt"><span class="muted">Notas:</span> ${esc(o.notas)}</div>` : ''}</div></div>
          <div class="card"><div class="card-h"><h3>Medida</h3>${p ? `<a class="btn sm ghost" href="#/paciente/${p.id}">Ver historial</a>` : ''}</div><div class="card-b">${m ? `<div class="muted small" style="margin-bottom:10px">Examen del ${fdate(m.fecha)} · DIP ${esc(m.dip || '—')}${m.altura ? ' · Altura ' + esc(m.altura) : ''}${m.lente ? ' · ' + esc(m.lente) : ''}</div>${rxTable(m)}` : `<div class="empty" style="padding:14px">Venta sin medida asociada.</div>`}</div></div>
        </div>
        <div class="grid" style="gap:18px">
          <div class="card"><div class="card-h"><h3>Paciente</h3></div><div class="card-b"><a class="row" href="#/paciente/${p?.id}"><span class="ini">${initials(p?.nombre)}</span><div><b>${esc(p?.nombre)}</b><div class="muted small">${esc(p?.telefono || '')}</div></div></a></div></div>
          <div class="card"><div class="card-h"><h3>Pagos</h3>${sal > 0.009 ? `<button class="btn sm accent" id="addpay">${icon('plus')} Cobrar</button>` : ''}</div><div class="card-b">
            <div class="cash-sum"><div class="line"><span class="muted">Total</span><b class="num">${money(tot)}</b></div><div class="line"><span class="muted">Pagado</span><b class="num" style="color:var(--ok)">${money(pag)}</b></div>
            <div class="line total"><span>Resta</span><span class="num" style="color:${sal > 0.009 ? 'var(--danger)' : 'var(--ok)'}">${money(Math.max(0, sal))}</span></div></div>
            ${pagos.length ? `<div class="mt">${pagos.map(x => `<div class="row between" style="padding:8px 0;border-top:1px solid var(--line-2)"><div><b class="num">${money(x.monto)}</b> <span class="tag">${esc(x.metodo)}</span><div class="muted small">${fdate(x.fecha)} · ${esc(socioName(x.por))}</div></div><button class="btn ghost icon sm" data-pdel="${x.id}" title="Anular pago">${icon('trash')}</button></div>`).join('')}</div>` : ''}
          </div></div>
        </div>
      </div>`;
  },
  bind(id) {
    const o = orden(id); if (!o) return;
    const p = paciente(o.pacienteId);
    $$('#est button').forEach(b => b.onclick = () => {
      const e = b.dataset.e;
      const doit = () => {
        o.estado = e; o.entregado = e === 'entregado' ? hoy() : null; save(); render();
        if (e === 'listo' && p?.telefono) toast('Avísale por WhatsApp con el botón verde');
      };
      if (e === 'entregado' && saldoOrden(o) > 0.009) confirmBox(`Esta orden todavía debe <b>${money(saldoOrden(o))}</b>. ¿Marcarla como entregada igual?`, doit, 'Marcar entregada');
      else doit();
    });
    $('#addpay') && ($('#addpay').onclick = () => cobrarForm(o));
    $$('[data-pdel]').forEach(b => b.onclick = () => {
      const pg = db.pagos.find(x => x.id === b.dataset.pdel);
      dual(`Anular pago de ${money(pg.monto)} (${pg.metodo}) de la orden N° ${pad(o.numero)}`, () => { db.pagos = db.pagos.filter(x => x !== pg); save(); toast('Pago anulado'); render(); });
    });
    $('#oedit').onclick = () => dual(`Corregir productos o precios de la orden N° ${pad(o.numero)}`, () => ordenEdit(o));
    $('#odel').onclick = () => dual(`Anular la orden N° ${pad(o.numero)} y sus pagos`, () => {
      o.items.filter(i => i.tipo === 'montura').forEach(i => { const m = db.monturas.find(x => x.id === i.ref); if (m) m.stock = num(m.stock) + i.cant; });
      db.pagos = db.pagos.filter(x => x.ordenId !== o.id); db.ordenes = db.ordenes.filter(x => x !== o); save(); toast('Orden anulada'); go('#/ordenes');
    });
    $('#ocp').onclick = () => { const cp = comprobanteDe(o.id); cp ? comprobanteView(cp) : emitirForm(o); };
    $('#owa') && ($('#owa').onclick = () => { if (o.estado === 'listo') { o.avisado = hoy(); save(); } });
  },
};
function cobrarForm(o) {
  const s = saldoOrden(o);
  const fechaCerrada = cerrado(hoy());
  modal({
    title: `Cobrar · Orden N° ${pad(o.numero)}`,
    body: `<form id="cf" class="form">${fechaCerrada ? `<div class="lock-note">${icon('lock')}<div>La caja de hoy ya está cerrada; se pedirá la clave de ambos socios.</div></div>` : ''}
      <div class="row between"><span class="muted">Saldo pendiente</span><b class="num" style="font-size:20px">${money(s)}</b></div>
      <label class="f">Monto<input class="inp" name="monto" inputmode="decimal" value="${s.toFixed(2)}" required></label>
      <div class="pay-opts">${METODOS.map((m, i) => `<label><input type="radio" name="metodo" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn accent" form="cf">${icon('check')} Registrar pago</button>`,
    onMount: bg => {
      $('#cf', bg).onsubmit = e => {
        e.preventDefault();
        const f = readForm(e.target), monto = round2(Math.min(num(f.monto), s));
        if (monto <= 0) { toast('Monto inválido'); return; }
        const doit = () => { db.pagos.push({ id: uid(), ordenId: o.id, fecha: hoy(), monto, metodo: f.metodo, por: user, ts: Date.now(), tipo: 'saldo' }); save(); closeModal(); toast('Pago registrado'); render(); };
        fechaCerrada ? dual(`Registrar pago con la caja del ${fdate(hoy())} cerrada`, doit) : doit();
      };
    },
  });
}
function ordenEdit(o) {
  const items = o.items.map(i => ({ ...i }));
  modal({
    title: `Corregir orden N° ${pad(o.numero)}`, wide: true,
    body: `<form id="oe" class="form"><div class="tbl-wrap"><table class="items"><thead><tr><th>Descripción</th><th style="width:80px">Cant.</th><th style="width:120px">Precio</th></tr></thead><tbody>
      ${items.map((i, k) => `<tr><td><input class="inp" name="d${k}" value="${esc(i.desc)}"></td><td><input class="inp" name="c${k}" inputmode="numeric" value="${i.cant}"></td><td><input class="inp" name="p${k}" inputmode="decimal" value="${i.precio}"></td></tr>`).join('')}</tbody></table></div>
      <div class="fg"><label class="f">Descuento<input class="inp" name="descuento" inputmode="decimal" value="${o.descuento || ''}"></label><label class="f">Entrega<input class="inp" type="date" name="entrega" value="${esc(o.entrega)}"></label>
      <label class="f full">Notas<textarea class="inp" name="notas">${esc(o.notas)}</textarea></label></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="oe">Guardar cambios</button>`,
    onMount: bg => {
      $('#oe', bg).onsubmit = e => {
        e.preventDefault(); const f = readForm(e.target);
        o.items = items.map((i, k) => ({ ...i, desc: f['d' + k], cant: num(f['c' + k]), precio: num(f['p' + k]) })).filter(i => i.cant > 0);
        Object.assign(o, { descuento: num(f.descuento), entrega: f.entrega, notas: f.notas });
        save(); closeModal(); toast('Orden actualizada'); render();
      };
    },
  });
}
function ordenWaTexto(o, p) {
  const n = p.nombre.split(' ')[0], s = saldoOrden(o);
  if (o.estado === 'listo') return `Hola ${n} 👋, te escribimos de *${db.config.nombre}*. ¡Tus lentes ya están listos! 👓\n\nOrden N° ${pad(o.numero)}${s > 0.009 ? `\nSaldo pendiente: ${money(s)}` : ''}\n\nTe esperamos para entregártelos.${db.config.direccion ? '\n📍 ' + db.config.direccion : ''}`;
  return `Hola ${n} 👋, te escribimos de *${db.config.nombre}*.\n\n*Orden N° ${pad(o.numero)}* — ${fdate(o.fecha)}\n${o.items.map(i => `• ${i.desc}: ${money(i.cant * i.precio)}`).join('\n')}\n\nTotal: ${money(totalOrden(o))}\nA cuenta: ${money(pagadoOrden(o))}\nSaldo: ${money(Math.max(0, s))}${o.entrega ? `\nEntrega: ${fdate(o.entrega, { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}\n\n¡Gracias por tu compra!`;
}
// ---------- Comprobantes: nota de venta, boleta y factura en PDF ----------
const TIPOS_CP = { nota: 'Nota de venta', boleta: 'Boleta de venta', factura: 'Factura' };
const TITULO_CP = { nota: 'NOTA DE VENTA', boleta: 'BOLETA DE VENTA', factura: 'FACTURA' };
const fact = () => db.config.fact;
const comprobanteDe = oid => db.comprobantes.filter(c => c.ordenId === oid && c.estado !== 'anulado').slice(-1)[0];
const cpNum = c => `${c.serie}-${c.numero === 0 ? 'PRUEBA' : String(c.numero).padStart(8, '0')}`;
const canShareFiles = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] })); } catch (e) { return false; } })();

function numeroALetras(n) {
  const U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
    'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const cien = x => {
    if (x === 100) return 'CIEN';
    const r = x % 100, dec = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : '');
    return [C[Math.floor(x / 100)], dec].filter(Boolean).join(' ');
  };
  const cents = Math.round(n * 100), ent = Math.floor(cents / 100), cts = cents % 100;
  const mill = Math.floor(ent / 1e6), miles = Math.floor(ent / 1000) % 1000, rest = ent % 1000;
  let t = ent === 0 ? 'CERO' : [mill ? (mill === 1 ? 'UN MILLÓN' : cien(mill) + ' MILLONES') : '', miles ? (miles === 1 ? 'MIL' : cien(miles) + ' MIL') : '', cien(rest)].filter(Boolean).join(' ');
  t = t.replace(/UNO (MIL|MILLONES)/g, 'UN $1');
  return `${t} CON ${String(cts).padStart(2, '0')}/100 SOLES`;
}

function cpCalc(c) {
  const total = round2(c.total), pct = num(c.igvPct);
  const gravada = pct ? round2(total / (1 + pct / 100)) : total;
  return { total, pct, gravada, igv: pct ? round2(total - gravada) : 0, sub: round2(c.items.reduce((s, i) => s + i.cant * i.precio, 0)) };
}

// Pide los datos del cliente y crea el comprobante con el siguiente número de la serie.
function emitirForm(o, tipo) {
  const p = paciente(o.pacienteId), F = fact(), tot = totalOrden(o);
  tipo = tipo || (F.ruc ? 'boleta' : 'nota');
  modal({
    title: `Comprobante · Orden N° ${pad(o.numero)}`,
    body: `<form id="cpf" class="form">
      <div class="seg" id="cptipo">${Object.entries(TIPOS_CP).map(([k, t]) => `<button type="button" data-t="${k}">${t}</button>`).join('')}</div>
      <div id="cpwarn"></div>
      <div class="fg">
        <label class="f" id="l-doc"><span></span><input class="inp" name="doc" inputmode="numeric" autocomplete="off"></label>
        <label class="f full" id="l-nom"><span></span><input class="inp" name="nombre" autocomplete="off"></label>
        <label class="f full" id="l-dir"><span></span><input class="inp" name="direccion" autocomplete="off"></label>
      </div>
      <div class="row between"><span class="muted">Total</span><b class="num" style="font-size:20px">${money(tot)}</b></div>
      <div class="hint" id="cpnum"></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="cpf" id="cpgo">${icon('file')} Generar PDF</button>`,
    onMount: bg => {
      const fDoc = $('[name=doc]', bg), fNom = $('[name=nombre]', bg), fDir = $('[name=direccion]', bg);
      const set = t => {
        tipo = t;
        $$('#cptipo button', bg).forEach(b => b.classList.toggle('on', b.dataset.t === t));
        const fa = t === 'factura';
        $('#l-doc span', bg).textContent = fa ? 'RUC del cliente (11 dígitos)' : t === 'boleta' && tot >= 700 ? 'DNI del cliente (obligatorio desde S/ 700)' : 'DNI del cliente (opcional)';
        $('#l-nom span', bg).textContent = fa ? 'Razón social' : 'Nombre del cliente';
        $('#l-dir span', bg).textContent = fa ? 'Dirección fiscal del cliente' : 'Dirección (opcional)';
        if (fa && !/^\d{11}$/.test(fDoc.value)) { fDoc.value = ''; fNom.value = ''; }
        if (!fa && !fDoc.value && !fNom.value) { fDoc.value = p?.dni || ''; fNom.value = p?.nombre || ''; }
        const falta = t !== 'nota' && !F.ruc;
        $('#cpwarn', bg).innerHTML = falta ? `<div class="lock-note">${icon('file')}<div>Para emitir ${TIPOS_CP[t].toLowerCase()} primero pon tu RUC y razón social en <a class="strong" href="#/ajustes">Ajustes → Boletas y facturas</a>.</div></div>` : '';
        $('#cpgo', bg).disabled = falta;
        const numero = t === 'boleta' ? F.numB : t === 'factura' ? F.numF : o.numero;
        const serie = t === 'boleta' ? F.serieB : t === 'factura' ? F.serieF : 'NV01';
        $('#cpnum', bg).textContent = `Se emitirá ${TIPOS_CP[t].toLowerCase()} ${serie}-${String(numero).padStart(8, '0')}`;
      };
      fDoc.value = p?.dni || ''; fNom.value = p?.nombre || '';
      $$('#cptipo button', bg).forEach(b => b.onclick = () => set(b.dataset.t));
      set(tipo);
      $('#cpf', bg).onsubmit = e => {
        e.preventDefault();
        const doc = fDoc.value.replace(/\s/g, ''), nombre = fNom.value.trim(), dir = fDir.value.trim();
        if (tipo === 'factura') {
          if (!/^(10|15|17|20)\d{9}$/.test(doc)) return toast('El RUC debe tener 11 dígitos (empieza con 10 o 20)');
          if (!nombre || !dir) return toast('La factura necesita razón social y dirección');
        } else {
          if (doc && !/^[A-Za-z0-9]{8,12}$/.test(doc)) return toast('Revisa el documento: el DNI tiene 8 dígitos');
          if (tipo === 'boleta' && tot >= 700 && !doc) return toast('Desde S/ 700 la boleta necesita el DNI del cliente');
        }
        let serie = 'NV01', numero = o.numero;
        if (tipo === 'boleta') { serie = F.serieB; numero = F.numB++; }
        if (tipo === 'factura') { serie = F.serieF; numero = F.numF++; }
        const pagos = pagosDe(o.id), sal = saldoOrden(o);
        const c = {
          id: uid(), tipo, serie, numero, fecha: hoy(), hora: new Date().toTimeString().slice(0, 5), ordenId: o.id, ordenNum: o.numero,
          cliente: { docTipo: tipo === 'factura' ? 'RUC' : doc.length === 8 ? 'DNI' : doc ? 'CE' : '', doc, nombre: nombre || 'CLIENTES VARIOS', direccion: dir },
          items: o.items.map(i => ({ desc: i.desc, cant: num(i.cant), precio: num(i.precio) })), descuento: num(o.descuento), total: tot,
          igvPct: tipo !== 'nota' && F.igv ? num(F.igvPct) : 0, pagado: pagadoOrden(o), saldo: Math.max(0, sal),
          metodos: [...new Set(pagos.map(x => x.metodo))], medidaId: o.medidaId, entrega: o.entrega, por: user, estado: 'emitido', creado: Date.now(),
        };
        db.comprobantes.push(c); save(); closeModal(); render();
        comprobanteView(c);
      };
    },
  });
}

function comprobanteView(c) {
  const o = orden(c.ordenId), p = o && paciente(o.pacienteId);
  const name = `${TIPOS_CP[c.tipo]} ${cpNum(c)}.pdf`;
  const waTxt = p ? `Hola ${p.nombre.split(' ')[0]}, te saludamos de *${db.config.nombre}*. Te enviamos tu ${TIPOS_CP[c.tipo].toLowerCase()} *${cpNum(c)}* por ${money(c.total)}. ¡Gracias por tu compra!` : '';
  modal({
    title: `${TIPOS_CP[c.tipo]} ${cpNum(c)}`,
    body: `${c.estado === 'anulado' ? `<div class="lock-note">${icon('x')}<div>Este comprobante está <b>anulado</b>.</div></div>` : ''}
      <div class="cash-sum">
        <div class="line"><span class="muted">${c.tipo === 'factura' ? 'Razón social' : 'Cliente'}</span><b style="text-align:right">${esc(c.cliente.nombre)}</b></div>
        ${c.cliente.doc ? `<div class="line"><span class="muted">${c.cliente.docTipo || 'Doc.'}</span><b class="num">${esc(c.cliente.doc)}</b></div>` : ''}
        <div class="line"><span class="muted">Fecha</span><b>${fdate(c.fecha)} ${esc(c.hora || '')}</b></div>
        <div class="line total"><span>Total</span><span class="num">${money(c.total)}</span></div>
      </div>
      ${c.tipo !== 'nota' ? `<p class="hint" style="margin:12px 0 0">Recuerda: para que sea válido ante SUNAT emítelo también como comprobante electrónico con la misma serie y número.</p>` : ''}`,
    foot: `${c.estado !== 'anulado' ? `<button class="btn danger" id="cpanul" style="margin-right:auto">${icon('trash')} Anular</button>` : ''}
      ${p?.telefono && !canShareFiles ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(p.telefono, waTxt)}">${icon('wa')} WhatsApp</a>` : ''}
      ${canShareFiles ? `<button class="btn wa" id="cpshare">${icon('wa')} Compartir PDF</button>` : ''}
      <button class="btn primary" id="cpdl">${icon('down')} Descargar PDF</button>`,
    onMount: bg => {
      const make = async () => { try { return await comprobantePDF(c); } catch (e) { toast('No se pudo generar el PDF: ' + e.message); return null; } };
      $('#cpdl', bg).onclick = async () => { const b = await make(); if (b) saveFile(name, b); };
      $('#cpshare', bg) && ($('#cpshare', bg).onclick = async () => {
        const b = await make(); if (!b) return;
        try { await navigator.share({ files: [new File([b], name, { type: 'application/pdf' })], text: waTxt }); }
        catch (e) { if (e.name !== 'AbortError') saveFile(name, b); }
      });
      $('#cpanul', bg) && ($('#cpanul', bg).onclick = () => dual(`Anular ${TIPOS_CP[c.tipo].toLowerCase()} ${cpNum(c)} de ${money(c.total)}`, () => {
        c.estado = 'anulado'; c.anulado = hoy(); save(); toast('Comprobante anulado'); render();
      }));
    },
  });
}

let jspdfP = null;
function loadJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  return jspdfP || (jspdfP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'jspdf.umd.min.js';
    s.onload = () => res(window.jspdf); s.onerror = () => { jspdfP = null; rej(new Error('revisa tu conexión')); };
    document.head.appendChild(s);
  }));
}
async function comprobantePDF(c) {
  const { jsPDF } = await loadJsPDF();
  const F = fact();
  if (F.formato === 'ticket') {
    const h = drawTicket(new jsPDF({ unit: 'mm', format: [80, 1500] }), c, F);
    const doc = new jsPDF({ unit: 'mm', format: [80, Math.max(h + 6, 90)] });
    drawTicket(doc, c, F);
    return doc.output('blob');
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  drawA4(doc, c, F);
  return doc.output('blob');
}

const PDF_NAVY = [20, 38, 63], PDF_TEAL = [28, 140, 134], PDF_GRAY = [98, 108, 126], PDF_LINE = [222, 218, 208];
function pdfText(doc, t, x, y, o = {}) {
  doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.s || 9); doc.setTextColor(...(o.c || PDF_NAVY));
  doc.text(String(t ?? ''), x, y, { align: o.a || 'left' });
}
function pdfSello(doc, c, W, H) {
  const t = c.estado === 'anulado' ? 'ANULADO' : c.numero === 0 ? 'PRUEBA' : '';
  if (!t) return;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(W > 100 ? 90 : 34); doc.setTextColor(214, 82, 60);
  doc.text(t, W / 2, H / 2, { align: 'center', angle: 30 });
}
function emisorLineas(F) {
  return [
    F.razon && F.razon !== db.config.nombre ? F.razon : '',
    [F.direccion || db.config.direccion, F.distrito, F.provincia, F.departamento].filter(Boolean).join(' - '),
    [db.config.telefono && 'Tel. ' + db.config.telefono, F.email, F.web].filter(Boolean).join('   ·   '),
  ].filter(Boolean);
}

function drawA4(doc, c, F) {
  const M = 14, W = 210, R = W - M, k = cpCalc(c), fa = c.tipo === 'factura';
  let y = 14, tx = M;
  if (F.logo) {
    const r = F.logoRatio || 1, lw = r >= 1.6 ? 38 : 26, lh = Math.min(26, lw / r);
    try { doc.addImage(F.logo, 'PNG', M, y, lh * r, lh); tx = M + lh * r + 5; } catch (e) { }
  }
  pdfText(doc, db.config.nombre || F.razon, tx, y + 6, { b: 1, s: 16 });
  let ey = y + 12;
  emisorLineas(F).forEach(l => doc.splitTextToSize(l, 128 - tx).forEach(s => { pdfText(doc, s, tx, ey, { s: 8.5, c: PDF_GRAY }); ey += 4.2; }));
  // recuadro de RUC y número
  const bx = 134, bw = R - bx;
  doc.setDrawColor(...PDF_NAVY); doc.setLineWidth(0.5); doc.roundedRect(bx, y, bw, 31, 2, 2, 'S');
  pdfText(doc, F.ruc ? 'R.U.C. ' + F.ruc : db.config.nombre, bx + bw / 2, y + 8, { b: 1, s: 11, a: 'center' });
  doc.setFillColor(...PDF_NAVY); doc.rect(bx + 0.25, y + 11.5, bw - 0.5, 9, 'F');
  pdfText(doc, TITULO_CP[c.tipo], bx + bw / 2, y + 17.6, { b: 1, s: 11, a: 'center', c: [255, 255, 255] });
  pdfText(doc, cpNum(c), bx + bw / 2, y + 27, { b: 1, s: 12, a: 'center' });
  y = Math.max(ey, y + 31) + 6;
  // datos del cliente
  doc.setFillColor(248, 246, 241); doc.setDrawColor(...PDF_LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, W - 2 * M, 25, 2, 2, 'FD');
  const izq = [[fa ? 'Razón social' : 'Cliente', c.cliente.nombre], [c.cliente.docTipo === 'RUC' ? 'R.U.C.' : c.cliente.docTipo || 'DNI', c.cliente.doc || '—'], ['Dirección', c.cliente.direccion || '—']];
  const der = [['Fecha de emisión', fdate(c.fecha, { day: '2-digit', month: '2-digit', year: 'numeric' }) + (c.hora ? '  ' + c.hora : '')], ['Moneda', 'SOLES'], ['Orden N°', pad(c.ordenNum)], ['Forma de pago', c.saldo > 0.009 ? 'Crédito' : 'Contado']];
  izq.forEach(([l, v], i) => { pdfText(doc, l, M + 4, y + 6.5 + i * 6.5, { b: 1, s: 7.5, c: PDF_GRAY }); pdfText(doc, doc.splitTextToSize(String(v), 88)[0], M + 26, y + 6.5 + i * 6.5, { s: 9 }); });
  der.forEach(([l, v], i) => { pdfText(doc, l, 132, y + 5.5 + i * 5.2, { b: 1, s: 7.5, c: PDF_GRAY }); pdfText(doc, v, R - 4, y + 5.5 + i * 5.2, { s: 8.5, a: 'right' }); });
  y += 32;
  // medida (solo nota de venta)
  const m = c.tipo === 'nota' && F.medida && db.medidas.find(x => x.id === c.medidaId);
  if (m) {
    pdfText(doc, `MEDIDA · examen del ${fdate(m.fecha)}${m.dip ? '  ·  DIP ' + m.dip + ' mm' : ''}${m.altura ? '  ·  Altura ' + m.altura + ' mm' : ''}`, M, y, { b: 1, s: 8, c: PDF_TEAL });
    y += 3;
    const cols = ['', 'Esfera', 'Cilindro', 'Eje', 'Adición', 'AV'], cw = (W - 2 * M) / 6;
    doc.setFillColor(243, 241, 236); doc.rect(M, y, W - 2 * M, 6, 'F');
    cols.forEach((t, i) => pdfText(doc, t.toUpperCase(), M + cw * i + cw / 2, y + 4.2, { b: 1, s: 7, c: PDF_GRAY, a: 'center' }));
    [['OD', m.od], ['OI', m.oi]].forEach(([lab, e], r) => {
      const yy = y + 11 + r * 6;
      [lab, rx2(e.esf), rx2(e.cil), rx2(e.eje, 0), rx2(e.add), e.av || '—'].forEach((t, i) => pdfText(doc, t, M + cw * i + cw / 2, yy, { b: i === 0, s: 9, a: 'center' }));
    });
    y += 24;
  }
  // detalle
  const xC = M + 8, xD = M + 18, xU = R - 34, xI = R - 3;
  doc.setFillColor(...PDF_NAVY); doc.rect(M, y, W - 2 * M, 8, 'F');
  [['CANT.', xC, 'center'], ['DESCRIPCIÓN', xD, 'left'], [fa ? 'V. UNIT.' : 'P. UNIT.', xU, 'right'], [fa ? 'VALOR VENTA' : 'IMPORTE', xI, 'right']]
    .forEach(([t, x, a]) => pdfText(doc, t, x, y + 5.4, { b: 1, s: 8, c: [255, 255, 255], a }));
  y += 8;
  const div = fa && k.pct ? 1 + k.pct / 100 : 1;
  c.items.forEach(it => {
    const lines = doc.splitTextToSize(it.desc, xU - xD - 22);
    const h = Math.max(8, lines.length * 4.2 + 3.8);
    if (y + h > 262) { doc.addPage(); y = 18; }
    pdfText(doc, it.cant, xC, y + 5.3, { s: 9, a: 'center' });
    lines.forEach((l, i) => pdfText(doc, l, xD, y + 5.3 + i * 4.2, { s: 9 }));
    pdfText(doc, money(it.precio / div), xU, y + 5.3, { s: 9, a: 'right' });
    pdfText(doc, money(it.cant * it.precio / div), xI, y + 5.3, { s: 9, a: 'right' });
    y += h; doc.setDrawColor(...PDF_LINE); doc.line(M, y, R, y);
  });
  // totales
  y += 6;
  const tl = R - 64, filas = [];
  if (c.descuento) filas.push(['Descuento', '− ' + money(c.descuento)]);
  if (k.pct) { filas.push(['Op. gravada', money(k.gravada)]); filas.push([`IGV (${k.pct}%)`, money(k.igv)]); }
  const yTot = y;
  filas.forEach(([l, v]) => { pdfText(doc, l, tl, y, { s: 9, c: PDF_GRAY }); pdfText(doc, v, xI, y, { s: 9, a: 'right' }); y += 5.5; });
  doc.setFillColor(...PDF_TEAL); doc.roundedRect(tl - 3, y - 4.5, R - tl + 3, 9, 1.5, 1.5, 'F');
  pdfText(doc, 'TOTAL', tl, y + 1.6, { b: 1, s: 10.5, c: [255, 255, 255] }); pdfText(doc, money(k.total), xI, y + 1.6, { b: 1, s: 11, a: 'right', c: [255, 255, 255] });
  let ly = yTot;
  doc.splitTextToSize('SON: ' + numeroALetras(k.total), tl - M - 8).forEach(s => { pdfText(doc, s, M, ly, { b: 1, s: 8.5 }); ly += 4.3; });
  ly += 2;
  if (c.pagado > 0.009 || c.saldo > 0.009) {
    pdfText(doc, `A cuenta: ${money(c.pagado)}${c.metodos.length ? ' (' + c.metodos.join(', ') + ')' : ''}`, M, ly, { s: 8.5, c: PDF_GRAY }); ly += 4.5;
    if (c.saldo > 0.009) { pdfText(doc, `Saldo pendiente: ${money(c.saldo)}`, M, ly, { b: 1, s: 8.5 }); ly += 4.5; }
  }
  if (c.entrega && c.tipo === 'nota') { pdfText(doc, `Fecha de entrega: ${fdate(c.entrega, { weekday: 'long', day: 'numeric', month: 'long' })}`, M, ly, { s: 8.5, c: PDF_GRAY }); ly += 4.5; }
  y = Math.max(y + 12, ly + 6);
  // pie
  const pie = [F.cuentas, F.pie].filter(Boolean).join('\n');
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setDrawColor(...PDF_LINE); doc.line(M, y, R, y); y += 6;
  pie.split('\n').forEach(par => doc.splitTextToSize(par, W - 2 * M).forEach(s => { pdfText(doc, s, W / 2, y, { s: 8.5, c: PDF_GRAY, a: 'center' }); y += 4.3; }));
  pdfText(doc, `Atendido por ${socioName(c.por)}`, W / 2, Math.max(y + 2, 287), { s: 7.5, c: PDF_GRAY, a: 'center' });
  pdfSello(doc, c, W, 297);
}

function drawTicket(doc, c, F) {
  const W = 80, M = 4, X = W / 2, R = W - M, k = cpCalc(c), fa = c.tipo === 'factura';
  let y = 6;
  const center = (t, o = {}) => doc.splitTextToSize(String(t), W - 2 * M).forEach(s => { pdfText(doc, s, X, y, { ...o, a: 'center' }); y += (o.s || 7.5) * 0.45; });
  const sep = () => { y += 1; doc.setLineDashPattern([0.8, 0.8], 0); doc.setDrawColor(150, 150, 150); doc.line(M, y, R, y); doc.setLineDashPattern([], 0); y += 4; };
  const fila = (l, v, o = {}) => { o = { s: 7.5, ...o }; pdfText(doc, l, M, y, o); pdfText(doc, v, R, y, { ...o, a: 'right' }); y += o.s * 0.48; };
  if (F.logo) { const r = F.logoRatio || 1, h = Math.min(16, 30 / r); try { doc.addImage(F.logo, 'PNG', X - h * r / 2, y, h * r, h); y += h + 4; } catch (e) { } }
  center(db.config.nombre || F.razon, { b: 1, s: 11 }); y += 0.5;
  emisorLineas(F).forEach(l => center(l, { s: 7.5, c: PDF_GRAY }));
  if (F.ruc) center('R.U.C. ' + F.ruc, { b: 1, s: 8.5 });
  sep();
  center(TITULO_CP[c.tipo], { b: 1, s: 9.5 }); center(cpNum(c), { b: 1, s: 9.5 });
  sep();
  fila('Fecha', fdate(c.fecha, { day: '2-digit', month: '2-digit', year: 'numeric' }) + (c.hora ? ' ' + c.hora : ''));
  fila('Orden N°', pad(c.ordenNum));
  doc.splitTextToSize((fa ? 'Razón social: ' : 'Cliente: ') + c.cliente.nombre, W - 2 * M).forEach(s => { pdfText(doc, s, M, y, { s: 7.5 }); y += 3.6; });
  if (c.cliente.doc) fila(c.cliente.docTipo === 'RUC' ? 'R.U.C.' : c.cliente.docTipo || 'DNI', c.cliente.doc);
  if (c.cliente.direccion) doc.splitTextToSize('Dirección: ' + c.cliente.direccion, W - 2 * M).forEach(s => { pdfText(doc, s, M, y, { s: 7.5 }); y += 3.6; });
  sep();
  const div = fa && k.pct ? 1 + k.pct / 100 : 1;
  c.items.forEach(it => {
    doc.splitTextToSize(it.desc, W - 2 * M).forEach(s => { pdfText(doc, s, M, y, { s: 7.5 }); y += 3.5; });
    fila(`  ${it.cant} x ${money(it.precio / div)}`, money(it.cant * it.precio / div), { s: 7.5, c: PDF_GRAY });
    y += 0.8;
  });
  sep();
  if (c.descuento) fila('Descuento', '− ' + money(c.descuento));
  if (k.pct) { fila('Op. gravada', money(k.gravada)); fila(`IGV (${k.pct}%)`, money(k.igv)); }
  y += 1; fila('TOTAL', money(k.total), { b: 1, s: 10 }); y += 1;
  doc.splitTextToSize('SON: ' + numeroALetras(k.total), W - 2 * M).forEach(s => { pdfText(doc, s, M, y, { s: 7, b: 1 }); y += 3.3; });
  if (c.pagado > 0.009 || c.saldo > 0.009) { y += 1; fila('A cuenta', money(c.pagado)); if (c.saldo > 0.009) fila('Saldo', money(c.saldo), { b: 1 }); }
  sep();
  [F.cuentas, F.pie].filter(Boolean).join('\n').split('\n').forEach(par => center(par, { s: 7, c: PDF_GRAY }));
  center(`Atendido por ${socioName(c.por)}`, { s: 6.5, c: PDF_GRAY });
  pdfSello(doc, c, W, Math.min(y, 140));
  return y;
}

function logoDesdeArchivo(file, cb) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 500 / Math.max(im.width, im.height)), cv = document.createElement('canvas');
      cv.width = Math.round(im.width * s); cv.height = Math.round(im.height * s);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
      cb(cv.toDataURL('image/png'), cv.width / cv.height);
    };
    im.onerror = () => toast('Esa imagen no se pudo leer; prueba con PNG o JPG');
    im.src = r.result;
  };
  r.readAsDataURL(file);
}

// ---------- Caja diaria ----------
function cajaData(d) {
  const pagos = db.pagos.filter(p => p.fecha === d).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const gastos = db.gastos.filter(g => g.fecha === d);
  const vales = db.vales.filter(v => v.fecha === d);
  const ingresos = pagos.reduce((s, p) => s + num(p.monto), 0);
  const tGastos = gastos.reduce((s, g) => s + num(g.monto), 0);
  const utilidad = round2(ingresos - tGastos);
  const porMetodo = METODOS.map(m => {
    const inn = pagos.filter(p => p.metodo === m).reduce((s, p) => s + num(p.monto), 0);
    const out = gastos.filter(g => (g.metodo || 'Efectivo') === m).reduce((s, g) => s + num(g.monto), 0) + (m === 'Efectivo' ? vales.reduce((s, v) => s + num(v.monto), 0) : 0);
    return { m, inn, out, neto: round2(inn - out) };
  });
  const socios = db.config.socios.map(s => {
    const parte = round2(utilidad * num(s.pct) / 100);
    const v = vales.filter(x => x.socioId === s.id).reduce((a, x) => a + num(x.monto), 0);
    return { ...s, parte, vales: v, neto: round2(parte - v) };
  });
  return { pagos, gastos, vales, ingresos, tGastos, utilidad, porMetodo, socios };
}
routes.caja = {
  html(d) {
    d = d || hoy();
    const c = cajaData(d), lock = cerrado(d), cierre = db.cierres.find(x => x.fecha === d);
    const vendido = db.ordenes.filter(o => o.fecha === d).reduce((s, o) => s + totalOrden(o), 0);
    return `<div class="page-head"><div><h1>Caja diaria</h1><p class="cap">${flong(d)}</p></div>
      <div class="actions"><a class="btn icon" href="#/caja/${addDays(d, -1)}" title="Día anterior">${icon('back')}</a><input class="inp" type="date" id="cdate" value="${d}" style="width:auto">
        <a class="btn icon" href="#/caja/${addDays(d, 1)}" title="Día siguiente" style="transform:scaleX(-1)">${icon('back')}</a>${d !== hoy() ? `<a class="btn" href="#/caja">Hoy</a>` : ''}
        <button class="btn" id="cprint" title="Descargar para Excel">${icon('down')}<span class="hide-sm">Excel</span></button>
        ${lock ? `<button class="btn" id="reopen">${icon('unlock')} Reabrir</button>` : `<button class="btn primary" id="close">${icon('lock')} Cerrar caja</button>`}</div></div>
      ${lock ? `<div class="locked" style="margin-bottom:18px">${icon('lock')} Caja cerrada por ${esc(socioName(cierre.por))} el ${new Date(cierre.ts).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}. Cualquier cambio necesita la clave de los dos socios.</div>` : ''}
      <div class="grid g4">
        <div class="card kpi"><div class="l"><i>${icon('wallet')}</i>Ingresos</div><div class="v num">${money(c.ingresos)}</div><div class="s">Vendido: ${money(vendido)}</div></div>
        <div class="card kpi warn"><div class="l"><i>${icon('down')}</i>Gastos</div><div class="v num">${money(c.tGastos)}</div><div class="s">${c.gastos.length} registro${c.gastos.length === 1 ? '' : 's'}</div></div>
        <div class="card kpi ink"><div class="l"><i>${icon('trend')}</i>Ganancia del día</div><div class="v num">${money(c.utilidad)}</div><div class="s">Ingresos − gastos</div></div>
        <div class="card kpi gold"><div class="l"><i>${icon('cash')}</i>Efectivo en caja</div><div class="v num">${money(c.porMetodo[0].neto)}</div><div class="s">Descontando gastos y vales</div></div>
      </div>
      <div class="card mt"><div class="card-h"><h3>Ventas y cobros</h3><span class="sub">${c.pagos.length} movimiento${c.pagos.length === 1 ? '' : 's'}</span></div><div class="card-b"><div class="tbl-wrap">
        ${c.pagos.length ? `<table><thead><tr><th>N° orden</th><th>Paciente</th><th class="hide-sm">Compró</th><th class="r">Total</th><th class="r">Abonó</th><th class="r">Resta</th><th>Método</th></tr></thead><tbody>
        ${c.pagos.map(pg => { const o = orden(pg.ordenId); if (!o) return ''; const pagadoHasta = round2(pagosDe(o.id).filter(x => x.fecha < pg.fecha || (x.fecha === pg.fecha && (x.ts || 0) <= (pg.ts || 0))).reduce((s, x) => s + num(x.monto), 0));
          return `<tr class="link" data-h="#/orden/${o.id}"><td class="ordnum">${pad(o.numero)}</td><td><b>${esc(paciente(o.pacienteId)?.nombre)}</b>${pg.tipo === 'saldo' ? '<div class="muted small">Pago de saldo</div>' : ''}</td><td class="hide-sm small muted">${esc(o.items.map(i => i.desc).join(' · ')).slice(0, 70)}</td>
          <td class="r num">${money(totalOrden(o))}</td><td class="r num strong">${money(pg.monto)}</td><td class="r num" style="${totalOrden(o) - pagadoHasta > 0.009 ? 'color:var(--danger)' : ''}">${money(Math.max(0, totalOrden(o) - pagadoHasta))}</td><td><span class="tag">${esc(pg.metodo)}</span></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="4" class="r hide-sm-no">Total cobrado</td><td class="r num">${money(c.ingresos)}</td><td colspan="2"></td></tr></tfoot></table>` : `<div class="empty">No hay cobros este día.</div>`}</div></div></div>
      <div class="grid g2 mt">
        <div class="card"><div class="card-h"><h3>Gastos</h3><button class="btn sm" id="addg">${icon('plus')} Gasto</button></div><div class="card-b">
          ${c.gastos.length ? `<table><tbody>${c.gastos.map(g => `<tr><td><b>${esc(g.concepto)}</b><div class="muted small">${esc(g.metodo || 'Efectivo')} · ${esc(socioName(g.por))}</div></td><td class="r num">${money(g.monto)}</td><td style="width:40px"><button class="btn ghost icon sm" data-gdel="${g.id}" title="Eliminar">${icon('trash')}</button></td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total gastos</td><td class="r num">${money(c.tGastos)}</td><td></td></tr></tfoot></table>` : `<div class="empty" style="padding:14px">Sin gastos.</div>`}</div></div>
        <div class="card"><div class="card-h"><h3>Vales de los socios</h3><button class="btn sm" id="addv">${icon('plus')} Vale</button></div><div class="card-b">
          ${c.vales.length ? `<table><tbody>${c.vales.map(v => `<tr><td><b>${esc(socioName(v.socioId))}</b><div class="muted small">${esc(v.concepto || 'Vale')}</div></td><td class="r num">${money(v.monto)}</td><td style="width:40px"><button class="btn ghost icon sm" data-vdel="${v.id}" title="Eliminar">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:14px">Sin vales.</div>`}</div></div>
      </div>
      <div class="grid g2 mt">
        <div class="card"><div class="card-h"><h3>Cuadre por método</h3></div><div class="card-b tbl-wrap"><table><thead><tr><th>Método</th><th class="r">Entró</th><th class="r">Salió</th><th class="r">Queda</th></tr></thead><tbody>
          ${c.porMetodo.map(x => `<tr><td><span class="row" style="gap:8px"><i style="width:10px;height:10px;border-radius:3px;background:${METODO_COLOR[x.m]}"></i>${x.m}</span></td><td class="r num">${money(x.inn)}</td><td class="r num muted">${x.out ? '− ' + money(x.out) : '—'}</td><td class="r num strong">${money(x.neto)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="r num">${money(c.ingresos)}</td><td class="r num">− ${money(c.tGastos + c.vales.reduce((s, v) => s + num(v.monto), 0))}</td><td class="r num">${money(c.porMetodo.reduce((s, x) => s + x.neto, 0))}</td></tr></tfoot></table></div></div>
        <div class="card"><div class="card-h"><h3>Ganancia por socio</h3><span class="sub">Ganancia ${money(c.utilidad)}</span></div><div class="card-b"><div class="grid g2 partner-grid" style="gap:12px">
          ${c.socios.map(s => `<div class="partner"><div class="row" style="gap:10px"><span class="avatar">${initials(s.nombre)}</span><b>${esc(s.nombre)}</b><span class="muted small" style="margin-left:auto">${s.pct}%</span></div>
            <div class="cash-sum mt-s small"><div class="line" style="padding:2px 0"><span class="muted">Su parte</span><span class="num">${money(s.parte)}</span></div><div class="line" style="padding:2px 0"><span class="muted">Vales</span><span class="num">− ${money(s.vales)}</span></div></div>
            <div class="v num">${money(s.neto)}</div></div>`).join('')}</div></div></div>
      </div>`;
  },
  bind(d) {
    d = d || hoy();
    const lock = cerrado(d);
    const guard = (motivo, cb) => lock ? dual(motivo + ` (caja del ${fdate(d)} cerrada)`, cb) : cb();
    $('#cdate').onchange = e => go('#/caja/' + e.target.value);
    $$('[data-h]').forEach(r => r.onclick = () => go(r.dataset.h));
    $('#addg').onclick = () => guard('Agregar gasto', () => gastoForm(d));
    $('#addv').onclick = () => guard('Agregar vale', () => valeForm(d));
    $$('[data-gdel]').forEach(b => b.onclick = () => { const g = db.gastos.find(x => x.id === b.dataset.gdel); dual(`Eliminar gasto "${g.concepto}" de ${money(g.monto)}`, () => { db.gastos = db.gastos.filter(x => x !== g); save(); render(); }); });
    $$('[data-vdel]').forEach(b => b.onclick = () => { const v = db.vales.find(x => x.id === b.dataset.vdel); dual(`Eliminar vale de ${socioName(v.socioId)} por ${money(v.monto)}`, () => { db.vales = db.vales.filter(x => x !== v); save(); render(); }); });
    $('#close') && ($('#close').onclick = () => confirmBox(`¿Cerrar la caja del ${flong(d)}? Después, cualquier cambio en este día necesitará la clave de los dos socios.`, () => { db.cierres.push({ fecha: d, por: user, ts: Date.now() }); addLog('Cierre de caja ' + d); save(); toast('Caja cerrada'); render(); }, 'Cerrar caja'));
    $('#reopen') && ($('#reopen').onclick = () => dual(`Reabrir la caja del ${fdate(d)}`, () => { db.cierres = db.cierres.filter(x => x.fecha !== d); save(); render(); }));
    $('#cprint').onclick = () => cajaCSV(d);
  },
};
function gastoForm(d) {
  modal({
    title: 'Registrar gasto',
    body: `<form id="gf" class="form"><label class="f">Concepto<input class="inp" name="concepto" required list="glist" placeholder="Ej. Laboratorio, pasaje, almuerzo…"><datalist id="glist">${[...new Set(db.gastos.map(g => g.concepto))].slice(0, 30).map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label class="f">Monto<input class="inp" name="monto" inputmode="decimal" required></label>
      <div class="pay-opts">${METODOS.map((m, i) => `<label><input type="radio" name="metodo" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="gf">Guardar</button>`,
    onMount: bg => { $('#gf', bg).onsubmit = e => { e.preventDefault(); const f = readForm(e.target); if (num(f.monto) <= 0) return toast('Monto inválido'); db.gastos.push({ id: uid(), fecha: d, concepto: f.concepto, monto: num(f.monto), metodo: f.metodo, por: user }); save(); closeModal(); toast('Gasto registrado'); render(); }; },
  });
}
function valeForm(d) {
  modal({
    title: 'Registrar vale',
    body: `<form id="vf" class="form"><label class="f">Socio<select class="inp" name="socioId">${db.config.socios.map(s => `<option value="${s.id}" ${s.id === user ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></label>
      <label class="f">Monto<input class="inp" name="monto" inputmode="decimal" required></label><label class="f">Detalle <span class="hint">(opcional)</span><input class="inp" name="concepto"></label>
      <p class="hint" style="margin:0">El vale sale del efectivo y se descuenta de la ganancia de ese socio.</p></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="vf">Guardar</button>`,
    onMount: bg => { $('#vf', bg).onsubmit = e => { e.preventDefault(); const f = readForm(e.target); if (num(f.monto) <= 0) return toast('Monto inválido'); db.vales.push({ id: uid(), fecha: d, socioId: f.socioId, monto: num(f.monto), concepto: f.concepto, por: user }); save(); closeModal(); toast('Vale registrado'); render(); }; },
  });
}
function cajaCSV(d) {
  const c = cajaData(d);
  const q = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const n2 = v => Number(v || 0).toFixed(2);
  const rows = [[db.config.nombre, 'Cierre de caja', d], [], ['N° orden', 'Paciente', 'Compró', 'Total orden', 'Abonó', 'Resta', 'Método', 'Comprobante']];
  c.pagos.forEach(pg => {
    const o = orden(pg.ordenId); if (!o) return;
    const hasta = pagosDe(o.id).filter(x => x.fecha < pg.fecha || (x.fecha === pg.fecha && (x.ts || 0) <= (pg.ts || 0))).reduce((s, x) => s + num(x.monto), 0);
    rows.push([pad(o.numero), paciente(o.pacienteId)?.nombre, o.items.map(i => i.desc).join(' + '), n2(totalOrden(o)), n2(pg.monto), n2(Math.max(0, totalOrden(o) - hasta)), pg.metodo, comprobanteDe(o.id) ? cpNum(comprobanteDe(o.id)) : '']);
  });
  rows.push([], ['Gastos', '', '', '', 'Monto', '', 'Método']);
  c.gastos.forEach(g => rows.push([g.concepto, '', '', '', n2(g.monto), '', g.metodo]));
  rows.push([], ['Vales', '', '', '', 'Monto']);
  c.vales.forEach(v => rows.push([socioName(v.socioId), v.concepto || '', '', '', n2(v.monto)]));
  rows.push([], ['Método', 'Entró', 'Salió', 'Queda']);
  c.porMetodo.forEach(x => rows.push([x.m, n2(x.inn), n2(x.out), n2(x.neto)]));
  rows.push([], ['Ingresos', n2(c.ingresos)], ['Gastos', n2(c.tGastos)], ['Ganancia del día', n2(c.utilidad)]);
  c.socios.forEach(s => rows.push([s.nombre + ' (' + s.pct + '%)', n2(s.parte), 'Vales', n2(s.vales), 'Neto', n2(s.neto)]));
  saveFile(`Caja ${d}.csv`, '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n'));
}

// ---------- Inventario ----------
let invTab = 'monturas';
routes.inventario = {
  html() {
    const bajo = db.monturas.filter(m => num(m.stock) <= 1).length;
    return `<div class="page-head"><div><h1>Inventario</h1><p>${db.monturas.length} monturas · ${db.monturas.reduce((s, m) => s + Math.max(0, num(m.stock)), 0)} unidades${bajo ? ` · <span style="color:var(--danger)">${bajo} con stock bajo</span>` : ''}</p></div>
      <div class="actions"><button class="btn primary" id="newi">${icon('plus')} ${invTab === 'monturas' ? 'Nueva montura' : 'Nuevo cristal'}</button></div></div>
      <div class="card"><div class="card-b row wrap" style="padding-bottom:8px"><div class="seg" id="iseg"><button data-k="monturas" class="${invTab === 'monturas' ? 'on' : ''}">Monturas</button><button data-k="cristales" class="${invTab === 'cristales' ? 'on' : ''}">Lista de precios de cristales</button></div>
      <input class="inp" id="if" style="flex:1;min-width:200px" placeholder="Buscar…"></div><div id="ilist"></div></div>`;
  },
  bind() {
    const draw = () => {
      const f = $('#if').value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      if (invTab === 'monturas') {
        const l = db.monturas.filter(m => !f || [m.codigo, m.marca, m.modelo, m.material, m.color].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f)).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
        $('#ilist').innerHTML = l.length ? `<div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Montura</th><th class="hide-sm">Material</th><th class="r">Precio</th><th class="c">Stock</th></tr></thead><tbody>
          ${l.map(m => `<tr class="link" data-id="${m.id}"><td><span class="tag">${esc(m.codigo)}</span></td><td><b>${esc(m.marca)}</b> ${esc(m.modelo)}<div class="muted small">${esc(m.color || '')}</div></td><td class="hide-sm">${esc(m.material || '—')}</td><td class="r num">${money(m.precio)}</td>
          <td class="c"><span class="chip ${num(m.stock) <= 0 ? 'deuda' : num(m.stock) <= 1 ? 'pend' : 'plain'}">${m.stock}</span></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">${icon('box')}<div>No hay monturas.</div></div>`;
        $$('#ilist [data-id]').forEach(r => r.onclick = () => monturaForm(db.monturas.find(x => x.id === r.dataset.id)));
      } else {
        const l = db.cristales.filter(c => !f || [c.nombre, c.tipo].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f));
        $('#ilist').innerHTML = l.length ? `<div class="tbl-wrap"><table><thead><tr><th>Cristal</th><th class="hide-sm">Tipo</th><th class="r">Precio</th></tr></thead><tbody>
          ${l.map(c => `<tr class="link" data-id="${c.id}"><td><b>${esc(c.nombre)}</b></td><td class="hide-sm">${esc(c.tipo || '—')}</td><td class="r num">${money(c.precio)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No hay cristales en la lista.</div>`;
        $$('#ilist [data-id]').forEach(r => r.onclick = () => cristalForm(db.cristales.find(x => x.id === r.dataset.id)));
      }
    };
    $$('#iseg button').forEach(b => b.onclick = () => { invTab = b.dataset.k; render(); });
    $('#if').oninput = draw; draw();
    $('#newi').onclick = () => invTab === 'monturas' ? monturaForm() : cristalForm();
  },
};
function monturaForm(m) {
  const e = m || { stock: 1 };
  modal({
    title: m ? 'Montura ' + esc(m.codigo) : 'Nueva montura',
    body: `<form id="mf" class="form"><div class="fg">
      <label class="f">Código<input class="inp" name="codigo" required value="${esc(e.codigo)}"></label><label class="f">Marca<input class="inp" name="marca" required value="${esc(e.marca)}"></label>
      <label class="f">Modelo<input class="inp" name="modelo" value="${esc(e.modelo)}"></label><label class="f">Color<input class="inp" name="color" value="${esc(e.color)}"></label>
      <label class="f">Material<select class="inp" name="material">${['', 'Metal', 'Acetato', 'TR90', 'Titanio', 'Aire / al aire', 'Otro'].map(x => `<option ${x === (e.material || '') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="f">Precio de venta<input class="inp" name="precio" inputmode="decimal" required value="${esc(e.precio)}"></label>
      <label class="f">Costo <span class="hint">(opcional)</span><input class="inp" name="costo" inputmode="decimal" value="${esc(e.costo)}"></label>
      <label class="f">Stock<input class="inp" name="stock" inputmode="numeric" value="${esc(e.stock)}"></label></div>
      ${m ? `<p class="hint" style="margin:0">${icon('lock', '').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"')} Cambiar el precio pide la clave de los dos socios.</p>` : ''}</form>`,
    foot: `${m ? `<button class="btn danger" id="mdel" style="margin-right:auto">${icon('trash')}</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" form="mf">Guardar</button>`,
    onMount: bg => {
      $('#mf', bg).onsubmit = ev => {
        ev.preventDefault();
        const f = readForm(ev.target); f.precio = num(f.precio); f.stock = num(f.stock); f.costo = f.costo ? num(f.costo) : '';
        if (db.monturas.some(x => x !== m && x.codigo.toLowerCase() === f.codigo.toLowerCase())) { toast('Ya existe una montura con ese código'); return; }
        const doit = () => { if (m) Object.assign(m, f); else db.monturas.push({ id: uid(), ...f }); save(); closeModal(); toast('Montura guardada'); render(); };
        m && num(m.precio) !== f.precio ? dual(`Cambiar precio de montura ${m.codigo}: ${money(m.precio)} → ${money(f.precio)}`, doit) : doit();
      };
      $('#mdel', bg) && ($('#mdel', bg).onclick = () => dual(`Eliminar montura ${m.codigo}`, () => { db.monturas = db.monturas.filter(x => x !== m); save(); render(); }));
    },
  });
}
function cristalForm(c) {
  const e = c || {};
  modal({
    title: c ? 'Editar cristal' : 'Nuevo cristal',
    body: `<form id="cf2" class="form"><label class="f">Nombre<input class="inp" name="nombre" required value="${esc(e.nombre)}" placeholder="Ej. Monofocal CR-39 antirreflejo"></label>
      <div class="fg"><label class="f">Tipo<select class="inp" name="tipo">${['Monofocal', 'Bifocal', 'Multifocal / Progresivo', 'Ocupacional', 'Lentes de contacto', 'Otro'].map(x => `<option ${x === e.tipo ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="f">Precio (par)<input class="inp" name="precio" inputmode="decimal" required value="${esc(e.precio)}"></label></div></form>`,
    foot: `${c ? `<button class="btn danger" id="cdel" style="margin-right:auto">${icon('trash')}</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" form="cf2">Guardar</button>`,
    onMount: bg => {
      $('#cf2', bg).onsubmit = ev => {
        ev.preventDefault(); const f = readForm(ev.target); f.precio = num(f.precio);
        const doit = () => { if (c) Object.assign(c, f); else db.cristales.push({ id: uid(), ...f }); save(); closeModal(); toast('Guardado'); render(); };
        c && num(c.precio) !== f.precio ? dual(`Cambiar precio de "${c.nombre}": ${money(c.precio)} → ${money(f.precio)}`, doit) : doit();
      };
      $('#cdel', bg) && ($('#cdel', bg).onclick = () => dual(`Eliminar cristal "${c.nombre}"`, () => { db.cristales = db.cristales.filter(x => x !== c); save(); render(); }));
    },
  });
}

// ---------- Recordatorios ----------
function recordatorioTexto(k, id) {
  if (k === 'control') {
    const p = paciente(id);
    return `Hola ${p.nombre.split(' ')[0]} 👋, te saludamos de *${db.config.nombre}*.\n\nYa pasó un año desde tu último examen visual 👁. La vista cambia con el tiempo y un control a tiempo evita dolores de cabeza y cansancio visual.\n\n¿Te separamos una cita esta semana?`;
  }
  const o = orden(id), p = paciente(o.pacienteId);
  if (k === 'listo') return ordenWaTexto(o, p);
  return `Hola ${p.nombre.split(' ')[0]}, te saludamos de *${db.config.nombre}*. Te recordamos que tu orden N° ${pad(o.numero)} tiene un saldo pendiente de ${money(saldoOrden(o))}. ¡Gracias!`;
}
function recordatoriosData() {
  const d = hoy(), meses = num(db.config.recordatorioMeses) || 12;
  const listos = db.ordenes.filter(o => o.estado === 'listo' && !o.avisado);
  const control = db.pacientes.map(p => ({ p, m: ultimaMedida(p.id) })).filter(x => x.m && daysBetween(x.m.fecha, d) >= meses * 30.4 && !(x.p.recordado && daysBetween(x.p.recordado, d) < 60))
    .sort((a, b) => a.m.fecha.localeCompare(b.m.fecha));
  const deudas = db.ordenes.filter(o => o.estado === 'entregado' && saldoOrden(o) > 0.009);
  return { listos, control, deudas, total: listos.length + control.length };
}
routes.recordatorios = {
  html() {
    const r = recordatoriosData();
    const sec = (t, sub, rows) => `<div class="card mt"><div class="card-h"><div><h3>${t}</h3><div class="sub">${sub}</div></div></div><div class="card-b" style="padding:10px 0 6px">${rows || `<div class="empty" style="padding:16px">Nada pendiente. ✨</div>`}</div></div>`;
    const waBtn = (tel, kind, id) => tel ? `<a class="btn sm wa" target="_blank" rel="noopener" data-k="${kind}" data-id="${id}" href="${waLink(tel, recordatorioTexto(kind, id))}">${icon('wa')} Enviar</a>` : '<span class="muted small">Sin teléfono</span>';
    return `<div class="page-head"><div><h1>Recordatorios</h1><p>Mensajes listos para enviar por WhatsApp, sin costo.</p></div></div>
      ${sec('Lentes listos para entregar', 'Avísale al cliente que ya puede recogerlos.', r.listos.map(o => { const p = paciente(o.pacienteId); return `<div class="list-item"><span class="ordnum">N° ${pad(o.numero)}</span><div class="grow"><div class="t">${esc(p?.nombre)}</div><div class="d">${esc(p?.telefono || '')}</div></div>${waBtn(p?.telefono, 'listo', o.id)}</div>`; }).join(''))}
      ${sec('Control visual anual', `Pacientes cuyo último examen fue hace más de ${db.config.recordatorioMeses} meses. Recuperar clientes es venta segura.`, r.control.map(({ p, m }) => `<div class="list-item"><span class="ini">${initials(p.nombre)}</span><div class="grow"><a class="t" href="#/paciente/${p.id}">${esc(p.nombre)}</a><div class="d">Último examen: ${fdate(m.fecha)} · hace ${Math.floor(daysBetween(m.fecha, hoy()) / 30.4)} meses</div></div>${waBtn(p.telefono, 'control', p.id)}</div>`).join(''))}
      ${sec('Saldos pendientes', 'Órdenes ya entregadas que aún deben dinero.', r.deudas.map(o => { const p = paciente(o.pacienteId); return `<div class="list-item"><span class="ordnum">N° ${pad(o.numero)}</span><div class="grow"><div class="t">${esc(p?.nombre)}</div><div class="d">Debe ${money(saldoOrden(o))}</div></div>${waBtn(p?.telefono, 'deuda', o.id)}</div>`; }).join(''))}`;
  },
  bind() {
    // El enlace abre WhatsApp con el mensaje; aquí solo se anota que ya se avisó.
    $$('a[data-k]').forEach(a => a.addEventListener('click', () => {
      const { k, id } = a.dataset;
      if (k === 'control') paciente(id).recordado = hoy();
      if (k === 'listo') orden(id).avisado = hoy();
      save(); setTimeout(render, 600);
    }));
  },
};

// ---------- Ajustes ----------
routes.ajustes = {
  html() {
    const c = db.config, F = c.fact;
    return `<div class="page-head"><div><h1>Ajustes</h1><p>Datos de la óptica, socios y respaldo.</p></div></div>
      <div class="grid g2">
        <div class="card"><div class="card-h"><h3>Datos de la óptica</h3></div><div class="card-b"><form id="cfg" class="form">
          <label class="f">Nombre<input class="inp" name="nombre" value="${esc(c.nombre)}" required></label>
          <label class="f">Teléfono<input class="inp" name="telefono" value="${esc(c.telefono)}"></label>
          <label class="f">Dirección<input class="inp" name="direccion" value="${esc(c.direccion)}"></label>
          <label class="f">Recordar control visual cada (meses)<input class="inp" name="recordatorioMeses" inputmode="numeric" value="${esc(c.recordatorioMeses)}"></label>
          <button class="btn primary">Guardar</button></form></div></div>
        <div class="card" style="grid-column:1/-1"><div class="card-h"><div><h3>Boletas y facturas</h3><div class="sub">Estos datos salen en el PDF de cada comprobante.</div></div></div><div class="card-b"><form id="factf" class="form">
          <div class="fg fg3">
            <label class="f">RUC<input class="inp" name="ruc" inputmode="numeric" maxlength="11" value="${esc(F.ruc)}" placeholder="11 dígitos"></label>
            <label class="f span2">Razón social<input class="inp" name="razon" value="${esc(F.razon)}" placeholder="Como figura en SUNAT"></label>
            <label class="f full">Dirección fiscal<input class="inp" name="direccion" value="${esc(F.direccion)}"></label>
            <label class="f">Distrito<input class="inp" name="distrito" value="${esc(F.distrito)}"></label>
            <label class="f">Provincia<input class="inp" name="provincia" value="${esc(F.provincia)}"></label>
            <label class="f">Departamento<input class="inp" name="departamento" value="${esc(F.departamento)}"></label>
            <label class="f">Correo<input class="inp" name="email" type="email" value="${esc(F.email)}"></label>
            <label class="f span2">Web o redes <span class="hint">(opcional)</span><input class="inp" name="web" value="${esc(F.web)}" placeholder="Instagram, Facebook o página web"></label>
          </div>
          <div class="row wrap" style="gap:14px">${F.logo ? `<img src="${F.logo}" alt="Logo" style="height:56px;max-width:180px;object-fit:contain;border:1px solid var(--line);border-radius:10px;padding:6px;background:#fff">` : '<span class="muted small">Sin logo</span>'}
            <label class="btn sm">${icon('img')} ${F.logo ? 'Cambiar logo' : 'Subir logo'}<input type="file" id="logoin" accept="image/*" hidden></label>${F.logo ? `<button type="button" class="btn sm ghost" id="logodel">Quitar</button>` : ''}</div>
          <div class="fg fg4">
            <label class="f">Serie boleta<input class="inp" name="serieB" value="${esc(F.serieB)}" maxlength="4"></label>
            <label class="f">Próximo N° boleta<input class="inp" name="numB" inputmode="numeric" value="${esc(F.numB)}"></label>
            <label class="f">Serie factura<input class="inp" name="serieF" value="${esc(F.serieF)}" maxlength="4"></label>
            <label class="f">Próximo N° factura<input class="inp" name="numF" inputmode="numeric" value="${esc(F.numF)}"></label>
          </div>
          <div class="fg">
            <label class="f">Tamaño del PDF<select class="inp" name="formato"><option value="A4" ${F.formato === 'A4' ? 'selected' : ''}>Hoja A4</option><option value="ticket" ${F.formato === 'ticket' ? 'selected' : ''}>Ticket de 80 mm</option></select></label>
            <label class="f">IGV (%)<input class="inp" name="igvPct" inputmode="decimal" value="${esc(F.igvPct)}"></label>
          </div>
          <label class="row small" style="gap:8px"><input type="checkbox" name="igv" ${F.igv ? 'checked' : ''}> Los precios incluyen IGV (se desglosa en boleta y factura)</label>
          <label class="row small" style="gap:8px"><input type="checkbox" name="medida" ${F.medida ? 'checked' : ''}> Incluir la medida del paciente en la nota de venta</label>
          <div class="fg">
            <label class="f">Cuentas para pagar <span class="hint">(opcional)</span><textarea class="inp" name="cuentas" placeholder="Yape 987 654 321 · BCP 191-12345678-0-12">${esc(F.cuentas)}</textarea></label>
            <label class="f">Texto al pie<textarea class="inp" name="pie">${esc(F.pie)}</textarea></label>
          </div>
          <p class="hint" style="margin:0">Para que la boleta o factura tenga validez ante SUNAT debe emitirse también como comprobante electrónico (SUNAT Operaciones en Línea o un proveedor autorizado).</p>
          <div class="actions"><button class="btn primary">Guardar</button><button type="button" class="btn" id="cptest">${icon('file')} Ver PDF de prueba</button></div>
        </form></div></div>
        <div class="card"><div class="card-h"><h3>Socios</h3></div><div class="card-b">
          ${c.socios.map(s => `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line-2)"><div class="row"><span class="avatar">${initials(s.nombre)}</span><div><b>${esc(s.nombre)}</b><div class="muted small">${s.pct}% de la ganancia</div></div></div><button class="btn sm" data-s="${s.id}">Editar</button></div>`).join('')}
          <p class="hint">Cambiar nombres, porcentajes o claves pide la clave de ambos socios.</p></div></div>
        <div class="card"><div class="card-h"><h3>Respaldo de datos</h3></div><div class="card-b">
          <p class="muted small" style="margin-top:0">Los datos se guardan en este equipo. Descarga un respaldo cada semana (o guárdalo en Google Drive) para no perder nada.</p>
          <div class="actions"><button class="btn primary" id="exp">${icon('down')} Descargar respaldo</button><label class="btn">${icon('up')} Restaurar respaldo<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
          ${c.ultimoRespaldo ? `<p class="hint">Último respaldo: ${new Date(c.ultimoRespaldo).toLocaleString('es-PE')}</p>` : ''}
          <div style="border-top:1px solid var(--line-2);margin-top:16px;padding-top:14px"><b class="small">¿Terminaste de probar?</b><p class="muted small" style="margin:4px 0 10px">Borra los datos de ejemplo y empieza con tus pacientes reales. Pide la clave de ambos socios.</p>
          <button class="btn danger" id="reset">${icon('trash')} Empezar de cero</button></div></div></div>
        <div class="card"><div class="card-h"><h3>Cambios autorizados</h3><span class="sub">Últimos 20</span></div><div class="card-b" style="padding-top:8px">
          ${db.log.length ? db.log.slice(0, 20).map(l => `<div style="padding:8px 0;border-bottom:1px solid var(--line-2)"><div class="small"><b>${esc(l.accion)}</b></div><div class="muted small">${new Date(l.ts).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })} · ${esc(socioName(l.por))}${l.autoriza ? ' · autorizado por ambos' : ''}</div></div>`).join('') : `<div class="empty" style="padding:14px">Sin registros.</div>`}</div></div>
      </div>`;
  },
  bind() {
    $('#cfg').onsubmit = e => { e.preventDefault(); const f = readForm(e.target); Object.assign(db.config, f, { recordatorioMeses: num(f.recordatorioMeses) || 12 }); save(); toast('Datos guardados'); render(); };
    $$('[data-s]').forEach(b => b.onclick = () => dual('Editar datos de socio', () => socioForm(socio(b.dataset.s))));
    $('#factf').onsubmit = e => {
      e.preventDefault();
      const f = readForm(e.target), F = fact();
      if (f.ruc && !/^\d{11}$/.test(f.ruc)) return toast('El RUC debe tener 11 dígitos');
      Object.assign(F, f, {
        igv: !!f.igv, medida: !!f.medida, igvPct: num(f.igvPct) || 18,
        numB: Math.max(1, parseInt(f.numB, 10) || 1), numF: Math.max(1, parseInt(f.numF, 10) || 1),
        serieB: (f.serieB || 'B001').toUpperCase(), serieF: (f.serieF || 'F001').toUpperCase(),
      });
      save(); toast('Datos de comprobantes guardados'); render();
    };
    $('#logoin').onchange = e => { const file = e.target.files[0]; if (file) logoDesdeArchivo(file, (url, ratio) => { Object.assign(fact(), { logo: url, logoRatio: ratio }); save(); toast('Logo guardado'); render(); }); };
    $('#logodel') && ($('#logodel').onclick = () => { fact().logo = ''; save(); render(); });
    $('#cptest').onclick = async () => {
      const o = db.ordenes.slice().sort((a, b) => b.numero - a.numero)[0];
      if (!o) return toast('Registra una venta para ver el ejemplo');
      const F = fact(), p = paciente(o.pacienteId);
      const c = { tipo: F.ruc ? 'boleta' : 'nota', serie: F.ruc ? F.serieB : 'NV01', numero: 0, fecha: hoy(), hora: new Date().toTimeString().slice(0, 5), ordenNum: o.numero,
        cliente: { docTipo: p?.dni ? 'DNI' : '', doc: p?.dni || '', nombre: p?.nombre || 'CLIENTES VARIOS', direccion: '' }, items: o.items, descuento: num(o.descuento), total: totalOrden(o),
        igvPct: F.ruc && F.igv ? num(F.igvPct) : 0, pagado: pagadoOrden(o), saldo: Math.max(0, saldoOrden(o)), metodos: [...new Set(pagosDe(o.id).map(x => x.metodo))], medidaId: o.medidaId, entrega: o.entrega, por: user, estado: 'prueba' };
      try { saveFile(`Prueba ${TIPOS_CP[c.tipo]}.pdf`, await comprobantePDF(c)); } catch (err) { toast('No se pudo generar el PDF: ' + err.message); }
    };
    $('#exp').onclick = async () => {
      const ok = await saveFile(`respaldo-${(db.config.nombre || 'optica').toLowerCase().replace(/\s+/g, '-')}-${hoy()}.json`, JSON.stringify(db));
      if (ok) { db.config.ultimoRespaldo = Date.now(); save(); render(); }
    };
    $('#reset').onclick = () => dual('Borrar pacientes, órdenes, caja e inventario (se conservan los socios y los datos de la óptica)', () => {
      const cfg = { ...db.config, nextOrden: 1, fact: { ...db.config.fact, numB: 1, numF: 1 } }; db = blank(); db.config = cfg; save(); toast('Listo: el sistema quedó en blanco'); go('#/inicio');
    });
    $('#imp').onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      file.text().then(t => {
        let data; try { data = JSON.parse(t); if (!data.config || !data.pacientes) throw 0; } catch (err) { toast('El archivo no es un respaldo válido'); return; }
        dual(`Restaurar respaldo (${data.pacientes.length} pacientes, ${data.ordenes.length} órdenes). Se reemplazan los datos actuales.`, () => { db = normDb(Object.assign(blank(), data)); save(); toast('Respaldo restaurado'); render(); });
      });
    };
  },
};
function socioForm(s) {
  modal({
    title: 'Editar socio',
    body: `<form id="sf" class="form"><label class="f">Nombre<input class="inp" name="nombre" value="${esc(s.nombre)}" required></label>
      <label class="f">Porcentaje de la ganancia<input class="inp" name="pct" inputmode="decimal" value="${s.pct}"></label>
      <label class="f">Nueva clave <span class="hint">(dejar vacío para no cambiar)</span><input class="inp" name="pin" type="password" inputmode="numeric" minlength="4" maxlength="8"></label></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="sf">Guardar</button>`,
    onMount: bg => {
      $('#sf', bg).onsubmit = e => {
        e.preventDefault(); const f = readForm(e.target);
        s.nombre = f.nombre; s.pct = num(f.pct); if (f.pin) s.pin = hashPin(f.pin);
        const other = db.config.socios.find(x => x !== s); if (other) other.pct = round2(100 - s.pct);
        save(); closeModal(); toast('Socio actualizado'); render();
      };
    },
  });
}

// ---------- Datos de ejemplo ----------
function seedDemo() {
  const d = hoy(), S = db.config.socios;
  const mont = [['M-101', 'Ray-Ban', 'RB5154 Clubmaster', 'Acetato', 'Carey', 380, 3], ['M-102', 'Ray-Ban', 'RB3447 Round', 'Metal', 'Dorado', 420, 2], ['M-201', 'Vogue', 'VO5286', 'Acetato', 'Negro', 290, 4],
    ['M-202', 'Oakley', 'OX8046 Airdrop', 'TR90', 'Gris mate', 450, 1], ['M-301', 'Genérica', 'GL-22', 'Metal', 'Plateado', 120, 12], ['M-302', 'Genérica', 'GL-35 Kids', 'TR90', 'Azul', 95, 8],
    ['M-401', 'Guess', 'GU2700', 'Metal', 'Rosa', 340, 2], ['M-402', 'Carolina Herrera', 'VHE836', 'Acetato', 'Havana', 520, 1], ['M-501', 'Genérica', 'Al aire A1', 'Aire / al aire', 'Plateado', 160, 6]];
  db.monturas = mont.map(([codigo, marca, modelo, material, color, precio, stock]) => ({ id: uid(), codigo, marca, modelo, material, color, precio, stock }));
  const cr = [['Monofocal CR-39 blanco', 'Monofocal', 80], ['Monofocal CR-39 antirreflejo', 'Monofocal', 150], ['Monofocal blue cut antirreflejo', 'Monofocal', 220], ['Monofocal fotocromático', 'Monofocal', 280],
    ['Bifocal flat-top antirreflejo', 'Bifocal', 260], ['Progresivo digital antirreflejo', 'Multifocal / Progresivo', 650], ['Progresivo blue cut premium', 'Multifocal / Progresivo', 890], ['Policarbonato antirreflejo (niños)', 'Monofocal', 240]];
  db.cristales = cr.map(([nombre, tipo, precio]) => ({ id: uid(), nombre, tipo, precio }));
  const E = (esf, cil, eje, add, av = '20/20') => ({ esf, cil, eje, add, av });
  const pacs = [
    ['María Fernanda Quispe', '987654321', '45871236', [[addDays(d, -520), E('-1.25', '-0.50', '180', ''), E('-1.00', '-0.50', '175', '')], [addDays(d, -2), E('-1.75', '-0.75', '180', ''), E('-1.50', '-0.50', '170', '')]]],
    ['Carlos Mendoza Ríos', '956112233', '40125698', [[addDays(d, -1), E('+1.50', '-0.75', '90', '+2.00'), E('+1.75', '-0.50', '85', '+2.00')]]],
    ['Lucía Paredes', '912345678', '72145896', [[addDays(d, -420), E('-3.00', '', '', ''), E('-2.75', '-0.25', '10', '')]]],
    ['Jorge Luis Huamán', '944556677', '', [[addDays(d, -30), E('-0.50', '-1.25', '5', ''), E('-0.75', '-1.00', '175', '')]]],
    ['Rosa Elvira Torres', '933221100', '08965412', [[addDays(d, -700), E('+2.00', '', '', '+2.25'), E('+2.25', '', '', '+2.25')], [addDays(d, -390), E('+2.25', '-0.25', '90', '+2.50'), E('+2.25', '', '', '+2.50')]]],
    ['Mateo Salazar (niño)', '921987654', '', [[d, E('-0.75', '-0.50', '180', ''), E('-1.00', '-0.50', '180', '')]]],
  ];
  const P = pacs.map(([nombre, telefono, dni, ms], i) => {
    const p = { id: uid(), nombre, telefono, dni, creado: Date.now() - i, creadoF: ms[0][0], por: S[i % 2].id }; db.pacientes.push(p);
    ms.forEach(([fecha, od, oi]) => db.medidas.push({ id: uid(), pacienteId: p.id, fecha, od, oi, dip: String(60 + i), lente: num(od.add) ? 'Multifocal / Progresivo' : 'Monofocal', creado: Date.now(), por: S[i % 2].id }));
    return p;
  });
  const mk = (pi, fecha, items, estado, pagos, entrega) => {
    const o = { id: uid(), numero: db.config.nextOrden++, pacienteId: P[pi].id, medidaId: medidasDe(P[pi].id)[0]?.id || '', fecha, items, descuento: 0, entrega, estado, por: S[pi % 2].id, creado: Date.now(), notas: '' };
    db.ordenes.push(o);
    pagos.forEach(([f, monto, metodo, tipo], k) => db.pagos.push({ id: uid(), ordenId: o.id, fecha: f, monto, metodo, por: o.por, ts: Date.now() + k + db.pagos.length, tipo }));
    return o;
  };
  const it = (mi, ci) => [{ tipo: 'montura', ref: db.monturas[mi].id, desc: `Montura ${db.monturas[mi].codigo} · ${db.monturas[mi].marca} ${db.monturas[mi].modelo}`, cant: 1, precio: db.monturas[mi].precio },
    { tipo: 'cristal', ref: db.cristales[ci].id, desc: 'Cristales ' + db.cristales[ci].nombre, cant: 1, precio: db.cristales[ci].precio }];
  mk(2, addDays(d, -420), it(4, 1), 'entregado', [[addDays(d, -420), 270, 'Efectivo', 'abono']], addDays(d, -417));
  mk(4, addDays(d, -390), it(7, 5), 'entregado', [[addDays(d, -390), 600, 'Tarjeta', 'abono'], [addDays(d, -385), 570, 'Efectivo', 'saldo']], addDays(d, -385));
  mk(3, addDays(d, -30), it(2, 2), 'entregado', [[addDays(d, -30), 300, 'Yape', 'abono'], [addDays(d, -26), 110, 'Yape', 'saldo']], addDays(d, -26));
  mk(1, addDays(d, -1), it(3, 5), 'listo', [[addDays(d, -1), 500, 'Tarjeta', 'abono']], d);
  mk(0, addDays(d, -2), it(0, 2), 'pendiente', [[addDays(d, -2), 300, 'Yape', 'abono'], [d, 100, 'Efectivo', 'saldo']], addDays(d, 1));
  mk(5, d, it(5, 7), 'pendiente', [[d, 200, 'Efectivo', 'abono']], addDays(d, 3));
  mk(3, d, [{ tipo: 'otro', desc: 'Estuche + líquido limpiador', cant: 1, precio: 35 }], 'entregado', [[d, 35, 'Yape', 'abono']], d);
  db.gastos.push({ id: uid(), fecha: d, concepto: 'Laboratorio (bisel y armado)', monto: 60, metodo: 'Efectivo', por: S[0].id }, { id: uid(), fecha: d, concepto: 'Almuerzo', monto: 24, metodo: 'Efectivo', por: S[1].id },
    { id: uid(), fecha: addDays(d, -1), concepto: 'Luz', monto: 85, metodo: 'Yape', por: S[0].id });
  db.vales.push({ id: uid(), fecha: d, socioId: S[1].id, monto: 50, concepto: 'Adelanto', por: S[1].id });
  db.cierres.push({ fecha: addDays(d, -1), por: S[0].id, ts: Date.now() - 864e5 });
}

render();

// Instalable en el teléfono/tablet y funciona sin internet (solo cuando se sirve por https o localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !EN_CLAUDE) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
