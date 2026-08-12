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
const DB_VERSION = 1;
const STORE = 'images';
const BUCKET = 'card-images';
const MAX_DIM = 1600;
const QUALITY = 0.82;

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
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
  uploadInBackground(id, blob);
  return id;
}

/** Verwijdert een afbeelding lokaal en (best effort) op de server. */
export async function deleteImage(id) {
  if (!id) return;
  await idbDelete(id).catch(() => {});
  const cached = urlCache.get(id);
  if (cached) { URL.revokeObjectURL(cached); urlCache.delete(id); }
  deleteRemoteInBackground(id);
}

const urlCache = new Map();

/** Geeft een tijdelijke URL om de afbeelding te tonen; haalt hem zo nodig op van de server. */
export async function imageUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  let blob = await idbGet(id).catch(() => null);
  if (!blob) blob = await downloadRemote(id);
  if (!blob) return null;
  idbPut(id, blob).catch(() => {});
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

function objectPath(id) {
  return `${getSession()?.user_id}/${id}.jpg`;
}

async function storageFetch(id, { method = 'GET', body, headers = {} } = {}) {
  const config = getConfig();
  const session = await ensureToken();
  return fetch(`${config.url}/storage/v1/object/${BUCKET}/${objectPath(id)}`, {
    method,
    headers: { apikey: config.anonKey, Authorization: `Bearer ${session.access_token}`, ...headers },
    body,
  });
}

async function uploadInBackground(id, blob) {
  if (!isSignedIn()) return;
  try {
    const res = await storageFetch(id, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' } });
    if (!res.ok) console.warn('Afbeelding uploaden mislukt', res.status);
  } catch (err) {
    console.warn('Afbeelding uploaden mislukt, probeer later opnieuw', err);
  }
}

async function downloadRemote(id) {
  if (!isSignedIn()) return null;
  try {
    const res = await storageFetch(id);
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
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
