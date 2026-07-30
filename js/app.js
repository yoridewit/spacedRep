/** Router + app-schil. Geen build-stap: gewoon ES-modules. */

import { store } from './store.js';
import { el, clear, toast } from './ui.js';
import { icon } from './icons.js';
import { totalXp, levelInfo, streak } from './gamify.js';
import { syncQuietly, scheduleSync, flushSync, isSignedIn, isConfigured, authSkipped, adoptTokens } from './sync.js';
import * as home from './views/home.js';
import * as study from './views/study.js';
import * as add from './views/add.js';
import * as deck from './views/deck.js';
import * as stats from './views/stats.js';
import * as settings from './views/settings.js';
import * as auth from './views/auth.js';

const viewRoot = document.getElementById('view');
const topbar = document.getElementById('topbar');

const ROUTES = { home, study, add, deck, stats, settings, auth };

const TABS = [
  { href: '#/', label: 'Decks', match: (r) => r.name === 'home' || r.name === 'deck' },
  { href: '#/add', label: 'Toevoegen', match: (r) => r.name === 'add' },
  { href: '#/stats', label: 'Statistieken', match: (r) => r.name === 'stats' },
];

let cleanup = null;
let current = null;

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (!parts.length) return { name: 'home', params };
  const [name, ...rest] = parts;
  if (name === 'share') return { name: 'add', params: { ...params, share: rest.join('/') } };
  if (name === 'sync') return { name: 'settings', params: { ...params, sync: rest.join('/') } };
  if (name === 'inloggen') return { name: 'auth', params: { ...params, mode: rest[0] || 'in' } };
  if (!ROUTES[name]) return { name: 'home', params };
  return { name, params: { ...params, id: rest[0] ? decodeURIComponent(rest[0]) : undefined } };
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) location.replace(hash);
  else location.hash = hash;
}

/** Vervangt de hele kop; views die een eigen kop willen leveren die zelf aan. */
export function setChrome(...nodes) {
  clear(topbar);
  for (const node of nodes.flat()) if (node) topbar.append(node);
}

export function backButton(href = '#/') {
  return el('button', {
    class: 'round-btn',
    'aria-label': 'Terug',
    onclick: () => (history.length > 1 ? history.back() : navigate(href)),
  }, [icon('back', 18)]);
}

function streakChip() {
  const days = streak(store.stats, Date.now(), store.settings.dayCutoffHour);
  return el('div', { class: 'chip flame', title: 'Dagen op rij geoefend' }, [icon('flame'), `${days} ${days === 1 ? 'dag' : 'dagen'}`]);
}

function levelChip() {
  const { level } = levelInfo(totalXp(store.stats));
  return el('a', { class: 'chip olive', href: '#/stats', style: 'text-decoration:none', title: 'Bekijk je voortgang' }, [`Niveau ${level}`]);
}

function appHeader(route) {
  return [
    el('div', { class: 'brand', text: 'Kaartjes' }),
    el('nav', { class: 'pillnav' },
      TABS.map((tab) => el('a', { href: tab.href, 'aria-current': tab.match(route) ? 'page' : null, text: tab.label }))),
    streakChip(),
    levelChip(),
    el('a', { class: 'round-btn', href: '#/settings', 'aria-label': 'Instellingen' }, [icon('gear', 17)]),
  ];
}

/** Zolang je niet ingelogd bent én niet bewust zonder account werkt: eerst inloggen. */
function needsAuth(route) {
  if (route.name === 'auth') return false;
  return isConfigured() && !isSignedIn() && !authSkipped();
}

function render() {
  const route = needsAuth(parseRoute()) ? { name: 'auth', params: { mode: 'in' } } : parseRoute();
  current = route;
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  clear(viewRoot);
  viewRoot.className = 'view';
  window.scrollTo(0, 0);
  topbar.hidden = route.name === 'auth';
  if (!topbar.hidden) setChrome(appHeader(route));
  try {
    cleanup = ROUTES[route.name].mount(viewRoot, route.params) || null;
  } catch (err) {
    console.error(err);
    viewRoot.append(el('div', { class: 'notice error', text: `Er ging iets mis: ${err.message}` }));
  }
}

/** Opnieuw tekenen na een wijziging (tellers, streak, niveau lopen mee). */
export function refresh() {
  if (current) render();
}

function applyTheme() {
  const theme = store.settings.theme;
  const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('theme-dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17130f' : '#f5ead8');
}

/**
 * Supabase stuurt na een herstelmail terug met de tokens in de hash. Die halen
 * we eruit voordat de router hem als route probeert te lezen.
 */
async function consumeAuthHash() {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!raw.includes('access_token=')) return false;
  const params = new URLSearchParams(raw);
  const accessToken = params.get('access_token');
  if (!accessToken) return false;
  const recovery = params.get('type') === 'recovery';
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  try {
    await adoptTokens({
      accessToken,
      refreshToken: params.get('refresh_token'),
      expiresIn: params.get('expires_in'),
    });
    location.hash = recovery ? '#/inloggen/herstel' : '#/';
  } catch (err) {
    location.hash = '#/inloggen';
    setTimeout(() => toast(err.message, 5000), 300);
  }
  return true;
}

store.load();
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (store.settings.theme === 'auto') applyTheme();
});
store.addEventListener('change', (e) => {
  if (['settings', 'restore', 'wipe'].includes(e.detail?.type)) applyTheme();
});
store.addEventListener('storage-error', (e) => toast(e.detail, 5000));
store.addEventListener('change', (e) => {
  if (e.detail?.type === 'sync') {
    // Na een merge van een ander apparaat de tellers verversen — maar niet
    // midden in een leersessie, dan zou de kaart onder je handen verdwijnen.
    if (current?.name !== 'study') refresh();
    return;
  }
  scheduleSync();
});

window.addEventListener('hashchange', async () => {
  // Staat de app al open als je op de link uit een herstelmail klikt, dan komt
  // die alleen als hashwijziging binnen — dus ook hier eerst de tokens eruit.
  if (await consumeAuthHash()) return;
  render();
});
window.addEventListener('pagehide', () => {
  store.save({ immediate: true });
  flushSync();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    store.save({ immediate: true });
    flushSync();
  } else if (isSignedIn()) {
    syncQuietly(); // terug in de app: eerst kijken of het andere apparaat iets heeft
  }
});

const handledAuthHash = await consumeAuthHash();
if (!handledAuthHash) render();

if (isSignedIn()) syncQuietly();
window.addEventListener('online', () => syncQuietly());

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker niet geregistreerd', err));
  });
}
