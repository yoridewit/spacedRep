/**
 * Afbeeldingen bij kaarten.
 *
 * Bewaard in IndexedDB (localStorage is veel te klein voor foto's — zie de
 * discussie over opslaggrenzen). Ingelogd? Dan gaat elke foto ook naar
 * Supabase Storage, in een map per gebruiker, zodat hij op je andere
 * apparaten verschijnt. Zonder account blijft een foto op het toestel waar
 * je hem toevoegde, net als de rest van je gegevens dan.
 *
 * Alleen het losse afbeelding-id staat in de kaart zelf (en dus in de sync);
 * de foto's zelf gaan nooit in de jsonb-rij van sync_state.
 *
 * Zie supabase/storage.sql voor de bucket en de RLS-regels.
 */

import { getConfig, getSession, isSignedIn, ensureToken } from './sync.js';

const DB_NAME = 'kaartjes-images';
const DB_VERSION = 2;
const STORE = 'images';
const PENDING_STORE = 'pending-uploads';
const BUCKET = 'card-images';
const MAX_DIM = 1600;
const QUALITY = 0.82;

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function idbGet(id) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }));
}

function idbPut(id, blob) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function idbDelete(id) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// Bijhouden welke foto's nog naar de server moeten — de upload zelf loopt op
// de achtergrond, en als je vlak daarna wegnavigeert of het scherm
// vergrendelt kan die halverwege afbreken. Dit zorgt dat zo'n onderbroken
// upload de volgende keer dat je de app opent gewoon opnieuw geprobeerd wordt.
function markPending(id) {
  return openDb().then((db) => new Promise((resolve) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    tx.objectStore(PENDING_STORE).put(true, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  }));
}

function clearPending(id) {
  return openDb().then((db) => new Promise((resolve) => {
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    tx.objectStore(PENDING_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  }));
}

function listPending() {
  return openDb().then((db) => new Promise((resolve) => {
    const req = db.transaction(PENDING_STORE, 'readonly').objectStore(PENDING_STORE).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  }));
}

function uid() {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `img_${rnd.replace(/-/g, '').slice(0, 16)}`;
}

/** Schaalt en comprimeert, ongeacht hoe groot de foto van je camera binnenkomt. */
async function compress(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('kon de afbeelding niet verwerken'))), 'image/jpeg', QUALITY);
  });
}

/** Slaat een gekozen of gefotografeerde afbeelding op en levert het id terug. */
export async function saveImage(file) {
  const blob = await compress(file);
  const id = uid();
  await idbPut(id, blob);
  await markPending(id);
  uploadInBackground(id, blob);
  return id;
}

/**
 * Probeert alle nog niet bevestigde uploads opnieuw. Aanroepen op momenten
 * dat de app toch al "terug is": bij het opstarten en zodra je 'm weer
 * zichtbaar maakt of weer online komt.
 */
export async function retryPendingUploads() {
  if (!isSignedIn()) return;
  for (const id of await listPending()) {
    const blob = await idbGet(id).catch(() => null);
    if (!blob) { clearPending(id); continue; } // lokaal ook weg, niets meer te uploaden
    await uploadInBackground(id, blob);
  }
}

/** Verwijdert een afbeelding lokaal en (best effort) op de server. */
export async function deleteImage(id) {
  if (!id) return;
  await idbDelete(id).catch(() => {});
  await clearPending(id);
  const cached = urlCache.get(id);
  if (cached) { URL.revokeObjectURL(cached); urlCache.delete(id); }
  deleteRemoteInBackground(id);
}

const urlCache = new Map();

/**
 * Geeft een tijdelijke URL om de afbeelding te tonen; haalt hem zo nodig op
 * van de server. Bij falen komt er ook een korte reden mee (voor de
 * placeholder in beeld — "waarom" is hier belangrijker dan overal elders,
 * want een foto die stil wegvalt is niet te diagnosticeren op je telefoon).
 */
export async function imageUrl(id) {
  if (!id) return { url: null, error: null };
  if (urlCache.has(id)) return { url: urlCache.get(id), error: null };
  const local = await idbGet(id).catch(() => null);
  const { blob, error } = local ? { blob: local, error: null } : await downloadRemote(id);
  if (!blob) return { url: null, error };
  idbPut(id, blob).catch(() => {});
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return { url, error: null };
}

function objectPath(id) {
  return `${getSession()?.user_id}/${id}.jpg`;
}

async function storageFetch(id, { method = 'GET', body, headers = {} } = {}) {
  const config = getConfig();
  if (!config) throw new Error('synchroniseren is niet ingesteld');
  const session = await ensureToken();
  return fetch(`${config.url}/storage/v1/object/${BUCKET}/${objectPath(id)}`, {
    method,
    headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}`, ...headers },
    body,
  });
}

/** Pakt de menselijke boodschap uit Supabase' foutrespons; die is specifieker dan de HTTP-status alleen. */
function describeError(status, bodyText) {
  try {
    const data = JSON.parse(bodyText);
    const msg = data.message || data.error_description || data.error || null;
    if (msg) return `${status}: ${msg}`;
  } catch {
    // geen JSON — dan de ruwe tekst maar
  }
  return bodyText ? `${status}: ${bodyText.slice(0, 140)}` : `serverfout ${status}`;
}

/**
 * Mislukt de upload, dan zie je die foto nooit terug op een ander apparaat —
 * en zonder melding zou je dat pas merken als je daar toevallig gaat kijken.
 * Daarom hier wél een toast, in tegenstelling tot de stille achtergrond-sync
 * van de rest van je gegevens.
 */
async function uploadInBackground(id, blob) {
  if (!isSignedIn()) return;
  try {
    const res = await storageFetch(id, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' } });
    if (res.ok) {
      clearPending(id);
    } else {
      const body = await res.text().catch(() => '');
      console.warn('Afbeelding uploaden mislukt, probeer opnieuw bij volgende gelegenheid', res.status, body);
    }
  } catch (err) {
    console.warn('Afbeelding uploaden mislukt (netwerk), probeer opnieuw bij volgende gelegenheid', err);
  }
}

async function downloadRemote(id) {
  if (!isSignedIn()) return { blob: null, error: 'niet ingelogd op dit toestel' };
  try {
    const res = await storageFetch(id);
    if (res.ok) return { blob: await res.blob(), error: null };
    const body = await res.text().catch(() => '');
    console.warn('Afbeelding ophalen mislukt', res.status, body);
    return { blob: null, error: describeError(res.status, body) };
  } catch (err) {
    return { blob: null, error: `netwerkfout: ${err.message}` };
  }
}

async function deleteRemoteInBackground(id) {
  if (!isSignedIn()) return;
  try {
    await storageFetch(id, { method: 'DELETE' });
  } catch {
    // best effort — een verweesde foto in Storage is onschuldig
  }
}
