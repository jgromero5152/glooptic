/* TerraÓptica — sistema para ópticas: pacientes, medidas, órdenes, inventario y caja diaria.
   Cada óptica tiene su cuenta; los datos viven en la nube (Firebase, ver nube.js) con copia en el equipo. */
'use strict';

// ---------- Utilidades ----------
const SOPORTE_WA = '51936156452'; // WhatsApp de TerraÓptica para activar planes y ayuda
// Registro libre de ópticas nuevas (con prueba gratis). Apagado por ahora: las cuentas las crea José desde su panel.
// Para abrirlo también hay que cambiar registroAbierto() en firestore.rules.
const REGISTRO_ABIERTO = false;
const METODOS = ['Efectivo', 'Yape', 'Plin', 'Tarjeta', 'Transferencia'];
const METODO_COLOR = { Efectivo: '#1baf7a', Tarjeta: '#eb6834', Yape: '#4a3aa7', Transferencia: '#eda100', Plin: '#2a78d6' };
// Orden para barras y donas: así dos colores parecidos nunca quedan juntos.
const METODOS_VIZ = ['Efectivo', 'Tarjeta', 'Yape', 'Transferencia', 'Plin'];
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
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  users: '<circle cx="10" cy="8" r="5"/><path d="M18 21a8 8 0 0 0-16 0"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  file: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  cash: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  bell: '<path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/><path d="M10.27 21a2 2 0 0 0 3.46 0M22 8c0-2.3-.8-4.3-2-6M4 2C2.8 3.7 2 5.7 2 8"/>',
  gear: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
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
  glasses: '<circle cx="6" cy="15" r="4"/><circle cx="18" cy="15" r="4"/><path d="M14 15a2 2 0 0 0-4 0"/><path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2M21.5 13 19 7c-.7-1.3-1.5-2-3-2"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bars: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  bag: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
};
const TILE = { inicio: '#1e4fea', pacientes: '#0891b2', ordenes: '#7c3aed', caja: '#059669', reportes: '#4f46e5', inventario: '#c026d3', recordatorios: '#e11d48', ajustes: '#475569', mas: '#475569' };
// Encabezado de la barra superior: [antetítulo, título] por sección.
const CABECERA = { inicio: ['Resumen del día', 'Inicio'], pacientes: ['Fichas y medidas', 'Pacientes'], paciente: ['Pacientes', 'Ficha del paciente'], ordenes: ['Laboratorio y entregas', 'Pedidos'], orden: ['Pedidos', 'Detalle del pedido'], 'nueva-orden': ['Vender', 'Nueva venta'], caja: ['Cobros y gastos', 'Caja del día'], reportes: ['Cómo va la óptica', 'Reportes'], inventario: ['Stock', 'Inventario'], recordatorios: ['Clientes para llamar', 'Recordatorios'], ajustes: ['Tu óptica', 'Ajustes'], aprobar: ['Autorización', 'Aprobar pedido'] };
const tile = (k, i) => `<span class="tile" style="--c:${TILE[k]}">${icon(i)}</span>`;
const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n] || ''}</svg>`;

// ---------- Datos ----------
const FACT_DEF = () => ({
  ruc: '', razon: '', direccion: '', distrito: '', provincia: '', departamento: '', email: '', web: '',
  igv: true, igvPct: 18, serieB: 'B001', numB: 1, serieF: 'F001', numF: 1, formato: 'A4', medida: true,
  pie: 'Gracias por su preferencia. Presente este documento para recoger sus lentes.', cuentas: '', logo: '', logoRatio: 1,
});
// Siglas con las que se describe cada montura: D.M FELL CU/C VER/RO = dama, metal, Fellis, cuadrada, completa, verde/rosa.
// Se pueden cambiar en Ajustes → Siglas del inventario.
const ABREV_DEF = () => ({
  genero: [['Dama', 'D'], ['Caballero', 'C'], ['Niño', 'N'], ['Unisex', 'U']],
  material: [['Metal', 'M'], ['Pasta', 'P'], ['TR90', 'TR'], ['Titanio', 'TI'], ['Mixta', 'MX']],
  forma: [['Cuadrada', 'CU'], ['Rectangular', 'REC'], ['Redonda', 'RE'], ['Ovalada', 'OV'], ['Aviador', 'AV'], ['Cat eye', 'CAT'], ['Hexagonal', 'HEX'], ['Mariposa', 'MAR']],
  aro: [['Completa', 'C'], ['Semi al aire', 'S/A'], ['Al aire', 'A/A']],
  color: [['Negro', 'NEG'], ['Blanco', 'BLA'], ['Gris', 'GRI'], ['Plateado', 'PLA'], ['Dorado', 'D'], ['Marrón', 'MAR'], ['Carey', 'CAR'], ['Azul', 'AZ'], ['Celeste', 'CEL'],
    ['Verde', 'VER'], ['Rosa', 'RO'], ['Rojo', 'ROJ'], ['Vino', 'VIN'], ['Morado', 'MOR'], ['Amarillo', 'AMA'], ['Nude', 'NUD'], ['Transparente', 'TRA']],
});
const ABREV_GRUPOS = [['genero', 'Para'], ['material', 'Material'], ['forma', 'Forma'], ['aro', 'Aro'], ['color', 'Colores']];
let db = null; // se llena con los datos de la nube al entrar a la cuenta
let user = null; // persona de la óptica que usa el sistema (sale del usuario con que se inició sesión)

// Una óptica nueva empieza sin listas de precios de lunas: cada una arma las suyas en Inventario.
function blank() {
  return {
    config: { nombre: '', ruc: '', direccion: '', telefono: '', recordatorioMeses: 12, nextOrden: 1, nextMontura: 1, socios: [], fact: FACT_DEF(), abrev: ABREV_DEF(), tarifasV: 1, productosV: 2, directaV: 1 },
    pacientes: [], medidas: [], monturas: [], cristales: [], tarifas: [], productos: productosDef(), anuladas: [], ordenes: [], pagos: [], gastos: [], vales: [], cierres: [], log: [], comprobantes: [], aprobaciones: [],
  };
}
// Completa los datos guardados con versiones anteriores del sistema.
function normDb(d) {
  d.config.fact = Object.assign(FACT_DEF(), d.config.fact || {});
  if (!d.config.fact.ruc && d.config.ruc) d.config.fact.ruc = d.config.ruc;
  if (!d.config.fact.direccion && d.config.direccion) d.config.fact.direccion = d.config.direccion;
  d.comprobantes = d.comprobantes || [];
  d.aprobaciones = d.aprobaciones || [];
  // La lista de precios de lunas se carga una sola vez; después solo la cambia el dueño.
  if (!d.config.tarifasV) { if (!d.tarifas || !d.tarifas.length) d.tarifas = tarifasDef(); d.config.tarifasV = 1; }
  d.tarifas = d.tarifas || [];
  if (!d.config.productosV) { if (!d.productos || !d.productos.length) d.productos = productosDef(); d.config.productosV = 1; }
  d.productos = d.productos || [];
  if (d.config.productosV < 2) { // Jorge pidió que se llamen "Accesorios"
    d.productos.forEach(p => { if (p.grupo === 'Repuestos') p.grupo = 'Accesorios'; if (p.id === 'luna-color' && p.nombre === 'Color de lunas completo') p.nombre = 'Color de lunas'; });
    d.config.productosV = 2;
  }
  d.anuladas = d.anuladas || [];
  // Las ventas directas (sin lunas) ya pagadas que quedaron "En laboratorio" pasan a entregadas.
  if (!d.config.directaV) {
    d.ordenes.forEach(o => {
      if (o.estado === 'entregado' || o.items.some(i => itemLab(i, d.monturas))) return;
      const tot = o.items.reduce((s, i) => s + num(i.cant) * num(i.precio), 0) - num(o.descuento);
      const pag = d.pagos.filter(p => p.ordenId === o.id).reduce((s, p) => s + num(p.monto), 0);
      if (tot - pag <= 0.009) Object.assign(o, { estado: 'entregado', entregado: o.fecha, directa: true });
    });
    d.config.directaV = 1;
  }
  const ab = ABREV_DEF(); d.config.abrev = Object.assign(ab, d.config.abrev || {});
  const deTabla = s => (ab.color.find(([n]) => n.toLowerCase() === s.toLowerCase()) || [s])[0];
  d.monturas.forEach(m => {
    if (!m.colores) m.colores = m.color ? String(m.color).split(/\s*(?:\/|,|\s+y\s+|\s+con\s+)\s*/i).map(s => s.trim()).filter(Boolean).map(deTabla) : [];
    if (m.material === 'Acetato') m.material = 'Pasta';
    if (m.material === 'Aire / al aire') { m.material = ''; m.aro = m.aro || 'Al aire'; }
  });
  // Roles (dueño, socio, vendedor): antes solo había socios.
  const S = d.config.socios || [];
  if (S.length && !S.some(x => x.id === d.config.duenoId)) d.config.duenoId = (S.find(x => /jorge/i.test(x.nombre)) || S[0]).id;
  S.forEach(x => { if (!x.rol) x.rol = x.id === d.config.duenoId ? 'dueno' : 'socio'; });
  return d;
}
// Lo que va al laboratorio: lunas, cristales y monturas ópticas (no lentes de sol ni accesorios).
function itemLab(i, monturas) {
  if (i.tipo === 'luna' || i.tipo === 'cristal') return true;
  if (i.tipo === 'montura') return (monturas.find(m => m.id === i.ref) || {}).clase !== 'sol';
  return i.tipo === 'otro' && /\b(lunas?|cristal|cristales|luna)\b/i.test(i.desc || '');
}
// Montos escritos como "S/ 150" o "150 soles" también valen.
const numPago = v => num(String(v ?? '').replace(/[^\d.,]/g, ''));
// ---------- Nube: cuenta de la óptica y sincronización ----------
// Cada registro (paciente, orden, pago…) se guarda aparte en la nube, repartido en varios documentos.
// Así dos equipos pueden trabajar a la vez sin pisarse: solo se sube lo que cambió.
const COLS = { pacientes: 16, medidas: 16, monturas: 16, ordenes: 16, pagos: 16, comprobantes: 16, gastos: 4, log: 4, anuladas: 4, vales: 2, cierres: 2, cristales: 2, aprobaciones: 2 };
const LISTAS = ['tarifas', 'productos']; // se guardan completas en el documento "listas"
let sesion = { cargando: true }; // { usuario, perfil, optica, error }
let quitarDatos = null;
let remoto = {};   // documento de la nube → { id: json }
let sinc = {};     // colección → { id: json } que la nube ya tiene (o que ya se envió)
let datosListos = false, permitirBorrado = false, pendienteRender = false, timerSubida = null, registrando = false;

const cubeta = (id, n) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0) % n; };
const docDe = (col, id) => col === 'config' || col === 'listas' ? col : `${col}~${cubeta(id, COLS[col])}`;
const colDeDoc = d => d.split('~')[0];
const ordenar = d => {
  for (const col in COLS) d[col].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  d.log.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  d.cierres.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
};
// Lo que hay ahora en el equipo, en el mismo formato que la nube.
function estadoLocal() {
  const out = { config: {}, listas: {} };
  for (const k in db.config) if (db.config[k] !== undefined) out.config[k] = JSON.stringify(db.config[k]);
  for (const k of LISTAS) out.listas[k] = JSON.stringify(db[k] || []);
  for (const col in COLS) { const m = out[col] = {}; for (const r of db[col] || []) { if (!r.id) r.id = uid(); m[r.id] = JSON.stringify(r); } }
  return out;
}
// Arma los datos completos a partir de lo que llegó de la nube (null si la óptica todavía no se configuró).
function dbDesdeRemoto() {
  const d = blank(), cfg = {};
  for (const col in COLS) d[col] = [];
  for (const docId in remoto) {
    const col = colDeDoc(docId), r = remoto[docId];
    for (const id in r) {
      let v; try { v = JSON.parse(r[id]); } catch (e) { continue; }
      if (col === 'config') cfg[id] = v; else if (col === 'listas') d[id] = v; else if (COLS[col]) d[col].push(v);
    }
  }
  if (!cfg.socios || !cfg.socios.length) return null;
  Object.assign(d.config, cfg);
  ordenar(d);
  return normDb(d);
}
function sincDesdeRemoto() {
  const s = {};
  for (const docId in remoto) { const col = colDeDoc(docId); s[col] = s[col] || {}; Object.assign(s[col], remoto[docId]); }
  return s;
}
// Guarda: se junta lo que cambió y se sube en un momento (la nube también lo guarda en el equipo si no hay internet).
function save() {
  if (!db || !datosListos) return;
  if (soloLectura()) { toast(avisoPlan().corto); restaurarDesdeNube(); return; }
  clearTimeout(timerSubida); timerSubida = setTimeout(subir, 300);
}
function subir() {
  clearTimeout(timerSubida); timerSubida = null;
  if (!db || !datosListos || !sesion.optica || soloLectura()) return;
  const loc = estadoLocal();
  let cambios = [];
  for (const col in loc) {
    const s = sinc[col] || {}, l = loc[col];
    for (const id in l) if (s[id] !== l[id]) cambios.push({ col, id, doc: docDe(col, id), json: l[id] });
    for (const id in s) if (!(id in l)) cambios.push({ col, id, doc: docDe(col, id), json: null });
  }
  if (!cambios.length) return;
  // Freno de seguridad: nunca se borran muchos registros de golpe, salvo "Empezar de cero" o "Restaurar respaldo".
  const borrados = cambios.filter(c => c.json == null).length;
  if (borrados > 25 && !permitirBorrado) {
    alert(`Se evitó borrar ${borrados} registros de golpe. Tus datos siguen guardados en la nube.\n\nSi querías borrarlo todo, usa Ajustes → Empezar de cero.`);
    restaurarDesdeNube(); return;
  }
  permitirBorrado = false;
  // Cada documento de la nube aguanta hasta 1 MB: se avisa antes de llegar al límite.
  const pesos = {};
  for (const col in loc) for (const id in loc[col]) { const d = docDe(col, id); pesos[d] = (pesos[d] || 0) + loc[col][id].length + id.length + 8; }
  const lleno = [...new Set(cambios.map(c => c.doc))].find(d => pesos[d] > 950000);
  if (lleno) { alert('No se pudo guardar: una parte de tus datos llegó al límite de espacio. Escríbenos por WhatsApp para ampliarlo.'); restaurarDesdeNube(); return; }
  cambios.forEach(c => { const s = sinc[c.col] || (sinc[c.col] = {}); if (c.json == null) delete s[c.id]; else s[c.id] = c.json; });
  // Devuelve la subida (true cuando la nube la recibió), para quien necesite esperarla.
  return Nube.escribir(sesion.optica.id, cambios).then(() => true, e => { toast('No se pudo guardar en la nube: ' + Nube.mensaje(e)); return false; });
}
// Vuelve a lo que dice la nube (se usa si un cambio no se puede guardar).
function restaurarDesdeNube() { db = dbDesdeRemoto(); sinc = sincDesdeRemoto(); render(); }
// Cambia un objeto por otro sin perder la referencia (los formularios abiertos siguen apuntando al mismo).
function reemplazar(dest, src) {
  if (Array.isArray(dest) && Array.isArray(src)) { dest.splice(0, dest.length, ...src); return dest; }
  for (const k of Object.keys(dest)) if (!(k in src)) delete dest[k];
  return Object.assign(dest, src);
}
// Llegan cambios de la nube (de este u otro equipo).
function recibirDatos(cambios, meta) {
  const antes = {};
  for (const c of cambios) { antes[c.id] = remoto[c.id] || {}; if (c.tipo === 'removed') delete remoto[c.id]; else remoto[c.id] = c.r; }
  if (!datosListos) {
    if (meta.desdeCache && !meta.total) return; // todavía no llegó nada del servidor
    datosListos = true; db = dbDesdeRemoto(); sinc = sincDesdeRemoto();
    if (db) subir(); // sube lo que normDb haya completado
    render(); return;
  }
  if (!db) { db = dbDesdeRemoto(); sinc = sincDesdeRemoto(); if (db) render(); return; }
  const loc = estadoLocal(); let hubo = false;
  for (const c of cambios) {
    const col = colDeDoc(c.id), prev = antes[c.id], next = remoto[c.id] || {};
    for (const id of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      const j = next[id] ?? null, s = sinc[col] || (sinc[col] = {});
      if ((s[id] ?? null) === j) continue; // ya lo teníamos (por ejemplo, lo que acabamos de subir)
      if ((loc[col]?.[id] ?? null) !== (s[id] ?? null)) continue; // hay un cambio local sin subir: gana el local
      if (j == null) delete s[id]; else s[id] = j;
      aplicar(col, id, j == null ? null : JSON.parse(j)); hubo = true;
    }
  }
  if (hubo) { ordenar(db); pintarSiSeguro(); }
}
function aplicar(col, id, v) {
  if (col === 'config') { if (v == null) delete db.config[id]; else if (v && typeof v === 'object' && db.config[id] && typeof db.config[id] === 'object') reemplazar(db.config[id], v); else db.config[id] = v; return; }
  if (col === 'listas') { if (Array.isArray(db[id]) && Array.isArray(v)) reemplazar(db[id], v); else db[id] = v || []; return; }
  if (!COLS[col]) return;
  const arr = db[col], i = arr.findIndex(r => r.id === id);
  if (v == null) { if (i >= 0) arr.splice(i, 1); } else if (i >= 0) reemplazar(arr[i], v); else arr.push(v);
}
// No se redibuja mientras alguien escribe o tiene una ventana abierta; se hace después.
function pintarSiSeguro() {
  const a = document.activeElement, escribiendo = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if ($('.modal-bg') || escribiendo || /^\/?(nueva-orden|ajustes)/.test(route)) { pendienteRender = true; return; }
  pendienteRender = false; render();
}
setInterval(() => { if (pendienteRender) pintarSiSeguro(); }, 4000);
addEventListener('pagehide', () => subir());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') subir(); });

// Estado del plan de la óptica.
const diasPlan = () => Math.ceil(((sesion.optica?.vence || 0) - Date.now()) / 864e5);
const soloLectura = () => { const o = sesion.optica; return !o || o.estado === 'bloqueada' || o.estado === 'vencida' || (o.vence || 0) < Date.now(); };
function avisoPlan() {
  const o = sesion.optica || {}, d = diasPlan(), vence = o.vence ? fdate(ymd(new Date(o.vence))) : '—';
  const gratis = o.plan === 'gratis';
  if (soloLectura()) return { tipo: 'mal', corto: 'Tu plan venció: puedes ver tus datos, pero no registrar cambios.', largo: `Tu ${gratis ? 'acceso gratis' : o.estado === 'prueba' ? 'prueba gratis' : 'plan'} venció el ${vence}. Puedes ver todos tus datos, pero para registrar ventas y cambios hay que activar el plan.` };
  if (o.estado === 'prueba' && gratis) return { tipo: d <= 5 ? 'warn' : 'info', corto: `Gratis hasta el ${vence}`, largo: `Tienes TerraÓptica gratis, con todas las funciones, hasta el ${vence}.` };
  if (o.estado === 'prueba') return { tipo: d <= 5 ? 'warn' : 'info', corto: `Prueba gratis: ${d === 1 ? 'queda 1 día' : `quedan ${d} días`}`, largo: `Estás usando la prueba gratis de TerraÓptica. ${d === 1 ? 'Queda 1 día' : `Quedan ${d} días`} (hasta el ${vence}).` };
  return { tipo: d <= 5 ? 'warn' : 'ok', corto: `Plan activo hasta el ${vence}`, largo: `Tu plan está activo hasta el ${vence}.` };
}
const waSoporte = txt => waLink(SOPORTE_WA, txt);
// Aviso en Inicio: solo cuando hace falta (prueba, por vencer o vencido).
function avisoSuscripcion() {
  const a = avisoPlan();
  if (a.tipo === 'ok') return '';
  const txt = `Hola, quiero activar TerraÓptica para mi óptica ${db.config.nombre || sesion.optica?.nombre || ''}.`;
  return `<div class="plan-note ${a.tipo}">${icon(a.tipo === 'mal' ? 'lock' : 'clock')}<div class="grow"><b>${esc(a.corto)}</b>${a.tipo !== 'info' ? `<br>${esc(a.largo)}` : ''}</div>
    <a class="btn sm ${a.tipo === 'info' ? '' : 'primary'}" href="${waSoporte(txt)}" target="_blank" rel="noopener">Activar mi plan</a></div>`;
}
// Respaldo manual: el archivo va como .txt para que el celular deje enviarlo por WhatsApp (no acepta .json); adentro es el mismo JSON.
const nombreRespaldo = ext => `respaldo-${(db.config.nombre || 'optica').toLowerCase().replace(/\s+/g, '-')}-${hoy()}.${ext}`;
const respaldoHecho = () => { db.config.ultimoRespaldo = Date.now(); save(); render(); };
async function descargarRespaldo() { if (await saveFile(nombreRespaldo('json'), JSON.stringify(db))) respaldoHecho(); }
const socio = id => db.config.socios.find(s => s.id === id);
const socioName = id => socio(id)?.nombre || '—';
const me = () => { const s = socio(user); return s && !s.baja ? s : null; };
// Roles: el dueño puede todo, el socio casi todo y el vendedor lo necesario para atender.
const ROLES = { dueno: 'Dueño', socio: 'Socio', vendedor: 'Vendedor' };
const activos = () => db.config.socios.filter(s => !s.baja);
const socioRol = s => !s ? 'vendedor' : s.id === dueno()?.id ? 'dueno' : s.rol === 'vendedor' ? 'vendedor' : 'socio';
const miRol = () => socioRol(me());
// Dueño y socios: autorizan los cambios delicados con su clave y se reparten la ganancia.
const autorizantes = () => activos().filter(s => socioRol(s) !== 'vendedor');
// Permisos que el dueño puede dar o quitar a cada persona. Lo que no está aquí lo hace todo el mundo
// (pacientes, ventas, cobros, caja del día, agregar mercadería). Crear usuarios, la clave del dueño,
// restaurar respaldo y empezar de cero son solo del dueño y no se pueden dar.
const PERMISOS = [
  ['Caja y dinero', [
    ['descuentos', 'Dar descuentos y cambiar precios en la venta'],
    ['gastos', 'Anotar y ver gastos'],
    ['vales', 'Anotar vales de los socios'],
    ['cerrarCaja', 'Cerrar la caja del día'],
    ['otrosDias', 'Ver la caja de otros días'],
    ['ganancias', 'Ver la ganancia y el reparto entre socios'],
    ['excel', 'Descargar la caja para Excel'],
    ['reportes', 'Ver reportes'],
  ]],
  ['Inventario y precios', [
    ['costos', 'Ver lo que cuesta cada producto'],
    ['editarInventario', 'Editar o borrar monturas y restar stock'],
    ['precios', 'Cambiar precios de accesorios y lunas sin pedir la clave del dueño'],
    ['anular', 'Anular ventas sin pedir la clave del dueño'],
  ]],
  ['Ajustes', [
    ['ajustes', 'Entrar a Ajustes (datos de la óptica, boletas y siglas)'],
  ]],
];
const PERMISO_KEYS = PERMISOS.flatMap(([, l]) => l.map(([k]) => k));
// Lo que trae cada rol si el dueño no marcó los permisos uno por uno.
const PERMISOS_ROL = {
  socio: PERMISO_KEYS.filter(k => !['ajustes', 'precios', 'anular'].includes(k)),
  vendedor: [],
};
const permisosDe = s => socioRol(s) === 'dueno' ? PERMISO_KEYS : Array.isArray(s?.permisos) ? s.permisos : PERMISOS_ROL[socioRol(s)];
const puede = accion => !PERMISO_KEYS.includes(accion) || permisosDe(me()).includes(accion);
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

// ---------- Búsqueda por DNI o RUC ----------
// Nombres en mayúsculas (como vienen de RENIEC) → "Juan Pérez".
const tituloNombre = t => String(t || '').toLowerCase().replace(/(^|[\s'-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase());
// Al completar los 8 números del DNI (u 11 del RUC) se llenan solos el nombre y, con RUC, la dirección.
// Primero se mira si ya es paciente (no gasta consulta); si no, se busca en la nube. Nunca pisa lo que ya se escribió a mano.
function enlazarDoc(fDoc, fNom, fDir, { mayus = false } = {}) {
  if (!fDoc) return;
  const aviso = document.createElement('div'); aviso.className = 'hint'; aviso.style.margin = '4px 0 0';
  fDoc.insertAdjacentElement('afterend', aviso);
  let ultimo = '', autoNom = '', autoDir = '';
  const poner = (campo, valor, previo) => { if (campo && (!campo.value.trim() || campo.value === previo)) campo.value = valor; return valor; };
  fDoc.addEventListener('input', async () => {
    const n = fDoc.value.replace(/\D/g, ''), tipo = n.length === 8 ? 'dni' : n.length === 11 ? 'ruc' : '';
    if (!tipo || n === ultimo) { if (!tipo) aviso.textContent = ''; return; }
    ultimo = n;
    // Lo que se llenó solo con el número anterior se borra; lo escrito a mano se respeta.
    if (fNom && autoNom && fNom.value === autoNom) fNom.value = '';
    if (fDir && autoDir && fDir.value === autoDir) fDir.value = '';
    autoNom = autoDir = '';
    const ya = tipo === 'dni' && db.pacientes.find(p => String(p.dni || '') === n);
    if (ya) { autoNom = poner(fNom, mayus ? ya.nombre.toUpperCase() : ya.nombre, autoNom); aviso.innerHTML = `Ya es paciente: <b>${esc(ya.nombre)}</b>`; return; }
    if (!Nube.CONSULTAS) return;
    aviso.textContent = 'Buscando…';
    try {
      const d = await Nube.consultarDoc(tipo, n);
      if (fDoc.value.replace(/\D/g, '') !== n) return;
      const nom = tipo === 'dni' && !mayus ? tituloNombre(d.nombre) : d.nombre;
      autoNom = poner(fNom, nom, autoNom);
      if (tipo === 'ruc') autoDir = poner(fDir, [d.direccion, d.distrito, d.provincia].filter(x => x && x !== '-').join(', '), autoDir);
      aviso.innerHTML = `${icon('check')} ${esc(nom)}${tipo === 'ruc' && d.estado && d.estado !== 'ACTIVO' ? ` · <span style="color:var(--danger)">RUC ${esc(d.estado.toLowerCase())}</span>` : ''}`;
    } catch (e) { if (fDoc.value.replace(/\D/g, '') === n) aviso.textContent = e.message; }
  });
}

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

// Autorización con la clave del dueño y los socios para cambios delicados (los vendedores no autorizan).
function dual(motivo, cb) {
  const socios = autorizantes();
  if (socios.length < 2 && socios.some(s => s.id === user)) { cb(); return; }
  modal({
    title: 'Autorización',
    body: `<div class="lock-note">${icon('lock')}<div><b>${esc(motivo)}</b><br>Este cambio necesita la clave de ${socios.length === 1 ? esc(socios[0].nombre) : socios.length === 2 ? 'los dos socios' : 'el dueño y los socios'}.</div></div>
      <div class="form">${socios.map(s => `<div><label class="f" data-fila="${s.id}">Clave de ${esc(s.nombre)}<input class="inp pin" type="password" inputmode="numeric" autocomplete="off" data-s="${s.id}" maxlength="8"></label>${s.id === user ? '' : botonRemoto(s)}</div>`).join('')}
      <div class="err" id="derr"></div></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="dok">${icon('unlock')} Autorizar</button>`,
    onMount: bg => {
      const listo = () => { closeModal(); remoto.usar(); addLog(motivo + remoto.texto(), socios.map(s => s.id)); cb(); };
      const remoto = esperarRemoto(bg, motivo, () => { if ($$('[data-s]', bg).every(i => remoto.ok.has(i.dataset.s))) listo(); });
      const go = () => {
        const bad = $$('[data-s]', bg).filter(i => !remoto.ok.has(i.dataset.s) && hashPin(i.value) !== socio(i.dataset.s).pin);
        if (bad.length) { $('#derr', bg).textContent = 'Clave incorrecta de ' + bad.map(i => socioName(i.dataset.s)).join(' y '); return; }
        listo();
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
// El enlace que llega por WhatsApp para aprobar trae ?aprobar=… : se abre directo ese pedido.
(() => { try { const q = new URLSearchParams(location.search), a = q.get('aprobar'); if (a) { route = '/aprobar/' + a; q.delete('aprobar'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); } } catch (e) { } })();
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
  pendienteRender = false;
  if (!window.Nube || sesion.cargando || registrando) { root.innerHTML = esperaView('Abriendo TerraÓptica…'); return; }
  if (!sesion.usuario) { root.innerHTML = cuentaView(); bindCuenta(); return; }
  if (!sesion.optica) { root.innerHTML = sinOpticaView(); bindSinOptica(); return; }
  if (sesion.optica.estado === 'bloqueada') { root.innerHTML = bloqueadaView(); bindSinOptica(); return; }
  if (!datosListos) { root.innerHTML = esperaView('Cargando los datos de tu óptica…', true); return; }
  const esDuenoCuenta = sesion.perfil?.rol === 'dueno';
  if (!db) { if (esDuenoCuenta && hayDatosCelular() && !estadoSubida(sesion.optica.id)) { root.innerHTML = subidaInicialView(); bindSubidaInicial(); } else if (esDuenoCuenta) { root.innerHTML = setupView(); bindSetup(); } else { root.innerHTML = avisoCuentaView('Tu óptica todavía no está lista', 'El dueño tiene que entrar primero y configurarla.'); bindAvisoCuenta(); } return; }
  const antes = user; user = personaDeSesion();
  if (user !== antes) ajustesAbierto = false;
  if (!me()) { root.innerHTML = avisoCuentaView('Sin acceso', 'Tu usuario ya no tiene acceso a esta óptica. Si crees que es un error, habla con el dueño.'); bindAvisoCuenta(); return; }
  if (socioRol(me()) !== 'vendedor' && !me().pin) { root.innerHTML = claveView(); bindClave(); return; }
  const [path, qs] = route.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs || '');
  const key = parts[0] || 'inicio';
  const view = (puede(key) && routes[key]) || routes.inicio;
  if (key !== 'ajustes') ajustesAbierto = false; // al salir de Ajustes se vuelve a cerrar
  root.innerHTML = shell(key, view.html(parts[1], q));
  bindShell();
  view.bind && view.bind(parts[1], q);
  if (route !== lastRoute) { window.scrollTo(0, 0); lastRoute = route; }
  // Una vez por sesión: si este celular tiene datos de Glooptic que no se subieron, se ofrece subirlos.
  if (!subidaOfrecida && !subiendoCelular && !estadoSubida(sesion.optica.id) && hayDatosCelular()) { subidaOfrecida = true; setTimeout(() => { if (!$('.modal-bg')) ofrecerSubida(); }, 400); }
}

function shell(key, content) {
  const nav = [
    ['inicio', 'Inicio', 'home'], ['ordenes', 'Pedidos', 'board'], ['pacientes', 'Pacientes', 'users'], ['inventario', 'Inventario', 'glasses'],
    ['caja', 'Caja del día', 'cash'], ['reportes', 'Reportes', 'bars'], ['recordatorios', 'Recordatorios', 'bell'], ['ajustes', 'Ajustes', 'gear'],
  ];
  const recs = recordatoriosData().total;
  const pend = db.ordenes.filter(o => o.estado !== 'entregado').length, atr = db.ordenes.filter(diasAtraso).length;
  const badge = k => k === 'recordatorios' && recs ? `<span class="badge">${recs}</span>` : k === 'ordenes' && atr ? `<span class="badge red">${atr} ${atr === 1 ? 'atrasado' : 'atrasados'}</span>` : k === 'ordenes' && pend ? `<span class="badge">${pend}</span>` : '';
  const [cabE, cabT] = CABECERA[key] || ['', ''];
  const active = k => (k === key || (k === 'pacientes' && key === 'paciente') || (k === 'ordenes' && key === 'orden')) ? 'on' : '';
  const u = me();
  return `<div class="app">
    <aside class="side">
      <div class="brand"><div class="logo"><img src="logo-mark.png" alt=""></div><div><b>${esc(db.config.nombre || 'Mi Óptica')}</b><small>TerraÓptica</small></div></div>
      <a class="side-sell" href="#/nueva-orden">${icon('bag')}<span>Nueva venta</span></a>
      <nav class="nav">${nav.filter(([k]) => puede(k)).map(([k, t, i]) => `<a href="#/${k}" class="${active(k)}">${tile(k, i)}<span>${t}</span>${badge(k)}</a>`).join('')}</nav>
      <div class="me"><div class="avatar">${initials(u.nombre)}</div><div><b>${esc(u.nombre)}</b><small>${ROLES[miRol()]}</small></div><button id="miclave" title="Cambiar mi contraseña">${icon('lock')}</button><button id="logout" title="Cerrar sesión">${icon('logout')}</button></div>
    </aside>
    <div class="main">
      <header class="top">
        <div class="top-l"><span class="top-logo"><img src="logo-mark.png" alt=""></span><div class="top-tt"><div class="top-eb" style="--c:${TILE[key] || TILE[{ paciente: 'pacientes', orden: 'ordenes', 'nueva-orden': 'ordenes' }[key]] || TILE.inicio}">${esc(cabE)}</div><div class="top-t">${esc(cabT)}</div></div></div>
        <div class="search">${icon('search')}<input id="gsearch" placeholder="Buscar paciente, teléfono o N° de orden…" autocomplete="off"><div class="sr" id="gres" hidden></div></div>
        <div class="date cap">${flong(hoy())}</div>
        <button class="btn ghost icon bsearch" id="bsearch" title="Buscar">${icon('search')}</button>
        <button class="btn ghost icon me-m" id="logout2" title="Salir">${icon('logout')}</button>
      </header>
      <main class="content">${avisoAprobaciones(key)}${content}</main>
    </div>
    <nav class="mobile-bar">${[nav[0], nav[1], ['vender', 'Vender', 'bag'], nav[2], ['mas', 'Más', 'apps']].map(([k, t, i]) => k === 'vender'
      ? `<a href="#/nueva-orden" class="vender ${key === 'nueva-orden' ? 'on' : ''}"><span class="fab">${icon('bag')}</span><span>${t}</span></a>`
      : `<a href="${k === 'mas' ? '#' : '#/' + k}" ${k === 'mas' ? 'id="mas"' : ''} class="${active(k)}">${icon(i)}<span>${t}</span>${k === 'mas' && recs ? `<span class="badge">${recs}</span>` : k === 'ordenes' && (atr || pend) ? `<span class="badge ${atr ? 'red' : ''}">${atr || pend}</span>` : ''}</a>`).join('')}</nav>
  </div>`;
}

// Cada persona cambia la contraseña con la que entra (así nadie más la conoce, ni quien le creó la cuenta).
function cambiarClaveForm() {
  modal({
    title: 'Cambiar mi contraseña',
    body: `<form id="ccf" class="form"><p class="muted small" style="margin:0">Es la contraseña con la que entras a TerraÓptica. Después de cambiarla, solo tú la sabrás.</p>
      <label class="f">Contraseña actual<input class="inp" type="password" name="actual" autocomplete="current-password" required></label>
      <label class="f">Contraseña nueva<input class="inp" type="password" name="nueva" autocomplete="new-password" minlength="6" required placeholder="Mínimo 6 caracteres"></label>
      <label class="f">Repite la contraseña nueva<input class="inp" type="password" name="nueva2" autocomplete="new-password" minlength="6" required></label>
      <div class="err" id="ccerr"></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="ccf" id="ccok">${icon('lock')} Cambiar contraseña</button>`,
    onMount: bg => {
      $('#ccf', bg).onsubmit = async e => {
        e.preventDefault();
        const f = readForm(e.target), err = $('#ccerr', bg), btn = $('#ccok', bg);
        if (f.nueva.length < 6) { err.textContent = 'La contraseña nueva debe tener al menos 6 caracteres.'; return; }
        if (f.nueva !== f.nueva2) { err.textContent = 'Las dos contraseñas nuevas no son iguales.'; return; }
        if (f.nueva === f.actual) { err.textContent = 'La nueva tiene que ser distinta de la actual.'; return; }
        btn.disabled = true; err.textContent = '';
        try { await Nube.cambiarClave(f.actual, f.nueva); closeModal(); toast('Listo: tu contraseña cambió. La próxima vez entra con la nueva.'); }
        catch (x) { btn.disabled = false; err.textContent = x.code === 'auth/invalid-credential' || x.code === 'auth/wrong-password' ? 'La contraseña actual no es correcta.' : Nube.mensaje(x); }
      };
    },
  });
}
function bindShell() {
  const out = salirDeCuenta;
  $('#logout').onclick = out; $('#logout2').onclick = out; $('#miclave').onclick = cambiarClaveForm;
  $('#mas').onclick = e => {
    e.preventDefault();
    modal({ title: 'Más opciones', body: `<div class="card" style="box-shadow:none">${[['inventario', 'Inventario', 'glasses'], ['caja', 'Caja del día', 'cash'], ['reportes', 'Reportes', 'bars'], ['recordatorios', 'Recordatorios', 'bell'], ['ajustes', 'Ajustes', 'gear']]
      .filter(([k]) => puede(k)).map(([k, t, i]) => `<a class="list-item link" href="#/${k}" data-close>${tile(k, i)}<span class="grow t">${t}</span></a>`).join('')}
      <a class="list-item link" href="#" id="clave3"><span class="tile" style="--c:#475569">${icon('lock')}</span><span class="grow t">Cambiar mi contraseña</span></a>
      <a class="list-item link" href="#" id="out3"><span class="tile" style="--c:#98a2b3">${icon('logout')}</span><span class="grow t">Cerrar sesión</span></a></div>`,
      onMount: bg => { $$('a[data-close]', bg).forEach(a => a.onclick = closeModal); $('#out3', bg).onclick = e => { e.preventDefault(); closeModal(); out(); }; $('#clave3', bg).onclick = e => { e.preventDefault(); cambiarClaveForm(); }; } });
  };
  const inp = $('#gsearch'), res = $('#gres');
  $('#bsearch').onclick = () => { $('.top').classList.add('buscando'); inp.focus(); };
  inp.addEventListener('blur', () => setTimeout(() => { if (!inp.value) $('.top')?.classList.remove('buscando'); }, 200));
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

// ---------- Cuenta de TerraÓptica (correo y clave) ----------
const marcaTO = `<div class="to-brand"><img src="logo-mark.png" alt=""><span>Terra<b>Óptica</b></span></div>`;
function esperaView(txt, red) {
  return `<div class="login"><div class="box" style="text-align:center">${marcaTO}<div class="spin"></div><p class="muted" style="margin:14px 0 0">${esc(txt)}</p>
    ${red ? `<p class="hint" style="margin-top:10px">La primera vez en este equipo necesitas internet.</p>` : ''}</div></div>`;
}
let modoCuenta = 'ingresar';
function cuentaView() {
  const m = REGISTRO_ABIERTO || modoCuenta !== 'registrar' ? modoCuenta : 'ingresar';
  const tabs = !REGISTRO_ABIERTO ? '' : `<div class="seg to-tabs"><button type="button" data-mc="ingresar" class="${m === 'ingresar' ? 'on' : ''}">Ingresar</button><button type="button" data-mc="registrar" class="${m === 'registrar' ? 'on' : ''}">Crear cuenta</button></div>`;
  let body;
  if (m === 'registrar') body = `<p class="muted" style="margin:0 0 16px">Prueba TerraÓptica gratis por ${Nube.DIAS_PRUEBA} días. No pedimos tarjeta.</p>
    <form id="cuenta" class="form">
      <label class="f">Nombre de tu óptica<input class="inp" name="optica" required autocomplete="organization"></label>
      <div class="fg"><label class="f">Tu nombre<input class="inp" name="nombre" required autocomplete="name"></label>
      <label class="f">Celular (WhatsApp)<input class="inp" name="telefono" inputmode="tel" required autocomplete="tel"></label></div>
      <label class="f">Correo<input class="inp" name="correo" type="email" required autocomplete="email"></label>
      <label class="f">Crea una clave<input class="inp" name="clave" type="password" required minlength="6" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></label>
      <div class="err" id="cerr"></div><button class="btn primary" style="padding:12px">Crear mi cuenta</button></form>`;
  else if (m === 'recuperar') body = `<p class="muted" style="margin:0 0 16px">Escribe tu usuario o el correo de tu cuenta y te enviaremos un enlace a tu correo para crear una clave nueva.</p>
    <form id="cuenta" class="form"><label class="f">Usuario o correo<input class="inp" name="correo" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
      <div class="err" id="cerr"></div><button class="btn primary" style="padding:12px">Enviar enlace</button>
      <button type="button" class="btn ghost" data-mc="ingresar">Volver</button></form>`;
  else body = `<form id="cuenta" class="form">
      <label class="f">Usuario o correo<input class="inp" name="correo" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
      <label class="f">Clave<input class="inp" name="clave" type="password" required autocomplete="current-password"></label>
      <div class="err" id="cerr"></div><button class="btn primary" style="padding:12px">Ingresar</button>
      <button type="button" class="btn ghost sm" data-mc="recuperar">Olvidé mi clave</button></form>
      ${REGISTRO_ABIERTO ? '' : `<p class="hint" style="margin:16px 0 0;text-align:center">¿Quieres usar TerraÓptica en tu óptica? <a href="${waSoporte('Hola, quiero usar TerraÓptica en mi óptica.')}" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">Escríbenos por WhatsApp</a></p>`}`;
  return `<div class="login"><div class="box">${marcaTO}<h1 style="margin-top:4px">${m === 'registrar' ? 'Crea la cuenta de tu óptica' : m === 'recuperar' ? 'Recuperar clave' : 'Bienvenido'}</h1>
    ${m === 'recuperar' ? '' : `<p class="muted" style="margin:6px 0 18px">El sistema para tu óptica: pacientes, ventas, caja e inventario.</p>`}
    ${m === 'recuperar' ? '' : tabs}${body}</div></div>`;
}
function bindCuenta() {
  $$('[data-mc]').forEach(b => b.onclick = () => { modoCuenta = b.dataset.mc; render(); });
  const f = $('#cuenta'); $('input', f).focus();
  f.onsubmit = async e => {
    e.preventDefault();
    const v = readForm(f), btn = $('button.primary', f), err = $('#cerr');
    err.textContent = ''; btn.disabled = true;
    try {
      if (modoCuenta === 'recuperar') {
        await Nube.recuperar(v.correo);
        toast('Te enviamos el enlace. Revisa tu correo (y la carpeta de spam).'); modoCuenta = 'ingresar'; render(); return;
      }
      if (modoCuenta === 'registrar') {
        registrando = true; render();
        await Nube.registrar({ correo: v.correo, clave: v.clave, nombre: v.nombre.trim(), optica: v.optica.trim(), telefono: v.telefono.trim() });
        registrando = false; await Nube.refrescar(); return;
      }
      await Nube.ingresar(v.correo, v.clave);
    } catch (x) {
      const fue = registrando; registrando = false;
      if (fue) { render(); $('#cerr').textContent = Nube.mensaje(x); return; }
      err.textContent = Nube.mensaje(x); btn.disabled = false;
    }
  };
}
function sinOpticaView() {
  // Cuenta sin óptica (por ejemplo, si el registro se cortó): puede terminar de crearla.
  if (REGISTRO_ABIERTO && !sesion.error && !sesion.perfil) return `<div class="login"><div class="box">${marcaTO}<h1>Termina de crear tu óptica</h1>
    <p class="muted" style="margin:6px 0 18px">Tu cuenta ${esc(sesion.usuario.email)} está lista. Solo falta tu óptica: tendrás ${Nube.DIAS_PRUEBA} días de prueba gratis.</p>
    <form id="copt" class="form"><label class="f">Nombre de tu óptica<input class="inp" name="optica" required></label>
      <div class="fg"><label class="f">Tu nombre<input class="inp" name="nombre" required></label><label class="f">Celular (WhatsApp)<input class="inp" name="telefono" inputmode="tel" required></label></div>
      <div class="err" id="cerr"></div><button class="btn primary" style="padding:12px">Crear mi óptica</button>
      <button type="button" class="btn ghost" id="csalir">Salir de la cuenta</button></form></div></div>`;
  return `<div class="login"><div class="box">${marcaTO}<h1>No encontramos tu óptica</h1>
    <p class="muted" style="margin:8px 0 18px">${sesion.error ? esc(sesion.error) : `La cuenta ${esc(sesion.usuario.email)} no está vinculada a ninguna óptica.`} Si crees que es un error, escríbenos.</p>
    <div class="actions"><a class="btn primary" href="${waSoporte('Hola, no puedo entrar a mi óptica en TerraÓptica. Mi correo es ' + sesion.usuario.email)}" target="_blank" rel="noopener">Escribir por WhatsApp</a>
    <button class="btn" id="csalir">Salir de la cuenta</button></div></div></div>`;
}
function bloqueadaView() {
  return `<div class="login"><div class="box">${marcaTO}<h1>Cuenta suspendida</h1>
    <p class="muted" style="margin:8px 0 18px">El acceso de ${esc(sesion.optica.nombre || 'tu óptica')} está suspendido. Tus datos siguen guardados y no se borra nada. Escríbenos para reactivarla.</p>
    <div class="actions"><a class="btn primary" href="${waSoporte('Hola, quiero reactivar mi óptica ' + (sesion.optica.nombre || '') + ' en TerraÓptica.')}" target="_blank" rel="noopener">Escribir por WhatsApp</a>
    <button class="btn" id="csalir">Salir de la cuenta</button></div></div></div>`;
}
function bindSinOptica() {
  $('#csalir').onclick = () => Nube.salir();
  const f = $('#copt'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault();
    const v = readForm(f), btn = $('button.primary', f); btn.disabled = true;
    try { await Nube.crearOptica(v); await Nube.refrescar(); }
    catch (x) { $('#cerr').textContent = Nube.mensaje(x); btn.disabled = false; }
  };
}
// Cierra la sesión de la cuenta en este equipo (los datos quedan en la nube).
function salirDeCuenta() {
  confirmBox(`¿Cerrar la sesión de <b>${esc(me()?.nombre || sesion.perfil?.usuario || sesion.usuario?.email || '')}</b> en este equipo? Los datos quedan guardados en la nube.`, async () => {
    subir(); user = null; await Nube.salir();
  }, 'Cerrar sesión');
}
// Persona de la óptica que corresponde al usuario con que se entró: el dueño, o la persona a la que el dueño le creó el usuario.
function personaDeSesion() {
  const p = sesion.perfil || {};
  if (p.rol === 'dueno') return dueno()?.id || null;
  const s = p.personaId && socio(p.personaId);
  return s && !s.baja ? s.id : null;
}
function avisoCuentaView(titulo, texto) {
  return `<div class="login"><div class="box">${marcaTO}<h1>${esc(titulo)}</h1>
    <p class="muted" style="margin:8px 0 18px">${esc(texto)}</p>
    <button class="btn" id="csalir">Cerrar sesión</button></div></div>`;
}
function bindAvisoCuenta() { $('#csalir').onclick = () => Nube.salir(); }
// Dueño y socios necesitan una clave de números para autorizar cambios delicados: la crean la primera vez que entran.
function claveView() {
  return `<div class="login"><div class="box">${marcaTO}<h1>Hola, ${esc(me().nombre)}</h1>
    <p class="muted" style="margin:8px 0 18px">Crea tu clave de autorización: son 4 a 8 números que se piden para aprobar cambios delicados, como anular una venta. No se la digas a nadie.</p>
    <form id="fclave" class="form"><label class="f">Tu clave<input class="inp pin" name="p1" type="password" inputmode="numeric" required pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off"></label>
      <label class="f">Repítela<input class="inp pin" name="p2" type="password" inputmode="numeric" required pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off"></label>
      <div class="err" id="clerr"></div><button class="btn primary" style="padding:12px">Guardar clave</button>
      <button type="button" class="btn ghost sm" id="csalir">Cerrar sesión</button></form></div></div>`;
}
function bindClave() {
  $('#csalir').onclick = salirDeCuenta;
  $('#fclave').onsubmit = e => {
    e.preventDefault();
    const f = readForm(e.target);
    if (f.p1 !== f.p2) { $('#clerr').textContent = 'Las dos claves no son iguales.'; return; }
    me().pin = hashPin(f.p1); addLog('Creó su clave de autorización'); save(); toast('Clave guardada'); render();
  };
}
// Arranque: espera a que cargue la conexión y escucha la cuenta y los datos de la óptica.
function arrancarNube() {
  Nube.alCambiarSesion(s => {
    const antes = sesion.optica?.id, oid = s.optica?.id;
    sesion = s;
    if (oid !== antes) {
      if (quitarDatos) { quitarDatos(); quitarDatos = null; }
      remoto = {}; sinc = {}; datosListos = false; db = null;
      if (oid) quitarDatos = Nube.escucharDatos(oid, recibirDatos, e => toast('Problema con la nube: ' + e));
    }
    if (!s.usuario) user = null;
    if (datosListos && db && user) pintarSiSeguro(); else render();
  });
}

// ---------- Primera configuración de la óptica ----------
function setupView() {
  const o = sesion.optica || {}, p = sesion.perfil || {};
  return `<div class="login"><div class="box wide">
    ${marcaTO}
    <h1>Configuremos tu óptica</h1><p class="muted" style="margin:6px 0 20px">Solo toma un minuto. Todo se puede cambiar después en Ajustes.</p>
    <form id="setup" class="form">
      <div class="fg"><label class="f full">Nombre de la óptica<input class="inp" name="nombre" required value="${esc(o.nombre || '')}"></label>
      <label class="f">Teléfono<input class="inp" name="telefono" inputmode="tel" value="${esc(o.telefono || '')}"></label><label class="f">RUC<input class="inp" name="ruc" inputmode="numeric" placeholder="Opcional"></label>
      <label class="f full">Dirección<input class="inp" name="direccion"></label></div>
      <p class="hint" style="margin:0">Tu clave de autorización son 4 a 8 números que se piden para aprobar cambios delicados, como anular una venta. Después, en Ajustes → Personas, les creas usuario y contraseña a tus socios y vendedores.</p>
      <div class="fg"><label class="f">Tu nombre (dueño)<input class="inp" name="s1" required value="${esc(p.nombre || '')}"></label><label class="f">Tu clave de autorización<input class="inp" name="p1" type="password" inputmode="numeric" required pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="4 a 8 números"></label></div>
      <div class="err" id="serr"></div>
      <button class="btn primary" style="padding:12px">Empezar</button>
    </form></div></div>`;
}
function bindSetup() {
  $('#setup').onsubmit = e => {
    e.preventDefault();
    const f = readForm(e.target);
    db = blank();
    Object.assign(db.config, { nombre: f.nombre.trim(), telefono: f.telefono, ruc: f.ruc, direccion: f.direccion });
    Object.assign(db.config.fact, { ruc: f.ruc, direccion: f.direccion });
    db.config.socios = [{ id: 's1', nombre: f.s1.trim(), pin: hashPin(f.p1), pct: 100, rol: 'dueno', usuario: sesion.perfil?.usuario || '' }];
    db.config.duenoId = 's1';
    user = 's1';
    save(); render();
  };
}

// ---------- Pasar los datos de Glooptic (guardados en el celular) a la nube ----------
// Glooptic guardaba todo en el navegador de cada celular. TerraÓptica se publica en la misma dirección,
// así que puede leer esos datos y subirlos. Nunca se borran del celular.
// Si dos celulares tenían datos (Jorge y Juan), el segundo se suma al primero sin repetir ni reemplazar nada.
const CLAVE_GLOOPTIC = 'optica-db-v1';
const marcaSubida = oid => 'terraoptica-subido-' + oid;
let subidaOfrecida = false, subiendoCelular = false;
const hashTxt = s => { let h = 5381; for (const c of String(s)) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const copia = v => JSON.parse(JSON.stringify(v));
function datosDelCelular() {
  try {
    const r = localStorage.getItem(CLAVE_GLOOPTIC); if (!r) return null;
    const d = JSON.parse(r); if (!d || !d.config || !Array.isArray(d.config.socios) || !d.config.socios.length) return null;
    return d;
  } catch (e) { return null; }
}
function estadoSubida(oid) { try { return JSON.parse(localStorage.getItem(marcaSubida(oid)) || 'null'); } catch (e) { return null; } }
function marcarSubida(oid, como) { try { localStorage.setItem(marcaSubida(oid), JSON.stringify({ como, ts: Date.now() })); } catch (e) { } }
// Glooptic ofrecía datos de ejemplo al empezar. Si siguen en el celular, no se suben.
const DEMO_PAC = ['María Fernanda Quispe|987654321', 'Carlos Mendoza Ríos|956112233', 'Lucía Paredes|912345678', 'Jorge Luis Huamán|944556677', 'Rosa Elvira Torres|933221100', 'Mateo Salazar (niño)|921987654'];
const DEMO_MONT = ['Ray-Ban|5154|C2|380', 'Ray-Ban|3447|C1|420', 'Vogue|5286|C1|290', 'Oakley|8046|C3|450', 'Fellis|4321|C2|180', 'Genérica|||95', 'Fellis|4321|C1|180', 'Carolina Herrera|836|C2|520', 'Vanci|7788|C1|220', 'Genérica|||160'];
const DEMO_CRIS = ['Monofocal CR-39 blanco', 'Monofocal CR-39 antirreflejo', 'Monofocal blue cut antirreflejo', 'Monofocal fotocromático', 'Bifocal flat-top antirreflejo', 'Progresivo digital antirreflejo', 'Progresivo blue cut premium', 'Policarbonato antirreflejo (niños)'];
const DEMO_GASTO = ['Laboratorio (bisel y armado)|60', 'Almuerzo|24', 'Luz|85'];
// Prepara los datos del celular: completa lo que falte y separa los datos de ejemplo. Devuelve { d, demo }.
function limpiarCelular(crudo) {
  const d = Object.assign(blank(), copia(crudo));
  for (const col in COLS) d[col] = Array.isArray(d[col]) ? d[col] : [];
  d.config.fact = d.config.fact || {};
  const pacDemo = new Set(d.pacientes.filter(p => DEMO_PAC.includes(`${p.nombre}|${p.telefono}`)).map(p => p.id));
  let demo = 0;
  if (pacDemo.size >= 4) {
    const ordDemo = new Set(d.ordenes.filter(o => pacDemo.has(o.pacienteId)).map(o => o.id));
    const monDemo = new Set(d.monturas.filter(m => DEMO_MONT.includes(`${m.marca}|${m.varilla || ''}|${m.colorCod || ''}|${m.precio}`) && /^M0000\d$|^M00010$/.test(m.codigo)).map(m => m.id));
    demo = pacDemo.size;
    d.pacientes = d.pacientes.filter(p => !pacDemo.has(p.id));
    d.medidas = d.medidas.filter(m => !pacDemo.has(m.pacienteId));
    d.ordenes = d.ordenes.filter(o => !ordDemo.has(o.id));
    d.pagos = d.pagos.filter(p => !ordDemo.has(p.ordenId));
    d.comprobantes = d.comprobantes.filter(c => !ordDemo.has(c.ordenId));
    // Las monturas de ejemplo solo se quitan si nadie las vendió en una venta real.
    const vendidas = new Set(d.ordenes.flatMap(o => o.items.map(i => i.ref)));
    d.monturas = d.monturas.filter(m => !monDemo.has(m.id) || vendidas.has(m.id));
    d.cristales = d.cristales.filter(c => !DEMO_CRIS.includes(c.nombre) || vendidas.has(c.id));
    d.gastos = d.gastos.filter(g => !DEMO_GASTO.includes(`${g.concepto}|${g.monto}`));
    d.vales = d.vales.filter(v => !(v.concepto === 'Adelanto' && num(v.monto) === 50));
    // El ejemplo también dejaba cerrada la caja del día anterior (un día antes de crear los pacientes de ejemplo).
    const creadoDemo = Math.max(...crudo.pacientes.filter(p => pacDemo.has(p.id)).map(p => num(p.creado)));
    d.cierres = d.cierres.filter(c => Math.abs(num(c.ts) - (creadoDemo - 864e5)) > 60000);
  }
  // Glooptic no les ponía código a los cierres de caja ni al historial: se les da uno fijo, para no repetirlos si se sube dos veces.
  d.log.forEach(l => { if (!l.id) l.id = 'g' + hashTxt(l.ts + '|' + l.accion); });
  d.cierres.forEach(c => { if (!c.id) c.id = 'c' + c.fecha; });
  for (const col in COLS) d[col].forEach(r => { if (!r.id) r.id = 'g' + hashTxt(JSON.stringify(r)); });
  return { d: normDb(d), demo };
}
const cuantos = d => ({ pacientes: d.pacientes.length, medidas: d.medidas.length, ventas: d.ordenes.length, monturas: d.monturas.length, pagos: d.pagos.length, gastos: d.gastos.length, comprobantes: d.comprobantes.length });
const CAMPOS_REF = ['por', 'socioId', 'autoriza', 'anuladaPor', 'pacienteId', 'ref'];
function cambiarRefs(v, mapa) {
  if (Array.isArray(v)) return v.map(x => cambiarRefs(x, mapa));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = CAMPOS_REF.includes(k) && typeof v[k] === 'string' && mapa[v[k]] ? mapa[v[k]] : cambiarRefs(v[k], mapa); return o; }
  return v;
}
// Suma los datos del celular (src) a los de la nube (dst). No borra ni reemplaza nada de la nube.
// Devuelve lo que pasó, para mostrarlo.
function juntarCelular(dst, src) {
  const R = { nuevos: { pacientes: 0, medidas: 0, ventas: 0, monturas: 0, pagos: 0, gastos: 0, comprobantes: 0, otros: 0, listas: 0 }, personas: [], renumeradas: [], codigos: [], mismosPacientes: 0, mismasMonturas: 0, boletasRepetidas: 0 };
  const mapa = {};
  const primera = s => sinTilde(s).trim().split(/\s+/)[0] || '';
  // Personas: se reconocen por el primer nombre (Jorge = Jorge Ortiz). Las que no están se agregan como socios.
  for (const s of src.config.socios) {
    const igual = dst.config.socios.find(x => primera(x.nombre) === primera(s.nombre));
    if (igual) { if (igual.id !== s.id) mapa[s.id] = igual.id; if (!igual.pin && s.pin) igual.pin = s.pin; continue; }
    const id = dst.config.socios.some(x => x.id === s.id) ? uid() : s.id;
    if (id !== s.id) mapa[s.id] = id;
    const { usuario, uid: _u, ...resto } = s;
    // Su porcentaje no puede pasar lo que queda libre (el resto es del dueño).
    const libre = Math.max(0, 100 - dst.config.socios.filter(x => x.id !== dst.config.duenoId && !x.baja && x.rol !== 'vendedor').reduce((t, x) => t + num(x.pct), 0));
    dst.config.socios.push({ ...resto, id, rol: 'socio', pct: Math.min(num(s.pct), libre) });
    R.personas.push(s.nombre);
  }
  if (R.personas.length) { const d = dst.config.socios.find(x => x.id === dst.config.duenoId); if (d) d.pct = Math.max(0, round2(100 - dst.config.socios.filter(x => x !== d && !x.baja && x.rol !== 'vendedor').reduce((t, x) => t + num(x.pct), 0))); }
  // Pacientes: el mismo DNI, o el mismo nombre con el mismo celular, es la misma persona.
  const tel = t => String(t || '').replace(/\D/g, '').slice(-9);
  const idsP = new Set(dst.pacientes.map(p => p.id));
  for (const p of src.pacientes) {
    if (idsP.has(p.id)) continue;
    const igual = dst.pacientes.find(x => (p.dni && String(x.dni || '').trim() === String(p.dni).trim()) || (alnum(x.nombre) === alnum(p.nombre) && tel(x.telefono) && tel(x.telefono) === tel(p.telefono)));
    if (igual) { mapa[p.id] = igual.id; R.mismosPacientes++; }
  }
  // Monturas: el mismo código con la misma marca, varilla y colores es la misma montura (no se suma dos veces).
  const firma = m => [alnum(m.marca), alnum(m.varilla), alnum(m.colorCod), (m.colores || []).map(alnum).join('/'), m.clase || ''].join('|');
  const idsM = new Set(dst.monturas.map(m => m.id));
  let sigM = Math.max(num(dst.config.nextMontura) || 1, ...dst.monturas.map(m => +(/^M(\d+)$/.exec(m.codigo) || [0, 0])[1] + 1));
  const nuevasM = [];
  for (const m of src.monturas) {
    if (idsM.has(m.id)) continue;
    const mismoCod = dst.monturas.find(x => x.codigo === m.codigo);
    if (mismoCod && firma(mismoCod) === firma(m)) { mapa[m.id] = mismoCod.id; R.mismasMonturas++; continue; }
    nuevasM.push(m);
  }
  // Cristales: por nombre.
  const idsC = new Set(dst.cristales.map(c => c.id));
  for (const c of src.cristales) { if (idsC.has(c.id)) continue; const igual = dst.cristales.find(x => alnum(x.nombre) === alnum(c.nombre)); if (igual) mapa[c.id] = igual.id; }
  // Con todo reconocido, se cambian las referencias de los registros del celular y se agregan los que faltan.
  const s = cambiarRefs(src, mapa);
  const agregar = (col, filtro = () => true, cuenta = 'otros') => {
    const ids = new Set(dst[col].map(r => r.id));
    for (const r of s[col]) if (!ids.has(r.id) && !mapa[r.id] && filtro(r)) { dst[col].push(r); ids.add(r.id); R.nuevos[cuenta]++; }
  };
  agregar('pacientes', () => true, 'pacientes');
  agregar('medidas', () => true, 'medidas');
  agregar('cristales');
  // Monturas nuevas: si su código ya lo usa otra montura en la nube, se les da uno nuevo.
  const codigos = new Set(dst.monturas.map(m => m.codigo));
  for (const m0 of nuevasM) {
    const m = s.monturas.find(x => x.id === m0.id);
    if (!m.codigo || codigos.has(m.codigo)) { const antes = m.codigo; m.codigo = 'M' + pad(sigM++, 5); R.codigos.push({ antes, ahora: m.codigo, desc: siglaMontura(m) }); }
    else { const n = /^M(\d+)$/.exec(m.codigo); if (n) sigM = Math.max(sigM, +n[1] + 1); }
    codigos.add(m.codigo); dst.monturas.push(m); R.nuevos.monturas++;
  }
  dst.config.nextMontura = sigM;
  // Ventas: si el número ya lo tiene otra venta en la nube, se le da el siguiente libre (y se guarda el número que tenía).
  const nums = new Set(dst.ordenes.map(o => o.numero));
  let sigO = Math.max(num(dst.config.nextOrden) || 1, ...dst.ordenes.map(o => num(o.numero) + 1));
  const idsO = new Set(dst.ordenes.map(o => o.id));
  const nuevasO = s.ordenes.filter(o => !idsO.has(o.id)).sort((a, b) => a.numero - b.numero);
  for (const o of nuevasO) if (!nums.has(o.numero)) { nums.add(o.numero); sigO = Math.max(sigO, num(o.numero) + 1); }
  for (const o of nuevasO) {
    if (dst.ordenes.some(x => x.numero === o.numero)) { R.renumeradas.push({ antes: o.numero, ahora: sigO }); o.numeroAntes = o.numero; o.numero = sigO++; }
    dst.ordenes.push(o); R.nuevos.ventas++;
  }
  dst.config.nextOrden = sigO;
  agregar('pagos', () => true, 'pagos');
  agregar('gastos', () => true, 'gastos');
  agregar('vales');
  agregar('anuladas');
  // Comprobantes: se suben todos; si una boleta o factura tiene el mismo número que otra, se avisa.
  const numsCp = new Set(dst.comprobantes.filter(c => c.numero).map(c => c.serie + '-' + c.numero));
  for (const c of s.comprobantes) if (c.numero && numsCp.has(c.serie + '-' + c.numero) && !dst.comprobantes.some(x => x.id === c.id)) R.boletasRepetidas++;
  agregar('comprobantes', () => true, 'comprobantes');
  const F = dst.config.fact, G = s.config.fact || {};
  F.numB = Math.max(num(F.numB) || 1, num(G.numB) || 1); F.numF = Math.max(num(F.numF) || 1, num(G.numF) || 1);
  const fechas = new Set(dst.cierres.map(c => c.fecha));
  agregar('cierres', c => !fechas.has(c.fecha));
  agregar('log');
  dst.log.sort((a, b) => String(b.ts).localeCompare(String(a.ts))); dst.log = dst.log.slice(0, 500);
  // Listas de precios y accesorios: la nube manda; solo se agregan los que no estén.
  for (const k of LISTAS) { const ids = new Set((dst[k] || []).map(x => x.id)); for (const x of s[k] || []) if (!ids.has(x.id)) { dst[k].push(x); R.nuevos.listas++; } }
  R.total = Object.values(R.nuevos).reduce((a, b) => a + b, 0) + R.personas.length;
  return R;
}
// Primera vez: la óptica en la nube todavía no tiene datos y el dueño trae los de Glooptic.
function datosInicialesDesdeCelular(crudo) {
  const { d, demo } = limpiarCelular(crudo);
  const du = d.config.socios.find(x => x.id === d.config.duenoId) || d.config.socios[0];
  d.config.duenoId = du.id;
  d.config.socios.forEach(x => { x.rol = x === du ? 'dueno' : x.rol === 'vendedor' ? 'vendedor' : 'socio'; delete x.uid; delete x.usuario; });
  du.usuario = sesion.perfil?.usuario || '';
  if (!d.config.nombre) d.config.nombre = sesion.optica?.nombre || '';
  return { d, demo };
}
const listaCuantos = c => [[c.pacientes, 'paciente', 'pacientes'], [c.medidas, 'medida', 'medidas'], [c.ventas, 'venta', 'ventas'], [c.monturas, 'montura', 'monturas'], [c.pagos, 'pago', 'pagos'], [c.gastos, 'gasto', 'gastos'], [c.comprobantes, 'comprobante', 'comprobantes'], [c.listas, 'precio o accesorio', 'precios y accesorios'], [c.otros, 'otro registro', 'otros registros']]
  .filter(([n]) => n).map(([n, a, b]) => `<div class="line"><span>${n === 1 ? a[0].toUpperCase() + a.slice(1) : b[0].toUpperCase() + b.slice(1)}</span><b>${n}</b></div>`).join('') || `<div class="line"><span>Sin registros (solo la configuración)</span><b>—</b></div>`;
function descargarCopiaCelular() {
  const r = localStorage.getItem(CLAVE_GLOOPTIC);
  if (r) saveFile(`copia-celular-glooptic-${hoy()}.json`, r);
}
// Pantalla para el dueño cuando su óptica en la nube está vacía y en este celular hay datos de Glooptic.
function subidaInicialView() {
  const { d, demo } = datosInicialesDesdeCelular(datosDelCelular());
  return `<div class="login"><div class="box wide">${marcaTO}
    <h1>Encontramos tus datos en este celular</h1>
    <p class="muted" style="margin:6px 0 16px">Son los datos que tenías en Glooptic${d.config.nombre && !/glooptic/i.test(d.config.nombre) ? ` (<b>${esc(d.config.nombre)}</b>)` : ''}. Los subimos a la nube para que los veas desde cualquier equipo. No tienes que volver a escribir nada.</p>
    <div class="cash-sum">${listaCuantos(cuantos(d))}<div class="line"><span>Personas</span><b>${esc(d.config.socios.map(x => x.nombre).join(', '))}</b></div></div>
    ${demo ? `<p class="hint">También estaban los ${demo} pacientes de ejemplo que trae el sistema. Esos no se suben.</p>` : ''}
    <p class="hint">Los datos no se borran de este celular.</p>
    <div class="err" id="suerr"></div>
    <div class="actions" style="margin-top:14px"><button class="btn primary" id="susubir" style="padding:12px">${icon('up')} Subir mis datos a la nube</button></div>
    <div class="actions" style="margin-top:6px"><button class="btn ghost sm" id="sucopia">${icon('down')} Guardar una copia en el celular</button><button class="btn ghost sm" id="sunada">Empezar sin estos datos</button></div>
  </div></div>`;
}
function bindSubidaInicial() {
  $('#sucopia').onclick = descargarCopiaCelular;
  $('#sunada').onclick = () => confirmBox('¿Empezar con la óptica vacía? Los datos de Glooptic se quedan en este celular y los puedes subir después desde Ajustes.', () => { marcarSubida(sesion.optica.id, 'no'); render(); }, 'Empezar vacía');
  $('#susubir').onclick = async () => {
    const btn = $('#susubir'); btn.disabled = true; btn.textContent = 'Subiendo tus datos…';
    const { d } = datosInicialesDesdeCelular(datosDelCelular());
    db = d; user = d.config.duenoId;
    addLog('Datos de Glooptic subidos desde este celular');
    const R = { total: 1, nuevos: cuantos(d), personas: [], renumeradas: [], codigos: [], mismosPacientes: 0, mismasMonturas: 0, boletasRepetidas: 0 };
    await terminarSubida(R, true);
  };
}
// Sube lo que se juntó y espera a que la nube lo reciba.
async function terminarSubida(R, inicial) {
  subiendoCelular = true;
  const envio = subir();
  const r = await Promise.race([envio, new Promise(ok => setTimeout(() => ok('lento'), 25000))]);
  subiendoCelular = false;
  if (r === true || r === 'lento') marcarSubida(sesion.optica.id, 'si');
  render();
  if (r === undefined || r === false) { restaurarDesdeNube(); return alert('No se pudieron subir los datos. Los datos siguen en este celular: vuelve a intentarlo con internet o escríbenos por WhatsApp.'); }
  resultadoSubidaModal(R, inicial, r === 'lento');
  if (r === 'lento') envio.then(ok => ok && toast('Listo: tus datos ya están en la nube'));
}
function resultadoSubidaModal(R, inicial, lento) {
  const n = R.nuevos;
  const filas = n.pacientes + n.ventas + n.monturas + n.pagos + n.gastos + n.comprobantes + (n.medidas || 0) + (n.otros || 0) + (n.listas || 0) ? listaCuantos(n) : '';
  const avisos = [
    R.personas.length && `Se ${R.personas.length === 1 ? 'agregó a ' + esc(R.personas[0]) + ' como socio' : 'agregaron ' + esc(R.personas.join(' y ')) + ' como socios'}. Revisa los porcentajes y créales su usuario en Ajustes → Personas.`,
    R.mismosPacientes && `${R.mismosPacientes} ${R.mismosPacientes === 1 ? 'paciente ya estaba' : 'pacientes ya estaban'} (mismo DNI o mismo nombre y celular): sus medidas y ventas se juntaron con el que ya había.`,
    R.mismasMonturas && `${R.mismasMonturas} ${R.mismasMonturas === 1 ? 'montura ya estaba registrada' : 'monturas ya estaban registradas'} con el mismo código: no se sumaron dos veces.`,
    R.renumeradas.length && `${R.renumeradas.length} ${R.renumeradas.length === 1 ? 'venta tenía un número que ya existía y ahora es' : 'ventas tenían números que ya existían y cambiaron'}: ${R.renumeradas.slice(0, 8).map(x => `N° ${pad(x.antes)} → ${pad(x.ahora)}`).join(', ')}${R.renumeradas.length > 8 ? '…' : ''}.`,
    R.codigos.length && `${R.codigos.length} ${R.codigos.length === 1 ? 'montura tenía un código que ya usaba otra y ahora es' : 'monturas tenían códigos que ya usaban otras y cambiaron'}: ${R.codigos.slice(0, 8).map(x => `${esc(x.antes || 'sin código')} → ${x.ahora} (${esc(x.desc)})`).join(', ')}${R.codigos.length > 8 ? '…' : ''}. Cambia la etiqueta de esas monturas.`,
    R.boletasRepetidas && `${R.boletasRepetidas} ${R.boletasRepetidas === 1 ? 'boleta o factura tiene' : 'boletas o facturas tienen'} el mismo número que otra. Revísalas en Órdenes.`,
  ].filter(Boolean);
  if (avisos.length) addLog('Datos de Glooptic de otro celular: ' + avisos.map(a => a.replace(/<[^>]+>/g, '')).join(' ')), save();
  modal({
    title: 'Tus datos ya están en la nube',
    body: `<p style="margin:0 0 12px">${inicial ? 'Se subió todo lo que tenías en este celular.' : 'Se sumó lo que tenía este celular a lo que ya estaba en la nube.'}</p>
      ${filas ? `<div class="cash-sum">${filas}</div>` : ''}
      ${avisos.map(a => `<p class="hint" style="margin:10px 0 0">${a}</p>`).join('')}
      ${lento ? `<p class="hint" style="margin:10px 0 0">El internet está lento: termina de subirse solo. No cierres la app por un rato.</p>` : ''}
      <p class="hint" style="margin:10px 0 0">Los datos de Glooptic siguen guardados en este celular.</p>`,
    foot: `<button class="btn primary" data-close>Listo</button>`,
  });
}
// Ya hay datos en la nube: se ofrece sumar lo que tenga este celular (por ejemplo, el celular del socio).
function ofrecerSubida(desdeAjustes) {
  const crudo = datosDelCelular(); if (!crudo || soloLectura() || miRol() === 'vendedor') return;
  const { d, demo } = limpiarCelular(crudo);
  const R = juntarCelular(copia(db), copia(d));
  if (!R.total) { marcarSubida(sesion.optica.id, 'si'); if (desdeAjustes) toast('Todo lo de este celular ya está en la nube'); return; }
  const n = R.nuevos;
  modal({
    title: 'Hay datos de Glooptic en este celular',
    body: `<p style="margin:0 0 12px">Este celular tiene datos de Glooptic que todavía no están en la nube. Se suman a lo que ya hay: no se borra ni se reemplaza nada.</p>
      <div class="cash-sum">${listaCuantos(n)}${R.personas.length ? `<div class="line"><span>Personas nuevas</span><b>${esc(R.personas.join(', '))}</b></div>` : ''}</div>
      ${demo ? `<p class="hint">Los ${demo} pacientes de ejemplo no se suben.</p>` : ''}
      <p class="hint">Si una venta o una montura tiene un número que ya existe, se le da uno nuevo y te avisamos cuáles.</p>`,
    foot: `<button class="btn ghost" id="sumas" style="margin-right:auto">Más tarde</button><button class="btn" id="sucopia">${icon('down')} Copia</button><button class="btn primary" id="susumar">${icon('up')} Subir</button>`,
    onMount: bg => {
      $('#sumas', bg).onclick = closeModal;
      $('#sucopia', bg).onclick = descargarCopiaCelular;
      $('#susumar', bg).onclick = async () => {
        const btn = $('#susumar', bg); btn.disabled = true; btn.textContent = 'Subiendo…';
        const R2 = juntarCelular(db, limpiarCelular(datosDelCelular()).d);
        addLog('Datos de Glooptic sumados desde este celular');
        closeModal(); await terminarSubida(R2, false);
      };
    },
  });
}
const hayDatosCelular = () => !!datosDelCelular();

// ---------- Inicio ----------
routes.inicio = {
  html() {
    const d = hoy();
    const ventasHoy = db.ordenes.filter(o => o.fecha === d);
    const pagosHoy = db.pagos.filter(p => p.fecha === d);
    const cobrado = pagosHoy.reduce((s, p) => s + num(p.monto), 0);
    const gastos = db.gastos.filter(g => g.fecha === d).reduce((s, g) => s + num(g.monto), 0);
    const conSaldo = db.ordenes.filter(o => saldoOrden(o) > 0.009), porCobrar = conSaldo.reduce((s, o) => s + saldoOrden(o), 0);
    const pend = db.ordenes.filter(o => o.estado !== 'entregado').sort((a, b) => diasAtraso(b) - diasAtraso(a) || (a.entrega || '9').localeCompare(b.entrega || '9'));
    const lab = pend.filter(o => o.estado === 'pendiente'), atr = lab.filter(diasAtraso);
    const listos = pend.filter(o => o.estado === 'listo'), sinAvisar = listos.filter(o => !o.avisado);
    const rec = recordatoriosData();
    const h = new Date().getHours();
    const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const alertas = [
      atr.length && ['#be123c', '#ffedf1', 'clock', `${atr.length} ${atr.length === 1 ? 'pedido atrasado' : 'pedidos atrasados'} en laboratorio`, atr.slice(0, 3).map(o => `${esc(paciente(o.pacienteId)?.nombre.split(' ')[0] || '')} (${diasAtraso(o)} ${diasAtraso(o) === 1 ? 'día' : 'días'})`).join(', ') + '. Llama al laboratorio.', '#/ordenes', 'Ver pedidos'],
      sinAvisar.length && ['#0e7490', '#e4f8fb', 'wa', `${sinAvisar.length} ${sinAvisar.length === 1 ? 'pedido listo' : 'pedidos listos'} sin avisar`, 'Mándales un WhatsApp para que vengan a recoger.', '#/recordatorios', 'Avisar'],
      rec.deudas.length && ['#a35607', '#fff4de', 'wallet', `${rec.deudas.length} ${rec.deudas.length === 1 ? 'cliente debe' : 'clientes deben'} saldo`, 'Ya se llevaron sus lentes y todavía deben.', '#/recordatorios', 'Ver'],
      rec.control.length && ['#4f46e5', '#eeeeff', 'eye', `${rec.control.length} ${rec.control.length === 1 ? 'paciente toca' : 'pacientes tocan'} control`, `Pasaron más de ${db.config.recordatorioMeses} meses desde su último examen.`, '#/recordatorios', 'Ver'],
    ].filter(Boolean);
    return `${avisoSuscripcion()}
      <section class="hero">
        <div><div class="hero-eb cap">${flong(d)} · ${esc(db.config.nombre || 'Mi óptica')}</div>
          <h1 class="hero-h">${saludo}, ${esc(me().nombre)}</h1>
          <p class="hero-p">Hoy: <b>${money(cobrado)}</b> cobrados${puede('reportes') ? `, <b>${money(porCobrar)}</b> por cobrar` : ''} y <b>${listos.length} ${listos.length === 1 ? 'pedido listo' : 'pedidos listos'}</b> para entregar.</p>
          <div class="hero-act"><a class="btn hero-w" href="#/nueva-orden">${icon('bag')} Nueva venta</a>${sinAvisar.length ? `<a class="btn hero-g" href="#/recordatorios">${icon('wa')} Avisar a ${sinAvisar.length === 1 ? '1 cliente' : 'los ' + sinAvisar.length}</a>` : `<a class="btn hero-g" href="#/pacientes?nuevo=1">${icon('users')} Nuevo paciente</a>`}</div></div>
        <div class="hero-side"><div class="hs"><span>En laboratorio</span><b class="num">${lab.length}</b>${atr.length ? `<em>${atr.length} atrasado${atr.length === 1 ? '' : 's'}</em>` : ''}</div><div class="hs"><span>Listos para recoger</span><b class="num">${listos.length}</b></div></div>
      </section>
      <div class="grid g4 mt">
        <div class="card kpi" style="--c:#1e4fea"><div class="l"><i>${icon('trend')}</i>Vendido hoy</div><div class="v num">${money(ventasHoy.reduce((s, o) => s + totalOrden(o), 0))}</div><div class="s">${ventasHoy.length} ${ventasHoy.length === 1 ? 'venta' : 'ventas'}</div></div>
        <div class="card kpi" style="--c:#059669"><div class="l"><i>${icon('wallet')}</i>Cobrado hoy</div><div class="v num">${money(cobrado)}</div><div class="s">${puede('gastos') ? `Gastos: ${money(gastos)}` : `${pagosHoy.length} ${pagosHoy.length === 1 ? 'cobro' : 'cobros'}`}</div></div>
        <div class="card kpi" style="--c:#f59e0b"><div class="l"><i>${icon('clock')}</i>Por cobrar</div><div class="v num">${money(porCobrar)}</div><div class="s">${conSaldo.length} ${conSaldo.length === 1 ? 'pedido' : 'pedidos'} con saldo</div></div>
        <div class="card kpi" style="--c:#7c3aed"><div class="l"><i>${icon('board')}</i>En laboratorio</div><div class="v num">${lab.length} ${lab.length === 1 ? 'pedido' : 'pedidos'}</div><div class="s" style="${atr.length ? 'color:var(--danger);font-weight:600' : ''}">${atr.length ? `${atr.length} atrasado${atr.length === 1 ? '' : 's'}` : 'Ninguno atrasado'}</div></div>
      </div>
      <div class="split mt">
        <div class="grid" style="gap:18px">
          ${listos.length ? `<div class="card"><div class="card-h"><div class="ttl"><span class="tic" style="--c:#0e7490">${icon('wa')}</span><h3>Listos para avisar</h3></div><a class="btn sm ghost" href="#/ordenes">Ver tablero</a></div>
            <div class="card-b" style="padding:10px 0 6px">${listos.slice(0, 6).map(o => { const pc = paciente(o.pacienteId), s = saldoOrden(o); return `<div class="list-item"><span class="ini">${initials(pc?.nombre)}</span><a class="grow" href="#/orden/${o.id}"><span class="t">${esc(pc?.nombre || '')}</span><span class="d">Pedido ${pad(o.numero)}${o.listoDesde ? ' · listo desde ' + fdate(o.listoDesde, { day: 'numeric', month: 'short' }) : ''}</span></a>${s > 0.009 ? `<span class="chip pend num">Debe ${money(s)}</span>` : `<span class="chip entr">Pagado</span>`}${pc?.telefono ? `<a class="btn sm wa" target="_blank" rel="noopener" data-avisar="${o.id}" href="${waLink(pc.telefono, ordenWaTexto(o, pc))}">${icon('wa')} ${o.avisado ? 'Otra vez' : 'Avisar'}</a>` : ''}</div>`; }).join('')}</div></div>` : ''}
          <div class="card"><div class="card-h"><div class="ttl"><span class="tic" style="--c:#7c3aed">${icon('board')}</span><h3>Pedidos pendientes</h3></div><a class="btn sm ghost" href="#/ordenes">Ver todos</a></div>
            <div class="card-b" style="padding:10px 0 6px">${pend.length ? pend.slice(0, 7).map(ordenRow).join('') : `<div class="empty">No hay pedidos pendientes.</div>`}</div></div>
        </div>
        <div class="grid" style="gap:18px">
          <div class="card"><div class="card-h"><div class="ttl"><span class="tic" style="--c:#e11d48">${icon('bell')}</span><h3>Alertas</h3></div>${alertas.length ? `<span class="badge-n">${alertas.length}</span>` : ''}</div>
            <div class="card-b" style="display:grid;gap:10px">${alertas.length ? alertas.map(([c, bg, i, t, dsc, href, bt]) => `<div class="alerta" style="--a:${c};--a50:${bg}"><span class="aic">${icon(i)}</span><div class="grow"><b>${t}</b><p>${dsc}</p><a class="btn sm" href="${href}">${bt}</a></div></div>`).join('') : `<div class="empty" style="padding:14px">${icon('check')}<div>Todo en orden por ahora.</div></div>`}</div></div>
          <div class="card"><div class="card-h"><div class="ttl"><span class="tic" style="--c:#059669">${icon('cash')}</span><h3>Caja de hoy</h3></div><a class="btn sm ghost" href="#/caja">Abrir caja</a></div>
            <div class="card-b">${metodoResumen(pagosHoy)}</div></div>
        </div>
      </div>`;
  },
  bind() {
    $$('[data-avisar]').forEach(a => a.addEventListener('click', () => { const o = orden(a.dataset.avisar); if (o) { o.avisado = hoy(); save(); } }));
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
  const by = METODOS_VIZ.map(m => [m, pagos.filter(p => p.metodo === m).reduce((s, p) => s + num(p.monto), 0)]).filter(x => x[1] > 0);
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
      <label class="f">DNI<input class="inp" name="dni" inputmode="numeric" maxlength="12" value="${esc(e.dni)}" placeholder="Con el DNI se llena el nombre"></label>
      <label class="f">Celular<input class="inp" name="telefono" inputmode="tel" value="${esc(e.telefono)}" placeholder="9XX XXX XXX"></label>
      <label class="f full">Nombre completo<input class="inp" name="nombre" required value="${esc(e.nombre)}"></label>
      <label class="f">Fecha de nacimiento<input class="inp" type="date" name="nacimiento" value="${esc(e.nacimiento)}"></label>
      <label class="f">Ocupación<input class="inp" name="ocupacion" value="${esc(e.ocupacion)}"></label>
      <label class="f full">Notas<textarea class="inp" name="notas">${esc(e.notas)}</textarea></label></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="pform">Guardar</button>`,
    onMount: bg => {
      enlazarDoc($('[name=dni]', bg), $('[name=nombre]', bg));
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

// Ficha del paciente: datos + historial de medidas a la izquierda; la medida elegida (ojos con el eje,
// comparación con la anterior) y la evolución de la vista a la derecha.
const medSel = {};
const proximoControl = m => m ? addDays(m.fecha, Math.round(num(db.config.recordatorioMeses || 12) * 30.4)) : '';
const rxCorto = e => `${rx2(e.esf)}${num(e.cil) ? ' ' + rx2(e.cil) : ''}`;
function ojoSVG(e, k) {
  const cx = 110, cy = 96, R = 76, cil = num(e.cil), eje = num(e.eje);
  let t = '';
  for (let a = 0; a <= 180; a += 15) { const r1 = a % 45 ? R - 6 : R - 11, ra = a * Math.PI / 180; t += `<line x1="${cx + r1 * Math.cos(ra)}" y1="${cy - r1 * Math.sin(ra)}" x2="${cx + R * Math.cos(ra)}" y2="${cy - R * Math.sin(ra)}"/>`; }
  const lab = [0, 45, 90, 135, 180].map(a => { const ra = a * Math.PI / 180; return `<text x="${cx + (R + 12) * Math.cos(ra)}" y="${cy - (R + 12) * Math.sin(ra) + 4}" text-anchor="middle">${a}</text>`; }).join('');
  let ax = '';
  if (cil && e.eje !== '' && e.eje != null) {
    const ra = eje * Math.PI / 180, dx = Math.cos(ra) * (R - 2), dy = Math.sin(ra) * (R - 2);
    ax = `<line x1="${cx + dx}" y1="${cy - dy}" x2="${cx - dx}" y2="${cy + dy}" stroke="#f79009" stroke-width="3.5" stroke-linecap="round"/><circle cx="${cx + dx}" cy="${cy - dy}" r="5" fill="#f79009"/><circle cx="${cx - dx}" cy="${cy + dy}" r="5" fill="#f79009"/>`;
  }
  return `<svg viewBox="0 0 220 186" role="img" aria-label="${cil ? 'Eje del cilindro ' + Math.round(eje) + ' grados' : 'Sin astigmatismo'}"><defs><radialGradient id="pfir${k}" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#9bd8e6"/><stop offset=".55" stop-color="#2a7f9e"/><stop offset="1" stop-color="#0f3f5c"/></radialGradient></defs>
    <path d="M${cx - R} ${cy}A${R} ${R} 0 0 1 ${cx + R} ${cy}" fill="none" stroke="#e4e7ec" stroke-width="1.5"/>
    <g stroke="#b9c2d0" stroke-width="1.4">${t}</g><g font-size="11" font-weight="600" fill="#667085">${lab}</g>
    <path d="M${cx - 62} ${cy}Q${cx} ${cy - 50} ${cx + 62} ${cy}Q${cx} ${cy + 50} ${cx - 62} ${cy}Z" fill="#fff" stroke="#d0d5dd" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="24" fill="url(#pfir${k})"/><circle cx="${cx}" cy="${cy}" r="9.5" fill="#101828"/><circle cx="${cx - 7}" cy="${cy - 8}" r="4" fill="#fff" opacity=".85"/>${ax}</svg>`;
}
// Compara la graduación con la medida anterior: "subió" = más medida (en valor absoluto).
function cambioRx(a, b) {
  if (a === '' || a == null || b === '' || b == null) return '';
  const d = Math.abs(num(a)) - Math.abs(num(b));
  if (Math.abs(d) < 0.01) return `<span class="pf-dl eq">igual</span>`;
  return d > 0 ? `<span class="pf-dl up">▲ subió ${d.toFixed(2)}</span>` : `<span class="pf-dl dn">▼ bajó ${Math.abs(d).toFixed(2)}</span>`;
}
function evolucionSVG(ms) {
  const pts = ms.slice().reverse(), W = 560, H = 200, pl = 46, pr = 18, pt = 18, pb = 30;
  const vals = pts.flatMap(m => [num(m.od.esf), num(m.oi.esf)]);
  let mn = Math.floor(Math.min(...vals, 0) * 2) / 2 - 0.25, mx = Math.ceil(Math.max(...vals, 0) * 2) / 2 + 0.25;
  if (mx <= 0) mx = 0.25;
  const paso = mx - mn > 6 ? 1 : 0.5;
  const x = i => pl + (pts.length === 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (pts.length - 1)), y = v => pt + (mx - v) / (mx - mn) * (H - pt - pb);
  let g = '';
  for (let v = Math.ceil(mn / paso) * paso; v <= mx; v += paso) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${Math.abs(v) < 0.001 ? '#b9c2d0' : '#f2f4f7'}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${rxv(v)}</text>`;
  const linea = (k, c) => `<path d="${pts.map((m, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(num(m[k].esf))).join('')}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
    + pts.map((m, i) => `<circle cx="${x(i)}" cy="${y(num(m[k].esf))}" r="${i === pts.length - 1 ? 6 : 4.5}" fill="#fff" stroke="${c}" stroke-width="3"><title>${k.toUpperCase()} ${fdate(m.fecha)}: ${rx2(m[k].esf)}</title></circle>`).join('');
  const cada = Math.ceil(pts.length / 7);
  return `<div class="pf-evo"><svg viewBox="0 0 ${W} ${H}" font-size="12" font-weight="500" fill="#667085">${g}${linea('od', '#0891b2')}${linea('oi', '#c026d3')}
    ${pts.map((m, i) => (i % cada === 0 || i === pts.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${fdate(m.fecha, { month: 'short', year: 'numeric' })}</text>` : '').join('')}</svg></div>`;
}
routes.paciente = {
  html(id) {
    const p = paciente(id);
    if (!p) return `<div class="empty">Paciente no encontrado. <a href="#/pacientes" class="strong">Volver</a></div>`;
    const ms = medidasDe(id), os = ordenesDe(id);
    const edad = p.nacimiento ? Math.floor(daysBetween(p.nacimiento, hoy()) / 365.25) : null;
    const i = Math.max(0, ms.findIndex(m => m.id === medSel[id])), m = ms[i], prev = ms[i + 1];
    const ult = ms[0], prox = proximoControl(ult), vencido = prox && prox < hoy();
    const kv = [['DNI', p.dni], ['Celular', p.telefono], ['Nacimiento', p.nacimiento && fdate(p.nacimiento)], ['Último control', ult && fdate(ult.fecha)],
      ['Próximo control', prox && `<span style="color:${vencido ? 'var(--danger)' : '#0891b2'}">${fdate(prox)}${vencido ? ' · ya toca' : ''}</span>`]].filter(x => x[1]);
    const fila = (k, e, pe) => `<div class="pf-e">${k}</div><div><b>${rx2(e.esf)}</b>${pe ? cambioRx(e.esf, pe.esf) : ''}</div><div><b>${rx2(e.cil)}</b>${pe ? cambioRx(e.cil, pe.cil) : ''}</div>
      <div><b>${num(e.cil) && e.eje !== '' ? rx2(e.eje, 0) + '°' : '—'}</b></div><div><b>${rx2(e.add)}</b></div><div><b>${esc(e.av || '—')}</b></div>`;
    const dx = m ? diagnostico(m) : [];
    const detalle = m ? `<div class="card pf-pad pf-det">
        <div class="row between wrap" style="align-items:flex-start;gap:10px"><div><div class="pf-eb">Medida del ${fdate(m.fecha, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <h3 class="pf-h">${esc(m.lente || 'Examen visual')}${m.dip ? ` · DIP ${esc(m.dip)} mm` : ''}${m.altura ? ` · Altura ${esc(m.altura)} mm` : ''}</h3></div>
          ${prev ? `<span class="chip plain">Comparado con el ${fdate(prev.fecha)}</span>` : i === 0 ? `<span class="chip listo">Primera medida</span>` : ''}</div>
        <div class="pf-eyes">
          <div class="pf-eye"><h4>OD · Ojo derecho</h4>${ojoSVG(m.od, 'd')}<div class="pf-ev">${num(m.od.cil) && m.od.eje !== '' ? `Eje del cilindro <b>${rx2(m.od.eje, 0)}°</b>` : 'Sin astigmatismo'}</div></div>
          <div class="pf-eye"><h4>OI · Ojo izquierdo</h4>${ojoSVG(m.oi, 'i')}<div class="pf-ev">${num(m.oi.cil) && m.oi.eje !== '' ? `Eje del cilindro <b>${rx2(m.oi.eje, 0)}°</b>` : 'Sin astigmatismo'}</div></div>
        </div>
        <div class="pf-xs"><div class="pf-grid"><div class="pf-fh"></div><div class="pf-fh">Esfera</div><div class="pf-fh">Cilindro</div><div class="pf-fh">Eje</div><div class="pf-fh">Adición</div><div class="pf-fh">AV</div>${fila('OD', m.od, prev?.od)}${fila('OI', m.oi, prev?.oi)}</div></div>
        <div class="pf-ley">${prev ? `<span class="pf-dl up">▲ subió</span> la medida aumentó · <span class="pf-dl dn">▼ bajó</span> la medida disminuyó · ` : ''}Examinó ${esc(socioName(m.por))}</div>
        ${dx.length ? `<div class="dx">${dx.map(d => `<span class="tag" title="${esc(d[1])}">${d[0]}</span>`).join('')}</div>` : ''}
        ${m.filtros ? `<div class="small mt-s"><span class="muted">Filtros:</span> ${esc(m.filtros)}</div>` : ''}
        ${m.obs ? `<div class="pf-note">${icon('edit')}<span>${esc(m.obs)}</span></div>` : ''}
        <div class="pf-acts"><button class="btn sm" data-medit="${m.id}">${icon('edit')} Corregir</button><button class="btn sm" data-mimg="${m.id}">${icon('img')} Imagen</button>${p.telefono ? `<a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(p.telefono, medidaTexto(m, p))}">${icon('wa')} Enviar al paciente</a>` : ''}</div>
      </div>`
      : `<div class="card pf-pad pf-det"><div class="empty">${icon('eye')}<div>Aún no tiene medidas registradas.</div><button class="btn accent mt" id="newm2">${icon('plus')} Registrar la primera medida</button></div></div>`;
    return `<a class="crumb" href="#/pacientes">${icon('back')} Pacientes</a>
      <div class="pf-grid2">
        <div class="pf-stack">
          <div class="card pf-pad pf-head">
            <div class="pf-id"><span class="ini">${initials(p.nombre)}</span><div style="min-width:0"><h1>${esc(p.nombre)}</h1><div class="muted small">${[edad != null && edad + ' años', p.ocupacion].filter(Boolean).map(esc).join(' · ') || 'Paciente'}</div></div>
              <button class="btn ghost icon sm" id="pedit" title="Editar datos">${icon('edit')}</button></div>
            ${kv.length ? `<div class="pf-kv">${kv.map(([k, v]) => `<span>${k}</span><b>${k === 'Próximo control' ? v : esc(v)}</b>`).join('')}</div>` : ''}
            ${p.notas ? `<div class="pf-note">${icon('edit')}<span>${esc(p.notas)}</span></div>` : ''}
            <div class="pf-btns"><a class="btn primary" href="#/nueva-orden?p=${p.id}">${icon('file')} Nueva venta</a>${p.telefono ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(p.telefono)}">${icon('wa')} WhatsApp</a>` : ''}</div>
            <button class="btn accent" id="newm">${icon('plus')} Registrar nueva medida</button>
          </div>
          <div class="card pf-hist"><div class="card-h"><div><h3>Historial de medidas</h3><div class="sub">${ms.length ? 'Cada examen se guarda; nada se sobrescribe.' : 'Todavía no hay exámenes.'}</div></div><span class="kcount pf-n">${ms.length}</span></div>
            ${ms.length ? `<div class="pf-tl">${ms.map((x, j) => `<button class="pf-tli ${j === i ? 'on' : ''}" data-msel="${x.id}"><span class="pf-td">${fdate(x.fecha, { day: 'numeric', month: 'short' })}<small>${x.fecha.slice(0, 4)}</small></span>
              <span style="min-width:0"><b>${esc(x.lente || 'Examen visual')}</b>${j === 0 ? ' <span class="chip listo">Más reciente</span>' : ''}<span class="d num">OD ${rxCorto(x.od)} · OI ${rxCorto(x.oi)}</span><span class="d">${esc(socioName(x.por))}</span></span></button>`).join('')}</div>` : ''}</div>
          <div class="card pf-comp"><div class="card-h"><h3>Compras</h3><span class="sub">${os.length} orden${os.length === 1 ? '' : 'es'}</span></div>
            <div class="card-b" style="padding:6px 0">${os.length ? os.map(o => `<a class="list-item link" href="#/orden/${o.id}"><span class="ordnum">N° ${pad(o.numero)}</span>
              <span class="grow"><span class="t">${esc(o.items.map(x => x.desc).join(' + '))}</span><span class="d">${fdate(o.fecha)} · <span class="num">${money(totalOrden(o))}</span></span></span><span style="display:grid;gap:4px;justify-items:end">${estadoChip(o)}${deudaChip(o)}</span></a>`).join('') : `<div class="empty" style="padding:18px">Sin compras.</div>`}</div></div>
        </div>
        <div class="pf-stack">
          ${detalle}
          ${ms.length > 1 ? `<div class="card pf-pad pf-evoc"><div class="row between wrap" style="gap:10px"><div><h3>Evolución de la vista</h3><div class="sub muted small">Esfera en cada examen · más abajo = más miopía, más arriba = más hipermetropía</div></div>
            <div class="row" style="gap:12px"><span class="small"><span class="pf-dot" style="--c:#0891b2"></span>OD</span><span class="small"><span class="pf-dot" style="--c:#c026d3"></span>OI</span><button class="btn sm ghost" id="evo">${icon('chart')} Ver tabla</button></div></div>
            ${evolucionSVG(ms)}</div>` : ''}
        </div>
      </div>`;
  },
  bind(id) {
    const p = paciente(id); if (!p) return;
    $('#pedit').onclick = () => pacienteForm(p);
    $('#newm').onclick = () => medidaForm(p);
    $('#newm2') && ($('#newm2').onclick = () => medidaForm(p));
    $('#evo') && ($('#evo').onclick = () => evolucion(p));
    $$('[data-msel]').forEach(b => b.onclick = () => {
      medSel[id] = b.dataset.msel; render();
      if (matchMedia('(max-width:900px)').matches) setTimeout(() => $('.pf-det')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    });
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
        else {
          const nueva = { id: uid(), pacienteId: p.id, creado: Date.now(), por: user, ...data };
          db.medidas.push(nueva);
          if (draft && draft.pacienteId === p.id) draft.medidaId = nueva.id; // en una venta abierta se usa la medida nueva
        }
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
const LOGO_IMG = new Image(); LOGO_IMG.src = 'logo-mark.png';
function medidaImagen(m, p) {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const serif = '"Fraunces", Georgia, serif', sans = '"Inter", Segoe UI, sans-serif';
  x.fillStyle = '#f5f3ee'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#14263f'; x.fillRect(0, 0, W, 300);
  const g = x.createLinearGradient(80, 80, 180, 180); g.addColorStop(0, '#2aa39c'); g.addColorStop(1, '#1c6f8c');
  if (LOGO_IMG.complete && LOGO_IMG.naturalWidth) { x.save(); roundRect(x, 80, 80, 96, 96, 26); x.clip(); x.drawImage(LOGO_IMG, 80, 80, 96, 96); x.restore(); }
  else {
    x.fillStyle = g; roundRect(x, 80, 80, 96, 96, 26); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.ellipse(128, 128, 30, 18, 0, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(128, 128, 8, 0, Math.PI * 2); x.stroke();
  }
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
// Vista "Tablero" (columnas por estado, se arrastran) o "Lista" (tabla con filtros).
let ordFiltro = 'activas', tabFiltro = 'todos', ordBusca = '';
let ordVista = (() => { try { return localStorage.getItem('terra-ord-vista') || 'tablero'; } catch (e) { return 'tablero'; } })();
const COLS_TABLERO = [['pendiente', 'En laboratorio', '#7c3aed'], ['listo', 'Listo para recoger', '#0891b2'], ['entregado', 'Entregado', '#079455']];
const diasAtraso = o => o.estado === 'pendiente' && o.entrega && o.entrega < hoy() ? diasEntre(o.entrega, hoy()) : 0;
const fcorta = s => fdate(s, { day: 'numeric', month: 'short' });
const buscaOrden = (o, f, d) => { if (!f) return true; const p = paciente(o.pacienteId); return (d && (String(o.numero) === String(+d) || pad(o.numero).includes(d) || String(p?.telefono).replace(/\D/g, '').includes(d))) || !!p?.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(f); };
// Cambia el estado de una orden (desde el tablero o desde la orden). Si debe saldo al entregar, ofrece cobrarlo.
function cambiarEstado(o, e) {
  if (!o || o.estado === e) return;
  const p = paciente(o.pacienteId), nom = p ? p.nombre.split(' ')[0] : 'el cliente';
  const doit = () => {
    o.estado = e; o.entregado = e === 'entregado' ? hoy() : null;
    if (e === 'listo') o.listoDesde = hoy();
    if (e === 'pendiente') { delete o.listoDesde; delete o.avisado; }
    save(); render();
    if (e === 'listo') toast(p?.telefono ? `Orden ${pad(o.numero)} lista. Avísale a ${nom} con el botón verde.` : `Orden ${pad(o.numero)} lista.`);
    else if (e === 'entregado') toast(`Orden ${pad(o.numero)} entregada a ${nom}`);
    else toast(`Orden ${pad(o.numero)} volvió a laboratorio`);
  };
  const s = saldoOrden(o);
  if (e === 'entregado' && s > 0.009) modal({
    title: `Entregar orden N° ${pad(o.numero)}`,
    body: `<p style="margin:0">${esc(p ? p.nombre : 'El cliente')} todavía debe <b class="num">${money(s)}</b>. ¿Le cobras antes de entregar?</p>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn" id="eig">Entregar sin cobrar</button><button class="btn accent" id="ecob">${icon('cash')} Cobrar y entregar</button>`,
    onMount: bg => { $('#eig', bg).onclick = () => { closeModal(); doit(); }; $('#ecob', bg).onclick = () => cobrarForm(o, doit); },
  });
  else doit();
}
function tarjetaOrden(o) {
  const p = paciente(o.pacienteId), s = saldoOrden(o), a = diasAtraso(o);
  const aviso = a ? `<span class="chip deuda">${a} ${a === 1 ? 'día' : 'días'} de retraso</span>`
    : o.estado === 'listo' ? (o.avisado ? `<span class="chip entr">Avisado ${fcorta(o.avisado)}</span>` : o.listoDesde ? `<span class="chip listo">Desde ${fcorta(o.listoDesde)}</span>` : '')
    : o.estado === 'pendiente' && o.entrega === hoy() ? `<span class="chip pend">Entrega hoy</span>` : '';
  const fecha = o.estado === 'entregado' ? (o.directa ? `Venta directa · ${fcorta(o.entregado || o.fecha)}` : `Entregado ${fcorta(o.entregado || o.fecha)}`) : o.entrega ? `Entrega ${fcorta(o.entrega)}` : 'Sin fecha de entrega';
  const btns = o.estado === 'pendiente' ? `<button class="btn sm" data-mv="listo">${icon('check')} Marcar listo</button>`
    : o.estado === 'listo' ? `${p?.telefono ? `<a class="btn sm wa" data-wa target="_blank" rel="noopener" href="${waLink(p.telefono, ordenWaTexto(o, p))}">${icon('wa')} Avisar</a>` : ''}<button class="btn sm" data-mv="entregado">Entregar</button>` : '';
  return `<article class="kcard ${a ? 'late' : ''}" draggable="true" data-id="${o.id}">
    <div class="kt"><span class="ordnum">N° ${pad(o.numero)}</span>${aviso}</div>
    <div class="kpac"><span class="ini">${initials(p?.nombre)}</span><div style="min-width:0"><b class="kp">${esc(p?.nombre || 'Sin paciente')}</b><div class="kx">${esc(o.items.map(i => i.desc).join(' + '))}</div></div></div>
    <div class="kf"><span class="${a ? 'late-t' : ''}">${fecha}</span>${s > 0.009 ? `<span class="chip pend num">Saldo ${money(s)}</span>` : `<span class="chip entr">Pagado</span>`}</div>
    ${btns ? `<div class="kb">${btns}</div>` : ''}</article>`;
}
routes.ordenes = {
  html() {
    const vistaSeg = `<div class="seg" id="ovista">${[['tablero', 'Tablero'], ['lista', 'Lista']].map(([k, t]) => `<button data-v="${k}" class="${k === ordVista ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    const head = `<div class="page-head"><div><h1>Pedidos</h1><p>${ordVista === 'tablero' ? (matchMedia('(pointer:coarse)').matches ? 'Usa los botones de cada tarjeta y desliza a los lados para ver las columnas. Las atrasadas salen en rojo.' : 'Arrastra la tarjeta a la siguiente columna o usa sus botones. Las atrasadas salen en rojo.') : 'Busca por número, nombre o teléfono.'}</p></div>
      <div class="actions">${vistaSeg}<a class="btn primary" href="#/nueva-orden">${icon('plus')} Nueva venta</a></div></div>`;
    if (ordVista === 'tablero') {
      const nAtr = db.ordenes.filter(diasAtraso).length;
      return head + `<div class="row wrap" style="margin-bottom:14px"><div class="seg" id="tseg">${[['todos', 'Todas'], ['atrasados', `Atrasadas${nAtr ? ` <span class="kcount">${nAtr}</span>` : ''}`], ['saldo', 'Con saldo']].map(([k, t]) => `<button data-k="${k}" class="${k === tabFiltro ? 'on' : ''}">${t}</button>`).join('')}</div>
        <input class="inp" id="of" style="flex:1;min-width:200px" placeholder="N° de orden, nombre o teléfono…" value="${esc(ordBusca)}"></div><div id="kan" class="kan"></div>`;
    }
    return head + `<div class="card"><div class="card-b row wrap" style="padding-bottom:8px"><div class="seg" id="oseg">${[['activas', 'Por entregar'], ['listo', 'Listas'], ['deuda', 'Con saldo'], ['todas', 'Todas']].map(([k, t]) => `<button data-k="${k}" class="${k === ordFiltro ? 'on' : ''}">${t}</button>`).join('')}</div>
      <input class="inp" id="of" style="flex:1;min-width:200px" placeholder="N° de orden, nombre o teléfono…" value="${esc(ordBusca)}"></div><div id="olist"></div></div>`;
  },
  bind() {
    $$('#ovista button').forEach(b => b.onclick = () => { ordVista = b.dataset.v; try { localStorage.setItem('terra-ord-vista', ordVista); } catch (e) { } render(); });
    const filtroTexto = () => { const f = $('#of').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); return [f, f.replace(/\D/g, '')]; };
    if (ordVista === 'tablero') {
      let verMas = false;
      const draw = () => {
        const [f, d] = filtroTexto();
        const ok = o => buscaOrden(o, f, d) && (tabFiltro === 'todos' || (tabFiltro === 'atrasados' && diasAtraso(o)) || (tabFiltro === 'saldo' && saldoOrden(o) > 0.009));
        const hace30 = (() => { const x = new Date(hoy() + 'T12:00:00'); x.setDate(x.getDate() - 30); return x.toISOString().slice(0, 10); })();
        $('#kan').innerHTML = COLS_TABLERO.map(([k, t, c]) => {
          let L = db.ordenes.filter(o => o.estado === k && ok(o)), extra = '';
          if (k === 'pendiente') L.sort((a, b) => diasAtraso(b) - diasAtraso(a) || (a.entrega || '9').localeCompare(b.entrega || '9'));
          else if (k === 'listo') L.sort((a, b) => (a.listoDesde || a.fecha).localeCompare(b.listoDesde || b.fecha));
          else {
            L.sort((a, b) => (b.entregado || b.fecha).localeCompare(a.entregado || a.fecha) || b.numero - a.numero);
            // Solo las entregas del último mes; las demás con "Ver más" o en la Lista.
            if (!f && !verMas) { const total = L.length; L = L.filter(o => (o.entregado || o.fecha) >= hace30).slice(0, 30); if (total > L.length) extra = `<button class="btn ghost sm" id="kmas">Ver ${total - L.length} más antiguas</button>`; }
          }
          return `<section class="kcol" data-col="${k}" style="--c:${c}" aria-label="${t}"><div class="kh"><span class="kd"></span><b>${t}</b><em>${L.length}</em></div>
            ${L.map(tarjetaOrden).join('') || `<div class="kempty">Nada por aquí</div>`}${extra}</section>`;
        }).join('');
        let arrastrando = null;
        $$('#kan .kcard').forEach(c => {
          const o = orden(c.dataset.id);
          c.onclick = e => { if (e.target.closest('button,a')) return; go('#/orden/' + o.id); };
          c.addEventListener('dragstart', e => { arrastrando = o; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', o.id); } catch (_) { } });
          c.addEventListener('dragend', () => { c.classList.remove('dragging'); $$('#kan .kcol').forEach(x => x.classList.remove('over')); });
          $$('[data-mv]', c).forEach(b => b.onclick = () => cambiarEstado(o, b.dataset.mv));
          $('[data-wa]', c) && ($('[data-wa]', c).onclick = () => { o.avisado = hoy(); save(); setTimeout(draw, 300); });
        });
        $$('#kan .kcol').forEach(col => {
          col.addEventListener('dragover', e => { if (!arrastrando) return; e.preventDefault(); col.classList.add('over'); });
          col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
          col.addEventListener('drop', e => { e.preventDefault(); col.classList.remove('over'); const o = arrastrando; arrastrando = null; if (o) cambiarEstado(o, col.dataset.col); });
        });
        $('#kmas') && ($('#kmas').onclick = () => { verMas = true; draw(); });
      };
      $$('#tseg button').forEach(b => b.onclick = () => { tabFiltro = b.dataset.k; $$('#tseg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
      $('#of').oninput = () => { ordBusca = $('#of').value; draw(); }; draw();
      return;
    }
    const draw = () => {
      const [f, d] = filtroTexto();
      const list = db.ordenes.filter(o => ordFiltro === 'todas' || (ordFiltro === 'activas' && o.estado !== 'entregado') || (ordFiltro === 'listo' && o.estado === 'listo') || (ordFiltro === 'deuda' && saldoOrden(o) > 0.009))
        .filter(o => buscaOrden(o, f, d))
        .sort((a, b) => b.numero - a.numero);
      $('#olist').innerHTML = list.length ? `<div class="tbl-wrap"><table><thead><tr><th>N°</th><th>Paciente</th><th class="hide-sm">Fecha</th><th class="hide-sm">Entrega</th><th class="r">Total</th><th class="r">Saldo</th><th>Estado</th></tr></thead><tbody>
        ${list.map(o => { const s = saldoOrden(o); return `<tr class="link" data-h="#/orden/${o.id}"><td class="ordnum">${pad(o.numero)}</td><td><b>${esc(paciente(o.pacienteId)?.nombre)}</b><div class="muted small">${esc(o.items.map(i => i.desc).join(' · ')).slice(0, 60)}</div></td>
        <td class="hide-sm">${fdate(o.fecha)}</td><td class="hide-sm">${o.entrega ? fdate(o.entrega) : '—'}</td><td class="r num">${money(totalOrden(o))}</td><td class="r num" style="${s > 0.009 ? 'color:var(--danger);font-weight:600' : ''}">${s > 0.009 ? money(s) : '—'}</td><td>${estadoChip(o)}</td></tr>`; }).join('')}</tbody></table></div>`
        : `<div class="empty">${icon('file')}<div>No hay órdenes aquí.</div></div>`;
      $$('[data-h]').forEach(r => r.onclick = () => go(r.dataset.h));
    };
    $$('#oseg button').forEach(b => b.onclick = () => { ordFiltro = b.dataset.k; $$('#oseg button').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#of').oninput = () => { ordBusca = $('#of').value; draw(); }; draw();
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
    if (!draft.paso || (!p && draft.paso > 1)) draft.paso = p ? 2 : 1;
    const pasos = ['Paciente', 'Montura y lunas', 'Cobro'];
    return `<div class="page-head vhead"><div><h1>Nueva venta</h1><p>Se generará el pedido N° ${pad(db.config.nextOrden)}</p></div>
        <div class="steps" id="vsteps">${pasos.map((t, i) => `<button type="button" class="stp" data-paso="${i + 1}"><span>${i + 1}</span><em>${t}</em></button>`).join('')}</div></div>
      <div class="vgrid">
        <div class="vmain">
          <div class="card vstep" data-paso="1"><div class="card-h"><h3>¿Para quién es la venta?</h3>${p ? `<button class="btn sm ghost" id="chp">Cambiar</button>` : ''}</div><div class="card-b">
            ${p ? `<div class="row"><span class="ini">${initials(p.nombre)}</span><div class="grow"><b>${esc(p.nombre)}</b><div class="muted small">${esc(p.telefono || '')}</div></div></div>
              <label class="f mt">Medida para esta orden<select class="inp" id="msel">${ms.length ? ms.map(m => `<option value="${m.id}" ${m.id === draft.medidaId ? 'selected' : ''}>${fdate(m.fecha)} — OD ${rx2((m.od.esf))} ${rx2((m.od.cil))} · OI ${rx2((m.oi.esf))} ${rx2((m.oi.cil))}</option>`).join('') : ''}<option value="" ${!draft.medidaId ? 'selected' : ''}>Sin medida (solo venta)</option></select></label>
              <button class="btn sm mt-s" id="addm">${icon('plus')} Registrar medida ahora</button>`
      : `<p class="muted small" style="margin:0 0 10px">Busca por nombre o celular. Si es nuevo, regístralo con su DNI.</p><div class="search" style="max-width:none">${icon('search')}<input id="psearch" placeholder="Nombre o celular del paciente…" autocomplete="off"><div class="sr" id="pres" hidden></div></div>
              <button class="btn mt-s" id="newp2">${icon('plus')} Paciente nuevo</button>
              ${(r => r.length ? `<div class="vrec"><div class="muted small strong">Atendidos hace poco</div>${r.map(x => `<button type="button" class="vrec-i" data-rp="${x.id}"><span class="ini">${initials(x.nombre)}</span><span class="grow"><b>${esc(x.nombre)}</b><span class="muted small">${esc(x.telefono || x.dni || '')}</span></span>${icon('back')}</button>`).join('')}</div>` : '')(db.pacientes.slice().sort((a, b) => (b.creado || 0) - (a.creado || 0)).slice(0, 5))}`}
          </div></div>
          <div class="card vstep" data-paso="2"><div class="card-h"><h3>Montura, lunas y accesorios</h3>${p ? `<span class="muted small">${esc(p.nombre)}</span>` : ''}</div><div class="card-b">
            <div class="fg"><div class="fld">Montura<div class="search" style="max-width:none">${icon('search')}<input id="mcode" placeholder="N° de varilla, marca o sigla…" autocomplete="off"><div class="sr" id="mres" hidden></div></div></div>
            <div class="fld">Lunas<div class="search" style="max-width:none">${icon('search')}<input id="lq" placeholder="Toca para ver todas o escribe: monofocal blue…" autocomplete="off"><div class="sr" id="lres" hidden></div></div>
              ${!db.tarifas.length && !db.cristales.length ? `<span class="hint">Aún no tienes precios de lunas. Créalos en <a class="lnk" href="#/inventario" id="irlunas">Inventario → Precios de lunas</a> o agrégalas con “Otro producto”.</span>` : ''}</div>
            <label class="f" style="display:none">Lunas<select class="inp" id="csel"><option value="">Elegir tipo de luna…</option>${gruposTarifa().map(([g, ts]) => `<optgroup label="${esc(g)}">${ts.map(t => `<option value="t:${t.id}">${esc(t.nombre)}</option>`).join('')}</optgroup>`).join('')}
              ${db.cristales.length ? `<optgroup label="Otros cristales (precio fijo)">${db.cristales.map(c => `<option value="c:${c.id}">${esc(c.nombre)} — ${money(c.precio)}</option>`).join('')}</optgroup>` : ''}</select></label>
            <div class="fld">Accesorios y otros<div class="search" style="max-width:none">${icon('search')}<input id="pq" placeholder="Ej. tornillo, plaquetas, estuche…" autocomplete="off"><div class="sr" id="prodres" hidden></div></div></div></div>
            <div id="lpanel"></div>
            <div class="tbl-wrap mt"><table class="items"><thead><tr><th>Descripción</th><th class="c" style="width:70px">Cant.</th><th class="r" style="width:120px">Precio</th><th class="r" style="width:110px">Subtotal</th><th style="width:40px"></th></tr></thead><tbody id="itbody"></tbody></table></div>
            <button class="btn sm mt-s" id="addo">${icon('plus')} Otro producto o servicio</button>
          </div></div>
          <div class="card vstep" data-paso="3"><div class="card-h"><h3>Cobro y entrega</h3></div><div class="card-b">
          <form id="oform" class="form">
            <div class="seg vtipo" id="vtipo"><button type="button" data-v="encargo">Encargo</button><button type="button" data-v="directa">Venta directa</button></div>
            <div class="hint" id="vhint" style="margin-top:-6px"></div>
            <div class="totals"><div><span class="muted">Subtotal</span><b class="num" id="tsub">S/ 0.00</b></div>
            <div><span class="muted">Descuento</span><input class="inp sm num" name="descuento" id="tdesc" inputmode="decimal" style="width:110px;text-align:right" value="${puede('descuentos') ? esc(draft.descuento) : ''}" placeholder="0.00" ${puede('descuentos') ? '' : 'disabled title="Los descuentos los pone el dueño o un socio"'}></div>
            <div class="big"><span>Total</span><span class="num" id="ttot">S/ 0.00</span></div></div>
            <label class="f"><span id="labono">A cuenta (abono)</span><input class="inp" name="abono" id="abono" inputmode="decimal" placeholder="0.00"></label>
            <div class="pay-opts">${METODOS.map((m, i) => `<label><input type="radio" name="metodo" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div>
            <div class="row between"><span class="muted">Resta</span><b class="num" id="tresta" style="font-size:18px">S/ 0.00</b></div>
            <div id="solo-encargo" class="form"><label class="f">Fecha de entrega<input class="inp" type="date" name="entrega" value="${esc(draft.entrega)}"></label>
            <label class="f">Notas para el laboratorio<textarea class="inp" name="notas" placeholder="Tipo de armado, altura, observaciones…">${esc(draft.notas)}</textarea></label></div>
            <label class="f">Comprobante<select class="inp" name="cptipo">${[['nota', 'Nota de venta'], ['boleta', 'Boleta de venta'], ['factura', 'Factura'], ['', 'Ninguno por ahora']].map(([v, t]) => `<option value="${v}" ${v === (fact().ruc ? 'boleta' : 'nota') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
            <button class="btn primary" style="padding:13px" id="ogo">${icon('check')} Registrar venta</button>
          </form></div></div>
        </div>
        <aside class="card vside"><div class="card-h"><h3 class="vs-eb">Resumen de la venta</h3></div><div class="card-b" id="vres"></div></aside>
      </div>
      <div class="vbar" id="vbar"></div>`;
  },
  bind() {
    const p = paciente(draft.pacienteId);
    const irPaso = n => {
      if (n > 1 && !draft.pacienteId) { toast('Primero elige el paciente'); n = 1; }
      else if (n > 2 && !draft.items.some(i => i.desc && num(i.cant) > 0)) { toast('Agrega al menos un producto'); n = 2; }
      draft.paso = n;
      $$('.vstep').forEach(c => c.classList.toggle('on', +c.dataset.paso === n));
      $$('#vsteps .stp').forEach(b => { const k = +b.dataset.paso; b.classList.toggle('on', k === n); b.classList.toggle('done', k < n); b.querySelector('span').innerHTML = k < n ? icon('check') : k; });
      resumen(); window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    // Resumen al costado (computadora) y barra de abajo (celular): total, a cuenta, saldo y el botón para avanzar.
    const resumen = () => {
      const med = db.medidas.find(m => m.id === draft.medidaId);
      const sub = draft.items.reduce((s, i) => s + num(i.cant) * num(i.precio), 0), tot = round2(sub - num(draft.descuento));
      const ab = $('#abono') ? Math.min(numPago($('#abono').value), Math.max(0, tot)) : 0;
      const sig = draft.paso < 3 ? `<button type="button" class="btn primary vnext" data-sig="${draft.paso + 1}">${draft.paso === 1 ? 'Continuar' : 'Ir a cobrar'} ${icon('back')}</button>` : '';
      $('#vres').innerHTML = `${p ? `<div class="row" style="gap:10px"><span class="ini">${initials(p.nombre)}</span><div class="grow" style="min-width:0"><b>${esc(p.nombre)}</b><div class="muted small">${med ? `Medida del ${fdate(med.fecha)}` : 'Sin medida'}</div></div></div>` : `<div class="muted small">Todavía no eliges al paciente.</div>`}
        <div class="vs-items">${draft.items.filter(i => i.desc).map(i => `<div class="row between"><span class="grow small">${esc(i.desc)}${num(i.cant) > 1 ? ` × ${num(i.cant)}` : ''}</span><b class="num small">${money(num(i.cant) * num(i.precio))}</b></div>`).join('') || '<div class="muted small">Sin productos todavía.</div>'}</div>
        <div class="vs-tot">${num(draft.descuento) ? `<div class="row between"><span class="muted">Descuento</span><span class="num">− ${money(num(draft.descuento))}</span></div>` : ''}<div class="row between big"><span>Total</span><b class="num">${money(tot)}</b></div>
        ${draft.paso === 3 ? `<div class="row between"><span class="muted">A cuenta</span><b class="num" style="color:var(--ok)">${money(ab)}</b></div><div class="row between"><span class="muted">Saldo al recoger</span><b class="num" style="color:${tot - ab > 0.009 ? 'var(--warn)' : 'var(--ok)'}">${money(Math.max(0, tot - ab))}</b></div>` : ''}</div>${sig}`;
      $('#vbar').innerHTML = `<div class="vt"><div><small>Total</small><b class="num">${money(tot)}</b></div><div><small>A cuenta</small><b class="num" style="color:var(--ok)">${money(ab)}</b></div><div><small>Saldo</small><b class="num" style="color:var(--warn)">${money(Math.max(0, tot - ab))}</b></div></div>${draft.paso < 3 ? sig : `<button type="button" class="btn primary vnext" id="vgo">${$('#ogo').innerHTML}</button>`}`;
      $$('.vnext[data-sig]').forEach(b => b.onclick = () => irPaso(+b.dataset.sig));
      $('#vgo') && ($('#vgo').onclick = () => $('#oform').requestSubmit());
    };
    $$('#vsteps .stp').forEach(b => b.onclick = () => irPaso(+b.dataset.paso));
    const drawItems = () => {
      $('#itbody').innerHTML = draft.items.length ? draft.items.map((it, i) => `<tr><td><input class="inp" data-i="${i}" data-k="desc" value="${esc(it.desc)}">${it.porLuna && num(it.cant) === 1 ? `<div class="lojo"><span class="small ${it.ojo ? 'muted' : 'strong'}" style="${it.ojo ? '' : 'color:var(--danger)'}">Una sola luna, ¿cuál?</span><div class="seg">${[['OD', 'Derecha (OD)'], ['OI', 'Izquierda (OI)']].map(([k, x]) => `<button type="button" data-ojo="${k}" data-i="${i}" class="${it.ojo === k ? 'on' : ''}">${x}</button>`).join('')}</div></div>` : ''}</td>
        <td><input class="inp c" data-i="${i}" data-k="cant" inputmode="numeric" value="${esc(it.cant)}"></td><td><input class="inp r num" data-i="${i}" data-k="precio" inputmode="decimal" value="${esc(it.precio)}" ${it.ref && !puede('descuentos') ? 'readonly title="El precio de la lista lo cambia el dueño o un socio"' : ''}></td>
        <td class="r num" id="st${i}">${money(num(it.cant) * num(it.precio))}</td><td><button type="button" class="btn ghost icon sm" data-del="${i}" aria-label="Quitar">${icon('x')}</button></td></tr>`).join('')
        : `<tr><td colspan="5" class="empty" style="padding:18px">Agrega una montura, lunas u otro producto.</td></tr>`;
      $$('#itbody [data-k]').forEach(inp => inp.oninput = () => { draft.items[inp.dataset.i][inp.dataset.k] = inp.value; if (inp.dataset.k === 'precio') draft.items[inp.dataset.i].auto = false; const it = draft.items[inp.dataset.i]; $('#st' + inp.dataset.i).textContent = money(num(it.cant) * num(it.precio)); calc(); });
      $$('#itbody [data-del]').forEach(b => b.onclick = () => { draft.items.splice(+b.dataset.del, 1); drawItems(); });
      const ponOjo = (it, ojo) => { it.ojo = ojo; it.desc = it.desc.replace(/ · solo O[DI]$/, '') + (ojo ? ' · solo ' + ojo : ''); };
      $$('#itbody [data-k="cant"]').forEach(inp => { const it = draft.items[inp.dataset.i]; if (it.porLuna) inp.onchange = () => { if (num(it.cant) !== 1) ponOjo(it, ''); drawItems(); }; });
      $$('#itbody [data-ojo]').forEach(b => b.onclick = () => { ponOjo(draft.items[b.dataset.i], b.dataset.ojo); drawItems(); });
      calc();
    };
    const calc = () => {
      const sub = draft.items.reduce((s, i) => s + num(i.cant) * num(i.precio), 0);
      draft.descuento = $('#tdesc').value;
      const tot = round2(sub - num(draft.descuento));
      $('#tsub').textContent = money(sub); $('#ttot').textContent = money(tot);
      // Venta directa: se cobra todo y se entrega en el momento. Se elige sola si no hay nada para el laboratorio.
      const dir = esDirecta(), ab = $('#abono');
      $$('#vtipo button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'directa') === dir));
      $('#vhint').textContent = dir ? 'Se cobra completo y queda entregada.' : 'Va al laboratorio: queda "En laboratorio" hasta que la entregues.';
      $('#labono').textContent = dir ? 'Cobrado (pago completo)' : 'A cuenta (abono)';
      if (dir) ab.value = Math.max(0, tot).toFixed(2); else if (ab.readOnly) ab.value = '';
      ab.readOnly = dir; $('#solo-encargo').hidden = dir;
      $('#ogo').innerHTML = `${icon('check')} ${dir ? 'Cobrar y entregar' : 'Registrar venta'}`;
      $('#tresta').textContent = money(Math.max(0, tot - numPago(ab.value)));
      resumen();
    };
    const esDirecta = () => draft.modo ? draft.modo === 'directa' : draft.items.length > 0 && !draft.items.some(i => itemLab(i, db.monturas));
    $$('#vtipo button').forEach(b => b.onclick = () => { draft.modo = b.dataset.v; calc(); });
    $('#tdesc').oninput = calc; $('#abono').oninput = calc;
    buscadorMonturas($('#mcode'), $('#mres'), m => {
      if (num(m.stock) <= 0) toast('Atención: esta montura figura sin stock');
      draft.items.push({ tipo: 'montura', ref: m.id, desc: descMontura(m), cant: 1, precio: m.precio });
      drawItems();
    });
    // Lunas: el rango (y el precio) sale de la medida elegida; se puede cambiar a mano.
    const medidaSel = () => db.medidas.find(m => m.id === draft.medidaId);
    let tSel = null, fSel = null, reflejo = '', colorFF = '', colBuscada = -1;
    // Foto Free: se elige el color (púrpura, rosado, celeste, verde). Blue: se elige el reflejo del AR (azul o verde).
    const esFF = c => /foto\s*-?\s*free/i.test(c), esBlue = c => /blue/i.test(c) && !esFF(c);
    const extraLuna = c => esFF(c) ? (colorFF ? ' · color ' + colorFF : '') : esBlue(c) && reflejo ? ' · reflejo ' + reflejo : '';
    const segOpc = (id, tit, val, ops) => `<div class="lrefl"><span class="small strong">${tit}</span><div class="seg" id="${id}">${[['', 'Sin especificar'], ...ops.map(o => [o, o[0].toUpperCase() + o.slice(1)])].map(([k, x]) => `<button type="button" data-r="${k}" class="${val === k ? 'on' : ''}">${x}</button>`).join('')}</div></div>`;
    const panel = () => {
      const box = $('#lpanel'), t = tSel;
      if (!t) { box.innerHTML = ''; return; }
      const med = medidaSel(), pot = potenciaMedida(med), auto = filaParaMedida(t, med);
      const fila = fSel ?? (auto >= 0 ? auto : tieneRangos(t) ? -1 : 0);
      const aviso = !tieneRangos(t) ? 'Toca el precio del tratamiento para agregarlo.'
        : !med ? 'Sin medida: toca el precio en la fila del rango que corresponde (o registra la medida del paciente).'
          : auto < 0 ? `<span style="color:var(--danger)">La medida (esf ±${n2r(pot.esf)}, cil −${n2r(pot.cil)}) pasa los rangos de esta lista. Toca el precio a mano o ponlo en "Otro producto".</span>`
            : `Según la medida (esf ±${n2r(pot.esf)}, cil −${n2r(pot.cil)}) le corresponde el <b>rango ${esc(t.filas[auto].rango)}</b> (marcado). Toca el precio del tratamiento.`;
      // Tabla completa: rangos en filas y tratamientos (UV, AR, Blue…) en columnas; se toca el precio para agregarlo.
      const tabla = `<div class="tbl-wrap lmat-w"><table class="lmat"><thead><tr><th>Rango</th>${t.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
        ${t.filas.map((f, i) => `<tr class="${i === auto ? 'auto' : ''} ${i === fila ? 'sel' : ''}"><td class="lr"><b>${esc(f.rango)}</b>${i === auto ? ' <span class="chip entr">Su medida</span>' : ''}${conRango(f) ? `<div class="muted small">esf ±${n2r(f.esf)} · cil −${n2r(f.cil)}</div>` : ''}</td>
          ${t.cols.map((_, j) => { const pr = precioTarifa(t, i, j); return pr ? `<td><button type="button" data-f="${i}" data-j="${j}" class="${j === colBuscada ? 'hl' : ''}"><small>${esc(t.cols[j])}</small>${money(pr)}</button></td>` : '<td class="nop"><span class="muted">—</span></td>'; }).join('')}</tr>`).join('')}</tbody></table></div>`;
      box.innerHTML = `<div class="lpanel"><b>${esc(t.nombre)}</b>
        <div class="small muted">${aviso}</div>
        ${t.cols.some(esBlue) ? segOpc('lrefl', 'Reflejo del Blue:', reflejo, ['azul', 'verde']) : ''}
        ${t.cols.some(esFF) ? segOpc('lff', 'Color del Foto Free:', colorFF, ['púrpura', 'rosado', 'celeste', 'verde']) : ''}
        ${tabla}
        ${extrasLuna().length ? `<div class="fld">Extras<div class="pick" id="lext">${extrasLuna().map(p => `<button type="button" data-p="${p.id}">${icon('plus')} ${esc(p.nombre)} <small>${money(p.precio)}</small></button>`).join('')}</div></div>
        <div class="lcolor" id="lcolor" hidden><div class="seg" id="lctipo"><button type="button" data-t="completo" class="on">Completo</button><button type="button" data-t="degradado">Degradado</button></div>
          <div class="fg"><label class="f">Tono<input class="inp sm" id="lctono" list="ltonos" placeholder="Gris, marrón, verde…" autocomplete="off"><datalist id="ltonos">${TONOS.map(t => `<option value="${t}">`).join('')}</datalist></label>
          <label class="f">Intensidad<select class="inp sm" id="lcpct"><option value="">Elegir %…</option>${Array.from({ length: 200 }, (_, i) => (i + 1) / 2).map(v => `<option value="${v}">${String(v).replace('.', ',')}%</option>`).join('')}</select></label></div>
          <button type="button" class="btn sm primary" id="lcadd">${icon('plus')} Agregar color</button></div>` : ''}</div>`;
      // "Color de lunas": se elige completo o degradado, el tono y el porcentaje antes de agregarlo.
      let colorP = null;
      $$('#lext [data-p]').forEach(b => b.onclick = () => {
        const p = producto(b.dataset.p);
        if (!/color/i.test(p.nombre)) { agregarProducto(p); b.classList.add('on'); return; }
        colorP = p; $('#lcolor').hidden = false; $('#lcadd').innerHTML = `${icon('plus')} Agregar color · ${money(p.precio)}`;
      });
      $$('#lctipo button').forEach(b => b.onclick = () => $$('#lctipo button').forEach(x => x.classList.toggle('on', x === b)));
      $('#lcadd') && ($('#lcadd').onclick = () => {
        const tipo = $('#lctipo .on').dataset.t, tono = $('#lctono').value.trim(), pct = $('#lcpct').value;
        const desc = [colorP.nombre, tipo, tono.toLowerCase(), pct && String(pct).replace('.', ',') + '%'].filter(Boolean).join(' ');
        draft.items.push({ tipo: 'producto', ref: colorP.id, desc, cant: 1, precio: colorP.precio }); drawItems();
        $('#lcolor').hidden = true; toast('Color agregado: ' + desc);
      });
      $$('#lrefl [data-r]').forEach(b => b.onclick = () => { reflejo = b.dataset.r; $$('#lrefl [data-r]').forEach(x => x.classList.toggle('on', x === b)); });
      $$('#lff [data-r]').forEach(b => b.onclick = () => { colorFF = b.dataset.r; $$('#lff [data-r]').forEach(x => x.classList.toggle('on', x === b)); });
      $$('.lmat [data-j]').forEach(b => b.onclick = () => {
        const j = +b.dataset.j, i = +b.dataset.f;
        const suf = extraLuna(t.cols[j]);
        draft.items.push({ tipo: 'luna', ref: t.id, col: j, fila: i, auto: i === auto, porLuna: true, suf, desc: descLuna(t, i, j) + suf, cant: 2, precio: round2(precioTarifa(t, i, j) / 2) });
        b.classList.add('on'); drawItems(); toast('Agregado: ' + t.cols[j] + ' · 2 lunas · ' + money(precioTarifa(t, i, j))); // el panel queda abierto para agregar un extra (color)
      });
    };
    // Si cambia la medida, las lunas que se pusieron solas se vuelven a calcular.
    const repreciar = () => {
      const med = medidaSel(); let n = 0;
      draft.items.forEach(it => {
        const t = it.tipo === 'luna' && it.auto && tarifa(it.ref); if (!t) return;
        const i = filaParaMedida(t, med), p = it.porLuna ? round2(precioTarifa(t, i, it.col) / 2) : precioTarifa(t, i, it.col);
        if (i < 0 || i === it.fila || !p) return;
        Object.assign(it, { fila: i, precio: p, desc: descLuna(t, i, it.col) + (it.suf ?? ((it.desc.match(/ · (reflejo|color) [^·]+$/) || [''])[0])) + (it.ojo ? ' · solo ' + it.ojo : '') }); n++;
      });
      return n;
    };
    $('#irlunas') && ($('#irlunas').onclick = () => { invTab = 'cristales'; });
    $('#csel').onchange = () => {
      const [k, id] = $('#csel').value.split(':');
      if (k === 't') { tSel = tarifa(id); fSel = null; colBuscada = -1; panel(); return; }
      tSel = null; panel();
      const c = k === 'c' && db.cristales.find(x => x.id === id); if (!c) return;
      draft.items.push({ tipo: 'cristal', ref: c.id, desc: 'Cristales ' + c.nombre, cant: 1, precio: c.precio });
      $('#csel').value = ''; drawItems();
    };
    // Buscar luna escribiendo: "monofocal blue", "inicial free ar"… Muestra lista + tratamiento y abre sus precios.
    const lq = $('#lq'), lres = $('#lres');
    const pintarLunas = () => {
      const q = lq.value.trim(), toks = sinTilde(q).split(/\s+/).filter(Boolean);
      const med = medidaSel(), hits = [];
      if (!toks.length) {
        // Sin escribir: todas las listas agrupadas (y los cristales de precio fijo) para elegir mirando.
        gruposTarifa().forEach(([g, ts]) => ts.forEach(t => hits.push({ t, j: -1, g })));
        db.cristales.forEach(c => hits.push({ c, g: 'Otros cristales (precio fijo)' }));
      } else {
        db.tarifas.forEach(t => t.cols.forEach((c, j) => {
          const txt = sinTilde(`${t.grupo} ${t.nombre} ${c}`);
          if (!toks.every(k => txt.includes(k))) return;
          const auto = filaParaMedida(t, med), precios = t.filas.map((_, i) => precioTarifa(t, i, j)).filter(Boolean);
          if (precios.length) hits.push({ t, j, auto, precio: auto >= 0 ? precioTarifa(t, auto, j) : Math.min(...precios) });
        }));
        db.cristales.filter(c => toks.every(k => sinTilde(c.nombre).includes(k))).forEach(c => hits.push({ c }));
      }
      let g0 = null;
      lres.innerHTML = hits.slice(0, toks.length ? 30 : 400).map((h, k) => (h.g && h.g !== g0 ? `<div class="grp">${esc(g0 = h.g)}</div>` : '') + (h.c
        ? `<a href="#" data-k="${k}"><span class="grow"><b>Cristales ${esc(h.c.nombre)}</b></span><b class="num">${money(h.c.precio)}</b></a>`
        : h.j < 0 ? `<a href="#" data-k="${k}"><span class="grow"><b>${esc(h.t.nombre)}</b><br><span class="muted small">${esc(h.t.cols.join(' · '))}</span></span></a>`
        : `<a href="#" data-k="${k}"><span class="grow"><b>${esc(h.t.nombre)}</b> · ${esc(h.t.cols[h.j])}<br><span class="muted small">${esc(h.t.grupo)}${h.auto >= 0 ? ' · rango ' + esc(h.t.filas[h.auto].rango) + ' (su medida)' : ''}</span></span><b class="num">${h.auto >= 0 ? '' : 'desde '}${money(h.precio)}</b></a>`)).join('')
        || `<div class="empty small">${toks.length ? `No hay lunas con “${esc(q)}”` : 'Aún no tienes precios de lunas.'}</div>`;
      lres.hidden = false;
      $$('[data-k]', lres).forEach(a => a.onmousedown = e => {
        e.preventDefault(); const h = hits[+a.dataset.k];
        lq.value = ''; lres.hidden = true; lq.blur();
        if (h.c) { $('#csel').value = 'c:' + h.c.id; $('#csel').onchange(); toast('Agregado: Cristales ' + h.c.nombre); return; }
        $('#csel').value = 't:' + h.t.id; tSel = h.t; fSel = null; colBuscada = h.j; panel();
        setTimeout(() => ($('.lmat .hl') || $('#lpanel'))?.scrollIntoView({ behavior: 'smooth', block: h.j < 0 ? 'start' : 'center' }), 50);
      });
    };
    lq.oninput = pintarLunas; lq.onfocus = pintarLunas;
    lq.onblur = () => setTimeout(() => { lres.hidden = true; }, 200);
    lq.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('[data-k="0"]', lres)?.dispatchEvent(new MouseEvent('mousedown')); } };
    const agregarProducto = p => {
      if (!p) return;
      if (conStock(p) && num(p.stock) <= 0) toast(`Atención: ${p.nombre} figura sin stock`);
      draft.items.push({ tipo: 'producto', ref: p.id, desc: p.nombre, cant: 1, precio: p.precio }); drawItems();
    };
    buscadorProductos($('#pq'), $('#prodres'), agregarProducto);
    repreciar();
    $('#addo').onclick = () => { draft.items.push({ tipo: 'otro', desc: '', cant: 1, precio: '' }); drawItems(); $$('#itbody [data-k=desc]').pop().focus(); };
    if (p) {
      $('#chp').onclick = () => { draft.pacienteId = ''; draft.medidaId = ''; draft.paso = 1; go('#/nueva-orden'); render(); };
      $('#msel') && ($('#msel').onchange = e => {
        draft.medidaId = e.target.value;
        if (repreciar()) { toast('Precio de las lunas ajustado a la medida'); drawItems(); }
        panel();
      });
      $('#addm').onclick = () => medidaForm(p);
    } else {
      const inp = $('#psearch'), res = $('#pres');
      inp.oninput = () => {
        const q = inp.value.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); if (!q) { res.hidden = true; return; }
        const ps = db.pacientes.filter(x => x.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q) || String(x.telefono).replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')).slice(0, 8);
        res.innerHTML = ps.map(x => `<a href="#" data-p="${x.id}"><span class="ini" style="width:30px;height:30px;font-size:12px">${initials(x.nombre)}</span><span><b>${esc(x.nombre)}</b><br><span class="muted small">${esc(x.telefono)}</span></span></a>`).join('') || `<div class="empty small">Sin resultados</div>`;
        res.hidden = false;
        $$('[data-p]', res).forEach(a => a.onclick = e => { e.preventDefault(); draft.pacienteId = a.dataset.p; draft.medidaId = ''; draft.paso = 2; render(); });
      };
      $$('[data-rp]').forEach(b => b.onclick = () => { draft.pacienteId = b.dataset.rp; draft.medidaId = ''; draft.paso = 2; render(); });
      if (!('ontouchstart' in window)) inp.focus();
      $('#newp2').onclick = () => pacienteFormForOrder();
    }
    $('#oform').onsubmit = e => {
      e.preventDefault();
      const f = readForm(e.target);
      if (!draft.pacienteId) { toast('Elige un paciente'); return; }
      if (draft.items.some(i => i.porLuna && num(i.cant) === 1 && !i.ojo)) { irPaso(2); toast('Indica si la luna es derecha (OD) o izquierda (OI)'); return; }
      const items = draft.items.filter(i => i.desc && num(i.precio) >= 0 && num(i.cant) > 0).map(i => ({ ...i, cant: num(i.cant), precio: num(i.precio) }));
      if (!items.length) { toast('Agrega al menos un producto'); return; }
      const dir = esDirecta();
      const tot = round2(items.reduce((s, i) => s + i.cant * i.precio, 0) - num(f.descuento));
      const registrar = monto => {
        const o = { id: uid(), numero: db.config.nextOrden++, pacienteId: draft.pacienteId, medidaId: draft.medidaId, fecha: hoy(), items, descuento: num(f.descuento), entrega: dir ? hoy() : f.entrega, notas: dir ? '' : f.notas, estado: dir ? 'entregado' : 'pendiente', por: user, creado: Date.now() };
        if (dir) Object.assign(o, { entregado: hoy(), directa: true });
        const ab = round2(Math.min(monto, tot));
        db.ordenes.push(o);
        if (ab > 0) db.pagos.push({ id: uid(), ordenId: o.id, fecha: hoy(), monto: ab, metodo: f.metodo, por: user, ts: Date.now(), tipo: 'abono' });
        moverStock(items, -1);
        save(); draft = null; toast(dir ? `Venta N° ${pad(o.numero)} cobrada y entregada` : `Orden N° ${pad(o.numero)} registrada`); go('#/orden/' + o.id);
        if (f.cptipo) emitirForm(o, f.cptipo);
      };
      if (dir) return registrar(tot);
      const ab = numPago(f.abono);
      if (ab > 0 || tot <= 0) return registrar(ab);
      // Sin monto escrito: se pregunta, para que no quede "por cobrar" algo que ya se pagó.
      modal({
        title: '¿El cliente pagó algo?', body: `<p style="margin:0">No escribiste cuánto dejó a cuenta. El total es <b>${money(tot)}</b>.</p>`,
        foot: `<button class="btn" id="nopago">Todavía no pagó</button><button class="btn accent" id="todo">${icon('check')} Pagó todo · ${esc(f.metodo)}</button>`,
        onMount: bg => { $('#nopago', bg).onclick = () => { closeModal(); registrar(0); }; $('#todo', bg).onclick = () => { closeModal(); registrar(tot); }; },
      });
    };
    drawItems(); irPaso(draft.paso);
  },
};
function pacienteFormForOrder() {
  modal({
    title: 'Paciente nuevo',
    body: `<form id="pq" class="form"><label class="f">DNI<input class="inp" name="dni" inputmode="numeric" maxlength="12" placeholder="Con el DNI se llena el nombre"></label><label class="f">Nombre completo<input class="inp" name="nombre" required></label><label class="f">Celular<input class="inp" name="telefono" inputmode="tel"></label></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="pq">Guardar</button>`,
    onMount: bg => { enlazarDoc($('[name=dni]', bg), $('[name=nombre]', bg)); $('#pq', bg).onsubmit = e => { e.preventDefault(); const f = readForm(e.target); const p = { id: uid(), creado: Date.now(), creadoF: hoy(), por: user, ...f }; db.pacientes.push(p); save(); draft.pacienteId = p.id; draft.paso = 2; closeModal(); render(); }; },
  });
}

routes.orden = {
  html(id) {
    const o = orden(id);
    if (!o) return `<div class="empty">Orden no encontrada. <a class="strong" href="#/ordenes">Volver</a></div>`;
    const p = paciente(o.pacienteId), m = db.medidas.find(x => x.id === o.medidaId);
    const tot = totalOrden(o), pag = pagadoOrden(o), sal = round2(tot - pag), pagos = pagosDe(o.id), cp = comprobanteDe(o.id);
    return `<a class="crumb" href="#/ordenes">${icon('back')} Pedidos</a>
      <div class="page-head"><div><h1>Pedido N° ${pad(o.numero)}</h1><p>${fdate(o.fecha, { day: 'numeric', month: 'long', year: 'numeric' })} · Atendió ${esc(socioName(o.por))}</p></div>
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
    $$('#est button').forEach(b => b.onclick = () => cambiarEstado(o, b.dataset.e));
    $('#addpay') && ($('#addpay').onclick = () => cobrarForm(o));
    $$('[data-pdel]').forEach(b => b.onclick = () => {
      const pg = db.pagos.find(x => x.id === b.dataset.pdel);
      dual(`Anular pago de ${money(pg.monto)} (${pg.metodo}) de la orden N° ${pad(o.numero)}`, () => { db.pagos = db.pagos.filter(x => x !== pg); save(); toast('Pago anulado'); render(); });
    });
    $('#oedit').onclick = () => dual(`Corregir productos o precios de la orden N° ${pad(o.numero)}`, () => ordenEdit(o));
    // Solo el dueño anula; la orden y sus pagos quedan guardados en "Ventas anuladas" (Ajustes).
    $('#odel').onclick = () => pideDueno(`Anular la orden N° ${pad(o.numero)} de ${p ? p.nombre : 'cliente'} · total ${money(totalOrden(o))} · pagado ${money(pagadoOrden(o))}`, () => {
      moverStock(o.items, +1);
      db.anuladas.unshift({ ...o, pacienteNombre: p ? p.nombre : '', total: totalOrden(o), pagos: pagosDe(o.id), anuladaTs: Date.now(), anuladaPor: user });
      db.pagos = db.pagos.filter(x => x.ordenId !== o.id); db.ordenes = db.ordenes.filter(x => x !== o); save(); toast('Orden anulada'); go('#/ordenes');
    }, 'anular');
    $('#ocp').onclick = () => { const cp = comprobanteDe(o.id); cp ? comprobanteView(cp) : emitirForm(o); };
    $('#owa') && ($('#owa').onclick = () => { if (o.estado === 'listo') { o.avisado = hoy(); save(); } });
  },
};
function cobrarForm(o, luego) {
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
        const f = readForm(e.target), monto = round2(Math.min(numPago(f.monto), s));
        if (monto <= 0) { toast('Monto inválido'); return; }
        const doit = () => { db.pagos.push({ id: uid(), ordenId: o.id, fecha: hoy(), monto, metodo: f.metodo, por: user, ts: Date.now(), tipo: 'saldo' }); save(); closeModal(); if (luego) luego(); else { toast('Pago registrado'); render(); } };
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
        moverStock(o.items, +1); // si cambian las cantidades, el stock se corrige
        o.items = items.map((i, k) => ({ ...i, desc: f['d' + k], cant: num(f['c' + k]), precio: num(f['p' + k]) })).filter(i => i.cant > 0);
        moverStock(o.items, -1);
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
      enlazarDoc(fDoc, fNom, fDir, { mayus: true });
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
      <button class="btn" id="cpdl">${icon('down')} Descargar</button>
      <button class="btn wa" id="cpshare">${icon('wa')} Compartir por WhatsApp</button>`,
    onMount: bg => {
      const make = async () => { try { return await comprobantePDF(c); } catch (e) { toast('No se pudo generar el PDF: ' + e.message); return null; } };
      $('#cpdl', bg).onclick = async () => { const b = await make(); if (b) saveFile(name, b); };
      // En el celular abre "Compartir" con el PDF: se elige WhatsApp y el chat del cliente.
      // En la computadora descarga el PDF y abre WhatsApp Web para adjuntarlo.
      $('#cpshare', bg).onclick = async () => {
        const b = await make(); if (!b) return;
        const file = new File([b], name, { type: 'application/pdf' });
        if (canShareFiles && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
        }
        await saveFile(name, b);
        window.open('https://web.whatsapp.com/', '_blank');
        toast('PDF descargado: adjúntalo en el chat del cliente');
      };
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
    const h = drawTicket(new jsPDF({ compress: true, unit: 'mm', format: [80, 1500] }), c, F);
    const doc = new jsPDF({ compress: true, unit: 'mm', format: [80, Math.max(h + 6, 90)] });
    drawTicket(doc, c, F);
    return doc.output('blob');
  }
  const doc = new jsPDF({ compress: true, unit: 'mm', format: 'a4' });
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

// Hoja para contar el inventario a mano: lo que dice el sistema y columnas en blanco para el conteo.
async function inventarioPDF() {
  const { jsPDF } = await loadJsPDF();
  const doc = new jsPDF({ compress: true, unit: 'mm', format: 'a4' });
  const M = 12, W = 210, H = 297, R = W - M;
  // columnas: N°, código, descripción, precio, stock del sistema, conteo, diferencia
  const X = { n: M, cod: M + 9, desc: M + 30, precio: 136, sis: 152, cont: 166, dif: 184 };
  const ahora = new Date();
  let y = 0, pag = 0;
  const encabezado = () => {
    pag++; y = 14;
    pdfText(doc, 'Inventario para conteo manual', M, y, { b: true, s: 15 });
    pdfText(doc, db.config.nombre || '', R, y, { b: true, s: 11, a: 'right', c: PDF_TEAL });
    y += 6;
    pdfText(doc, `Stock según el sistema al ${ahora.toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' })}`, M, y, { s: 9, c: PDF_GRAY });
    y += 7;
  };
  const cabecera = () => {
    doc.setFillColor(...PDF_NAVY); doc.rect(M, y, R - M, 7, 'F');
    const t = (s, x, a) => pdfText(doc, s, x, y + 4.8, { b: true, s: 8, c: [255, 255, 255], a });
    t('N°', X.n + 1); t('Código', X.cod); t('Descripción', X.desc); t('Precio', X.sis - 3, 'right'); t('Sistema', X.sis + 7, 'center'); t('Conteo', X.cont + 9, 'center'); t('Dif.', X.dif + 7, 'center');
    y += 7;
  };
  const salto = alto => { if (y + alto > H - 16) { doc.addPage(); encabezado(); cabecera(); } };
  const seccion = (titulo, filas, nota) => {
    salto(22);
    y += 3; pdfText(doc, `${titulo} (${filas.length})`, M, y + 4, { b: true, s: 11, c: PDF_TEAL });
    if (nota) pdfText(doc, nota, R, y + 4, { s: 8, c: PDF_GRAY, a: 'right' });
    y += 7;
    cabecera();
    if (!filas.length) { pdfText(doc, 'No hay registros.', X.desc, y + 5, { s: 9, c: PDF_GRAY }); y += 8; return; }
    filas.forEach((f, i) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
      const sub = f.sub ? doc.splitTextToSize(f.sub, X.precio - X.desc - 24) : [];
      const alto = sub.length ? 7.5 + sub.length * 3.2 : 8;
      salto(alto);
      if (i % 2) { doc.setFillColor(248, 246, 241); doc.rect(M, y, R - M, alto, 'F'); }
      pdfText(doc, i + 1, X.n + 1, y + 5, { s: 8, c: PDF_GRAY });
      pdfText(doc, f.cod, X.cod, y + 5, { s: 8 });
      pdfText(doc, f.titulo, X.desc, y + 5, { b: true, s: 8.5 });
      sub.forEach((l, k) => pdfText(doc, l, X.desc, y + 8.6 + k * 3.2, { s: 7.5, c: PDF_GRAY }));
      pdfText(doc, f.precio, X.sis - 3, y + 5, { s: 8, a: 'right' });
      pdfText(doc, f.stock, X.sis + 7, y + 5, { b: true, s: 9, a: 'center' });
      // casillas en blanco para escribir a mano
      doc.setDrawColor(...PDF_GRAY); doc.setLineWidth(0.25);
      doc.rect(X.cont + 1, y + 1.2, 16, alto - 2.4); doc.rect(X.dif + 1, y + 1.2, 12, alto - 2.4);
      doc.setDrawColor(...PDF_LINE); doc.line(M, y + alto, R, y + alto);
      y += alto;
    });
    const uni = filas.reduce((s, f) => s + (typeof f.n === 'number' ? f.n : 0), 0);
    y += 5; pdfText(doc, `Total en sistema: ${uni} unidades`, X.sis + 14, y, { b: true, s: 8.5, a: 'right' }); y += 3;
  };
  const orden = (a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
  const fMont = m => ({ cod: m.codigo, titulo: siglaMontura(m), sub: infoMontura(m), precio: money(m.precio), stock: String(num(m.stock)), n: num(m.stock) });
  encabezado();
  seccion('Monturas', db.monturas.filter(m => m.clase !== 'sol').sort(orden).map(fMont));
  seccion('Lentes de sol', db.monturas.filter(m => m.clase === 'sol').sort(orden).map(fMont));
  const grupos = {}; accesorios().forEach(p => { (grupos[p.grupo] = grupos[p.grupo] || []).push(p); });
  Object.entries(grupos).forEach(([g, ps]) => seccion(g, ps.map(p => ({ cod: '', titulo: p.nombre, sub: '', precio: money(p.precio), stock: conStock(p) ? String(num(p.stock)) : '—', n: conStock(p) ? num(p.stock) : null })),
    ps.some(p => !conStock(p)) ? '— = el sistema no lleva la cuenta de ese producto' : ''));
  salto(26); y += 10;
  pdfText(doc, 'Contado por: ______________________________', M, y, { s: 10 }); pdfText(doc, 'Fecha: ______________', 120, y, { s: 10 });
  y += 10; pdfText(doc, 'Firma: ______________________________', M, y, { s: 10 });
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) { doc.setPage(i); pdfText(doc, `Página ${i} de ${total}`, R, H - 8, { s: 8, c: PDF_GRAY, a: 'right' }); }
  return doc.output('blob');
}

function drawA4(doc, c, F) {
  const M = 14, W = 210, R = W - M, k = cpCalc(c), fa = c.tipo === 'factura';
  let y = 14, tx = M;
  let ey = y + 12;
  const ancho = F.logo && (F.logoRatio || 1) >= 2.2;
  if (F.logo && ancho) {
    // logo horizontal (ya trae el nombre): va arriba y los datos debajo
    const lw = 70, lh = lw / F.logoRatio;
    try { doc.addImage(F.logo, 'PNG', M, y - 2, lw, lh, 'logo', 'FAST'); } catch (e) { }
    ey = y + lh + 3;
  } else {
    if (F.logo) {
      const r = F.logoRatio || 1, lh = Math.min(26, 26 / r);
      try { doc.addImage(F.logo, 'PNG', M, y, lh * r, lh, 'logo', 'FAST'); tx = M + lh * r + 5; } catch (e) { }
    }
    pdfText(doc, db.config.nombre || F.razon, tx, y + 6, { b: 1, s: 16 });
  }
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
  const r = F.logoRatio || 1, ancho = F.logo && r >= 2.2;
  if (F.logo) { const w = ancho ? 62 : Math.min(30, 16 * r), h = w / r; try { doc.addImage(F.logo, 'PNG', X - w / 2, y, w, h, 'logo', 'FAST'); y += h + 4; } catch (e) { } }
  if (!ancho) { center(db.config.nombre || F.razon, { b: 1, s: 11 }); y += 0.5; }
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
  const socios = autorizantes().map(s => {
    const parte = round2(utilidad * num(s.pct) / 100);
    const v = vales.filter(x => x.socioId === s.id).reduce((a, x) => a + num(x.monto), 0);
    return { ...s, parte, vales: v, neto: round2(parte - v) };
  });
  return { pagos, gastos, vales, ingresos, tGastos, utilidad, porMetodo, socios };
}
routes.caja = {
  html(d) {
    d = puede('otrosDias') && d || hoy(); // el vendedor solo ve la caja de hoy
    const c = cajaData(d), lock = cerrado(d), cierre = db.cierres.find(x => x.fecha === d);
    const vendido = db.ordenes.filter(o => o.fecha === d).reduce((s, o) => s + totalOrden(o), 0);
    return `<div class="page-head"><div><h1>Caja del día</h1><p class="cap">${flong(d)}</p></div>
      <div class="actions">${puede('otrosDias') ? `<a class="btn icon" href="#/caja/${addDays(d, -1)}" title="Día anterior">${icon('back')}</a><input class="inp" type="date" id="cdate" value="${d}" style="width:auto">
        <a class="btn icon" href="#/caja/${addDays(d, 1)}" title="Día siguiente" style="transform:scaleX(-1)">${icon('back')}</a>${d !== hoy() ? `<a class="btn" href="#/caja">Hoy</a>` : ''}` : ''}
        ${puede('excel') ? `<button class="btn" id="cprint" title="Descargar para Excel">${icon('down')}<span class="hide-sm">Excel</span></button>` : ''}
        ${!puede('cerrarCaja') ? '' : lock ? `<button class="btn" id="reopen">${icon('unlock')} Reabrir</button>` : `<button class="btn primary" id="close">${icon('lock')} Cerrar caja</button>`}</div></div>
      ${lock ? `<div class="locked" style="margin-bottom:18px">${icon('lock')} Caja cerrada por ${esc(socioName(cierre.por))} el ${new Date(cierre.ts).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}. Cualquier cambio necesita la clave de los dos socios.</div>` : ''}
      <section class="cashc">
        <div class="cashc-m"><div class="row wrap" style="gap:8px"><span class="cashc-l">Efectivo que debe haber en la caja</span><span class="cashc-st">${lock ? `${icon('lock')} Cerrada` : '● Abierta'}</span></div>
          <div class="cashc-v num">${money(c.porMetodo[0].neto)}</div>
          <div class="cashc-brk"><span>Entró en efectivo <b class="num">+ ${money(c.porMetodo[0].inn)}</b></span>${c.porMetodo[0].out ? `<span>Gastos y vales <b class="num">− ${money(c.porMetodo[0].out)}</b></span>` : ''}</div>
          ${c.porMetodo.slice(1).some(x => x.inn || x.out) ? `<div class="cashc-met">${c.porMetodo.slice(1).filter(x => x.inn || x.out).map(x => `<span><i style="background:${METODO_COLOR[x.m]}"></i>${x.m} <b class="num">${money(x.neto)}</b></span>`).join('')}</div>` : ''}</div>
        <div class="cashc-side"><div class="hs"><span>Cobrado hoy</span><b class="num">${money(c.ingresos)}</b><em>Vendido: ${money(vendido)}</em></div>
          ${puede('ganancias') ? `<div class="hs"><span>Gastos</span><b class="num">${money(c.tGastos)}</b></div><div class="hs"><span>Ganancia del día</span><b class="num">${money(c.utilidad)}</b></div>` : ''}</div>
      </section>
      <div class="card mt"><div class="card-h"><h3>Ventas y cobros</h3><span class="sub">${c.pagos.length} movimiento${c.pagos.length === 1 ? '' : 's'}</span></div><div class="card-b"><div class="tbl-wrap">
        ${c.pagos.length ? `<table><thead><tr><th>N° orden</th><th>Paciente</th><th class="hide-sm">Compró</th><th class="r">Total</th><th class="r">Abonó</th><th class="r">Resta</th><th>Método</th></tr></thead><tbody>
        ${c.pagos.map(pg => { const o = orden(pg.ordenId); if (!o) return ''; const pagadoHasta = round2(pagosDe(o.id).filter(x => x.fecha < pg.fecha || (x.fecha === pg.fecha && (x.ts || 0) <= (pg.ts || 0))).reduce((s, x) => s + num(x.monto), 0));
          return `<tr class="link" data-h="#/orden/${o.id}"><td class="ordnum">${pad(o.numero)}</td><td><b>${esc(paciente(o.pacienteId)?.nombre)}</b>${pg.tipo === 'saldo' ? '<div class="muted small">Pago de saldo</div>' : ''}</td><td class="hide-sm small muted">${esc(o.items.map(i => i.desc).join(' · ')).slice(0, 70)}</td>
          <td class="r num">${money(totalOrden(o))}</td><td class="r num strong">${money(pg.monto)}</td><td class="r num" style="${totalOrden(o) - pagadoHasta > 0.009 ? 'color:var(--danger)' : ''}">${money(Math.max(0, totalOrden(o) - pagadoHasta))}</td><td><span class="tag">${esc(pg.metodo)}</span></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="4" class="r hide-sm-no">Total cobrado</td><td class="r num">${money(c.ingresos)}</td><td colspan="2"></td></tr></tfoot></table>` : `<div class="empty">No hay cobros este día.</div>`}</div></div></div>
      ${puede('gastos') || puede('vales') ? `<div class="grid ${puede('gastos') && puede('vales') ? 'g2' : ''} mt">
        ${!puede('gastos') ? '' : `<div class="card"><div class="card-h"><h3>Gastos</h3><button class="btn sm" id="addg">${icon('plus')} Gasto</button></div><div class="card-b">
          ${c.gastos.length ? `<table><tbody>${c.gastos.map(g => `<tr><td><b>${esc(g.concepto)}</b><div class="muted small">${esc(g.metodo || 'Efectivo')} · ${esc(socioName(g.por))}</div></td><td class="r num">${money(g.monto)}</td><td style="width:40px"><button class="btn ghost icon sm" data-gdel="${g.id}" title="Eliminar">${icon('trash')}</button></td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total gastos</td><td class="r num">${money(c.tGastos)}</td><td></td></tr></tfoot></table>` : `<div class="empty" style="padding:14px">Sin gastos.</div>`}</div></div>`}
        ${!puede('vales') ? '' : `<div class="card"><div class="card-h"><h3>Vales de los socios</h3><button class="btn sm" id="addv">${icon('plus')} Vale</button></div><div class="card-b">
          ${c.vales.length ? `<table><tbody>${c.vales.map(v => `<tr><td><b>${esc(socioName(v.socioId))}</b><div class="muted small">${esc(v.concepto || 'Vale')}</div></td><td class="r num">${money(v.monto)}</td><td style="width:40px"><button class="btn ghost icon sm" data-vdel="${v.id}" title="Eliminar">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : `<div class="empty" style="padding:14px">Sin vales.</div>`}</div></div>`}
      </div>` : ''}
      <div class="grid ${puede('ganancias') ? 'g2' : ''} mt">
        <div class="card"><div class="card-h"><h3>Cuadre por método</h3></div><div class="card-b tbl-wrap"><table><thead><tr><th>Método</th><th class="r">Entró</th><th class="r">Salió</th><th class="r">Queda</th></tr></thead><tbody>
          ${c.porMetodo.map(x => `<tr><td><span class="row" style="gap:8px"><i style="width:10px;height:10px;border-radius:3px;background:${METODO_COLOR[x.m]}"></i>${x.m}</span></td><td class="r num">${money(x.inn)}</td><td class="r num muted">${x.out ? '− ' + money(x.out) : '—'}</td><td class="r num strong">${money(x.neto)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="r num">${money(c.ingresos)}</td><td class="r num">− ${money(c.tGastos + c.vales.reduce((s, v) => s + num(v.monto), 0))}</td><td class="r num">${money(c.porMetodo.reduce((s, x) => s + x.neto, 0))}</td></tr></tfoot></table></div></div>
        ${!puede('ganancias') ? '' : `<div class="card"><div class="card-h"><h3>Ganancia por socio</h3><span class="sub">Ganancia ${money(c.utilidad)}</span></div><div class="card-b"><div class="grid g2 partner-grid" style="gap:12px">
          ${c.socios.map(s => `<div class="partner"><div class="row" style="gap:10px"><span class="avatar">${initials(s.nombre)}</span><b>${esc(s.nombre)}</b><span class="muted small" style="margin-left:auto">${s.pct}%</span></div>
            <div class="cash-sum mt-s small"><div class="line" style="padding:2px 0"><span class="muted">Su parte</span><span class="num">${money(s.parte)}</span></div><div class="line" style="padding:2px 0"><span class="muted">Vales</span><span class="num">− ${money(s.vales)}</span></div></div>
            <div class="v num">${money(s.neto)}</div></div>`).join('')}</div></div></div>`}
      </div>`;
  },
  bind(d) {
    d = puede('otrosDias') && d || hoy();
    const lock = cerrado(d);
    const guard = (motivo, cb) => lock ? dual(motivo + ` (caja del ${fdate(d)} cerrada)`, cb) : cb();
    $('#cdate') && ($('#cdate').onchange = e => go('#/caja/' + e.target.value));
    $$('[data-h]').forEach(r => r.onclick = () => go(r.dataset.h));
    $('#addg') && ($('#addg').onclick = () => guard('Agregar gasto', () => gastoForm(d)));
    $('#addv') && ($('#addv').onclick = () => guard('Agregar vale', () => valeForm(d)));
    $$('[data-gdel]').forEach(b => b.onclick = () => { const g = db.gastos.find(x => x.id === b.dataset.gdel); dual(`Eliminar gasto "${g.concepto}" de ${money(g.monto)}`, () => { db.gastos = db.gastos.filter(x => x !== g); save(); render(); }); });
    $$('[data-vdel]').forEach(b => b.onclick = () => { const v = db.vales.find(x => x.id === b.dataset.vdel); dual(`Eliminar vale de ${socioName(v.socioId)} por ${money(v.monto)}`, () => { db.vales = db.vales.filter(x => x !== v); save(); render(); }); });
    $('#close') && ($('#close').onclick = () => confirmBox(`¿Cerrar la caja del ${flong(d)}? Después, cualquier cambio en este día necesitará la clave de los dos socios.`, () => { db.cierres.push({ fecha: d, por: user, ts: Date.now() }); addLog('Cierre de caja ' + d); save(); toast('Caja cerrada'); render(); }, 'Cerrar caja'));
    $('#reopen') && ($('#reopen').onclick = () => dual(`Reabrir la caja del ${fdate(d)}`, () => { db.cierres = db.cierres.filter(x => x.fecha !== d); save(); render(); }));
    $('#cprint') && ($('#cprint').onclick = () => cajaCSV(d));
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
    body: `<form id="vf" class="form"><label class="f">Socio<select class="inp" name="socioId">${autorizantes().map(s => `<option value="${s.id}" ${s.id === user ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></label>
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

// ---------- Monturas: siglas y búsqueda ----------
const sinTilde = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const alnum = s => sinTilde(s).replace(/[^a-z0-9]/g, '');
const abrev = () => db.config.abrev;
// Sigla de un valor (Dama → D); si no está en la tabla se usan sus 3 primeras letras.
const abr = (g, v) => v ? ((abrev()[g] || []).find(([n]) => sinTilde(n) === sinTilde(v)) || [, alnum(v).slice(0, 3).toUpperCase()])[1] : '';
const abrMarca = marca => alnum(marca).slice(0, 4).toUpperCase();
// Si la marca ya se usó, se repite la sigla que se le puso antes.
const abrMarcaUsada = marca => (db.monturas.find(x => x.marcaAbr && alnum(x.marca) === alnum(marca)) || {}).marcaAbr || abrMarca(marca);
function siglaMontura(m) {
  // Lentes de sol: SOL + marca + colores completos, ej. SOLPUMA NEGRO
  if (m.clase === 'sol') return ['SOL' + (m.marcaAbr || abrMarca(m.marca)), (m.colores || []).map(c => c.toUpperCase()).join('/')].filter(Boolean).join(' ');
  const gm = [abr('genero', m.genero), abr('material', m.material)].filter(Boolean).join('.');
  const fa = [abr('forma', m.forma), abr('aro', m.aro)].filter(Boolean).join('/');
  const col = (m.colores || []).map(c => abr('color', c)).join('/');
  return [gm, m.marcaAbr || abrMarca(m.marca), fa, col].filter(Boolean).join(' ');
}
const varillaDe = m => [m.varilla, m.colorCod].filter(Boolean).join(' ');
const coloresDe = m => (m.colores || []).join(' / ') || m.color || '';
const infoMontura = m => [[m.marca, m.modelo].filter(Boolean).join(' '), varillaDe(m) && 'varilla ' + varillaDe(m), coloresDe(m)].filter(Boolean).join(' · ');
const descMontura = m => `${m.clase === 'sol' ? 'Lentes de sol' : 'Montura'} ${[m.marca, m.modelo, varillaDe(m)].filter(Boolean).join(' ')}${coloresDe(m) ? ' · ' + coloresDe(m) : ''} (${m.codigo})`;
const chipStock = m => num(m.stock) <= 0 ? 'deuda' : 'plain';
// "4321 C2" → varilla 4321, color de fábrica C2; si no son números se toma como marca.
function varillaDeTexto(q) {
  const r = /^(\d{3,6})\s*(?:[-/]?\s*c\s*(\d{1,3}))?$/i.exec(String(q || '').trim());
  return r ? { varilla: r[1], colorCod: r[2] ? 'C' + r[2] : '' } : q ? { marca: q } : {};
}
function nuevoCodigo() {
  const max = Math.max(0, ...db.monturas.map(x => +((/^M(\d+)$/i.exec(x.codigo) || [])[1] || 0)));
  return 'M' + pad(Math.max(db.config.nextMontura || 1, max + 1), 5);
}
// Busca por N° de varilla (4321 o 4321 C2), código interno, marca, sigla, color, etc.
function buscarMonturas(q) {
  const toks = sinTilde(q).split(/\s+/).filter(Boolean), qa = alnum(q);
  if (!toks.length) return db.monturas.slice();
  return db.monturas.map(m => {
    const vc = alnum(m.varilla + (m.colorCod || ''));
    const texto = sinTilde([m.codigo, m.marca, m.modelo, siglaMontura(m), m.varilla, m.colorCod, m.genero, m.material, m.forma, m.aro, coloresDe(m), m.clase === 'sol' ? 'lentes de sol solar' : 'montura'].join(' '));
    const pts = alnum(m.codigo) === qa || (vc && vc === qa) ? 3 : vc && qa.length >= 3 && vc.startsWith(qa) ? 2 : toks.every(t => texto.includes(t)) ? 1 : 0;
    return [m, pts];
  }).filter(x => x[1]).sort((a, b) => b[1] - a[1] || a[0].codigo.localeCompare(b[0].codigo, 'es', { numeric: true })).map(x => x[0]);
}
// Misma marca y mismo código de varilla (o, sin varilla, misma descripción): es la misma montura.
function monturaIgual(f, excepto) {
  if (!f.marca) return null;
  return db.monturas.find(x => x !== excepto && (x.clase || '') === (f.clase || '') && alnum(x.marca) === alnum(f.marca) && (f.varilla
    ? alnum(x.varilla) === alnum(f.varilla) && alnum(x.colorCod) === alnum(f.colorCod)
    : !x.varilla && alnum(x.modelo) === alnum(f.modelo) && siglaMontura(x) === siglaMontura(f)));
}
const filaMontura = m => `<span class="grow" style="min-width:0"><b class="sigla">${esc(siglaMontura(m))}</b><br><span class="muted small">${esc(infoMontura(m))} · ${esc(m.codigo)}</span></span>
  <span style="text-align:right;white-space:nowrap"><b class="num">${money(m.precio)}</b><br><span class="chip ${chipStock(m)}">${m.stock} en stock</span></span>`;
// Caja de búsqueda con resultados; Enter elige el primero.
function buscadorMonturas(inp, res, onPick) {
  let lista = [];
  const pick = m => { inp.value = ''; res.hidden = true; lista = []; onPick(m); };
  inp.oninput = () => {
    const q = inp.value.trim();
    lista = q ? buscarMonturas(q).slice(0, 12) : db.monturas.filter(m => num(m.stock) > 0).sort((a, b) => b.codigo.localeCompare(a.codigo, 'es', { numeric: true })).slice(0, 40);
    res.innerHTML = (q ? '' : `<div class="grp">Escribe varilla, marca, sigla o código · últimas monturas</div>`) + (lista.map(m => `<a href="#" data-m="${m.id}">${filaMontura(m)}</a>`).join('') || `<div class="empty small">${q ? `No hay monturas con “${esc(q)}”` : 'Todavía no hay monturas con stock.'}</div>`);
    res.hidden = false;
    $$('[data-m]', res).forEach(a => a.onclick = e => { e.preventDefault(); pick(db.monturas.find(x => x.id === a.dataset.m)); });
  };
  inp.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); if (lista[0]) pick(lista[0]); }
    if (e.key === 'Escape') res.hidden = true;
  };
  if (!res.classList.contains('static')) { inp.onfocus = inp.oninput; inp.onblur = () => setTimeout(() => { res.hidden = true; }, 200); }
}

// ---------- Lista de precios de lunas ----------
// Cada lista tiene tratamientos (columnas) y rangos (filas). En la venta se elige sola la primera fila
// cuyo "esf hasta" y "cil hasta" alcancen la medida del paciente (el ojo con más esfera y más cilindro).
function tarifasDef() {
  const R3 = [['I', 6, 2], ['II', 6, 4], ['III', 6, 6]];
  const R4 = [['I', 6, 2], ['II', 6, 4], ['III', 8, 6], ['F', 20, 6]];
  const MONO = ['UV', 'AR', 'Blue import', 'Blue', 'Blue foto AR', 'Fotomatic', 'Fotomatic AR'];
  const C6 = ['UV', 'AR', 'Blue', 'Blue foto AR', 'Foto AR', 'Fotomatic'];
  const ESP = ['Tessler blue AR', 'Drive AR blue', 'Drive foto blue AR', 'Foto free AR', 'Foto free AR blue'];
  const t = (id, grupo, nombre, cols, rangos, precios) => ({ id, grupo, nombre, cols, filas: rangos.map(([rango, esf, cil], i) => ({ rango, esf, cil, precios: precios[i] })) });
  return [
    t('mono-c39', 'Monofocales', 'Monofocal C-39', MONO, [...R3, ['IIII', 10, 6], ['Combi fábrica', 20, 6]],
      [[80, 95, 140, 170, 230, 130, 160], [90, 120, 180, 200, 250, 180, 280], [150, 200, 250, 270, 290, 240, 260], [180, 260, 500, 490, 600, 370, 390], [300, 370, 650, 680, 650, 500, 570]]),
    t('mono-poli', 'Monofocales', 'Monofocal Policarbonato', MONO, R3,
      [[80, 100, 190, 250, 390, 230, 250], [150, 190, 230, 300, 450, 280, 320], [200, 250, 300, 390, 550, 350, 430]]),
    t('mono-cristal', 'Monofocales', 'Monofocal Cristal', ['UV', 'AR', 'Foto grey', 'Foto brown'], [...R3, ['Combi fábrica', 20, 6]],
      [[80, 120, 130, 150], [90, 170, 200, 240], [150, 300, 390, 430], [390, 490, 690, 750]]),
    t('mono-digital-foto', 'Monofocales', 'Monofocal digital Foto Free', ['Foto free AR', 'Foto free blue AR', 'Foto Driver blue AR', 'Driver blue AR'], [['I', 6, 6]],
      [[450, 600, 600, 550]]),
    t('mono-digital-indice', 'Monofocales', 'Monofocal digital por índice', ['AR', 'Blue', 'Foto AR', 'Blue foto AR'], [['Índice 1.49', '', ''], ['Índice 1.61', '', ''], ['Índice 1.67', '', ''], ['Índice 1.74', '', '']],
      [[310, 430, 470, 520], [480, 570, 600, 660], [540, 630, 660, 720], [630, 720, 780, 840]]),
    t('mono-tessler', 'Monofocales', 'Tessler deportes (índice 1.60)', ['Blue'], [['I', 6, 2], ['II', 6, 4], ['Combi fábrica', 10, 6]],
      [[270], [360], [600]]),
    t('bi-flaptop', 'Bifocales', 'Bifocal Flaptop', C6, R4,
      [[120, 150, 290, 400, 289, 280], [150, 170, 350, 450, 350, 300], [180, 200, 380, 530, 400, 350], [350, 400, 500, 790, 500, 480]]),
    t('bi-invisible', 'Bifocales', 'Bifocal Invisible', C6, R4,
      [[145, 210, 300, 420, 390, 340], [200, 240, 350, 450, 400, 350], [300, 340, 380, 530, 450, 410], [450, 490, 500, 790, 500, 480]]),
    t('bi-cristal', 'Bifocales', 'Bifocal Cristal', ['UV', 'AR', 'Foto grey', 'Foto grey AR'], R4,
      [[290, 390, 400, 430], [320, 420, 550, 570], [450, 550, 650, 690], [590, 490, 690, 750]]),
    t('bi-digital', 'Bifocales', 'Bifocal Digital', C6, R4,
      [[300, 350, 500, 600, 530, 500], [350, 390, 550, 650, 580, 550], [400, 450, 600, 700, 630, 600], [500, 600, 700, 800, 670, 630]]),
    t('bi-digital-esp', 'Bifocales', 'Bifocal Digital especial', ESP, R4,
      [[580, 520, 660, 520, 620], [600, 550, 700, 550, 700], [670, 600, 740, 600, 780], [730, 690, 840, 690, 860]]),
    t('multi-conv', 'Multifocales', 'Multifocal convencional', C6, R4,
      [[250, 320, 390, 490, 390, 350], [300, 370, 410, 550, 440, 400], [390, 440, 468, 600, 480, 440], [450, 550, 650, 890, 580, 540]]),
    t('multi-inicial', 'Multifocales', 'Inicial Free (digital 180°)', C6, R4,
      [[350, 390, 550, 670, 630, 600], [400, 460, 610, 550, 690, 660], [460, 520, 670, 600, 750, 720], [510, 570, 730, 890, 810, 780]]),
    t('multi-inicial-esp', 'Multifocales', 'Inicial Free especial', ESP, R4,
      [[680, 620, 720, 650, 750], [760, 700, 780, 730, 830], [820, 780, 860, 810, 910], [900, 860, 900, 890, 990]]),
    t('multi-free', 'Multifocales', 'Multi Free (digital 180°)', C6, R4,
      [[450, 520, 600, 750, 700, 650], [530, 600, 680, 830, 780, 740], [610, 680, 760, 910, 860, 820], [690, 760, 840, 990, 940, 900]]),
    t('multi-free-esp', 'Multifocales', 'Multi Free especial', ESP, R4,
      [[780, 680, 830, 730, 830], [780, 760, 910, 810, 910], [860, 840, 990, 890, 920], [940, 920, 1070, 970, 1000]]),
    t('prem-spektrum', 'Digital Premium 180°', 'Spektrum Hiper', C6, R4,
      [[840, 880, 990, 1150, 980, 940], [920, 960, 1070, 1230, 1060, 1020], [1000, 1040, 1150, 1310, 1140, 1100], [1080, 1120, 1230, 1390, 1220, 1180]]),
    t('prem-spektrum-esp', 'Digital Premium 180°', 'Spektrum especial', ESP, R4,
      [[920, 990, 1150, 1150, 1200], [1000, 1070, 1230, 1100, 1280], [1080, 1150, 1310, 1050, 1360], [1160, 1230, 1390, 1000, 1440]]),
    t('prem-ergo', 'Digital Premium 180°', 'Ergo Miopía', C6, R4,
      [[840, 880, 990, 1150, 980, 940], [920, 960, 1070, 1230, 1060, 1020], [1000, 1040, 1150, 1310, 1140, 1100], [1080, 1120, 1230, 1390, 1220, 1180]]),
    t('prem-ergo-esp', 'Digital Premium 180°', 'Ergo especial', ESP, R4,
      [[920, 990, 1150, 1150, 1200], [1000, 1070, 1230, 1100, 1280], [1080, 1150, 1310, 1050, 1360], [1160, 1230, 1390, 1000, 1440]]),
    t('prem-smart', 'Digital Premium 180°', 'Smart', C6, R4,
      [[900, 980, 1090, 1250, 1180, 1150], [950, 1030, 1140, 1300, 1230, 1200], [1000, 1080, 1190, 1350, 1280, 1250], [1050, 1130, 1240, 1400, 1330, 1300]]),
    t('prem-smart-esp', 'Digital Premium 180°', 'Smart especial', ESP, R4,
      [[1000, 1070, 1230, 1230, 1280], [1080, 1150, 1310, 1310, 1360], [1160, 1230, 1390, 1390, 1440], [1240, 1310, 1470, 1470, 1520]]),
  ];
}
const tarifa = id => db.tarifas.find(t => t.id === id);
const conRango = f => f.esf !== '' && f.esf != null;
const tieneRangos = t => t.filas.some(conRango);
const precioTarifa = (t, i, j) => i >= 0 && t.filas[i] ? num(t.filas[i].precios[j]) : 0;
const n2r = v => num(v).toFixed(2).replace(/\.00$/, '');
const filaTexto = f => conRango(f) ? `Rango ${f.rango} · esf hasta ±${n2r(f.esf)} · cil hasta −${n2r(f.cil)}` : f.rango;
const descLuna = (t, i, j) => `Lunas ${t.nombre} · ${t.cols[j]} · ${conRango(t.filas[i]) ? 'rango ' + t.filas[i].rango : t.filas[i].rango}`;
function gruposTarifa() {
  const g = new Map(); db.tarifas.forEach(t => { if (!g.has(t.grupo)) g.set(t.grupo, []); g.get(t.grupo).push(t); });
  return [...g.entries()];
}
// Lo más alto de los dos ojos: esfera y cilindro en valor absoluto.
function potenciaMedida(med) {
  if (!med) return null;
  const ojos = [med.od || {}, med.oi || {}];
  return { esf: Math.max(...ojos.map(o => Math.abs(num(o.esf)))), cil: Math.max(...ojos.map(o => Math.abs(num(o.cil)))) };
}
// -1 si la medida pasa todos los rangos (o no hay medida); las filas sin rango se eligen a mano.
function filaParaMedida(t, med) {
  const p = potenciaMedida(med); if (!p) return -1;
  return t.filas.findIndex(f => conRango(f) && p.esf <= num(f.esf) + 1e-9 && p.cil <= num(f.cil) + 1e-9);
}
function tarifaForm(t) {
  const e = t ? JSON.parse(JSON.stringify(t)) : { id: uid(), grupo: '', nombre: '', cols: ['UV', 'AR'], filas: [{ rango: 'I', esf: 6, cil: 2, precios: ['', ''] }] };
  const grupos = [...new Set(db.tarifas.map(x => x.grupo))];
  modal({
    title: t ? 'Editar lista de precios' : 'Nueva lista de precios', wide: true,
    body: `<form id="tf" class="form"><div class="fg"><label class="f">Grupo<input class="inp" name="grupo" list="tgrupos" required value="${esc(e.grupo)}" placeholder="Ej. Monofocales"><datalist id="tgrupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
      <label class="f">Nombre<input class="inp" name="nombre" required value="${esc(e.nombre)}" placeholder="Ej. Monofocal C-39"></label></div>
      <p class="hint" style="margin:0">En la venta se elige sola la primera fila que alcance la medida del paciente (el ojo con más esfera y más cilindro). Deja vacío “Esf hasta” en las filas que se eligen a mano, como las de índice.</p>
      <div class="tbl-wrap"><table class="tedit" id="tgrid"></table></div>
      <div class="actions"><button type="button" class="btn sm" id="taddf">${icon('plus')} Fila (rango)</button><button type="button" class="btn sm" id="taddc">${icon('plus')} Tratamiento</button></div></form>`,
    foot: `${t ? `<button class="btn danger" id="tdel" style="margin-right:auto">${icon('trash')}</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" form="tf">Guardar</button>`,
    onMount: bg => {
      const grid = $('#tgrid', bg);
      const leer = () => {
        $$('[data-c]', grid).forEach(i => { e.cols[+i.dataset.c] = i.value.trim(); });
        $$('[data-f]', grid).forEach(i => { const [r, k, j] = i.dataset.f.split(':'), f = e.filas[+r]; if (k === 'p') f.precios[+j] = i.value.trim(); else f[k] = i.value.trim(); });
      };
      const x = a => `<button type="button" class="btn ghost icon sm" ${a} aria-label="Quitar">${icon('x')}</button>`;
      const pintar = () => {
        grid.innerHTML = `<thead><tr><th>Rango</th><th>Esf hasta ±</th><th>Cil hasta −</th>${e.cols.map((c, j) => `<th><div class="row" style="gap:2px"><input class="inp sm" data-c="${j}" value="${esc(c)}" placeholder="Tratamiento">${x(`data-xc="${j}"`)}</div></th>`).join('')}<th></th></tr></thead>
          <tbody>${e.filas.map((f, r) => `<tr><td><input class="inp sm" data-f="${r}:rango" value="${esc(f.rango)}"></td><td><input class="inp sm" data-f="${r}:esf" inputmode="decimal" value="${esc(f.esf)}"></td><td><input class="inp sm" data-f="${r}:cil" inputmode="decimal" value="${esc(f.cil)}"></td>
            ${e.cols.map((_, j) => `<td><input class="inp sm num" data-f="${r}:p:${j}" inputmode="decimal" value="${esc(f.precios[j] ?? '')}"></td>`).join('')}<td>${x(`data-xf="${r}"`)}</td></tr>`).join('')}</tbody>`;
      };
      grid.addEventListener('click', ev => {
        const c = ev.target.closest('[data-xc]'), f = ev.target.closest('[data-xf]'); if (!c && !f) return;
        leer();
        if (c) { const j = +c.dataset.xc; e.cols.splice(j, 1); e.filas.forEach(r => r.precios.splice(j, 1)); }
        else e.filas.splice(+f.dataset.xf, 1);
        pintar();
      });
      $('#taddf', bg).onclick = () => { leer(); const u = e.filas[e.filas.length - 1]; e.filas.push({ rango: '', esf: u ? u.esf : '', cil: u ? u.cil : '', precios: e.cols.map(() => '') }); pintar(); };
      $('#taddc', bg).onclick = () => { leer(); e.cols.push(''); e.filas.forEach(r => r.precios.push('')); pintar(); $$('[data-c]', grid).pop().focus(); };
      pintar();
      $('#tf', bg).onsubmit = ev => {
        ev.preventDefault(); leer();
        const f = readForm(ev.target);
        if (!e.cols.length || e.cols.some(c => !c)) return toast('Ponle nombre a cada tratamiento');
        if (!e.filas.length) return toast('Agrega al menos una fila');
        e.grupo = f.grupo; e.nombre = f.nombre;
        e.filas = e.filas.map(r => ({ rango: r.rango || '—', esf: String(r.esf).trim() === '' ? '' : num(r.esf), cil: String(r.cil).trim() === '' ? (String(r.esf).trim() === '' ? '' : 0) : num(r.cil), precios: r.precios.map(p => String(p).trim() === '' ? '' : num(p)) }));
        if (t) Object.assign(t, e); else db.tarifas.push(e);
        addLog(`Lista de precios "${e.nombre}" ${t ? 'modificada' : 'creada'}`, [dueno().id]);
        save(); closeModal(); toast('Lista de precios guardada'); render();
      };
      $('#tdel', bg) && ($('#tdel', bg).onclick = () => confirmBox(`¿Eliminar la lista "${esc(t.nombre)}"?`, () => { db.tarifas = db.tarifas.filter(x => x !== t); addLog(`Lista de precios "${t.nombre}" eliminada`, [dueno().id]); save(); render(); }, 'Eliminar'));
    },
  });
}

// ---------- Repuestos y otros productos ----------
// Lista de Jorge (foto del 23/09). El stock es opcional: vacío = no se lleva control.
function productosDef() {
  const rep = [['Topes', 15], ['Mantenimiento', 10], ['Varillas (par)', 60], ['Plaquetas (par)', 5], ['Terminales (par)', 40], ['Puente teléfono', 15],
    ['Varillas niño de goma (par)', 60], ['Plaquetas niño de goma (par)', 25], ['Tuercas (unidad)', 3], ['Tornillos (unidad)', 3], ['Soldadura plástica', 20],
    ['Soldadura por punto', 18], ['Nylon', 10], ['Flex tambor', 18], ['Pase', 10], ['Flex', 20], ['Sujetador simple', 3], ['Sujetador deportivo', 20],
    ['Sujetador dama con pedrería', 25], ['Fórmula para lavar gafas', 10], ['Estuche cofre', 10], ['Estuche grande cofre y deportivo', 20]];
  return [...rep.map(([nombre, precio], i) => ({ id: 'rep-' + (i + 1), grupo: 'Accesorios', nombre, precio, costo: '', stock: '' })),
    { id: 'luna-color', grupo: 'Extras de lunas', nombre: 'Color de lunas', precio: 30, costo: '', stock: '' }];
}
const producto = id => db.productos.find(p => p.id === id);
const conStock = p => String(p.stock ?? '').trim() !== '';
const extrasLuna = () => db.productos.filter(p => /luna/i.test(p.grupo));
const accesorios = () => db.productos.filter(p => !/luna/i.test(p.grupo)); // los extras de lunas salen al elegir las lunas
const TONOS = ['Gris', 'Marrón', 'Verde', 'Azul', 'Rosa', 'Amarillo', 'Morado', 'Naranja', 'Rojo', 'Celeste'];
// Busca por nombre o grupo: "tornillo" → Tornillos; "accesorios" → todo el grupo.
function buscarProductos(q) {
  const toks = sinTilde(q).split(/\s+/).filter(Boolean);
  return accesorios().filter(p => { const t = sinTilde(p.grupo + ' ' + p.nombre); return toks.every(k => t.includes(k)); });
}
function buscadorProductos(inp, res, onPick) {
  let lista = [];
  const pintar = () => {
    const q = inp.value.trim();
    lista = (q ? buscarProductos(q) : accesorios()).slice(0, 60);
    res.innerHTML = lista.map(p => `<a href="#" data-p="${p.id}"><span class="grow"><b>${esc(p.nombre)}</b><br><span class="muted small">${esc(p.grupo)}</span></span>
      <span style="text-align:right;white-space:nowrap"><b class="num">${money(p.precio)}</b>${conStock(p) ? `<br><span class="chip ${chipStock(p)}">${p.stock} en stock</span>` : ''}</span></a>`).join('') || `<div class="empty small">No hay productos con “${esc(q)}”</div>`;
    res.hidden = false;
    $$('[data-p]', res).forEach(a => a.onclick = e => { e.preventDefault(); inp.value = ''; res.hidden = true; onPick(producto(a.dataset.p)); });
  };
  inp.oninput = pintar; inp.onfocus = pintar;
  inp.onkeydown = e => {
    if (e.key === 'Enter') { e.preventDefault(); if (inp.value.trim() && lista[0]) { const p = lista[0]; inp.value = ''; res.hidden = true; onPick(p); } }
    if (e.key === 'Escape') res.hidden = true;
  };
  inp.onblur = () => setTimeout(() => { res.hidden = true; }, 200);
}
// Resta (signo -1) o devuelve (+1) el stock de monturas y productos de una venta.
function moverStock(items, signo) {
  items.forEach(i => {
    const x = i.tipo === 'montura' ? db.monturas.find(m => m.id === i.ref) : i.tipo === 'producto' ? producto(i.ref) : null;
    if (x && (i.tipo === 'montura' || conStock(x))) x.stock = num(x.stock) + signo * num(i.cant);
  });
}
function productoForm(p) {
  const e = p || { grupo: 'Accesorios', stock: '' };
  const grupos = [...new Set(db.productos.map(x => x.grupo))];
  modal({
    title: p ? 'Editar producto' : 'Nuevo producto',
    body: `<form id="pf" class="form"><label class="f">Nombre<input class="inp" name="nombre" required value="${esc(e.nombre)}" placeholder="Ej. Tornillos (unidad)"></label>
      <div class="fg"><label class="f">Grupo<input class="inp" name="grupo" list="pgrupos" required value="${esc(e.grupo)}"><datalist id="pgrupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
      <label class="f">Precio de venta<input class="inp" name="precio" inputmode="decimal" required value="${esc(e.precio)}"></label>
      ${puede('costos') ? `<label class="f">Costo <span class="hint">(lo que te cuesta a ti)</span><input class="inp" name="costo" inputmode="decimal" value="${esc(e.costo)}"></label>` : `<input type="hidden" name="costo" value="${esc(e.costo ?? '')}">`}
      <label class="f">Stock <span class="hint">(déjalo vacío si no llevas la cuenta)</span><input class="inp" name="stock" inputmode="numeric" value="${esc(e.stock)}"></label></div>
      <p class="hint" style="margin:0">Los productos del grupo “Extras de lunas” salen como opción al elegir las lunas en la venta. Agregar o cambiar precios pide la clave del dueño.</p></form>`,
    foot: `${p ? `<button class="btn danger" id="pdel" style="margin-right:auto">${icon('trash')}</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" form="pf">Guardar</button>`,
    onMount: bg => {
      $('#pf', bg).onsubmit = ev => {
        ev.preventDefault();
        const f = readForm(ev.target); f.precio = num(f.precio); f.costo = f.costo === '' ? '' : num(f.costo); f.stock = f.stock === '' ? '' : num(f.stock);
        const doit = () => { if (p) Object.assign(p, f); else db.productos.push({ id: uid(), ...f }); save(); closeModal(); toast('Producto guardado'); render(); };
        !p ? pideDueno(`Agregar "${f.nombre}" a ${money(f.precio)}`, doit, 'precios')
          : num(p.precio) !== f.precio || num(p.costo) !== num(f.costo) ? pideDueno(`Cambiar precio o costo de "${p.nombre}"`, doit, 'precios') : doit();
      };
      $('#pdel', bg) && ($('#pdel', bg).onclick = () => pideDueno(`Eliminar "${p.nombre}"`, () => { db.productos = db.productos.filter(x => x !== p); save(); render(); }, 'precios'));
    },
  });
}

// ---------- Clave del dueño ----------
// Ajustes y la lista de precios solo se abren con la clave del dueño; solo él la puede cambiar.
let ajustesAbierto = false;
const dueno = () => socio(db.config.duenoId) || db.config.socios.find(s => /jorge/i.test(s.nombre)) || db.config.socios[0];
const soyDueno = () => dueno()?.id === user;
function pideDueno(motivo, cb, permiso) {
  const d = dueno();
  // Si el dueño le dio este permiso a la persona, no necesita su clave (queda anotado igual).
  if (permiso && !soyDueno() && puede(permiso)) { confirmBox('¿' + esc(motivo) + '?', () => { addLog(motivo); save(); cb(); }, 'Continuar'); return; }
  if (!db.config.claveDueno && soyDueno()) { crearClaveDueno(cb); return; }
  const sinClave = !db.config.claveDueno; // todavía no la creó: solo se le puede pedir aprobación
  modal({
    title: 'Clave del dueño',
    body: `<div class="lock-note">${icon('lock')}<div><b>${esc(motivo)}</b><br>Necesita la clave de dueño de ${esc(d.nombre)}.</div></div>
      <div class="form"><label class="f" data-fila="${d.id}">${sinClave ? `<span class="muted small">${esc(d.nombre)} todavía no creó su clave de dueño.</span>` : `Clave de dueño<input class="inp pin" id="dpin" type="password" inputmode="numeric" autocomplete="off" maxlength="8">`}</label>${d.id === user ? '' : botonRemoto(d)}<div class="err" id="dperr"></div></div>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" id="dpok">${icon('unlock')} Continuar</button>`,
    onMount: bg => {
      const listo = () => { closeModal(); remoto.usar(); addLog(motivo + remoto.texto(), [d.id]); save(); cb(); };
      const remoto = esperarRemoto(bg, motivo, () => listo());
      const ok = () => {
        if (remoto.ok.has(d.id)) return listo();
        if (sinClave) { $('#dperr', bg).textContent = `Pídele aprobación a ${d.nombre}.`; return; }
        if (hashPin($('#dpin', bg).value) !== db.config.claveDueno) { $('#dperr', bg).textContent = 'Clave incorrecta'; $('#dpin', bg).select(); return; }
        listo();
      };
      $('#dpok', bg).onclick = ok; $('#dpin', bg) && $('#dpin', bg).addEventListener('keydown', ev => ev.key === 'Enter' && ok());
    },
  });
}
// ---------- Aprobación a distancia ----------
// Si quien tiene la clave no está en la tienda, se le pide por WhatsApp: abre el enlace, ve qué le piden y aprueba o rechaza.
// Cada aprobación sirve una sola vez, para ese cambio, y se vence a los 30 minutos.
const APROB_MIN = 30;
const aprobacion = id => db.aprobaciones.find(a => a.id === id);
const aprobVencida = a => Date.now() - a.ts > APROB_MIN * 6e4;
const misAprobaciones = () => db.aprobaciones.filter(a => a.para === user && a.estado === 'pendiente' && !aprobVencida(a));
const telefonoDe = s => s ? (s.telefono || (socioRol(s) === 'dueno' ? sesion.optica?.telefono || db.config.telefono : '')) : '';
const botonRemoto = s => `<div class="remoto" data-rem="${s.id}"><span class="muted small">¿${esc(s.nombre.split(' ')[0])} no está?</span><button type="button" class="btn sm" data-pedir="${s.id}">${icon('wa')} Pedirle aprobación</button></div>`;
function pedirAprobacion(motivo, para) {
  const lim = Date.now() - 3 * 864e5; // los pedidos viejos se borran solos
  db.aprobaciones.splice(0, db.aprobaciones.length, ...db.aprobaciones.filter(a => a.ts > lim));
  const a = { id: uid(), motivo, pide: user, para, estado: 'pendiente', ts: Date.now() };
  db.aprobaciones.push(a); save();
  return a;
}
function waAprobacion(a) {
  const s = socio(a.para), url = location.origin + location.pathname + '?aprobar=' + a.id;
  const txt = `Hola ${s.nombre.split(' ')[0]}, ${me().nombre} te pide autorización en ${db.config.nombre || 'la óptica'} para: ${a.motivo}.\n\nToca aquí para aprobar o rechazar: ${url}`;
  const tel = telefonoDe(s);
  return tel ? waLink(tel, txt) : 'https://wa.me/?text=' + encodeURIComponent(txt);
}
// Maneja los botones "Pedirle aprobación" de una ventana de clave. alAprobar se llama cada vez que alguien aprueba.
function esperarRemoto(bg, motivo, alAprobar) {
  const pedidos = {}, ok = new Set();
  let timer = null;
  const pintar = (sid, html) => { const r = $(`[data-rem="${sid}"]`, bg); if (r) r.innerHTML = html; };
  const otraVez = (sid, txt) => { delete pedidos[sid]; pintar(sid, `<span class="err" style="margin:0">${txt}</span><button type="button" class="btn sm" data-pedir="${sid}">Pedir otra vez</button>`); enlazar(); };
  const revisar = () => {
    if (!document.body.contains(bg)) { // se cerró la ventana sin terminar: los pedidos quedan cancelados
      clearInterval(timer);
      let hubo = false;
      for (const sid in pedidos) { const a = aprobacion(pedidos[sid]); if (a && a.estado === 'pendiente') { a.estado = 'cancelada'; hubo = true; } }
      if (hubo) save();
      return;
    }
    for (const sid in pedidos) {
      if (ok.has(sid)) continue;
      const a = aprobacion(pedidos[sid]), n = esc(socioName(sid));
      if (!a) continue;
      if (a.estado === 'aprobada') {
        ok.add(sid);
        const f = $(`[data-fila="${sid}"]`, bg); if (f) f.hidden = true;
        pintar(sid, `<span class="ok-note">${icon('check')} ${n} lo aprobó desde su celular</span>`);
        alAprobar(sid);
      } else if (a.estado === 'rechazada') otraVez(sid, `${n} rechazó el pedido.`);
      else if (aprobVencida(a)) otraVez(sid, 'El pedido se venció.');
    }
  };
  const enlazar = () => $$('[data-pedir]', bg).forEach(b => b.onclick = () => {
    const sid = b.dataset.pedir, a = pedirAprobacion(motivo, sid), wa = waAprobacion(a);
    pedidos[sid] = a.id;
    window.open(wa, '_blank', 'noopener');
    pintar(sid, `<span class="spin sm"></span><span class="grow small">Esperando que <b>${esc(socioName(sid))}</b> apruebe desde su celular…</span><a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">Reenviar</a>`);
    if (!timer) timer = setInterval(revisar, 1000);
  });
  enlazar();
  return {
    ok,
    // Al terminar, las aprobaciones quedan usadas (no sirven para otro cambio).
    usar() { clearInterval(timer); for (const sid in pedidos) { const a = aprobacion(pedidos[sid]); if (a) a.estado = a.estado === 'aprobada' ? 'usada' : 'cancelada'; } save(); },
    texto: () => ok.size ? ` (aprobado a distancia por ${[...ok].map(socioName).join(' y ')})` : '',
  };
}
// Pantalla que abre quien aprueba (desde el enlace de WhatsApp o desde el aviso en la app).
routes.aprobar = {
  html(id) {
    const a = aprobacion(id);
    const caja = (t, cuerpo) => `<div class="page-head"><div><h1>${t}</h1></div></div><div class="card" style="max-width:560px"><div class="card-b">${cuerpo}</div></div>`;
    const volver = `<div class="actions" style="margin-top:14px"><a class="btn" href="#/inicio">Ir al inicio</a></div>`;
    if (!a) return caja('Pedido de autorización', `<p class="muted" style="margin:0">Este pedido ya no existe.</p>${volver}`);
    if (a.para !== user) return caja('Pedido de autorización', `<p class="muted" style="margin:0">Este pedido es para <b>${esc(socioName(a.para))}</b>. Tiene que abrirlo con su usuario.</p>${volver}`);
    const cuando = new Date(a.ts).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
    const detalle = `<div class="lock-note">${icon('lock')}<div><b>${esc(a.motivo)}</b><br>Lo pide ${esc(socioName(a.pide))} · ${cuando}</div></div>`;
    const estado = { aprobada: 'Ya lo aprobaste.', usada: 'Ya lo aprobaste y se hizo el cambio.', rechazada: 'Lo rechazaste.', cancelada: `${esc(socioName(a.pide))} canceló el pedido.` }[a.estado];
    if (estado) return caja('Pedido de autorización', `${detalle}<p style="margin:0">${estado}</p>${volver}`);
    if (aprobVencida(a)) return caja('Pedido de autorización', `${detalle}<p style="margin:0">Este pedido se venció (duran ${APROB_MIN} minutos). Si hace falta, que te lo pidan otra vez.</p>${volver}`);
    return caja('Te piden autorización', `${detalle}
      <p class="muted small" style="margin:0 0 14px">Si apruebas, se hace solo este cambio, una sola vez. Queda anotado que lo aprobaste tú.</p>
      <div class="actions"><button class="btn danger" id="aprno">${icon('x')} Rechazar</button><button class="btn primary" id="aprsi">${icon('check')} Aprobar</button></div>`);
  },
  bind(id) {
    const a = aprobacion(id); if (!a) return;
    const responder = estado => {
      if (a.estado !== 'pendiente' || aprobVencida(a)) return render();
      Object.assign(a, { estado, resp: Date.now() });
      addLog(`${estado === 'aprobada' ? 'Aprobó' : 'Rechazó'} a distancia: ${a.motivo} (lo pidió ${socioName(a.pide)})`);
      save(); toast(estado === 'aprobada' ? 'Aprobado. Ya pueden continuar en la tienda.' : 'Pedido rechazado'); render();
    };
    $('#aprsi') && ($('#aprsi').onclick = () => responder('aprobada'));
    $('#aprno') && ($('#aprno').onclick = () => responder('rechazada'));
  },
};
// Aviso arriba de cualquier pantalla cuando alguien espera tu aprobación.
function avisoAprobaciones(key) {
  if (key === 'aprobar') return '';
  return misAprobaciones().map(a => `<div class="plan-note warn">${icon('lock')}<div class="grow"><b>${esc(socioName(a.pide))} te pide autorización</b><br>${esc(a.motivo)}</div><a class="btn sm primary" href="#/aprobar/${a.id}">Ver</a></div>`).join('');
}
// La primera vez el dueño confirma con su clave de socio y elige su clave de dueño.
function crearClaveDueno(cb, cambiar) {
  const d = dueno();
  modal({
    title: cambiar ? 'Cambiar clave de dueño' : 'Crea tu clave de dueño',
    body: `<form id="cdf" class="form"><p class="muted small" style="margin:0">Esta clave es solo tuya, ${esc(d.nombre)}: abre Ajustes y permite cambiar la lista de precios. Nadie más puede cambiarla.</p>
      <label class="f">${cambiar ? 'Clave de dueño actual' : 'Tu clave de socio (la que usas para entrar)'}<input class="inp pin" name="actual" type="password" inputmode="numeric" autocomplete="off" maxlength="8" required></label>
      <label class="f">Nueva clave de dueño <span class="hint">(4 a 8 números)</span><input class="inp pin" name="nueva" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" required></label>
      <label class="f">Repite la nueva clave<input class="inp pin" name="rep" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8" required></label>
      <div class="err" id="cderr"></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="cdf">${icon('lock')} Guardar clave</button>`,
    onMount: bg => {
      $('#cdf', bg).onsubmit = ev => {
        ev.preventDefault();
        const f = readForm(ev.target), err = m => { $('#cderr', bg).textContent = m; };
        if (hashPin(f.actual) !== (cambiar ? db.config.claveDueno : d.pin)) return err(cambiar ? 'La clave de dueño actual no es correcta' : 'Tu clave de socio no es correcta');
        if (!/^\d{4,8}$/.test(f.nueva)) return err('La nueva clave debe tener de 4 a 8 números');
        if (f.nueva !== f.rep) return err('Las dos claves nuevas no son iguales');
        db.config.claveDueno = hashPin(f.nueva); db.config.duenoId = d.id;
        addLog(cambiar ? 'Clave de dueño cambiada' : 'Clave de dueño creada', [d.id]);
        save(); closeModal(); toast('Clave de dueño guardada'); cb ? cb() : render();
      };
    },
  });
}

// ---------- Inventario ----------
let invTab = 'monturas';
// ---------- Reportes ----------
// Solo muestra números; nadie cambia nada desde aquí.
const REP_TIPO_COLOR = { Monturas: '#2a78d6', Lunas: '#1baf7a', 'Lentes de sol': '#eb6834', Accesorios: '#4a3aa7', Otros: '#98a2b3' };
const REP_PER = { semana: 'Semana', mes: 'Mes', anio: 'Año', rango: 'Fechas' };
const esFecha = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

function repPeriodo(p, ref, hasta) {
  const d = new Date(ref + 'T12:00:00'), y = d.getFullYear(), m = d.getMonth();
  if (p === 'rango') {
    // Hasta 62 días se ve día por día; más largo, mes por mes.
    const a = ref, b = hasta, n = diasEntre(a, b) + 1, porMes = n > 62, varios = a.slice(0, 4) !== b.slice(0, 4);
    const buckets = !porMes ? Array.from({ length: n }, (_, i) => { const x = addDays(a, i); return { a: x, b: x, l: n <= 7 ? fdate(x, { weekday: 'short' }).replace('.', '') : String(+x.slice(8)), t: fdate(x, { weekday: 'short', day: 'numeric', month: 'short' }) }; }) : [];
    for (let k = new Date(+a.slice(0, 4), +a.slice(5, 7) - 1, 1); porMes && ymd(k) <= b; k = new Date(k.getFullYear(), k.getMonth() + 1, 1)) {
      const ini = ymd(k), fin = ymd(new Date(k.getFullYear(), k.getMonth() + 1, 0));
      buckets.push({ a: ini < a ? a : ini, b: fin > b ? b : fin, l: MESES[k.getMonth()] + (varios ? ' ' + String(k.getFullYear()).slice(2) : ''), t: fdate(ini, { month: 'long', year: 'numeric' }) });
    }
    return { a, b, n, porMes, buckets, prev: addDays(a, -n), prevB: addDays(a, -1), next: addDays(b, 1), nextB: addDays(b, n), antes: `los ${n} días anteriores`,
      label: a === b ? fdate(a, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : `${fdate(a)} – ${fdate(b)}` };
  }
  if (p === 'mes') {
    const a = ymd(new Date(y, m, 1)), b = ymd(new Date(y, m + 1, 0));
    return { a, b, prev: ymd(new Date(y, m - 1, 1)), next: ymd(new Date(y, m + 1, 1)), label: fdate(a, { month: 'long', year: 'numeric' }), antes: 'mes pasado',
      buckets: Array.from({ length: +b.slice(8) }, (_, i) => { const x = addDays(a, i); return { a: x, b: x, l: String(i + 1), t: fdate(x, { weekday: 'short', day: 'numeric', month: 'short' }) }; }) };
  }
  if (p === 'anio') {
    return { a: `${y}-01-01`, b: `${y}-12-31`, prev: `${y - 1}-01-01`, next: `${y + 1}-01-01`, label: String(y), antes: 'año pasado', porMes: true,
      buckets: MESES.map((l, i) => ({ a: ymd(new Date(y, i, 1)), b: ymd(new Date(y, i + 1, 0)), l, t: fdate(ymd(new Date(y, i, 1)), { month: 'long', year: 'numeric' }) })) };
  }
  const a = addDays(ref, -((d.getDay() + 6) % 7)), b = addDays(a, 6);
  return { a, b, prev: addDays(a, -7), next: addDays(a, 7), antes: 'semana pasada',
    label: `${fdate(a, { day: 'numeric', month: 'short' })} – ${fdate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    buckets: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((l, i) => { const x = addDays(a, i); return { a: x, b: x, l, t: fdate(x, { weekday: 'long', day: 'numeric', month: 'short' }) }; }) };
}
function repDatos(a, b) {
  const en = f => !!f && f >= a && f <= b;
  const ords = db.ordenes.filter(o => en(o.fecha)), pagos = db.pagos.filter(p => en(p.fecha));
  const vendido = round2(ords.reduce((s, o) => s + totalOrden(o), 0));
  const cobrado = round2(pagos.reduce((s, p) => s + num(p.monto), 0));
  const gastos = round2(db.gastos.filter(g => en(g.fecha)).reduce((s, g) => s + num(g.monto), 0));
  return { ords, pagos, vendido, cobrado, gastos, ganancia: round2(cobrado - gastos) };
}
function repTipo(it) {
  if (it.tipo === 'montura') return db.monturas.find(m => m.id === it.ref)?.clase === 'sol' ? 'Lentes de sol' : 'Monturas';
  if (it.tipo === 'luna') return 'Lunas';
  if (it.tipo === 'producto') return 'Accesorios';
  return 'Otros';
}
// Dona fina con un espacio entre partes; al centro va el total.
function dona(partes, titulo) {
  const tot = partes.reduce((s, x) => s + x.v, 0);
  if (!tot) return `<div class="empty" style="padding:20px">Sin datos en este periodo.</div>`;
  const gap = partes.length > 1 ? .8 : 0;
  let acc = 0;
  const segs = partes.map(x => {
    const pct = x.v / tot * 100, len = Math.max(pct - gap, .2);
    const s = `<circle cx="21" cy="21" r="15.915" fill="none" stroke="${x.c}" stroke-width="4.2" stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${25 - acc}" stroke-linecap="butt"><title>${esc(x.n)}: ${money(x.v)} (${Math.round(pct)}%)</title></circle>`;
    acc += pct; return s;
  }).join('');
  return `<div class="dona"><svg viewBox="0 0 42 42" role="img" aria-label="${esc(titulo)}">${segs}</svg><div class="dona-c"><span class="muted small">Total</span><b class="num">${money(tot)}</b></div></div>
    <div class="dleg">${partes.map(x => `<div><i style="background:${x.c}"></i><span class="grow">${esc(x.n)}</span><span class="muted num">${Math.round(x.v / tot * 100)}%</span><b class="num">${money(x.v)}</b></div>`).join('')}</div>`;
}
function cambio(cur, ant, antes, bueno = 1) {
  if (!ant) return `<span class="muted">Sin datos para comparar</span>`;
  const p = Math.round((cur - ant) / Math.abs(ant) * 100);
  const cls = p === 0 ? '' : (p > 0) === (bueno > 0) ? 'up' : 'down';
  return `<span class="delta ${cls}">${p > 0 ? '▲' : p < 0 ? '▼' : ''} ${Math.abs(p)}%</span> vs. ${antes}`;
}
function hbar(filas) {
  const max = Math.max(...filas.map(f => f.v), 0);
  return filas.map(f => `<div class="hb"><div class="row between"><span class="t">${esc(f.n)}</span><b class="num">${money(f.v)}</b></div>
    <div class="hb-track"><span style="width:${max ? Math.max(f.v / max * 100, 1.5) : 0}%"></span></div>${f.s ? `<span class="muted small">${f.s}</span>` : ''}</div>`).join('');
}
routes.reportes = {
  html(_, q) {
    const p = REP_PER[q.get('p')] ? q.get('p') : 'semana';
    let ref = esFecha(q.get('d')) ? q.get('d') : hoy(), ra = esFecha(q.get('a')) ? q.get('a') : addDays(hoy(), -29), rb = esFecha(q.get('b')) ? q.get('b') : hoy();
    if (ra > rb) [ra, rb] = [rb, ra];
    if (p === 'rango') ref = rb;
    const P = p === 'rango' ? repPeriodo(p, ra, rb) : repPeriodo(p, ref), R = repDatos(P.a, P.b);
    // El rango de fechas se compara con los mismos días justo antes; si el periodo está en curso, con los mismos días del periodo anterior.
    let A;
    if (p === 'rango') A = repDatos(P.prev, P.prevB);
    else { const Pa = repPeriodo(p, P.prev), hasta = hoy() >= P.a && hoy() <= P.b ? addDays(Pa.a, diasEntre(P.a, hoy())) : Pa.b; A = repDatos(Pa.a, hasta < Pa.b ? hasta : Pa.b); }
    const url = (pp, d, b) => pp === 'rango' ? `#/reportes?p=rango&a=${d}&b=${b}` : `#/reportes?p=${pp}&d=${d}`;
    const hoyOAntes = f => f > hoy() ? hoy() : f;
    const barras = P.buckets.map(k => { const os = R.ords.filter(o => o.fecha >= k.a && o.fecha <= k.b); return { ...k, v: round2(os.reduce((s, o) => s + totalOrden(o), 0)), n: os.length }; });
    const maxB = Math.max(...barras.map(x => x.v), 0), mejor = barras.reduce((m, x) => x.v > m.v ? x : m, { v: 0 });
    const metodos = METODOS_VIZ.map(m => ({ n: m, c: METODO_COLOR[m], v: round2(R.pagos.filter(x => x.metodo === m).reduce((s, x) => s + num(x.monto), 0)) })).filter(x => x.v > 0);
    const porTipo = {};
    R.ords.forEach(o => o.items.forEach(it => { const t = repTipo(it); porTipo[t] = (porTipo[t] || 0) + num(it.cant) * num(it.precio); }));
    const tipos = Object.keys(REP_TIPO_COLOR).map(t => ({ n: t, c: REP_TIPO_COLOR[t], v: round2(porTipo[t] || 0) })).filter(x => x.v > 0);
    const marcas = {};
    R.ords.forEach(o => o.items.filter(it => it.tipo === 'montura').forEach(it => { const mk = db.monturas.find(m => m.id === it.ref)?.marca || 'Sin marca'; const x = marcas[mk] = marcas[mk] || { n: mk, v: 0, u: 0 }; x.v += num(it.cant) * num(it.precio); x.u += num(it.cant); }));
    const topMarcas = Object.values(marcas).sort((a, b) => b.v - a.v).slice(0, 5).map(x => ({ ...x, s: `${x.u} ${x.u === 1 ? 'unidad' : 'unidades'}` }));
    const socios = db.config.socios.map(s => { const os = R.ords.filter(o => o.por === s.id); return { n: s.nombre, v: round2(os.reduce((a, o) => a + totalOrden(o), 0)), s: `${os.length} ${os.length === 1 ? 'venta' : 'ventas'}` }; });
    const nuevos = db.pacientes.filter(x => { const f = x.creadoF || (x.creado ? ymd(new Date(x.creado)) : ''); return f >= P.a && f <= P.b; }).length;
    const debe = round2(R.ords.reduce((s, o) => s + Math.max(0, saldoOrden(o)), 0));
    const etiqueta = (k, i) => barras.length <= 14 || i === 0 || (i + 1) % 5 === 0 || i === barras.length - 1 ? k.l : '';
    const enCurso = p !== 'rango' && hoy() >= P.a && hoy() <= P.b;
    return `<div class="page-head"><div><h1>Reportes</h1><p class="cap">${esc(P.label)}</p></div>
      <div class="actions"><div class="seg">${Object.entries(REP_PER).map(([k, t]) => `<button type="button" data-go="${k === 'rango' ? url(k, P.a, hoyOAntes(P.b)) : url(k, ref)}" class="${k === p ? 'on' : ''}">${t}</button>`).join('')}</div>
        <a class="btn icon" href="${url(p, P.prev, P.prevB)}" title="Anterior">${icon('back')}</a><a class="btn icon" href="${url(p, P.next, P.nextB)}" title="Siguiente" style="transform:scaleX(-1)">${icon('back')}</a>
        ${enCurso || p === 'rango' ? '' : `<a class="btn" href="${url(p, hoy())}">Hoy</a>`}</div></div>
      ${p === 'rango' ? `<div class="card card-b rango"><form id="rgf" class="rg-f"><label class="f">Desde<input class="inp" type="date" name="a" value="${P.a}" required></label>
        <label class="f">Hasta<input class="inp" type="date" name="b" value="${P.b}" required></label><button class="btn primary">Ver</button></form>
        <div class="pick">${[['Hoy', 0, 0], ['Ayer', 1, 1], ['Últimos 7 días', 6, 0], ['Últimos 30 días', 29, 0], ['Últimos 90 días', 89, 0]].map(([t, x, y]) => { const a = addDays(hoy(), -x), b = addDays(hoy(), -y); return `<button type="button" data-go="${url('rango', a, b)}" class="${a === P.a && b === P.b ? 'on' : ''}">${t}</button>`; }).join('')}</div></div>` : ''}
      <div class="grid g4">
        <div class="card kpi"><div class="l"><i>${icon('trend')}</i>Vendido</div><div class="v num">${money(R.vendido)}</div><div class="s">${cambio(R.vendido, A.vendido, P.antes)}</div></div>
        <div class="card kpi ink"><div class="l"><i>${icon('wallet')}</i>Cobrado</div><div class="v num">${money(R.cobrado)}</div><div class="s">${cambio(R.cobrado, A.cobrado, P.antes)}</div></div>
        <div class="card kpi warn"><div class="l"><i>${icon('down')}</i>Gastos</div><div class="v num">${money(R.gastos)}</div><div class="s">${cambio(R.gastos, A.gastos, P.antes, -1)}</div></div>
        <div class="card kpi gold"><div class="l"><i>${icon('chart')}</i>Ganancia</div><div class="v num">${money(R.ganancia)}</div><div class="s">${cambio(R.ganancia, A.ganancia, P.antes)}</div></div>
      </div>
      ${enCurso ? `<p class="hint" style="margin:8px 2px 0">Comparado con los mismos días ${p === 'semana' ? 'de la semana pasada' : p === 'mes' ? 'del mes pasado' : 'del año pasado'}.</p>` : ''}
      ${p === 'rango' ? `<p class="hint" style="margin:8px 2px 0">Comparado con ${P.n === 1 ? 'el día anterior' : `los ${P.n} días anteriores`} (${P.n === 1 ? fdate(P.prev) : `${fdate(P.prev)} – ${fdate(P.prevB)}`}).</p>` : ''}
      <div class="card mt"><div class="card-h"><h3>Ventas ${P.porMes ? 'por mes' : 'por día'}</h3></div>
        <div class="card-b">${maxB ? `<p class="bcap" id="bcap">Mejor ${P.porMes ? 'mes' : 'día'}: ${esc(mejor.t)} · ${money(mejor.v)}</p><div class="bars" style="--n:${barras.length}">${barras.map((k, i) => `<button type="button" class="bcol${k.a <= hoy() && k.b >= hoy() ? ' hoy' : ''}" data-t="${esc(k.t)}: ${money(k.v)} · ${k.n} ${k.n === 1 ? 'venta' : 'ventas'}" aria-label="${esc(k.t)}: ${money(k.v)}"><span class="bar" style="height:${k.v ? Math.max(k.v / maxB * 100, 2) : 0}%"></span></button>`).join('')}</div>
          <div class="blab" style="--n:${barras.length}">${barras.map((k, i) => `<span>${etiqueta(k, i)}</span>`).join('')}</div>
          <p class="hint" style="margin:10px 0 0">Toca una barra para ver el monto.</p>` : `<div class="empty">No hubo ventas en este periodo.</div>`}</div></div>
      <div class="grid g2 mt">
        <div class="card"><div class="card-h"><h3>¿Cómo te pagan?</h3><span class="sub">Cobros por método</span></div><div class="card-b">${dona(metodos, 'Cobros por método de pago')}</div></div>
        <div class="card"><div class="card-h"><h3>¿Qué se vende más?</h3><span class="sub">Ventas por tipo</span></div><div class="card-b">${dona(tipos, 'Ventas por tipo de producto')}</div></div>
      </div>
      <div class="grid g3 mt">
        <div class="card"><div class="card-h"><h3>Marcas más vendidas</h3></div><div class="card-b">${topMarcas.length ? hbar(topMarcas) : `<div class="empty" style="padding:14px">Sin monturas vendidas.</div>`}</div></div>
        <div class="card"><div class="card-h"><h3>Ventas por persona</h3></div><div class="card-b">${hbar(socios)}</div></div>
        <div class="card"><div class="card-h"><h3>Datos rápidos</h3></div><div class="card-b"><div class="cash-sum">
          <div class="line"><span class="muted">Ventas</span><b class="num">${R.ords.length}</b></div>
          <div class="line"><span class="muted">Venta promedio</span><b class="num">${money(R.ords.length ? R.vendido / R.ords.length : 0)}</b></div>
          <div class="line"><span class="muted">Pacientes nuevos</span><b class="num">${nuevos}</b></div>
          <div class="line"><span class="muted">Por cobrar de estas ventas</span><b class="num" style="${debe > 0.009 ? 'color:var(--danger)' : ''}">${money(debe)}</b></div></div></div></div>
      </div>`;
  },
  bind() {
    $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    const rf = $('#rgf');
    rf && (rf.onsubmit = e => { e.preventDefault(); const f = readForm(rf); if (!esFecha(f.a) || !esFecha(f.b)) return toast('Elige las dos fechas'); go(`#/reportes?p=rango&a=${f.a}&b=${f.b}`); });
    const cap = $('#bcap'), base = cap?.textContent;
    $$('.bcol').forEach(b => {
      const ver = () => { $$('.bcol').forEach(x => x.classList.toggle('sel', x === b)); cap.textContent = b.dataset.t; };
      b.onclick = ver; b.onmouseenter = ver;
    });
    const bars = $('.bars'); bars && (bars.onmouseleave = () => { $$('.bcol').forEach(x => x.classList.remove('sel')); cap.textContent = base; });
  },
};

// Dibujo de la montura según su forma, color y material (no hay fotos).
const COLOR_MONT = { negro: '#1f2433', carey: '#8a5424', dorado: '#c39a2e', plateado: '#98a2b3', azul: '#2447c9', rosa: '#db5c9a', rosado: '#db5c9a', vino: '#8c1d3f', transparente: '#a9bad2', verde: '#1f6f52', blanco: '#c8ced9', gris: '#6b7280', marron: '#7a4a2a', rojo: '#c81e3a', amarillo: '#d4a514', naranja: '#e8742a', nude: '#d6a88c', jaspeado: '#8a6a4a', miel: '#c98a2e', morado: '#6d3bb8', celeste: '#4aa3df' };
function monturaSVG(m) {
  const cols = (m.colores && m.colores.length ? m.colores : [m.color || '']).map(c => sinTilde(String(c).split('/')[0].trim()));
  const c = COLOR_MONT[cols[0]] || '#475569', c2 = COLOR_MONT[cols[1]] || c;
  const mat = sinTilde(m.material || ''), fino = /metal|titanio|alumin/.test(mat), aire = /aire/i.test(m.aro || '');
  const sol = m.clase === 'sol', fill = sol ? 'rgba(28,38,60,.78)' : 'rgba(190,220,255,.22)';
  const f = sinTilde(m.forma || '');
  const L = /redond/.test(f) ? '<circle cx="58" cy="50" r="30"/>' : /cuadr/.test(f) ? '<rect x="24" y="22" width="66" height="56" rx="15"/>'
    : /avia/.test(f) ? '<path d="M24 28Q58 18 90 28Q94 58 76 74Q58 84 40 74Q22 60 24 28Z"/>' : /cat|gat/.test(f) ? '<path d="M16 26Q46 22 88 30Q94 52 80 68Q60 78 38 72Q22 64 20 46Q18 36 16 26Z"/>'
    : /oval/.test(f) ? '<ellipse cx="57" cy="50" rx="36" ry="25"/>' : /hexa/.test(f) ? '<path d="M38 22H76L92 50L76 78H38L22 50Z"/>' : '<rect x="20" y="30" width="72" height="42" rx="11"/>';
  const sw = aire ? 1.6 : fino ? 3.2 : 7;
  return `<svg viewBox="0 0 200 100" aria-hidden="true"><g fill="none" stroke="${c2}" stroke-width="${fino ? 3 : 6}" stroke-linecap="round"><path d="M20 36 5 32M180 36l15-4"/><path d="M89 44Q100 34 111 44"/></g><g fill="${fill}" stroke="${c}" stroke-width="${sw}" stroke-linejoin="round" ${cols[0] === 'transparente' || aire ? 'stroke-opacity=".7"' : ''}>${L}<g transform="translate(200 0) scale(-1 1)">${L}</g></g><g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="${sol ? .5 : .8}"><path d="M36 40q6-9 16-10"/><path d="M128 40q6-9 16-10"/></g></svg>`;
}
let invFiltro = '', invVista = (() => { try { return localStorage.getItem('terra-inv-vista') || 'tarjetas'; } catch (e) { return 'tarjetas'; } })();
routes.inventario = {
  html() {
    const M = db.monturas, sinSt = M.filter(m => num(m.stock) <= 0).length, unid = M.reduce((s, m) => s + Math.max(0, num(m.stock)), 0);
    const P = accesorios(), pSin = P.filter(p => conStock(p) && num(p.stock) <= 0).length;
    const stat = (t, v, st = '') => `<div class="stat"><small>${t}</small><b class="num" style="${st}">${v}</b></div>`;
    const stats = invTab === 'productos'
      ? stat('Productos', P.length) + stat('Con stock anotado', P.filter(conStock).length) + (puede('costos') ? stat('Valor a costo', money(P.filter(conStock).reduce((s, p) => s + num(p.costo) * Math.max(0, num(p.stock)), 0))) : '') + stat('Se acabaron', pSin, pSin ? 'color:var(--danger)' : '')
      : invTab === 'monturas'
        ? stat('Modelos', M.length) + stat('Unidades en tienda', unid) + (puede('costos') ? stat('Valor a costo', money(M.reduce((s, m) => s + num(m.costo) * Math.max(0, num(m.stock)), 0))) : '') + stat('Sin stock', sinSt, sinSt ? 'color:var(--danger)' : '')
        : '';
    return `<div class="page-head"><div><h1>Inventario</h1><p>${M.filter(m => m.clase !== 'sol').length} monturas · ${((n) => `${n} ${n === 1 ? 'lente' : 'lentes'} de sol`)(M.filter(m => m.clase === 'sol').length)} · ${unid} unidades · ${P.length} accesorios</p></div>
      <div class="actions"><button class="btn" id="invpdf">${icon('down')} PDF para conteo</button>${invTab === 'monturas' ? `<button class="btn" id="ingreso">${icon('box')} Llegó mercadería</button>` : ''}<button class="btn primary" id="newi">${icon('plus')} ${{ monturas: 'Montura o lente de sol', cristales: 'Nueva lista', productos: 'Nuevo accesorio o pieza' }[invTab]}</button></div></div>
      ${stats ? `<div class="stats">${stats}</div>` : ''}
      <div class="seg inv-tabs" id="iseg">${[['monturas', 'Monturas y lentes de sol'], ['productos', 'Accesorios y piezas'], ['cristales', 'Precios de lunas']].map(([k, t]) => `<button data-k="${k}" class="${invTab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="inv-bar"><div class="search inv-q">${icon('search')}<input id="if" placeholder="${{ monturas: 'Buscar varilla, marca, sigla o código…', cristales: 'Buscar tipo de luna o tratamiento…', productos: 'Buscar accesorio: tornillo, plaquetas, estuche…' }[invTab]}" autocomplete="off"></div>
        ${invTab === 'monturas' ? `<div class="seg" id="ivista">${[['tarjetas', 'Tarjetas'], ['lista', 'Lista']].map(([k, t]) => `<button data-v="${k}" class="${invVista === k ? 'on' : ''}">${t}</button>`).join('')}</div>` : ''}</div>
      ${invTab === 'monturas' ? `<div class="fbar" id="ifil">${[['', 'Todas'], ['Dama', 'Dama'], ['Caballero', 'Caballero'], ['Unisex', 'Unisex'], ['Niño', 'Niño'], ['sol', 'Lentes de sol'], ['sin', 'Sin stock']].map(([k, t]) => `<button class="fch ${invFiltro === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}</div>` : ''}
      <div id="ilist"></div>`;
  },
  bind() {
    const draw = () => {
      const f = sinTilde($('#if').value.trim());
      if (invTab === 'monturas') {
        let l = f ? buscarMonturas(f) : db.monturas.slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
        if (invFiltro === 'sol') l = l.filter(m => m.clase === 'sol'); else if (invFiltro === 'sin') l = l.filter(m => num(m.stock) <= 0); else if (invFiltro) l = l.filter(m => m.genero === invFiltro);
        const chip = m => num(m.stock) <= 0 ? `<span class="chip deuda">Sin stock</span>` : `<span class="chip plain">${m.stock} en stock</span>`;
        $('#ilist').innerHTML = !l.length ? `<div class="card"><div class="empty">${icon('box')}<div>No hay monturas${f || invFiltro ? ' con ese filtro' : ''}.</div></div></div>`
          : invVista === 'tarjetas' ? `<div class="fgrid">${l.map(m => `<div class="fcard link" data-id="${m.id}"><div class="fimg" style="--t:${COLOR_MONT[sinTilde(String((m.colores || [])[0] || '').trim())] || '#94a3b8'}"><div class="fb">${m.clase === 'sol' ? '<span class="chip plain">Sol</span>' : ''}</div>${monturaSVG(m)}</div>
              <div class="fbody"><div class="row between" style="gap:6px"><span class="tag">${esc(m.codigo)}</span>${m.genero ? `<span class="muted small">${esc(m.genero)}</span>` : ''}</div><b class="sigla fsig">${esc(siglaMontura(m))}</b><span class="fmo">${esc(infoMontura(m))}</span>
              <div class="ffoot"><b class="num">${money(m.precio)}</b>${chip(m)}<button class="btn sm icon" data-add="${m.id}" title="Sumar unidades">${icon('plus')}</button></div></div></div>`).join('')}</div>`
          : `<div class="card"><div class="tbl-wrap"><table><thead><tr><th class="hide-sm">Código</th><th>Montura</th><th class="r">Precio</th><th class="c">Stock</th><th></th></tr></thead><tbody>
            ${l.map(m => `<tr class="link" data-id="${m.id}"><td class="hide-sm"><span class="tag">${esc(m.codigo)}</span></td><td><b class="sigla">${esc(siglaMontura(m))}</b><div class="muted small"><span class="show-sm">${esc(m.codigo)} · </span>${esc(infoMontura(m))}</div></td><td class="r num">${money(m.precio)}</td>
            <td class="c"><span class="chip ${chipStock(m)}">${m.stock}</span></td><td class="r"><button class="btn sm" data-add="${m.id}" title="Sumar unidades">${icon('plus')}<span class="hide-sm">Stock</span></button></td></tr>`).join('')}</tbody></table></div></div>`;
        $$('#ilist [data-id]').forEach(r => r.onclick = e => { if (e.target.closest('[data-add]')) return; const m = db.monturas.find(x => x.id === r.dataset.id); puede('editarInventario') ? monturaForm(m) : stockForm(m); });
        $$('#ilist [data-add]').forEach(b => b.onclick = () => stockForm(db.monturas.find(x => x.id === b.dataset.add)));
      } else if (invTab === 'productos') {
        const ps = db.productos.filter(p => !f || sinTilde([p.nombre, p.grupo].join(' ')).includes(f));
        const grupos = [...new Set(ps.map(p => p.grupo))];
        const tarjeta = p => `<div class="pz ${conStock(p) && num(p.stock) <= 0 ? 'low' : ''}"><button class="grow pz-t" data-id="${p.id}"><b>${esc(p.nombre)}</b><span class="pzm"><span class="num strong">${money(p.precio)}</span>${puede('costos') && String(p.costo ?? '') !== '' ? `<span class="muted small">costo ${money(p.costo)}</span>` : ''}${conStock(p) && num(p.stock) <= 0 ? '<span class="chip deuda">Se acabó</span>' : ''}</span></button>
          ${conStock(p) ? `<div class="pzstep"><button data-menos="${p.id}" aria-label="Restar uno" ${puede('editarInventario') ? '' : 'disabled'}>−</button><span class="num">${p.stock}</span><button data-mas="${p.id}" aria-label="Sumar uno">+</button></div>` : `<span class="chip plain" title="Este producto no lleva cuenta de stock">${/luna/i.test(p.grupo) ? 'Extra' : 'Sin stock anotado'}</span>`}</div>`;
        $('#ilist').innerHTML = ps.length ? `${grupos.map(g => `<div class="pzg"><div class="pzh"><span class="tic" style="--c:${/luna/i.test(g) ? '#f59e0b' : '#0891b2'}">${icon(/luna/i.test(g) ? 'eye' : 'box')}</span><b>${esc(g)}</b><em>${ps.filter(p => p.grupo === g).length}</em></div><div class="pzgrid">${ps.filter(p => p.grupo === g).map(tarjeta).join('')}</div></div>`).join('')}
          <p class="hint">Toca un producto para ver o cambiar su precio y su stock (pide la clave del dueño). Con + sumas lo que llegó.</p>` : `<div class="card"><div class="empty">No hay productos.</div></div>`;
        $$('#ilist [data-id]').forEach(r => r.onclick = () => productoForm(producto(r.dataset.id)));
        $$('#ilist [data-mas]').forEach(b => b.onclick = () => { const p = producto(b.dataset.mas); p.stock = num(p.stock) + 1; addLog(`Sumó 1 a ${p.nombre} (queda ${p.stock})`); save(); draw(); });
        $$('#ilist [data-menos]').forEach(b => b.onclick = () => { const p = producto(b.dataset.menos); if (num(p.stock) <= 0) return; p.stock = num(p.stock) - 1; addLog(`Restó 1 a ${p.nombre} (queda ${p.stock})`); save(); draw(); if (p.stock === 0) toast(`Se acabó: ${p.nombre}`); });
      } else {
        $('#ilist').classList.add('card');
        const ts = db.tarifas.filter(t => !f || sinTilde([t.grupo, t.nombre, ...t.cols].join(' ')).includes(f));
        const l = db.cristales.filter(c => !f || sinTilde([c.nombre, c.tipo].join(' ')).includes(f));
        const tabla = t => `<div class="tarifa"><div class="row between" style="gap:8px"><b>${esc(t.nombre)}</b><button class="btn sm" data-edt="${t.id}">${icon('lock')} Editar</button></div>
          <div class="tbl-wrap"><table class="tprec"><thead><tr><th>Rango</th>${t.cols.map(c => `<th class="r">${esc(c)}</th>`).join('')}</tr></thead><tbody>
          ${t.filas.map(r => `<tr><td><b>${esc(r.rango)}</b>${conRango(r) ? `<div class="muted small">esf ±${n2r(r.esf)} · cil −${n2r(r.cil)}</div>` : ''}</td>${t.cols.map((_, j) => `<td class="r num">${num(r.precios[j]) ? money(r.precios[j]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
        const grupos = [...new Set(ts.map(t => t.grupo))];
        $('#ilist').innerHTML = `<div class="card-b">
          <p class="muted small" style="margin:0 0 12px">En la venta el precio se pone solo según la medida del paciente: se toma el ojo con más esfera y más cilindro y se busca el primer rango que lo cubre. Cambiar precios pide la clave del dueño.</p>
          ${grupos.map(g => `<h3 class="tgrupo">${esc(g)}</h3>${ts.filter(t => t.grupo === g).map(tabla).join('')}`).join('') || (f ? '' : `<div class="empty">No hay listas de precios.</div>`)}
          <h3 class="tgrupo">Otros cristales (precio fijo)</h3>
          ${l.length ? `<div class="tbl-wrap"><table><thead><tr><th>Cristal</th><th class="hide-sm">Tipo</th><th class="r">Precio</th></tr></thead><tbody>
          ${l.map(c => `<tr class="link" data-id="${c.id}"><td><b>${esc(c.nombre)}</b></td><td class="hide-sm">${esc(c.tipo || '—')}</td><td class="r num">${money(c.precio)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted small">No hay cristales de precio fijo.</p>`}
          <button class="btn sm mt-s" id="newc">${icon('plus')} Cristal de precio fijo</button></div>`;
        if (puede('editarInventario')) $$('#ilist [data-id]').forEach(r => r.onclick = () => cristalForm(db.cristales.find(x => x.id === r.dataset.id)));
        $$('#ilist [data-edt]').forEach(b => b.onclick = () => { const t = tarifa(b.dataset.edt); pideDueno(`Editar lista de precios "${t.nombre}"`, () => tarifaForm(t), 'precios'); });
        $('#newc').hidden = !puede('editarInventario'); $('#newc').onclick = () => cristalForm();
      }
    };
    $$('#iseg button').forEach(b => b.onclick = () => { invTab = b.dataset.k; render(); });
    $$('#ivista button').forEach(b => b.onclick = () => { invVista = b.dataset.v; try { localStorage.setItem('terra-inv-vista', invVista); } catch (e) { } render(); });
    $$('#ifil [data-f]').forEach(b => b.onclick = () => { invFiltro = b.dataset.f; $$('#ifil [data-f]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#if').oninput = draw; draw();
    $('#newi').onclick = () => invTab === 'monturas' ? monturaForm() : invTab === 'productos' ? productoForm() : pideDueno('Crear una lista de precios de lunas', () => tarifaForm(), 'precios');
    $('#ingreso') && ($('#ingreso').onclick = () => ingresoForm());
    $('#invpdf').onclick = async () => {
      try { await saveFile(`Inventario ${hoy()}.pdf`, await inventarioPDF()); } catch (err) { toast('No se pudo generar el PDF: ' + err.message); }
    };
  },
};
// Llegó mercadería: se busca la montura; si ya existe se suman unidades, si no se registra nueva.
function ingresoForm() {
  modal({
    title: 'Llegó mercadería',
    body: `<div class="form"><p class="muted small" style="margin:0">Busca la montura por el N° de la varilla, la marca o el código. Si ya está registrada solo se suman las unidades; si es nueva, la registras.</p>
      <label class="f">¿Cuántas unidades llegaron?<input class="inp" id="icant" inputmode="numeric" value="1"></label>
      <div class="fld">Montura<div class="search" style="max-width:none">${icon('search')}<input id="iq" placeholder="Ej. 4321 C2 o Fellis" autocomplete="off"></div><div class="sr static" id="ires" hidden></div></div>
      <button type="button" class="btn" id="inew">${icon('plus')} No está, es nueva</button></div>`,
    foot: `<button class="btn" data-close>Cancelar</button>`,
    onMount: bg => {
      const cant = () => Math.max(1, parseInt($('#icant', bg).value, 10) || 1);
      buscadorMonturas($('#iq', bg), $('#ires', bg), m => { closeModal(); stockForm(m, cant()); });
      $('#inew', bg).onclick = () => { const q = $('#iq', bg).value; closeModal(); monturaForm(null, { stock: cant(), ...varillaDeTexto(q) }); };
      $('#iq', bg).focus();
    },
  });
}
function stockForm(m, cant = 1) {
  modal({
    title: 'Sumar unidades',
    body: `<form id="stf" class="form">
      <div class="row"><span class="tag">${esc(m.codigo)}</span><div><b class="sigla">${esc(siglaMontura(m))}</b><div class="muted small">${esc(infoMontura(m))} · ${money(m.precio)}</div></div></div>
      <div class="row between"><span class="muted">Stock actual</span><b class="num" style="font-size:20px">${m.stock}</b></div>
      <label class="f">Unidades que llegaron<input class="inp" name="cant" inputmode="numeric" value="${cant}" required></label>
      ${puede('costos') ? `<label class="f">Costo por unidad <span class="hint">(opcional)</span><input class="inp" name="costo" inputmode="decimal" value="${esc(m.costo || '')}"></label>` : ''}
      <div class="row between"><span class="muted">Quedará en</span><b class="num" id="stnew" style="font-size:20px">${num(m.stock) + cant}</b></div></form>`,
    foot: `<button class="btn" data-close>Cancelar</button><button class="btn primary" form="stf">${icon('check')} Sumar al stock</button>`,
    onMount: bg => {
      const c = $('[name=cant]', bg);
      c.oninput = () => { $('#stnew', bg).textContent = num(m.stock) + Math.max(0, parseInt(c.value, 10) || 0); };
      $('#stf', bg).onsubmit = e => {
        e.preventDefault();
        const f = readForm(e.target), n = parseInt(f.cant, 10) || 0;
        if (n <= 0) return toast('Pon cuántas unidades llegaron');
        m.stock = num(m.stock) + n; if (f.costo) m.costo = num(f.costo);
        m.ingresos = [...(m.ingresos || []), { fecha: hoy(), cant: n, costo: f.costo ? num(f.costo) : '', por: user }];
        save(); closeModal(); toast(`${m.codigo}: +${n} unidades · stock ${m.stock}`); render();
      };
    },
  });
}
function monturaForm(m, pre) {
  const e = m ? { ...m } : { stock: 1, codigo: nuevoCodigo(), ...(pre || {}) };
  const sel = { clase: e.clase || '', genero: e.genero || '', material: e.material || '', forma: e.forma || '', aro: e.aro || '', colores: [...(e.colores || [])] };
  if (!e.marcaAbr && e.marca) e.marcaAbr = abrMarcaUsada(e.marca);
  let abrManual = !!(e.marcaAbr && e.marcaAbr !== abrMarcaUsada(e.marca));
  const marcas = [...new Set(db.monturas.map(x => x.marca).filter(Boolean))].sort();
  modal({
    title: m ? (m.clase === 'sol' ? 'Lente de sol ' : 'Montura ') + esc(m.codigo) : 'Nueva montura o lente de sol', wide: true,
    body: `<form id="mf" class="form">
      <div class="seg" id="mclase"><button type="button" data-c="" class="${sel.clase ? '' : 'on'}">Montura</button><button type="button" data-c="sol" class="${sel.clase === 'sol' ? 'on' : ''}">Lente de sol</button></div>
      <div class="sigla-box"><span class="small">Así queda</span><b class="sigla" id="msig"></b></div>
      <div class="fg"><label class="f">Marca<input class="inp" name="marca" list="mmarcas" required autocomplete="off" value="${esc(e.marca)}" placeholder="Ej. Fellis"><datalist id="mmarcas">${marcas.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
        <label class="f">Sigla de la marca <span class="hint">(se pone sola, puedes cambiarla)</span><input class="inp up" name="marcaAbr" maxlength="6" autocomplete="off" value="${esc(e.marcaAbr)}"></label></div>
      ${ABREV_GRUPOS.map(([g, t]) => `<div class="fld">${t}${g === 'color' ? ' <span class="hint">(en el orden en que los tocas)</span>' : ''}<div class="pick" data-g="${g}"></div></div>`).join('')}
      <div class="fg"><label class="f">N° en la varilla <span class="hint">(opcional)</span><input class="inp up" name="varilla" autocomplete="off" value="${esc(e.varilla)}" placeholder="Ej. 4321"></label>
        <label class="f">Color de fábrica <span class="hint">(opcional)</span><input class="inp up" name="colorCod" autocomplete="off" value="${esc(e.colorCod)}" placeholder="C1, C2, C3…"></label></div>
      <div id="mdup"></div>
      <div class="fg fg3"><label class="f">Modelo o nombre <span class="hint">(opcional)</span><input class="inp" name="modelo" value="${esc(e.modelo)}"></label>
        <label class="f">Código interno<input class="inp up" name="codigo" required value="${esc(e.codigo)}"></label>
        <label class="f">Precio de venta<input class="inp" name="precio" inputmode="decimal" required value="${esc(e.precio)}"></label>
        ${puede('costos') ? `<label class="f">Costo <span class="hint">(opcional)</span><input class="inp" name="costo" inputmode="decimal" value="${esc(e.costo)}"></label>` : `<input type="hidden" name="costo" value="${esc(e.costo ?? '')}">`}
        <label class="f">Stock<input class="inp" name="stock" inputmode="numeric" value="${esc(e.stock)}"></label></div>
      ${m ? `<p class="hint" style="margin:0">${icon('lock', '').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"')} Cambiar el precio pide la clave de los dos socios.</p>` : ''}</form>`,
    foot: `${m && puede('editarInventario') ? `<button class="btn danger" id="mdel" style="margin-right:auto">${icon('trash')}</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" form="mf">Guardar</button>`,
    onMount: bg => {
      const form = $('#mf', bg), campo = n => form.elements[n];
      const estado = () => {
        const f = readForm(form);
        let v = f.varilla.toUpperCase().replace(/\s+/g, ''), c = f.colorCod.toUpperCase().replace(/\s+/g, '');
        const vc = /^(\d+)[-/]?(C\d+)$/.exec(v); if (vc && !c) [, v, c] = vc; // escribieron "4321 C2" junto
        if (/^\d+$/.test(c)) c = 'C' + c;
        return { ...f, ...sel, colores: [...sel.colores], marcaAbr: (f.marcaAbr || abrMarca(f.marca)).toUpperCase(), varilla: v, colorCod: c };
      };
      const actualizar = () => {
        const f = estado();
        $('#msig', bg).textContent = siglaMontura(f) || '—';
        const d = (f.varilla || (f.genero && f.colores.length)) && monturaIgual(f, m);
        $('#mdup', bg).innerHTML = d ? `<div class="lock-note" style="margin:0;align-items:center">${icon('box')}<div class="grow"><b>${m ? 'Ya hay otra montura igual' : 'Esta montura ya está registrada'}</b><br><span class="sigla">${esc(siglaMontura(d))}</span> · ${esc(d.codigo)} · ${d.stock} en stock</div>${m ? '' : `<button type="button" class="btn sm primary" id="mdupadd">Sumar al stock</button>`}</div>` : '';
        $('#mdupadd', bg) && ($('#mdupadd', bg).onclick = () => { closeModal(); stockForm(d, Math.max(1, num(campo('stock').value) || 1)); });
      };
      const pintar = () => {
        // Los lentes de sol solo llevan marca, color y varilla.
        ['genero', 'material', 'forma', 'aro'].forEach(g => { $(`[data-g="${g}"]`, bg).parentNode.hidden = sel.clase === 'sol'; });
        $$('#mclase button', bg).forEach(b => b.classList.toggle('on', b.dataset.c === sel.clase));
        ABREV_GRUPOS.forEach(([g]) => {
          const act = g === 'color' ? sel.colores : [sel[g]].filter(Boolean);
          const opts = abrev()[g].map(x => x[0]);
          act.forEach(v => { if (!opts.some(o => sinTilde(o) === sinTilde(v))) opts.push(v); });
          $(`[data-g="${g}"]`, bg).innerHTML = opts.map(v => {
            const i = act.findIndex(a => sinTilde(a) === sinTilde(v));
            return `<button type="button" data-v="${esc(v)}" class="${i >= 0 ? 'on' : ''}">${g === 'color' && i >= 0 && act.length > 1 ? `<i>${i + 1}</i>` : ''}${esc(v)} <small>${esc(abr(g, v))}</small></button>`;
          }).join('') + (g === 'color' ? `<input class="inp sm" id="mcolx" placeholder="Otro color + Enter" style="width:170px">` : '');
        });
        actualizar();
      };
      form.addEventListener('click', ev => {
        const c = ev.target.closest('#mclase button'); if (c) { sel.clase = c.dataset.c; pintar(); return; }
        const b = ev.target.closest('.pick button'); if (!b) return;
        const g = b.parentNode.dataset.g, v = b.dataset.v;
        if (g === 'color') { const i = sel.colores.findIndex(a => sinTilde(a) === sinTilde(v)); i >= 0 ? sel.colores.splice(i, 1) : sel.colores.push(v); }
        else sel[g] = sinTilde(sel[g]) === sinTilde(v) ? '' : v;
        pintar();
      });
      form.addEventListener('keydown', ev => {
        if (ev.target.id !== 'mcolx' || ev.key !== 'Enter') return;
        ev.preventDefault();
        const v = ev.target.value.trim(); if (!v) return;
        const t = abrev().color.find(([n]) => sinTilde(n) === sinTilde(v));
        if (!sel.colores.some(a => sinTilde(a) === sinTilde(v))) sel.colores.push(t ? t[0] : v.charAt(0).toUpperCase() + v.slice(1));
        pintar(); $('#mcolx', bg).focus();
      });
      campo('marca').oninput = () => { if (!abrManual) campo('marcaAbr').value = abrMarcaUsada(campo('marca').value); actualizar(); };
      campo('marcaAbr').oninput = () => { abrManual = !!campo('marcaAbr').value.trim(); actualizar(); };
      ['varilla', 'colorCod', 'modelo'].forEach(n => campo(n).oninput = actualizar);
      pintar();
      form.onsubmit = ev => {
        ev.preventDefault();
        const f = estado(); f.precio = num(f.precio); f.stock = num(f.stock); f.costo = f.costo ? num(f.costo) : '';
        f.codigo = f.codigo.toUpperCase(); f.color = f.colores.join(' / ');
        if (f.clase === 'sol') Object.assign(f, { genero: '', material: '', forma: '', aro: '' });
        const cod = db.monturas.find(x => x !== m && x.codigo.toLowerCase() === f.codigo.toLowerCase());
        if (cod && m) { toast('Ya existe otra montura con ese código'); return; }
        const registrar = () => {
          if (cod) f.codigo = nuevoCodigo();
          if (m) Object.assign(m, f); else db.monturas.push({ id: uid(), ...f });
          const n = /^M(\d+)$/.exec(f.codigo); if (n) db.config.nextMontura = Math.max(db.config.nextMontura || 1, +n[1] + 1);
          save(); closeModal(); toast(`Montura ${f.codigo} guardada`); render();
        };
        const igual = !m && (cod || monturaIgual(f));
        if (igual) return yaRegistrada(igual, Math.max(1, f.stock || 1), registrar);
        m && num(m.precio) !== f.precio ? dual(`Cambiar precio de montura ${m.codigo}: ${money(m.precio)} → ${money(f.precio)}`, registrar) : registrar();
      };
      $('#mdel', bg) && ($('#mdel', bg).onclick = () => dual(`Eliminar montura ${m.codigo}`, () => { db.monturas = db.monturas.filter(x => x !== m); save(); render(); }));
    },
  });
}
// Al registrar una montura que ya existe se ofrece sumar al stock en lugar de duplicarla.
function yaRegistrada(d, cant, registrarAparte) {
  modal({
    title: 'Esta montura ya está registrada',
    body: `<div class="form"><div class="row"><span class="tag">${esc(d.codigo)}</span><div><b class="sigla">${esc(siglaMontura(d))}</b><div class="muted small">${esc(infoMontura(d))} · ${money(d.precio)}</div></div></div>
      <div class="row between"><span class="muted">Stock actual</span><b class="num" style="font-size:20px">${d.stock}</b></div>
      <p class="muted small" style="margin:0">¿Quieres sumarle ${cant} ${cant === 1 ? 'unidad' : 'unidades'}? Si en verdad es otra montura, regístrala aparte.</p></div>`,
    foot: `<button class="btn" id="yaparte">Registrar aparte</button><button class="btn primary" id="ysumar">${icon('plus')} Sumar al stock</button>`,
    onMount: bg => {
      $('#ysumar', bg).onclick = () => stockForm(d, cant);
      $('#yaparte', bg).onclick = registrarAparte;
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
        !c ? pideDueno(`Agregar cristal "${f.nombre}" a ${money(f.precio)}`, doit, 'precios')
          : num(c.precio) !== f.precio ? pideDueno(`Cambiar precio de "${c.nombre}": ${money(c.precio)} → ${money(f.precio)}`, doit, 'precios') : doit();
      };
      $('#cdel', bg) && ($('#cdel', bg).onclick = () => pideDueno(`Eliminar cristal "${c.nombre}"`, () => { db.cristales = db.cristales.filter(x => x !== c); save(); render(); }, 'precios'));
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
    const c = db.config, F = c.fact, d = dueno();
    if (soyDueno() && !ajustesAbierto) return `<div class="page-head"><div><h1>Ajustes</h1><p>Protegido con la clave del dueño.</p></div></div>
      <div class="card" style="max-width:460px"><div class="card-b">
        <div class="lock-note">${icon('lock')}<div>Ajustes, las claves y el respaldo solo los maneja <b>${esc(d.nombre)}</b>.</div></div>
        ${c.claveDueno ? `<form id="ajf" class="form"><label class="f">Clave de dueño<input class="inp pin" id="ajpin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" required></label><div class="err" id="ajerr"></div>
          <button class="btn primary">${icon('unlock')} Abrir Ajustes</button></form>`
        : soyDueno() ? `<p class="muted small" style="margin-top:0">Todavía no tienes clave de dueño. Créala ahora: con ella se abre Ajustes y se cambia la lista de precios.</p><button class="btn primary" id="ajcrear">${icon('lock')} Crear mi clave de dueño</button>`
          : `<p class="muted small" style="margin:0">${esc(d.nombre)} tiene que entrar con su usuario y crear su clave de dueño.</p>`}</div></div>`;
    return `<div class="page-head"><div><h1>Ajustes</h1><p>Datos de la óptica, personas y respaldo.</p></div>${soyDueno() ? `<div class="actions"><button class="btn" id="ajlock">${icon('lock')} Cerrar Ajustes</button></div>` : ''}</div>
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
        <div class="card" style="grid-column:1/-1"><div class="card-h"><div><h3>Siglas del inventario</h3><div class="sub">Con estas letras se arma la descripción de cada montura, por ejemplo D.M FELL CU/C VER/RO.</div></div></div><div class="card-b"><form id="abf" class="form">
          ${ABREV_GRUPOS.map(([g, t]) => `<div class="fld">${t}<div class="abl" data-g="${g}">${abrev()[g].map(([n, a]) => filaAbrev(n, a)).join('')}</div><div><button type="button" class="btn sm ghost" data-addab="${g}">${icon('plus')} Agregar</button></div></div>`).join('')}
          <p class="hint" style="margin:0">Si cambias una sigla, se actualiza en todas las monturas. Si cambias un nombre, las monturas que ya tenían el nombre anterior lo conservan.</p>
          <div class="actions"><button class="btn primary">Guardar siglas</button><button type="button" class="btn ghost" id="abreset">Volver a las siglas iniciales</button></div></form></div></div>
        ${!soyDueno() ? '' : `<div class="card"><div class="card-h"><div><h3>Personas y permisos</h3><div class="sub">Cada una entra con su propio usuario y contraseña.</div></div><button class="btn sm primary" id="padd">${icon('plus')} Agregar</button></div><div class="card-b">
          ${activos().map(s => { const u = socioRol(s) === 'dueno' ? sesion.perfil?.usuario || s.usuario || sesion.usuario?.email : s.usuario; return `<div class="row between" style="padding:10px 0;border-bottom:1px solid var(--line-2)"><div class="row"><span class="avatar">${initials(s.nombre)}</span><div><b>${esc(s.nombre)}</b><div class="muted small">${ROLES[socioRol(s)]}${socioRol(s) === 'vendedor' ? '' : ` · ${s.pct}% de la ganancia`} · ${resumenPermisos(s)} · ${u ? 'usuario ' + esc(u) : '<span style="color:var(--danger)">sin usuario</span>'}</div></div></div><button class="btn sm" data-per="${s.id}">${u ? 'Editar' : 'Crear usuario'}</button></div>`; }).join('')}
          <p class="hint">Todos pueden atender pacientes, vender, cobrar, ver la caja del día y agregar mercadería. Lo demás lo decides tú con el botón Editar de cada persona. Crear usuarios, tu clave de dueño y los respaldos son solo tuyos.</p></div></div>
        <div class="card"><div class="card-h"><h3>Clave del dueño</h3></div><div class="card-b">
          <p class="muted small" style="margin-top:0">Es de <b>${esc(d.nombre)}</b>. Abre Ajustes y permite cambiar la lista de precios de lunas. Solo se cambia sabiendo la clave actual.</p>
          <button class="btn" id="cdcambiar">${icon('lock')} Cambiar clave de dueño</button></div></div>
`}
        <div class="card"><div class="card-h"><h3>Cuenta TerraÓptica</h3></div><div class="card-b">
          <div class="cash-sum"><div class="line"><span>Tu usuario</span><b>${esc(sesion.perfil?.usuario || sesion.usuario?.email || '')}</b></div>
          <div class="line"><span>Plan</span><b>${esc(avisoPlan().corto)}</b></div></div>
          <p class="muted small">Con tu usuario y tu contraseña entras a la óptica desde cualquier celular, tablet o computadora. Si la olvidas, en la pantalla de entrada toca "Olvidé mi clave".</p>
          <div class="actions"><a class="btn" href="${waSoporte('Hola, tengo una consulta sobre TerraÓptica (' + (c.nombre || '') + ').')}" target="_blank" rel="noopener">${icon('wa')} Escribir a soporte</a>
          <button class="btn" id="csalir3">${icon('logout')} Cerrar sesión en este equipo</button></div></div></div>
        ${!soyDueno() ? '' : `<div class="card"><div class="card-h"><h3>Respaldo de datos</h3></div><div class="card-b">
          <p class="muted small" style="margin-top:0">Tus datos se guardan en la nube de TerraÓptica y quedan copiados en cada equipo. Igual puedes descargar una copia cuando quieras.</p>
          <div class="actions"><button class="btn primary" id="exp">${icon('down')} Descargar respaldo</button><label class="btn">${icon('up')} Restaurar respaldo<input type="file" id="imp" accept=".json,.txt,application/json,text/plain" hidden></label></div>
          ${c.ultimoRespaldo ? `<p class="hint">Último respaldo: ${new Date(c.ultimoRespaldo).toLocaleString('es-PE')}</p>` : ''}
          <div style="border-top:1px solid var(--line-2);margin-top:16px;padding-top:14px"><b class="small">¿Terminaste de probar?</b><p class="muted small" style="margin:4px 0 10px">Borra los datos de ejemplo y empieza con tus pacientes reales. Pide la clave de ambos socios.</p>
          <button class="btn danger" id="reset">${icon('trash')} Empezar de cero</button></div></div></div>
`}
        ${soyDueno() && hayDatosCelular() ? `<div class="card"><div class="card-h"><h3>Datos de Glooptic en este celular</h3></div><div class="card-b">
          <p class="muted small" style="margin-top:0">Este celular todavía guarda los datos del sistema anterior. ${(e => e && e.como === 'si' ? `Ya se subieron a la nube el ${new Date(e.ts).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Todavía no se subieron a la nube.')(estadoSubida(sesion.optica.id))} Puedes revisar si falta algo: solo se suma lo que no está.</p>
          <div class="actions"><button class="btn" id="subcel">${icon('up')} Revisar y subir</button></div></div></div>` : ''}
        <div class="card"><div class="card-h"><h3>Cambios autorizados</h3><span class="sub">Últimos 20</span></div><div class="card-b" style="padding-top:8px">
          ${db.log.length ? db.log.slice(0, 20).map(l => `<div style="padding:8px 0;border-bottom:1px solid var(--line-2)"><div class="small"><b>${esc(l.accion)}</b></div><div class="muted small">${new Date(l.ts).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })} · ${esc(socioName(l.por))}${l.autoriza ? (l.autoriza.length > 1 ? ' · autorizado por ambos' : ' · con clave del dueño') : ''}</div></div>`).join('') : `<div class="empty" style="padding:14px">Sin registros.</div>`}</div></div>
        <div class="card"><div class="card-h"><h3>Ventas anuladas</h3><span class="sub">Quedan guardadas con sus pagos</span></div><div class="card-b" style="padding-top:8px">
          ${db.anuladas.length ? db.anuladas.slice(0, 30).map(a => `<div style="padding:8px 0;border-bottom:1px solid var(--line-2)"><div class="row between small"><b>N° ${pad(a.numero)} · ${esc(a.pacienteNombre || '—')}</b><b class="num">${money(a.total)}</b></div>
            <div class="muted small">${esc(a.items.map(i => i.desc).join(' · '))}</div>
            <div class="muted small">Venta ${fdate(a.fecha)} · pagado ${money(a.pagos.reduce((s, x) => s + num(x.monto), 0))} · anulada ${new Date(a.anuladaTs).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })} por ${esc(socioName(a.anuladaPor))}</div></div>`).join('') : `<div class="empty" style="padding:14px">No hay ventas anuladas.</div>`}</div></div>
      </div>`;
  },
  bind() {
    if (soyDueno() && !ajustesAbierto) {
      $('#ajcrear') && ($('#ajcrear').onclick = () => crearClaveDueno(() => { ajustesAbierto = true; render(); }));
      $('#ajf') && ($('#ajf').onsubmit = e => {
        e.preventDefault();
        if (hashPin($('#ajpin').value) !== db.config.claveDueno) { $('#ajerr').textContent = 'Clave incorrecta'; $('#ajpin').select(); return; }
        ajustesAbierto = true; render();
      });
      return;
    }
    $('#ajlock') && ($('#ajlock').onclick = () => { ajustesAbierto = false; render(); });
    $('#cdcambiar') && ($('#cdcambiar').onclick = () => crearClaveDueno(null, true));
    $('#cfg').onsubmit = e => { e.preventDefault(); const f = readForm(e.target); Object.assign(db.config, f, { recordatorioMeses: num(f.recordatorioMeses) || 12 }); save(); toast('Datos guardados'); render(); };
    $$('[data-per]').forEach(b => b.onclick = () => personaForm(socio(b.dataset.per)));
    $('#padd') && ($('#padd').onclick = () => personaForm());
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
    $$('[data-addab]').forEach(b => b.onclick = () => { $(`.abl[data-g="${b.dataset.addab}"]`).insertAdjacentHTML('beforeend', filaAbrev('', '')); $(`.abl[data-g="${b.dataset.addab}"] .abr:last-child input`).focus(); });
    $('#abf').addEventListener('click', e => { const x = e.target.closest('[data-delab]'); if (x) x.closest('.abr').remove(); });
    $('#abf').onsubmit = e => {
      e.preventDefault();
      const ab = {};
      ABREV_GRUPOS.forEach(([g]) => {
        ab[g] = $$(`.abl[data-g="${g}"] .abr`).map(r => [$('[data-n]', r).value.trim(), $('[data-a]', r).value.trim().toUpperCase()])
          .filter(([n]) => n).map(([n, a]) => [n, a || alnum(n).slice(0, 3).toUpperCase()]);
      });
      db.config.abrev = ab; save(); toast('Siglas guardadas'); render();
    };
    $('#abreset').onclick = () => confirmBox('¿Volver a las siglas iniciales? Se pierden los cambios que hiciste en esta tabla.', () => { db.config.abrev = ABREV_DEF(); save(); toast('Siglas restablecidas'); render(); }, 'Restablecer');
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
    $('#exp') && ($('#exp').onclick = descargarRespaldo);
    $('#subcel') && ($('#subcel').onclick = () => ofrecerSubida(true));
    $('#csalir3').onclick = salirDeCuenta;
    $('#reset') && ($('#reset').onclick = () => dual('Borrar pacientes, órdenes, caja e inventario (se conservan los socios, los datos de la óptica y las listas de precios)', () => {
      const cfg = { ...db.config, nextOrden: 1, nextMontura: 1, fact: { ...db.config.fact, numB: 1, numF: 1 } }, tar = db.tarifas, prod = db.productos; db = blank(); db.config = cfg; db.tarifas = tar; db.productos = prod; permitirBorrado = true; save(); toast('Listo: el sistema quedó en blanco'); go('#/inicio');
    }));
    $('#imp') && ($('#imp').onchange = e => {
      const file = e.target.files[0]; if (!file) return;
      file.text().then(t => {
        let data; try { data = JSON.parse(t); if (!data.config || !data.pacientes) throw 0; } catch (err) { toast('El archivo no es un respaldo válido'); return; }
        dual(`Restaurar respaldo (${data.pacientes.length} pacientes, ${data.ordenes.length} órdenes). Se reemplazan los datos actuales.`, () => { db = normDb(Object.assign(blank(), data)); permitirBorrado = true; save(); toast('Respaldo restaurado'); render(); });
      });
    });
  },
};
const filaAbrev = (n, a) => `<div class="abr"><input class="inp sm" data-n value="${esc(n)}" placeholder="Nombre" aria-label="Nombre"><input class="inp sm up" data-a value="${esc(a)}" placeholder="Sigla" maxlength="5" aria-label="Sigla"><button type="button" class="btn ghost icon sm" data-delab aria-label="Quitar">${icon('x')}</button></div>`;
// Casillas de permisos del formulario de una persona.
function permisosHTML(s) {
  const tiene = permisosDe(s || { rol: 'vendedor' });
  return `<div class="fld">Qué puede hacer
    <div class="row" style="gap:6px;flex-wrap:wrap"><span class="muted small">Rápido:</span><button type="button" class="btn sm" data-preset="todo">Igual que yo</button><button type="button" class="btn sm" data-preset="socio">Como socio</button><button type="button" class="btn sm" data-preset="vendedor">Solo atender</button></div>
    <div class="perms">${PERMISOS.map(([g, l]) => `<div class="perm-g"><b class="small">${g}</b>${l.map(([k, t]) => `<label class="perm"><input type="checkbox" data-perm="${k}" ${tiene.includes(k) ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`).join('')}</div>
    <div class="hint">Siempre puede atender pacientes, vender, cobrar, ver la caja del día y agregar mercadería. Crear usuarios, cambiar tu clave de dueño, restaurar respaldos y empezar de cero son solo tuyos.</div></div>`;
}
function resumenPermisos(s) {
  if (socioRol(s) === 'dueno') return 'todo';
  const n = permisosDe(s).length;
  return n === PERMISO_KEYS.length ? 'igual que el dueño' : n ? `${n} de ${PERMISO_KEYS.length} permisos` : 'solo atender';
}
// Agregar o editar una persona, con su usuario y contraseña. Solo el dueño entra aquí (Ajustes).
// El porcentaje de ganancia que no tienen los socios queda para el dueño.
function personaForm(s) {
  const esD = s && s.id === dueno().id;
  let rol = s ? socioRol(s) : 'vendedor', cambiarClave = false, tocados = !!(s && Array.isArray(s.permisos));
  const conUsuario = !!(s && s.usuario);
  modal({
    title: s ? 'Editar ' + esc(s.nombre) : 'Agregar persona',
    body: `<form id="pf2" class="form" autocomplete="off"><label class="f">Nombre<input class="inp" name="nombre" value="${esc(s?.nombre || '')}" required maxlength="40"></label>
      <label class="f">Celular (WhatsApp) <span class="hint">(para pedirle aprobación cuando no esté en la tienda)</span><input class="inp" name="telefono" inputmode="tel" value="${esc(s?.telefono || (esD ? sesion.optica?.telefono || '' : ''))}" maxlength="20"></label>
      ${esD ? `<p class="muted small" style="margin:0">Rol: <b>Dueño</b>. Puede hacer todo en el sistema. Entras con tu usuario <b>${esc(sesion.perfil?.usuario || '')}</b>.</p>` : `<div class="fld">Rol<div class="seg" id="prol"><button type="button" data-r="socio">Socio</button><button type="button" data-r="vendedor">Vendedor</button></div><div class="hint" id="prolh"></div></div>`}
      ${esD ? '' : permisosHTML(s)}
      ${esD ? '' : `<label class="f" id="ppct">Porcentaje de la ganancia <span class="hint">(lo que falta para 100% queda para el dueño)</span><input class="inp" name="pct" inputmode="decimal" value="${s && socioRol(s) === 'socio' ? s.pct : ''}"></label>`}
      ${esD ? '' : conUsuario ? `<div class="fld">Usuario para entrar<div class="row between"><b>${esc(s.usuario)}</b><button type="button" class="btn sm" id="pnueva">Poner contraseña nueva</button></div>
          <label class="f" id="pclavebox" hidden>Contraseña nueva<input class="inp" name="clave" minlength="6" spellcheck="false" placeholder="Mínimo 6 caracteres"></label></div>`
        : `<div class="fg"><label class="f">Usuario para entrar<input class="inp" name="usuario" required minlength="3" maxlength="30" pattern="[A-Za-z0-9._\\-]+" autocapitalize="none" spellcheck="false" placeholder="Ej. juan.perez"></label>
          <label class="f">Contraseña<input class="inp" name="clave" required minlength="6" spellcheck="false" placeholder="Mínimo 6 caracteres"></label></div>`}
      <label class="f" id="ppin">${s && s.pin ? 'Nueva clave de autorización <span class="hint">(vacía = no cambiar)</span>' : 'Clave de autorización <span class="hint">(opcional: si la dejas vacía, la crea él al entrar)</span>'}<input class="inp" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" placeholder="4 a 8 números"></label>
      <div class="err" id="pferr"></div></form>`,
    foot: `${s && !esD ? `<button class="btn danger" id="pbaja" style="margin-right:auto">${icon('trash')} Quitar acceso</button>` : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" form="pf2" id="pfok">Guardar</button>`,
    onMount: bg => {
      const pintar = () => {
        $$('#prol button', bg).forEach(b => b.classList.toggle('on', b.dataset.r === rol));
        $('#ppct', bg) && ($('#ppct', bg).hidden = rol !== 'socio');
        $('#ppin', bg).hidden = !esD && rol === 'vendedor';
        $('#prolh', bg) && ($('#prolh', bg).textContent = rol === 'socio' ? 'Es dueño de una parte: autoriza cambios delicados con su clave y recibe su parte de la ganancia.' : 'Trabaja en la óptica: no recibe ganancia ni autoriza cambios con clave.');
      };
      $$('#prol button', bg).forEach(b => b.onclick = () => { rol = b.dataset.r; if (!tocados) $$('[data-perm]', bg).forEach(c => { c.checked = PERMISOS_ROL[rol].includes(c.dataset.perm); }); pintar(); });
      $('#pnueva', bg) && ($('#pnueva', bg).onclick = () => { cambiarClave = true; $('#pclavebox', bg).hidden = false; $('#pnueva', bg).hidden = true; $('[name=clave]', bg).required = true; $('[name=clave]', bg).focus(); });
      $$('[data-preset]', bg).forEach(b => b.onclick = () => { const l = b.dataset.preset === 'todo' ? PERMISO_KEYS : PERMISOS_ROL[b.dataset.preset]; $$('[data-perm]', bg).forEach(c => { c.checked = l.includes(c.dataset.perm); }); tocados = true; });
      $$('[data-perm]', bg).forEach(c => c.onchange = () => { tocados = true; });
      pintar();
      const repartir = (quien, pct) => {
        const otros = autorizantes().filter(x => x.id !== dueno().id && x !== quien).reduce((t, x) => t + num(x.pct), 0);
        return round2(100 - otros - pct);
      };
      $('#pf2', bg).onsubmit = async e => {
        e.preventDefault();
        const f = readForm(e.target), err = t => { $('#pferr', bg).textContent = t; }, btn = $('#pfok', bg);
        if (activos().some(x => x !== s && x.nombre.toLowerCase() === f.nombre.toLowerCase())) return err('Ya hay otra persona con ese nombre.');
        const r = esD ? 'dueno' : rol, pct = r === 'socio' ? num(f.pct) : 0;
        const resto = esD ? null : repartir(s, pct);
        if (resto !== null && resto < 0) return err('Los porcentajes de los socios pasan del 100%.');
        const p = s || { id: uid() };
        // Primero se crea (o se renueva) su usuario en la nube; si falla, no se guarda nada.
        let acceso = null;
        if (!esD && (!conUsuario || cambiarClave)) {
          btn.disabled = true; btn.textContent = 'Creando usuario…'; err('');
          try {
            if (conUsuario) await Nube.quitarAcceso({ uid: s.uid, usuario: s.usuario });
            acceso = await Nube.crearAcceso({ opticaId: sesion.optica.id, usuario: conUsuario ? s.usuario : f.usuario, clave: f.clave, nombre: f.nombre, rol: r, personaId: p.id });
          } catch (x) { btn.disabled = false; btn.textContent = 'Guardar'; return err(Nube.mensaje(x)); }
          Object.assign(p, { uid: acceso.uid, usuario: acceso.usuario });
        }
        Object.assign(p, { nombre: f.nombre, rol: r, pct: esD ? p.pct : pct, telefono: (f.telefono || '').trim() });
        if (!esD) p.permisos = $$('[data-perm]', bg).filter(c => c.checked).map(c => c.dataset.perm);
        if (f.pin && r !== 'vendedor') p.pin = hashPin(f.pin);
        if (!s) db.config.socios.push(p);
        if (resto !== null) dueno().pct = resto;
        addLog(`${!s ? 'Persona agregada' : acceso && conUsuario ? 'Contraseña nueva' : acceso ? 'Usuario creado' : 'Datos actualizados'}: ${p.nombre} (${ROLES[r]})`);
        save(); closeModal(); render();
        if (acceso) datosAccesoModal(p, f.clave); else toast('Datos guardados');
      };
      $('#pbaja', bg) && ($('#pbaja', bg).onclick = () => confirmBox(`¿Quitarle el acceso a <b>${esc(s.nombre)}</b>? Ya no podrá entrar desde ningún equipo. Sus ventas y registros se conservan.`, async () => {
        if (s.usuario) { try { await Nube.quitarAcceso({ uid: s.uid, usuario: s.usuario }); } catch (x) { toast('No se pudo quitar el acceso: ' + Nube.mensaje(x)); return; } }
        s.baja = true; s.pct = 0; dueno().pct = repartir(s, 0);
        addLog(`Acceso quitado: ${s.nombre}`); save(); toast(`${s.nombre} ya no puede entrar`); render();
      }, 'Quitar acceso'));
    },
  });
}
// Datos para pasarle a la persona: dónde entrar, su usuario y su contraseña.
function datosAccesoModal(p, clave) {
  const url = location.origin + location.pathname.replace(/[^/]*$/, '');
  const txt = `Hola ${p.nombre.split(' ')[0]}, ya tienes tu usuario para ${db.config.nombre || 'la óptica'}. Entra a ${url} con tu usuario ${p.usuario} y la contraseña ${clave}.`;
  modal({
    title: 'Usuario listo',
    body: `<p style="margin:0 0 12px"><b>${esc(p.nombre)}</b> ya puede entrar con su propio usuario.</p>
      <div class="cash-sum"><div class="line"><span>Dirección</span><b>${esc(url)}</b></div><div class="line"><span>Usuario</span><b>${esc(p.usuario)}</b></div><div class="line"><span>Contraseña</span><b>${esc(clave)}</b></div></div>
      <p class="hint">La contraseña no queda guardada en el sistema: pásasela ahora. Si la olvida, aquí mismo le pones una nueva.</p>`,
    foot: `<button class="btn" data-close>Cerrar</button><a class="btn wa" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">${icon('wa')} Enviar por WhatsApp</a>`,
  });
}

// ---------- Datos de ejemplo ----------
function seedDemo() {
  const d = hoy(), S = db.config.socios;
  const mont = [
    ['Ray-Ban', 'RB', 'Clubmaster', 'Unisex', 'Pasta', 'Cuadrada', 'Semi al aire', ['Carey', 'Dorado'], '5154', 'C2', 380, 3],
    ['Ray-Ban', 'RB', 'Round', 'Unisex', 'Metal', 'Redonda', 'Completa', ['Dorado'], '3447', 'C1', 420, 2],
    ['Vogue', 'VOG', '', 'Dama', 'Pasta', 'Cat eye', 'Completa', ['Negro'], '5286', 'C1', 290, 4],
    ['Oakley', 'OAK', 'Airdrop', 'Caballero', 'TR90', 'Rectangular', 'Completa', ['Gris'], '8046', 'C3', 450, 1],
    ['Fellis', 'FELL', '', 'Dama', 'Metal', 'Cuadrada', 'Completa', ['Verde', 'Rosa'], '4321', 'C2', 180, 2],
    ['Genérica', 'GEN', 'Kids', 'Niño', 'TR90', 'Rectangular', 'Completa', ['Azul'], '', '', 95, 8],
    ['Fellis', 'FELL', '', 'Dama', 'Metal', 'Cuadrada', 'Completa', ['Negro', 'Dorado'], '4321', 'C1', 180, 3],
    ['Carolina Herrera', 'CH', '', 'Dama', 'Pasta', 'Cuadrada', 'Completa', ['Carey'], '836', 'C2', 520, 1],
    ['Vanci', 'VAN', '', 'Caballero', 'Metal', 'Redonda', 'Semi al aire', ['Dorado'], '7788', 'C1', 220, 2],
    ['Genérica', 'GEN', '', 'Unisex', 'Titanio', 'Rectangular', 'Al aire', ['Plateado'], '', '', 160, 6],
  ];
  db.monturas = mont.map(([marca, marcaAbr, modelo, genero, material, forma, aro, colores, varilla, colorCod, precio, stock], i) =>
    ({ id: uid(), codigo: 'M' + pad(i + 1, 5), marca, marcaAbr, modelo, genero, material, forma, aro, colores, color: colores.join(' / '), varilla, colorCod, precio, stock }));
  db.config.nextMontura = mont.length + 1;
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
  const it = (mi, ci) => [{ tipo: 'montura', ref: db.monturas[mi].id, desc: descMontura(db.monturas[mi]), cant: 1, precio: db.monturas[mi].precio },
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

// Si se publicó una versión nueva, la app se actualiza sola al volver a abrirla.
const APP_VERSION = '2026.09.24.7';
async function buscarActualizacion() {
  if (EN_CLAUDE || location.protocol === 'file:') return;
  try {
    const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
    const v = r.ok ? (await r.text()).trim() : '';
    // Solo se recarga si de verdad llegó un número de versión distinto (no una página de error).
    if (/^\d{4}\.\d{2}\.\d{2}\.\w+$/.test(v) && v !== APP_VERSION && !$('.modal-bg') && !(draft && draft.items && draft.items.length)) { subir(); setTimeout(() => location.reload(), 500); }
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscarActualizacion(); });
setInterval(buscarActualizacion, 15 * 60 * 1000);

render();
if (window.Nube) arrancarNube(); else addEventListener('nube-lista', arrancarNube, { once: true });
// Pide al navegador que no borre la copia local por su cuenta cuando falte espacio.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist().catch(() => { }); } catch (e) { }

// Instalable en el teléfono/tablet y funciona sin internet (solo cuando se sirve por https o localhost).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !EN_CLAUDE) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
}
