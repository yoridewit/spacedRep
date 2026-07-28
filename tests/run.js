/**
 * Kleine testrunner zonder dependencies: `node tests/run.js`.
 * Dekt de logica die je niet met het blote oog controleert: de planner,
 * de import-parser en de opmaak-escaping.
 */

import { newSrsState, schedule, RATING, DEFAULT_CONFIG, DAY, MINUTE, dayKey, formatDelay } from '../js/srs.js';
import { parseImport, cardKey, clozeNumbers, ParseError } from '../js/parse.js';
import { renderMarkup, renderCloze, cardSummary } from '../js/markup.js';
import { levelInfo, streak, mastery, badges, xpForAnswer } from '../js/gamify.js';

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

// ── uitkomst ─────────────────────────────────────────────────────────────

if (failures.length) {
  console.error(`\n${failures.length} van ${passed + failures.length} tests faalden:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ ${passed} tests geslaagd`);
