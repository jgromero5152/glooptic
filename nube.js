// Conexión con Firebase: cuentas (correo y clave) y datos de cada óptica en la nube.
// app.js no importa nada: usa window.Nube cuando este módulo avisa con el evento "nube-lista".
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, collection,
  onSnapshot, writeBatch, deleteField, Timestamp, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'es';
// Copia local en el equipo: la app abre y guarda sin internet y se pone al día al volver la señal.
const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

const DIAS_PRUEBA = 15;

// Mensajes de error de Firebase en palabras simples.
function mensaje(e) {
  const c = (e && e.code) || '';
  return ({
    'auth/invalid-credential': 'Usuario o clave incorrectos.',
    'auth/wrong-password': 'Usuario o clave incorrectos.',
    'auth/requires-recent-login': 'Por seguridad, sal y vuelve a entrar antes de cambiar la contraseña.',
    'auth/user-not-found': 'Usuario o clave incorrectos.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Ingresa con tu clave.',
    'auth/weak-password': 'La clave debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos y vuelve a intentar.',
    'auth/network-request-failed': 'No hay conexión a internet.',
    'permission-denied': 'No tienes permiso para hacer esto.',
    'unavailable': 'No hay conexión a internet.',
  })[c] || (e && e.message) || 'Ocurrió un error.';
}

// Sesión: avisa con {usuario, perfil, optica} cada vez que cambia (perfil y optica pueden ser null).
let avisar = () => { }, quitarOptica = null, quitarPerfil = null;
async function cargarSesion(u) {
  if (quitarOptica) { quitarOptica(); quitarOptica = null; }
  if (quitarPerfil) { quitarPerfil(); quitarPerfil = null; }
  if (!u) return avisar({ usuario: null, perfil: null, optica: null });
  let perfil = null;
  // Justo después de entrar, la base de datos puede tardar un instante en reconocer la sesión: se reintenta.
  for (let i = 0; ; i++) {
    try {
      await u.getIdToken();
      const s = await getDoc(doc(fs, 'usuarios', u.uid));
      perfil = s.exists() ? s.data() : null; break;
    } catch (e) {
      if (auth.currentUser !== u) return;
      if (e.code !== 'permission-denied' || i >= 4) return avisar({ usuario: u, perfil: null, optica: null, error: mensaje(e) });
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  if (auth.currentUser !== u) return;
  if (!perfil || !perfil.opticaId) return avisar({ usuario: u, perfil, optica: null });
  // La óptica se escucha en vivo: si el administrador cambia el estado o la fecha, se ve al momento.
  const escuchar = intento => {
    quitarOptica = onSnapshot(doc(fs, 'opticas', perfil.opticaId),
      s => avisar({ usuario: u, perfil, optica: s.exists() ? { id: s.id, ...s.data(), vence: s.data().vence?.toMillis?.() || 0 } : null }),
      e => {
        if (auth.currentUser !== u) return;
        if (e.code === 'permission-denied' && intento < 4) { setTimeout(() => { if (auth.currentUser === u) escuchar(intento + 1); }, 400 * (intento + 1)); return; }
        avisar({ usuario: u, perfil, optica: null, error: mensaje(e) });
      });
  };
  escuchar(0);
  // Si el dueño le quita el acceso a esta persona, se cierra su entrada al momento.
  quitarPerfil = onSnapshot(doc(fs, 'usuarios', u.uid), s => {
    if (s.exists() || auth.currentUser !== u) return;
    if (quitarOptica) { quitarOptica(); quitarOptica = null; }
    avisar({ usuario: u, perfil: null, optica: null, error: 'Tu acceso a esta óptica fue retirado.' });
  }, () => { });
}
function alCambiarSesion(cb) { avisar = cb; return onAuthStateChanged(auth, cargarSesion); }
const refrescar = () => cargarSesion(auth.currentUser);

// Se puede entrar con el correo o con el usuario que José le dio a la óptica (accesos/{usuario} guarda su correo).
async function correoDe(texto) {
  const t = String(texto || '').trim().toLowerCase();
  if (t.includes('@')) return t;
  const s = t ? await getDoc(doc(fs, 'accesos', t)).catch(e => { if (e.code === 'unavailable') throw e; return null; }) : null;
  if (!s || !s.exists()) throw Object.assign(new Error('Usuario o clave incorrectos.'), { code: 'auth/invalid-credential' });
  return s.data().correo;
}
const ingresar = async (usuario, clave) => signInWithEmailAndPassword(auth, await correoDe(usuario), clave);
// Las personas que crea el dueño no tienen correo propio: la contraseña nueva se la pone el dueño.
const DOMINIO_PERSONAS = 'usuarios.miterraoptica.com';
async function recuperar(usuario) {
  const c = await correoDe(usuario);
  if (c.endsWith('@' + DOMINIO_PERSONAS)) throw new Error('Pídele al dueño de tu óptica que te ponga una contraseña nueva.');
  return sendPasswordResetEmail(auth, c);
}

// Datos por DNI o RUC (nombre; con RUC también la dirección), a través del intermediario de TerraÓptica en Cloudflare.
// Vacío = todavía no está instalado, y la app no muestra la búsqueda.
const CONSULTAS_URL = 'https://consultas-terraoptica.joseromero5152.workers.dev';
async function consultarDoc(tipo, numero) {
  if (!CONSULTAS_URL || !auth.currentUser) throw new Error('La búsqueda por DNI no está disponible.');
  const token = await auth.currentUser.getIdToken();
  let r;
  try { r = await fetch(`${CONSULTAS_URL}/${tipo}/${numero}`, { headers: { Authorization: 'Bearer ' + token } }); }
  catch (e) { throw new Error('No hay conexión para buscar. Escribe los datos a mano.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo buscar. Escribe los datos a mano.');
  return j;
}

// Usuario y contraseña para una persona de la óptica (socio o vendedor). Lo crea el dueño.
// La cuenta se crea en una conexión aparte y temporal, para que el dueño siga con su sesión.
async function crearAcceso({ opticaId, usuario, clave, nombre, rol, personaId }) {
  const u = String(usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) throw new Error('El usuario debe tener de 3 a 30 letras o números (sin espacios; puede llevar punto o guion).');
  if ((await getDoc(doc(fs, 'accesos', u))).exists()) throw new Error('Ese usuario ya existe. Elige otro.');
  const tmp = initializeApp(firebaseConfig, 'acceso-' + Date.now());
  const authTmp = initializeAuth(tmp, { persistence: inMemoryPersistence });
  try {
    const correo = `${u}.${Math.random().toString(36).slice(2, 8)}@${DOMINIO_PERSONAS}`;
    const { user } = await createUserWithEmailAndPassword(authTmp, correo, clave);
    const b = writeBatch(fs);
    b.set(doc(fs, 'usuarios', user.uid), { opticaId, rol, nombre, correo, usuario: u, personaId, creado: serverTimestamp() });
    b.set(doc(fs, 'accesos', u), { correo, opticaId });
    try { await b.commit(); } catch (e) { try { await user.delete(); } catch (x) { } throw e; }
    return { uid: user.uid, usuario: u };
  } finally {
    try { await signOut(authTmp); } catch (e) { }
    deleteApp(tmp).catch(() => { });
  }
}
// Quita la entrada de una persona: ya no puede iniciar sesión en la óptica.
function quitarAcceso({ uid, usuario }) {
  const b = writeBatch(fs);
  if (uid) b.delete(doc(fs, 'usuarios', uid));
  if (usuario) b.delete(doc(fs, 'accesos', usuario));
  return b.commit();
}
const salir = () => signOut(auth);

// Cada persona cambia su propia contraseña: primero confirma la actual (Firebase lo exige) y luego pone la nueva.
async function cambiarClave(actual, nueva) {
  const u = auth.currentUser;
  if (!u || !u.email) throw Object.assign(new Error('Vuelve a entrar e inténtalo otra vez.'), { code: 'sin-sesion' });
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, actual));
  await updatePassword(u, nueva);
}

// Registro de una óptica nueva: crea la cuenta, la óptica (en prueba) y el perfil del dueño en un solo paso.
async function registrar({ correo, clave, nombre, optica, telefono }) {
  const { user } = await createUserWithEmailAndPassword(auth, correo.trim(), clave);
  try { return await crearOptica({ nombre, optica, telefono }); }
  catch (e) { try { await user.delete(); } catch (x) { } throw e; }
}
// Crea la óptica (en prueba) y el perfil de dueño para la cuenta con la que se entró.
async function crearOptica({ nombre, optica, telefono }) {
  const user = auth.currentUser;
  const oid = doc(collection(fs, 'opticas')).id;
  const b = writeBatch(fs);
  b.set(doc(fs, 'opticas', oid), {
    nombre: optica, duenoUid: user.uid, correo: user.email, telefono: telefono || '', estado: 'prueba', plan: 'prueba',
    creado: serverTimestamp(), vence: Timestamp.fromMillis(Date.now() + DIAS_PRUEBA * 864e5),
  });
  b.set(doc(fs, 'usuarios', user.uid), { opticaId: oid, rol: 'dueno', nombre, correo: user.email, creado: serverTimestamp() });
  await b.commit();
  return oid;
}

// Datos de la óptica: cada documento de opticas/{oid}/datos guarda { r: { id: "json del registro" } }.
function escucharDatos(oid, cb, alError) {
  return onSnapshot(collection(fs, 'opticas', oid, 'datos'), { includeMetadataChanges: true }, snap => {
    const cambios = snap.docChanges().map(c => ({ tipo: c.type, id: c.doc.id, r: c.type === 'removed' ? {} : (c.doc.data().r || {}) }));
    cb(cambios, { desdeCache: snap.metadata.fromCache, total: snap.size });
  }, e => alError && alError(mensaje(e)));
}

// Escribe los cambios [{doc, id, json|null}] agrupados por documento; null borra el registro.
// Firestore los guarda en el equipo al instante y los sube cuando hay internet.
function escribir(oid, cambios) {
  const porDoc = new Map();
  for (const c of cambios) {
    if (!porDoc.has(c.doc)) porDoc.set(c.doc, {});
    porDoc.get(c.doc)[c.id] = c.json == null ? deleteField() : c.json;
  }
  const lotes = []; let b = writeBatch(fs), n = 0, peso = 0;
  for (const [d, r] of porDoc) {
    const p = Object.values(r).reduce((s, v) => s + (typeof v === 'string' ? v.length : 20), 0);
    if (n >= 400 || (n && peso + p > 4e6)) { lotes.push(b); b = writeBatch(fs); n = 0; peso = 0; }
    b.set(doc(fs, 'opticas', oid, 'datos', d), { r }, { merge: true }); n++; peso += p;
  }
  if (n) lotes.push(b);
  return Promise.all(lotes.map(x => x.commit()));
}

window.Nube = { alCambiarSesion, refrescar, ingresar, recuperar, cambiarClave, crearAcceso, quitarAcceso, consultarDoc, CONSULTAS: !!CONSULTAS_URL, salir, registrar, crearOptica, escucharDatos, escribir, mensaje, DIAS_PRUEBA };
window.dispatchEvent(new Event('nube-lista'));
