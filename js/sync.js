/**
 * Synchroniseren via Supabase — zonder SDK, gewoon fetch naar de Auth- en
 * REST-endpoints. Dat houdt de app dependency-loos en offline bruikbaar.
 *
 * Model: één rij per gebruiker in de tabel `sync_state`, met de hele stand als
 * jsonb en een `revision`. Bij het opslaan wordt die revision meegegeven als
 * voorwaarde; heeft een ander apparaat er ondertussen iets in gezet, dan levert
 * de update nul rijen op, halen we opnieuw op en voegen we opnieuw samen.
 * De inhoud gaat nooit "gewoon over elkaar heen" — zie merge.js.
 *
 * Zie supabase/schema.sql voor de tabel en de RLS-regels.
 */

import { store } from './store.js';
import { looksSecret, SECRET_KEY_WARNING } from './keycheck.js';

const CONFIG_KEY = 'kaartjes.supabase.v1';
const SESSION_KEY = 'kaartjes.session.v1';
const META_KEY = 'kaartjes.sync.v1';

const TABLE = 'sync_state';
const MAX_ATTEMPTS = 3;

export class SyncError extends Error {}

// ---------- instellingen & sessie ----------

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

export function getConfig() {
  const stored = readJson(CONFIG_KEY);
  if (stored?.url && stored?.anonKey) return stored;
  const global = globalThis.KAARTJES_SUPABASE;
  return global?.url && global?.anonKey ? global : null;
}

export function setConfig({ url, anonKey }) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  const key = String(anonKey || '').trim();
  if (!/^https:\/\/.+/.test(clean)) throw new SyncError('De project-URL moet met https:// beginnen.');
  if (key.length < 20) throw new SyncError('Die sleutel ziet er niet compleet uit.');
  if (looksSecret(key)) throw new SyncError(SECRET_KEY_WARNING);
  writeJson(CONFIG_KEY, { url: clean, anonKey: key });
  return getConfig();
}

export function clearConfig() {
  writeJson(CONFIG_KEY, null);
  clearSession();
}

export function getSession() {
  return readJson(SESSION_KEY);
}

function setSession(session) {
  writeJson(SESSION_KEY, session);
}

function clearSession() {
  writeJson(SESSION_KEY, null);
}

export function isConfigured() {
  return Boolean(getConfig());
}

/** 'baked' = uit config.js, 'local' = in deze browser ingevuld. */
export function configSource() {
  const stored = readJson(CONFIG_KEY);
  if (stored?.url && stored?.anonKey) return 'local';
  return getConfig() ? 'baked' : null;
}

export function isSignedIn() {
  return Boolean(getSession()?.refresh_token);
}

export function meta() {
  return readJson(META_KEY) || { lastSync: null, revision: null };
}

function setMeta(patch) {
  writeJson(META_KEY, { ...meta(), ...patch });
}

// ---------- HTTP ----------

async function request(path, { method = 'GET', body, headers = {}, auth = true, query = '' } = {}) {
  const config = getConfig();
  if (!config) throw new SyncError('Synchroniseren is nog niet ingesteld.');

  const session = getSession();
  const response = await fetch(`${config.url}${path}${query}`, {
    method,
    headers: {
      apikey: config.anonKey,
      'Content-Type': 'application/json',
      ...(auth && session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  return { ok: response.ok, status: response.status, data };
}

function authMessage(status, data) {
  const raw = String(data?.error_description || data?.msg || data?.message || '').toLowerCase();
  if (raw.includes('invalid login')) return 'E-mailadres of wachtwoord klopt niet.';
  if (raw.includes('email not confirmed')) return 'Bevestig eerst je e-mailadres via de link die Supabase je stuurde.';
  if (raw.includes('already registered') || raw.includes('already exists')) return 'Er bestaat al een account met dit e-mailadres — log gewoon in.';
  if (raw.includes('password')) return 'Het wachtwoord moet minstens 6 tekens hebben.';
  if (status === 0) return 'Geen verbinding.';
  return data?.error_description || data?.msg || data?.message || `Aanmelden mislukte (${status}).`;
}

function storeSession(data) {
  setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    email: data.user?.email || null,
    user_id: data.user?.id || null,
  });
}

// ---------- aanmelden ----------

export async function signIn(email, password) {
  const { ok, status, data } = await request('/auth/v1/token', {
    method: 'POST',
    query: '?grant_type=password',
    auth: false,
    body: { email: String(email).trim(), password },
  });
  if (!ok) throw new SyncError(authMessage(status, data));
  storeSession(data);
  return getSession();
}

export async function signUp(email, password) {
  const { ok, status, data } = await request('/auth/v1/signup', {
    method: 'POST',
    auth: false,
    body: { email: String(email).trim(), password },
  });
  if (!ok) throw new SyncError(authMessage(status, data));
  if (data?.access_token) {
    storeSession(data);
    return { session: getSession(), confirmationNeeded: false };
  }
  // Staat "Confirm email" aan, dan komt er nog geen sessie terug.
  return { session: null, confirmationNeeded: true };
}

export async function signOut() {
  try {
    await request('/auth/v1/logout', { method: 'POST' });
  } catch {
    // netwerkfout mag het uitloggen niet blokkeren
  }
  clearSession();
  setMeta({ revision: null });
}

async function refreshSession() {
  const session = getSession();
  if (!session?.refresh_token) throw new SyncError('Je bent uitgelogd.');
  const { ok, data } = await request('/auth/v1/token', {
    method: 'POST',
    query: '?grant_type=refresh_token',
    auth: false,
    body: { refresh_token: session.refresh_token },
  });
  if (!ok) {
    clearSession();
    throw new SyncError('Je sessie is verlopen — log opnieuw in.');
  }
  storeSession(data);
  return getSession();
}

async function ensureToken() {
  const session = getSession();
  if (!session) throw new SyncError('Je bent niet ingelogd.');
  if (!session.access_token || session.expires_at - Date.now() < 60_000) await refreshSession();
  return getSession();
}

/** Voert een REST-aanroep uit en probeert het na een 401 nog één keer met een verse token. */
async function rest(path, options) {
  let result = await request(path, options);
  if (result.status === 401) {
    await refreshSession();
    result = await request(path, options);
  }
  return result;
}

// ---------- synchroniseren ----------

async function pull(userId) {
  const { ok, status, data } = await rest(`/rest/v1/${TABLE}`, {
    query: `?user_id=eq.${userId}&select=doc,revision`,
  });
  if (!ok) throw new SyncError(restMessage(status, data));
  return Array.isArray(data) && data.length ? data[0] : null;
}

async function insert(userId, doc) {
  const { ok, status, data } = await rest(`/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: { user_id: userId, doc, revision: 1 },
  });
  if (ok) return Array.isArray(data) && data.length ? data[0].revision : 1;
  if (status === 409) return null; // een ander apparaat was net eerder
  throw new SyncError(restMessage(status, data));
}

async function update(userId, doc, revision) {
  const { ok, status, data } = await rest(`/rest/v1/${TABLE}`, {
    method: 'PATCH',
    query: `?user_id=eq.${userId}&revision=eq.${revision}`,
    headers: { Prefer: 'return=representation' },
    body: { doc, revision: revision + 1, updated_at: new Date().toISOString() },
  });
  if (!ok) throw new SyncError(restMessage(status, data));
  return Array.isArray(data) && data.length ? data[0].revision : null; // leeg = revision veranderd
}

function restMessage(status, data) {
  const raw = String(data?.message || '').toLowerCase();
  if (status === 404 || raw.includes('does not exist') || raw.includes('schema cache')) {
    return 'De tabel sync_state bestaat nog niet. Draai supabase/schema.sql in de SQL-editor van je project.';
  }
  if (status === 401 || status === 403) return 'Geen toegang — log opnieuw in.';
  return data?.message || `Synchroniseren mislukte (${status}).`;
}

let inFlight = null;

/**
 * Haalt op, voegt samen en zet terug. Meerdere aanroepen tegelijk delen dezelfde
 * ronde, zodat automatisch en handmatig synchroniseren elkaar niet in de weg zitten.
 */
export function syncNow() {
  if (inFlight) return inFlight;
  inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}

async function runSync() {
  if (!isConfigured()) throw new SyncError('Synchroniseren is nog niet ingesteld.');
  if (!isSignedIn()) throw new SyncError('Je bent niet ingelogd.');
  if (navigator.onLine === false) throw new SyncError('Geen verbinding.');

  const session = await ensureToken();
  const userId = session.user_id;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remote = await pull(userId);
    const summary = store.applyRemote(remote?.doc || null);
    const doc = store.syncDoc();

    const revision = remote ? await update(userId, doc, remote.revision) : await insert(userId, doc);
    if (revision !== null) {
      setMeta({ lastSync: Date.now(), revision });
      return summary;
    }
    // Iemand anders was sneller: opnieuw ophalen en samenvoegen.
  }
  throw new SyncError('Een ander apparaat was steeds net eerder. Probeer het zo nog eens.');
}

let debounceTimer = null;

/**
 * Plant een sync in nadat het even stil is. Zo staat je werk ook op de server
 * als je halverwege een set stopt, zonder na elk antwoord te versturen.
 */
export function scheduleSync(delay = 12_000) {
  if (!isConfigured() || !isSignedIn()) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => syncQuietly(), delay);
}

/** Nu meteen, bijvoorbeeld als de app naar de achtergrond gaat. */
export function flushSync() {
  clearTimeout(debounceTimer);
  return syncQuietly();
}

/** Synchroniseert op de achtergrond; fouten worden alleen gelogd. */
export async function syncQuietly() {
  if (!isConfigured() || !isSignedIn() || navigator.onLine === false) return null;
  try {
    return await syncNow();
  } catch (err) {
    console.warn('Synchroniseren overgeslagen:', err.message);
    return null;
  }
}
