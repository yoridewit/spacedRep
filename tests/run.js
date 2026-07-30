/**
 * Kleine testrunner zonder dependencies: `node tests/run.js`.
 * Dekt de logica die je niet met het blote oog controleert: de planner,
 * de import-parser en de opmaak-escaping.
 */

import { newSrsState, schedule, RATING, DEFAULT_CONFIG, DAY, MINUTE, dayKey, formatDelay } from '../js/srs.js';
import { parseImport, cardKey, clozeNumbers, ParseError } from '../js/parse.js';
import { renderMarkup, renderCloze, cardSummary } from '../js/markup.js';
import { levelInfo, streak, mastery, badges, xpForAnswer } from '../js/gamify.js';
import { mergeStates, contentKey } from '../js/merge.js';
import { dayTotal, mergeDay, normalizeDay } from '../js/daystats.js';
import { looksSecret } from '../js/keycheck.js';

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'verwachtte iets waars');
}

function eq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || 'ongelijk'}: ${a} !== ${b}`);
}

const NOW = Date.UTC(2026, 6, 28, 12, 0, 0);
const CFG = { ...DEFAULT_CONFIG, fuzz: false };

// ── planner ──────────────────────────────────────────────────────────────

test('nieuwe kaart start in de wachtrij', () => {
  const s = newSrsState(NOW, CFG);
  eq(s.state, 'new');
  eq(s.interval, 0);
  eq(s.due, NOW);
});

test('"Goed" doorloopt de leerstappen en gaat dan naar herhalen', () => {
  let s = newSrsState(NOW, CFG);
  s = schedule(s, RATING.GOOD, NOW, CFG);
  eq(s.state, 'learning');
  eq(s.due - NOW, 10 * MINUTE, 'tweede leerstap is 10 minuten');
  s = schedule(s, RATING.GOOD, NOW, CFG);
  eq(s.state, 'review');
  eq(s.interval, 1);
  eq(s.due - NOW, DAY);
});

test('"Makkelijk" slaat de leerstappen over', () => {
  const s = schedule(newSrsState(NOW, CFG), RATING.EASY, NOW, CFG);
  eq(s.state, 'review');
  eq(s.interval, CFG.easyInterval);
});

test('"Opnieuw" op een nieuwe kaart zet terug naar de eerste stap', () => {
  let s = schedule(newSrsState(NOW, CFG), RATING.GOOD, NOW, CFG);
  s = schedule(s, RATING.AGAIN, NOW, CFG);
  eq(s.state, 'learning');
  eq(s.step, 0);
  eq(s.due - NOW, 1 * MINUTE);
});

test('intervallen groeien met de ease-factor', () => {
  let s = { ...newSrsState(NOW, CFG), state: 'review', interval: 10, ease: 2.5 };
  s = schedule(s, RATING.GOOD, NOW, CFG);
  eq(s.interval, 25, '10 dagen * 2.5');
  assert(s.due - NOW === 25 * DAY, 'due volgt het interval');
});

test('"Lastig" groeit langzamer en verlaagt de ease', () => {
  const before = { ...newSrsState(NOW, CFG), state: 'review', interval: 10, ease: 2.5 };
  const s = schedule(before, RATING.HARD, NOW, CFG);
  eq(s.interval, 12);
  assert(s.ease < before.ease, 'ease daalt');
});

test('"Opnieuw" op een geleerde kaart geeft een lapse en herleerstap', () => {
  const before = { ...newSrsState(NOW, CFG), state: 'review', interval: 20, ease: 2.5 };
  const s = schedule(before, RATING.AGAIN, NOW, CFG);
  eq(s.state, 'relearning');
  eq(s.lapses, 1);
  eq(s.interval, 10, 'interval gehalveerd');
  eq(s.due - NOW, 10 * MINUTE);
  assert(s.ease === 2.3, `ease 2.3 verwacht, kreeg ${s.ease}`);
});

test('herleren keert terug naar herhalen met het verkorte interval', () => {
  let s = { ...newSrsState(NOW, CFG), state: 'review', interval: 20, ease: 2.5 };
  s = schedule(s, RATING.AGAIN, NOW, CFG);
  s = schedule(s, RATING.GOOD, NOW, CFG);
  eq(s.state, 'review');
  eq(s.interval, 10);
});

test('ease zakt nooit onder 1.3', () => {
  let s = { ...newSrsState(NOW, CFG), state: 'review', interval: 5, ease: 1.35 };
  for (let i = 0; i < 5; i++) s = schedule(s, RATING.AGAIN, NOW, CFG);
  assert(s.ease >= 1.3, `ease ${s.ease} onder de bodem`);
});

test('interval blijft onder het maximum', () => {
  let s = { ...newSrsState(NOW, CFG), state: 'review', interval: 3000, ease: 2.5 };
  s = schedule(s, RATING.EASY, NOW, CFG);
  assert(s.interval <= CFG.maximumInterval, `${s.interval} > max`);
});

test('de leerdag rolt om op het ingestelde uur', () => {
  const laat = new Date(2026, 6, 28, 2, 0, 0).getTime();
  const vroeg = new Date(2026, 6, 28, 5, 0, 0).getTime();
  eq(dayKey(laat, 4), '2026-07-27', 'twee uur \'s nachts telt bij gisteren');
  eq(dayKey(vroeg, 4), '2026-07-28');
});

test('formatDelay leest als een mens', () => {
  eq(formatDelay(30 * 1000), '<1 min');
  eq(formatDelay(10 * MINUTE), '10 min');
  eq(formatDelay(3 * DAY), '3 d');
  eq(formatDelay(400 * DAY), '1.1 jr');
});

// ── import ───────────────────────────────────────────────────────────────

test('leest het standaardformaat', () => {
  const { decks } = parseImport('{"deck":"Biologie","cards":[{"front":"A","back":"B"}]}');
  eq(decks.length, 1);
  eq(decks[0].name, 'Biologie');
  eq(decks[0].cards[0], { type: 'basic', front: 'A', back: 'B', hint: '', note: '', tags: [], text: '' });
});

test('strippt code-fences van de AI', () => {
  const { decks } = parseImport('Hier is je deck:\n```json\n{"deck":"X","cards":[{"front":"A","back":"B"}]}\n```\nSucces!');
  eq(decks[0].cards.length, 1);
});

test('accepteert afwijkende sleutels', () => {
  const { decks } = parseImport('{"naam":"Test","kaarten":[{"vraag":"V","antwoord":"A"},{"q":"Q","a":"A2"}]}');
  eq(decks[0].name, 'Test');
  eq(decks[0].cards.length, 2);
});

test('accepteert een kale array', () => {
  const { decks } = parseImport('[{"front":"A","back":"B"},{"front":"C","back":"D"}]', 'Losse kaarten');
  eq(decks[0].name, 'Losse kaarten');
  eq(decks[0].cards.length, 2);
});

test('overleeft een trailing komma', () => {
  const { decks } = parseImport('{"deck":"X","cards":[{"front":"A","back":"B"},]}');
  eq(decks[0].cards.length, 1);
});

test('splitst cloze-kaarten per gat', () => {
  const { decks } = parseImport('{"cards":[{"type":"cloze","text":"De {{c1::kat}} zit op de {{c2::mat}}"}]}');
  eq(decks[0].cards.length, 2);
  eq(decks[0].cards[0].clozeIndex, 1);
  eq(decks[0].cards[1].clozeIndex, 2);
});

test('herkent cloze zonder expliciet type', () => {
  eq(clozeNumbers('a {{c1::x}} b {{c3::y}}'), [1, 3]);
  const { decks } = parseImport('{"cards":[{"text":"Water kookt bij {{c1::100}} graden"}]}');
  eq(decks[0].cards[0].type, 'cloze');
});

test('valt terug op platte tekst', () => {
  const { decks } = parseImport('# Aardrijkskunde\nHoofdstad van Frankrijk :: Parijs\nHoofdstad van Spanje :: Madrid');
  eq(decks[0].name, 'Aardrijkskunde');
  eq(decks[0].cards.length, 2);
  eq(decks[0].cards[1].back, 'Madrid');
});

test('leest Q:/A:-blokken', () => {
  const { decks } = parseImport('V: Wat is DNA?\nA: Het erfelijk materiaal\n\nV: En RNA?\nA: Boodschapper');
  eq(decks[0].cards.length, 2);
});

test('meldt onbruikbare invoer', () => {
  let raised = false;
  try {
    parseImport('zomaar wat losse tekst zonder scheiding');
  } catch (err) {
    raised = err instanceof ParseError;
  }
  assert(raised, 'verwachtte een ParseError');
});

test('waarschuwt over halve kaarten in plaats van ze stil te laten vallen', () => {
  const { decks, warnings } = parseImport('{"cards":[{"front":"A","back":"B"},{"front":"C"}]}');
  eq(decks[0].cards.length, 1);
  assert(warnings.length === 1, 'één waarschuwing verwacht');
});

test('dubbele kaarten krijgen dezelfde sleutel', () => {
  eq(cardKey({ type: 'basic', front: '  Hoofdstad   van Frankrijk ' }), cardKey({ type: 'basic', front: 'hoofdstad van frankrijk' }));
  assert(cardKey({ type: 'cloze', text: 'x {{c1::y}}', clozeIndex: 1 }) !== cardKey({ type: 'cloze', text: 'x {{c1::y}}', clozeIndex: 2 }));
});

// ── opmaak ───────────────────────────────────────────────────────────────

test('HTML in kaartinhoud wordt geëscaped', () => {
  const html = renderMarkup('<img src=x onerror="alert(1)">');
  assert(!html.includes('<img'), 'tag mag niet doorkomen');
  assert(html.includes('&lt;img'), 'moet zichtbaar zijn als tekst');
});

test('markdown-lite doet vet, code en lijstjes', () => {
  assert(renderMarkup('**dik**').includes('<strong>dik</strong>'));
  assert(renderMarkup('`code`').includes('<code>code</code>'));
  assert(renderMarkup('- een\n- twee').includes('<ul>'));
});

test('cloze verbergt alleen het doelgat', () => {
  const front = renderCloze('De {{c1::kat}} zit op de {{c2::mat}}', 1, false);
  assert(front.includes('[ ... ]'), 'gat 1 verborgen');
  assert(front.includes('mat'), 'gat 2 gewoon zichtbaar');
  const back = renderCloze('De {{c1::kat}} zit op de {{c2::mat}}', 1, true);
  assert(back.includes('<span class="cloze">kat</span>'), 'antwoord gemarkeerd');
});

test('cloze met hint toont de hint', () => {
  assert(renderCloze('Hoofdstad: {{c1::Parijs::stad}}', 1, false).includes('[stad]'));
});

test('kaartsamenvatting blijft platte tekst', () => {
  eq(cardSummary({ type: 'cloze', text: 'De {{c1::kat}} zit', clozeIndex: 1 }), 'De [kat] zit');
  eq(cardSummary({ type: 'basic', front: '**Vet**  gedrukt' }), 'Vet gedrukt');
});

// ── voortgang ────────────────────────────────────────────────────────────

test('niveau volgt de XP', () => {
  eq(levelInfo(0).level, 1);
  eq(levelInfo(120).level, 2);
  eq(levelInfo(125).into, 5);
});

test('XP beloont goede antwoorden en nieuwe kaarten', () => {
  assert(xpForAnswer(RATING.GOOD, false) > xpForAnswer(RATING.AGAIN, false));
  assert(xpForAnswer(RATING.GOOD, true) > xpForAnswer(RATING.GOOD, false));
});

test('streak telt aaneengesloten dagen en breekt bij een gat', () => {
  const stats = {};
  for (let i = 0; i < 4; i++) stats[dayKey(NOW - i * DAY, 4)] = { reviews: 3 };
  eq(streak(stats, NOW, 4), 4);
  delete stats[dayKey(NOW - 2 * DAY, 4)];
  eq(streak(stats, NOW, 4), 2);
});

test('een lege dag van vandaag breekt de streak nog niet', () => {
  const stats = {};
  for (let i = 1; i < 4; i++) stats[dayKey(NOW - i * DAY, 4)] = { reviews: 3 };
  eq(streak(stats, NOW, 4), 3);
});

test('beheersing weegt rijpe kaarten vol en jonge half', () => {
  const cards = [
    { srs: { state: 'review', interval: 30 } },
    { srs: { state: 'review', interval: 5 } },
    { srs: { state: 'new', interval: 0 } },
    { srs: { state: 'new', interval: 0 } },
  ];
  eq(mastery(cards), 38);
  eq(mastery([]), 0);
});

test('badges gaan open op hun drempel', () => {
  const stats = { [dayKey(NOW, 4)]: { reviews: 1, again: 0 } };
  const list = badges({ stats, cards: [] }, NOW, 4);
  const byId = Object.fromEntries(list.map((b) => [b.id, b.unlocked]));
  eq(byId.start, true);
  eq(byId.honderd, false);
});


// ── samenvoegen tussen apparaten ─────────────────────────────────────────

const deckA = { id: 'd_1', name: 'Biologie', description: '', created: NOW - 10 * DAY };
const deckAOther = { id: 'd_9', name: 'biologie ', description: 'kopie', created: NOW - 9 * DAY };

function card(id, deckId, front, { lastReview = null, interval = 0, state = 'new' } = {}) {
  return {
    id, deckId, type: 'basic', front, back: `${front}!`, text: '', clozeIndex: null,
    hint: '', note: '', tags: [], created: NOW - 5 * DAY,
    srs: { state, due: NOW, interval, ease: 2.5, step: 0, reps: 0, lapses: 0, lastReview },
  };
}

const emptyDoc = () => ({ decks: {}, cards: {}, stats: {}, settings: {}, tombstones: { decks: {}, cards: {} } });

test('merge zonder tegenhanger geeft de lokale stand terug', () => {
  const local = { ...emptyDoc(), decks: { d_1: deckA } };
  eq(mergeStates(local, null).state, local);
});

test('kaarten van beide kanten komen samen', () => {
  const local = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_1: card('c_1', 'd_1', 'Wat is DNA?') } };
  const remote = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_2: card('c_2', 'd_1', 'Wat is RNA?') } };
  const { state, summary } = mergeStates(local, remote);
  eq(Object.keys(state.cards).length, 2);
  eq(summary.cardsAdded, 1);
});

test('hetzelfde deck onder een andere id wordt niet gedupliceerd', () => {
  const local = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_1: card('c_1', 'd_1', 'Vraag 1') } };
  const remote = { ...emptyDoc(), decks: { d_9: deckAOther }, cards: { c_2: card('c_2', 'd_9', 'Vraag 2') } };
  const { state } = mergeStates(local, remote);
  eq(Object.keys(state.decks).length, 1, 'één deck');
  eq(Object.keys(state.cards).length, 2, 'beide kaarten, in hetzelfde deck');
  for (const c of Object.values(state.cards)) eq(c.deckId, 'd_1');
});

test('dezelfde kaart: de laatst geoefende planning wint', () => {
  const oud = card('c_1', 'd_1', 'Wat is DNA?', { lastReview: NOW - 3 * DAY, interval: 4, state: 'review' });
  const nieuw = card('c_2', 'd_1', 'wat is  DNA? ', { lastReview: NOW - 1 * DAY, interval: 12, state: 'review' });
  const local = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_1: oud } };
  const remote = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_2: nieuw } };
  const { state } = mergeStates(local, remote);
  eq(Object.keys(state.cards).length, 1, 'geen dubbele kaart');
  eq(Object.values(state.cards)[0].srs.interval, 12);
});

test('de oudere planning overschrijft de nieuwere niet', () => {
  const nieuw = card('c_1', 'd_1', 'Wat is DNA?', { lastReview: NOW - 1 * DAY, interval: 12, state: 'review' });
  const oud = card('c_2', 'd_1', 'Wat is DNA?', { lastReview: NOW - 3 * DAY, interval: 4, state: 'review' });
  const { state } = mergeStates(
    { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_1: nieuw } },
    { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_2: oud } }
  );
  eq(Object.values(state.cards)[0].srs.interval, 12);
});

test('een verwijderde kaart komt niet terug', () => {
  const weg = card('c_2', 'd_1', 'Weggegooid', { lastReview: NOW - 2 * DAY });
  const local = {
    ...emptyDoc(),
    decks: { d_1: deckA },
    tombstones: { decks: {}, cards: { [contentKey(weg, 'Biologie')]: NOW - 1000 } },
  };
  const remote = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_2: weg } };
  eq(Object.keys(mergeStates(local, remote).state.cards).length, 0);
});

test('maar wel als je hem daarna opnieuw hebt geoefend', () => {
  const terug = card('c_2', 'd_1', 'Weggegooid', { lastReview: NOW });
  const local = {
    ...emptyDoc(),
    decks: { d_1: deckA },
    tombstones: { decks: {}, cards: { [contentKey(terug, 'Biologie')]: NOW - 1000 } },
  };
  const remote = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_2: terug } };
  eq(Object.keys(mergeStates(local, remote).state.cards).length, 1);
});

test('een verwijderd deck neemt zijn kaarten mee', () => {
  const local = { ...emptyDoc(), tombstones: { decks: { biologie: NOW }, cards: {} } };
  const remote = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_1: card('c_1', 'd_1', 'Vraag') } };
  const { state } = mergeStates(local, remote);
  eq(Object.keys(state.decks).length, 0);
  eq(Object.keys(state.cards).length, 0);
});

test('dagstatistiek van twee apparaten wordt opgeteld, niet vergeleken', () => {
  const day = dayKey(NOW, 4);
  const local = { ...emptyDoc(), stats: { [day]: { dev_pc: { reviews: 10, xp: 30, again: 1 } } } };
  const remote = { ...emptyDoc(), stats: { [day]: { dev_tel: { reviews: 5, xp: 15, again: 0 } } } };
  const once = mergeStates(local, remote).state;
  eq(dayTotal(once.stats[day]).reviews, 15, '10 op de pc + 5 op de telefoon');
  eq(dayTotal(once.stats[day]).xp, 45);
});

test('opnieuw synchroniseren telt niets dubbel', () => {
  const day = dayKey(NOW, 4);
  const local = { ...emptyDoc(), stats: { [day]: { dev_pc: { reviews: 10, xp: 30 } } } };
  const remote = { ...emptyDoc(), stats: { [day]: { dev_tel: { reviews: 5, xp: 15 } } } };
  const once = mergeStates(local, remote).state;
  const twice = mergeStates(once, remote).state;
  eq(twice.stats[day], once.stats[day], 'tweede keer verandert niets meer');
  eq(dayTotal(twice.stats[day]).reviews, 15);
});

test('hetzelfde apparaat dat verder telt overschrijft zijn eigen stand', () => {
  const verouderd = { dev_pc: { reviews: 4, xp: 12 } };
  const actueel = { dev_pc: { reviews: 9, xp: 27 } };
  eq(dayTotal(mergeDay(verouderd, actueel)).reviews, 9, 'hoogste stand per apparaat');
});

test('oude gegevens zonder apparaat-emmertje blijven meetellen', () => {
  eq(normalizeDay({ reviews: 7, xp: 21 }), { legacy: { new: 0, reviews: 7, again: 0, hard: 0, good: 0, easy: 0, ms: 0, xp: 21 } });
  eq(dayTotal({ reviews: 7, xp: 21 }).reviews, 7, 'platte dag blijft leesbaar');
  eq(dayTotal(normalizeDay({ reviews: 7, xp: 21 })).reviews, 7);
});

test('XP telt op over apparaten heen', () => {
  const day = dayKey(NOW, 4);
  const stats = { [day]: { dev_pc: { reviews: 10, xp: 30 }, dev_tel: { reviews: 5, xp: 15 } } };
  eq(levelInfo(45).xp, 45);
  eq(dayTotal(stats[day]).xp, 45);
  eq(streak(stats, NOW, 4), 1, 'de dag telt één keer voor de streak');
});

test('de nieuwste instellingen winnen, het thema blijft van het apparaat', () => {
  const local = { ...emptyDoc(), settings: { newPerDay: 20, theme: 'dark', settingsUpdatedAt: 100 } };
  const remote = { ...emptyDoc(), settings: { newPerDay: 40, theme: 'light', settingsUpdatedAt: 200 } };
  const { state } = mergeStates(local, remote);
  eq(state.settings.newPerDay, 40);
  eq(state.settings.theme, 'dark');
});

test('samenvoegen is idempotent', () => {
  const local = { ...emptyDoc(), decks: { d_1: deckA }, cards: { c_1: card('c_1', 'd_1', 'Vraag 1') } };
  const remote = { ...emptyDoc(), decks: { d_9: deckAOther }, cards: { c_2: card('c_2', 'd_9', 'Vraag 2') } };
  const once = mergeStates(local, remote).state;
  const twice = mergeStates(once, remote).state;
  eq(Object.keys(twice.cards).length, Object.keys(once.cards).length);
  eq(Object.keys(twice.decks).length, 1);
});


// ── sleutels ─────────────────────────────────────────────────────────────

const jwt = (payload) => {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part(payload)}.handtekening`;
};

test('geheime sleutels worden herkend', () => {
  assert(looksSecret('sb_secret_srM6drdu2Xgpa5uZ'), 'sb_secret-prefix');
  assert(looksSecret(jwt({ role: 'service_role', iss: 'supabase' })), 'service_role-JWT');
});

test('publiceerbare sleutels komen er gewoon door', () => {
  assert(!looksSecret('sb_publishable_abc123def456ghi789'), 'sb_publishable-prefix');
  assert(!looksSecret(jwt({ role: 'anon', iss: 'supabase' })), 'anon-JWT');
  assert(!looksSecret(''), 'leeg');
});

// ── het sync-protocol (met een nagebootste server) ───────────────────────

globalThis.localStorage = {
  _data: new Map(),
  getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
  setItem(key, value) { this._data.set(key, String(value)); },
  removeItem(key) { this._data.delete(key); },
  clear() { this._data.clear(); },
};

const { store } = await import('../js/store.js');
const sync = await import('../js/sync.js');

/** Bootst de Supabase-endpoints na en houdt bij wat er langskomt. */
function fakeServer({ row = null, failFirstPatch = false, expireToken = false } = {}) {
  const calls = [];
  let patches = 0;
  let refreshed = false;

  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: String(url), method, body });
    const reply = (status, data) => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(data),
    });

    if (String(url).includes('grant_type=password')) {
      return reply(200, {
        access_token: 'token-1', refresh_token: 'refresh-1',
        expires_in: expireToken ? -10 : 3600,
        user: { id: 'user-1', email: body.email },
      });
    }
    if (String(url).includes('grant_type=refresh_token')) {
      refreshed = true;
      return reply(200, {
        access_token: 'token-2', refresh_token: 'refresh-1', expires_in: 3600,
        user: { id: 'user-1', email: 'ik@voorbeeld.nl' },
      });
    }
    if (String(url).includes('/rest/v1/sync_state')) {
      if (method === 'GET') return reply(200, row ? [row] : []);
      if (method === 'POST') {
        row = { doc: body.doc, revision: 1 };
        return reply(201, [row]);
      }
      if (method === 'PATCH') {
        patches++;
        if (failFirstPatch && patches === 1) {
          row = { doc: row.doc, revision: row.revision + 1 }; // ander apparaat was sneller
          return reply(200, []);
        }
        row = { doc: body.doc, revision: body.revision };
        return reply(200, [row]);
      }
    }
    return reply(404, { message: 'onbekend endpoint' });
  };

  return { calls, get row() { return row; }, get refreshed() { return refreshed; }, get patches() { return patches; } };
}

async function withFreshStore(fn) {
  localStorage.clear();
  store.wipe();
  sync.setConfig({ url: 'https://project.supabase.co', anonKey: 'x'.repeat(40) });
  await sync.signIn('ik@voorbeeld.nl', 'geheim123');
  return fn();
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

await asyncTest('eerste sync maakt de rij aan met de lokale stand', async () => {
  const server = fakeServer({});
  await withFreshStore(async () => {
    const deck = store.createDeck('Biologie');
    store.addCards(deck.id, [{ type: 'basic', front: 'Wat is DNA?', back: 'Erfelijk materiaal' }]);
    await sync.syncNow();
  });
  const inserts = server.calls.filter((c) => c.method === 'POST' && c.url.includes('/rest/'));
  eq(inserts.length, 1, 'precies één insert');
  eq(Object.keys(server.row.doc.cards).length, 1);
  eq(server.row.revision, 1);
  assert(sync.meta().lastSync > 0, 'tijdstip onthouden');
});

await asyncTest('kaarten van het andere apparaat komen binnen', async () => {
  const remoteCard = card('c_ver', 'd_ver', 'Van de pc');
  const server = fakeServer({
    row: {
      revision: 7,
      doc: {
        decks: { d_ver: { id: 'd_ver', name: 'Biologie', description: '', created: NOW - DAY } },
        cards: { c_ver: remoteCard },
        stats: {}, settings: {}, tombstones: { decks: {}, cards: {} },
      },
    },
  });
  await withFreshStore(async () => {
    const deck = store.createDeck('Biologie');
    store.addCards(deck.id, [{ type: 'basic', front: 'Van de telefoon', back: 'B' }]);
    const summary = await sync.syncNow();
    eq(summary.cardsAdded, 1);
  });
  eq(store.allCards().length, 2, 'beide kaarten staan nu lokaal');
  eq(store.listDecks().length, 1, 'in hetzelfde deck');
  eq(server.row.revision, 8, 'revisie opgehoogd');
  eq(Object.keys(server.row.doc.cards).length, 2, 'en teruggezet naar de server');
});

await asyncTest('bij een revisieconflict wordt opnieuw opgehaald en samengevoegd', async () => {
  const server = fakeServer({
    row: { revision: 3, doc: { decks: {}, cards: {}, stats: {}, settings: {}, tombstones: { decks: {}, cards: {} } } },
    failFirstPatch: true,
  });
  await withFreshStore(async () => {
    const deck = store.createDeck('Biologie');
    store.addCards(deck.id, [{ type: 'basic', front: 'Vraag', back: 'Antwoord' }]);
    await sync.syncNow();
  });
  const pulls = server.calls.filter((c) => c.method === 'GET').length;
  eq(server.patches, 2, 'tweede poging gedaan');
  eq(pulls, 2, 'en daarvoor opnieuw opgehaald');
  eq(Object.keys(server.row.doc.cards).length, 1, 'niets kwijtgeraakt');
});

await asyncTest('een verlopen token wordt automatisch vernieuwd', async () => {
  const server = fakeServer({ expireToken: true });
  await withFreshStore(async () => {
    store.createDeck('Biologie');
    await sync.syncNow();
  });
  assert(server.refreshed, 'refresh-token gebruikt');
});

await asyncTest('een geheime sleutel wordt geweigerd bij het instellen', async () => {
  localStorage.clear();
  let message = '';
  try {
    sync.setConfig({ url: 'https://project.supabase.co', anonKey: 'sb_secret_srM6drdu2Xgpa5uZ_l65QQ' });
  } catch (err) {
    message = err.message;
  }
  assert(message.includes('geheime sleutel'), `verwachtte een waarschuwing, kreeg: ${message}`);
  eq(sync.isConfigured(), false, 'en er wordt niets opgeslagen');
});

await asyncTest('zonder configuratie of sessie gebeurt er niets', async () => {
  localStorage.clear();
  globalThis.fetch = async () => { throw new Error('had niet aangeroepen mogen worden'); };
  eq(await sync.syncQuietly(), null);
  let raised = false;
  try {
    await sync.syncNow();
  } catch (err) {
    raised = err instanceof sync.SyncError;
  }
  assert(raised, 'verwachtte een SyncError');
});

// ── uitkomst ─────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\n${failures.length} van ${passed + failures.length} tests faalden:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} tests geslaagd`);
