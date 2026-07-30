/**
 * Opslag + planning van de sessie. Alles staat lokaal in localStorage:
 * geen account, geen server, werkt offline.
 */

import { DEFAULT_CONFIG, newSrsState, schedule, dayKey, endOfDay, MINUTE } from './srs.js';
import { cardKey } from './parse.js';
import { xpForAnswer } from './gamify.js';
import { mergeStates, contentKey, emptyTombstones } from './merge.js';

const STORAGE_KEY = 'spacedrep.state.v1';
const SCHEMA_VERSION = 1;
const LEARN_AHEAD = 20 * MINUTE; // net als Anki: vlak-voor-tijd kaarten toch tonen
const MAX_UNDO = 30;
const MAX_LOG = 5000;

export const DEFAULT_SETTINGS = {
  newPerDay: 20,
  maxReviewsPerDay: 200,
  dayCutoffHour: 4,
  theme: 'auto',
  srs: { ...DEFAULT_CONFIG },
};

function uid(prefix = 'c') {
  const rnd = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd.replace(/-/g, '').slice(0, 16)}`;
}

function emptyState() {
  return {
    version: SCHEMA_VERSION,
    decks: {},
    cards: {},
    settings: { ...DEFAULT_SETTINGS, srs: { ...DEFAULT_CONFIG } },
    stats: {},
    tombstones: emptyTombstones(),
    log: [],
  };
}

class Store extends EventTarget {
  constructor() {
    super();
    this.state = emptyState();
    this.undoStack = [];
    this.storageError = null;
    this._saveTimer = null;
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.state = this._migrate(JSON.parse(raw));
    } catch (err) {
      console.error('Kon opgeslagen gegevens niet lezen', err);
      this.storageError = 'Opgeslagen gegevens konden niet gelezen worden.';
    }
    return this.state;
  }

  _migrate(data) {
    const base = emptyState();
    const state = {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}), srs: { ...DEFAULT_CONFIG, ...(data.settings?.srs || {}) } },
      decks: data.decks || {},
      cards: data.cards || {},
      stats: data.stats || {},
      tombstones: { ...emptyTombstones(), ...(data.tombstones || {}) },
      log: Array.isArray(data.log) ? data.log : [],
    };
    for (const card of Object.values(state.cards)) {
      if (!card.srs) card.srs = newSrsState(Date.now(), state.settings.srs);
      if (!card.type) card.type = 'basic';
      if (!Array.isArray(card.tags)) card.tags = [];
    }
    state.version = SCHEMA_VERSION;
    return state;
  }

  save({ immediate = false } = {}) {
    clearTimeout(this._saveTimer);
    const write = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        this.storageError = null;
      } catch (err) {
        console.error('Opslaan mislukt', err);
        this.storageError = 'Opslag zit vol. Maak een back-up en verwijder decks die je niet meer nodig hebt.';
        this.dispatchEvent(new CustomEvent('storage-error', { detail: this.storageError }));
      }
    };
    if (immediate) write();
    else this._saveTimer = setTimeout(write, 250);
  }

  changed(detail = {}) {
    this.save();
    this.dispatchEvent(new CustomEvent('change', { detail }));
  }

  // ---------- instellingen ----------

  get settings() {
    return this.state.settings;
  }

  updateSettings(patch) {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
      srs: { ...this.state.settings.srs, ...(patch.srs || {}) },
      settingsUpdatedAt: Date.now(),
    };
    this.changed({ type: 'settings' });
  }

  // ---------- decks ----------

  listDecks() {
    return Object.values(this.state.decks).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }

  getDeck(id) {
    return this.state.decks[id] || null;
  }

  findDeckByName(name) {
    const norm = String(name || '').trim().toLowerCase();
    return this.listDecks().find((d) => d.name.trim().toLowerCase() === norm) || null;
  }

  createDeck(name, description = '') {
    const deck = {
      id: uid('d'),
      name: String(name || 'Nieuwe deck').trim().slice(0, 80) || 'Nieuwe deck',
      description: String(description || '').slice(0, 500),
      created: Date.now(),
    };
    this.state.decks[deck.id] = deck;
    this.changed({ type: 'deck', id: deck.id });
    return deck;
  }

  updateDeck(id, patch) {
    const deck = this.state.decks[id];
    if (!deck) return null;
    Object.assign(deck, patch);
    this.changed({ type: 'deck', id });
    return deck;
  }

  deleteDeck(id) {
    const deck = this.state.decks[id];
    if (deck) this._bury('decks', deck.name.trim().toLowerCase().replace(/\s+/g, ' '));
    delete this.state.decks[id];
    for (const [cardId, card] of Object.entries(this.state.cards)) {
      if (card.deckId === id) delete this.state.cards[cardId];
    }
    this.undoStack = this.undoStack.filter((u) => this.state.cards[u.cardId]);
    this.changed({ type: 'deck-deleted', id });
  }

  // ---------- kaarten ----------

  deckCards(deckId) {
    return Object.values(this.state.cards).filter((c) => c.deckId === deckId);
  }

  /** Alle kaarten, of alleen die van één deck als `deckId` is opgegeven. */
  allCards(deckId = null) {
    const cards = Object.values(this.state.cards);
    return deckId ? cards.filter((c) => c.deckId === deckId) : cards;
  }

  getCard(id) {
    return this.state.cards[id] || null;
  }

  /**
   * Voegt kaarten toe aan een deck. Kaarten die er (op de voorkant) al in staan
   * worden overgeslagen, zodat je een deck opnieuw kunt importeren zonder je
   * voortgang kwijt te raken.
   */
  addCards(deckId, cards, { skipDuplicates = true } = {}) {
    const existing = new Set(this.deckCards(deckId).map((c) => cardKey(c)));
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    for (const raw of cards) {
      const key = cardKey(raw);
      if (skipDuplicates && existing.has(key)) { skipped++; continue; }
      existing.add(key);
      const card = {
        id: uid('c'),
        deckId,
        type: raw.type === 'cloze' ? 'cloze' : 'basic',
        front: raw.front || '',
        back: raw.back || '',
        text: raw.text || '',
        clozeIndex: raw.clozeIndex ?? null,
        hint: raw.hint || '',
        note: raw.note || '',
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        created: now,
        srs: newSrsState(now, this.settings.srs),
      };
      this.state.cards[card.id] = card;
      added++;
    }
    this.changed({ type: 'cards-added', deckId });
    return { added, skipped };
  }

  updateCard(id, patch) {
    const card = this.state.cards[id];
    if (!card) return null;
    Object.assign(card, patch);
    this.changed({ type: 'card', id });
    return card;
  }

  deleteCard(id) {
    const card = this.state.cards[id];
    const deck = card && this.state.decks[card.deckId];
    if (card && deck) this._bury('cards', contentKey(card, deck.name));
    delete this.state.cards[id];
    this.undoStack = this.undoStack.filter((u) => u.cardId !== id);
    this.changed({ type: 'card-deleted', id, deckId: card?.deckId });
  }

  resetCard(id) {
    const card = this.state.cards[id];
    if (!card) return;
    card.srs = newSrsState(Date.now(), this.settings.srs);
    this.changed({ type: 'card', id });
  }

  resetDeck(deckId) {
    const now = Date.now();
    for (const card of this.deckCards(deckId)) card.srs = newSrsState(now, this.settings.srs);
    this.undoStack = [];
    this.changed({ type: 'deck-reset', id: deckId });
  }

  // ---------- dagstatistiek ----------

  get stats() {
    return this.state.stats;
  }

  today(now = Date.now()) {
    const key = dayKey(now, this.settings.dayCutoffHour);
    if (!this.state.stats[key]) {
      this.state.stats[key] = { new: 0, reviews: 0, again: 0, hard: 0, good: 0, easy: 0, ms: 0, xp: 0 };
    }
    const day = this.state.stats[key];
    if (day.xp === undefined) day.xp = 0;
    return day;
  }

  remainingToday(now = Date.now()) {
    const t = this.today(now);
    const { newPerDay, maxReviewsPerDay } = this.settings;
    return {
      new: newPerDay < 0 ? Infinity : Math.max(0, newPerDay - t.new),
      reviews: maxReviewsPerDay < 0 ? Infinity : Math.max(0, maxReviewsPerDay - t.reviews),
    };
  }

  // ---------- wachtrij ----------

  /** Telt wat er nu (of vandaag nog) te doen is, met daglimieten meegerekend. */
  counts(deckId = null, now = Date.now()) {
    const dueBy = endOfDay(now, this.settings.dayCutoffHour);
    const remaining = this.remainingToday(now);
    let fresh = 0;
    let learning = 0;
    let review = 0;
    let total = 0;
    for (const card of Object.values(this.state.cards)) {
      if (deckId && card.deckId !== deckId) continue;
      total++;
      const s = card.srs;
      if (s.state === 'new') fresh++;
      else if (s.state === 'learning' || s.state === 'relearning') {
        if (s.due <= now + LEARN_AHEAD) learning++;
      } else if (s.due <= dueBy) review++;
    }
    return {
      total,
      newTotal: fresh,
      new: Math.min(fresh, remaining.new),
      learning,
      review: Math.min(review, remaining.reviews),
      reviewTotal: review,
      due: Math.min(fresh, remaining.new) + learning + Math.min(review, remaining.reviews),
    };
  }

  /**
   * Kiest de volgende kaart. Wordt na elk antwoord opnieuw aangeroepen, zodat
   * leerkaarten die over een minuut terugkomen vanzelf weer opduiken.
   */
  nextCard(deckId = null, now = Date.now(), session = null) {
    const dueBy = endOfDay(now, this.settings.dayCutoffHour);
    const remaining = this.remainingToday(now);
    const pool = Object.values(this.state.cards).filter((c) => !deckId || c.deckId === deckId);

    const learningDue = pool
      .filter((c) => (c.srs.state === 'learning' || c.srs.state === 'relearning') && c.srs.due <= now)
      .sort((a, b) => a.srs.due - b.srs.due);
    if (learningDue.length) return learningDue[0];

    const reviewDue = pool
      .filter((c) => c.srs.state === 'review' && c.srs.due <= dueBy)
      .sort((a, b) => a.srs.due - b.srs.due);
    const fresh = pool.filter((c) => c.srs.state === 'new').sort((a, b) => a.created - b.created);

    const canReview = remaining.reviews > 0 && reviewDue.length > 0;
    const canNew = remaining.new > 0 && fresh.length > 0;

    if (canReview && canNew) {
      // Nieuwe kaarten er gelijkmatig tussendoor mengen.
      const every = Math.max(2, Math.round(reviewDue.length / Math.min(fresh.length, remaining.new)) + 1);
      const seen = session?.answered ?? 0;
      return seen > 0 && seen % every === 0 ? fresh[0] : reviewDue[0];
    }
    if (canReview) return reviewDue[0];
    if (canNew) return fresh[0];

    // Niets meer op tijd: leerkaarten die binnen het "vooruit leren"-venster vallen.
    const soon = pool
      .filter((c) => (c.srs.state === 'learning' || c.srs.state === 'relearning') && c.srs.due <= now + LEARN_AHEAD)
      .sort((a, b) => a.srs.due - b.srs.due);
    return soon[0] || null;
  }

  /** Verwerkt een antwoord en onthoudt de vorige stand voor "ongedaan maken". */
  answer(cardId, rating, now = Date.now(), elapsedMs = 0) {
    const card = this.state.cards[cardId];
    if (!card) return null;

    const before = { ...card.srs };
    const wasNew = before.state === 'new';
    const next = schedule(card.srs, rating, now, this.settings.srs);
    card.srs = next;

    const stats = this.today(now);
    const xp = xpForAnswer(rating, wasNew);
    if (wasNew) stats.new++;
    stats.reviews++;
    stats.xp += xp;
    stats.ms += Math.min(elapsedMs, 5 * 60 * 1000);
    stats.again += rating === 1 ? 1 : 0;
    stats.hard += rating === 2 ? 1 : 0;
    stats.good += rating === 3 ? 1 : 0;
    stats.easy += rating === 4 ? 1 : 0;

    this.state.log.push({ cardId, ts: now, rating, interval: next.interval, state: next.state });
    if (this.state.log.length > MAX_LOG) this.state.log.splice(0, this.state.log.length - MAX_LOG);

    this.undoStack.push({ cardId, srs: before, wasNew, rating, xp, dayKey: dayKey(now, this.settings.dayCutoffHour) });
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();

    this.changed({ type: 'answer', cardId });
    return next;
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  undo() {
    const last = this.undoStack.pop();
    if (!last) return null;
    const card = this.state.cards[last.cardId];
    if (!card) return null;
    card.srs = last.srs;
    const stats = this.state.stats[last.dayKey];
    if (stats) {
      stats.reviews = Math.max(0, stats.reviews - 1);
      stats.xp = Math.max(0, (stats.xp || 0) - (last.xp || 0));
      if (last.wasNew) stats.new = Math.max(0, stats.new - 1);
      const bucket = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }[last.rating];
      if (bucket) stats[bucket] = Math.max(0, stats[bucket] - 1);
    }
    for (let i = this.state.log.length - 1; i >= 0; i--) {
      if (this.state.log[i].cardId === last.cardId) { this.state.log.splice(i, 1); break; }
    }
    this.changed({ type: 'undo', cardId: last.cardId });
    return card;
  }

  // ---------- import / export ----------

  exportDeck(deckId) {
    const deck = this.getDeck(deckId);
    if (!deck) return null;
    return {
      deck: deck.name,
      description: deck.description || '',
      cards: this.deckCards(deckId).map((c) =>
        c.type === 'cloze'
          ? { type: 'cloze', text: c.text, tags: c.tags, hint: c.hint || undefined }
          : { front: c.front, back: c.back, hint: c.hint || undefined, note: c.note || undefined, tags: c.tags }),
    };
  }

  // ---------- synchroniseren ----------

  /** Onthoudt dat iets verwijderd is, zodat het na een merge niet terugkomt. */
  _bury(kind, key) {
    if (!this.state.tombstones) this.state.tombstones = emptyTombstones();
    this.state.tombstones[kind][key] = Date.now();
  }

  /**
   * De gegevens die gedeeld worden tussen apparaten. Het logboek blijft lokaal:
   * dat is puur historie en zou de payload onnodig groot maken.
   */
  syncDoc() {
    return {
      decks: this.state.decks,
      cards: this.state.cards,
      stats: this.state.stats,
      settings: this.state.settings,
      tombstones: this.state.tombstones || emptyTombstones(),
    };
  }

  /**
   * Voegt een binnengehaalde stand samen met de lokale en neemt het resultaat over.
   * @returns het overzicht van wat erbij kwam, voor de melding aan de gebruiker.
   */
  applyRemote(remoteDoc) {
    const { state: merged, summary } = mergeStates(this.syncDoc(), remoteDoc);
    this.state.decks = merged.decks;
    this.state.cards = merged.cards;
    this.state.stats = merged.stats;
    this.state.settings = { ...merged.settings, srs: { ...DEFAULT_CONFIG, ...(merged.settings?.srs || {}) } };
    this.state.tombstones = merged.tombstones;
    this.undoStack = this.undoStack.filter((u) => this.state.cards[u.cardId]);
    this.save({ immediate: true });
    this.dispatchEvent(new CustomEvent('change', { detail: { type: 'sync' } }));
    return summary;
  }

  exportBackup() {
    return { app: 'spacedRep', kind: 'backup', version: SCHEMA_VERSION, exported: new Date().toISOString(), state: this.state };
  }

  importBackup(data) {
    const payload = data?.state && data?.kind === 'backup' ? data.state : data;
    if (!payload || typeof payload !== 'object' || !payload.cards || !payload.decks) {
      throw new Error('Dit bestand ziet er niet uit als een back-up van spacedRep.');
    }
    this.state = this._migrate(payload);
    this.undoStack = [];
    this.save({ immediate: true });
    this.dispatchEvent(new CustomEvent('change', { detail: { type: 'restore' } }));
  }

  wipe() {
    this.state = emptyState();
    this.undoStack = [];
    this.save({ immediate: true });
    this.dispatchEvent(new CustomEvent('change', { detail: { type: 'wipe' } }));
  }

  /** Reeks van de laatste `days` dagen voor het staafdiagram op het startscherm. */
  history(days = 14, now = Date.now()) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const ts = now - i * 24 * 60 * MINUTE;
      const key = dayKey(ts, this.settings.dayCutoffHour);
      const s = this.state.stats[key];
      out.push({ key, date: new Date(ts), reviews: s?.reviews || 0, new: s?.new || 0 });
    }
    return out;
  }

  /** Verdeling van kaarten over de statussen, voor het overzicht. */
  maturity(deckId = null) {
    const out = { new: 0, learning: 0, young: 0, mature: 0 };
    for (const card of Object.values(this.state.cards)) {
      if (deckId && card.deckId !== deckId) continue;
      const s = card.srs;
      if (s.state === 'new') out.new++;
      else if (s.state === 'learning' || s.state === 'relearning') out.learning++;
      else if (s.interval >= 21) out.mature++;
      else out.young++;
    }
    return out;
  }
}

export const store = new Store();
export { uid };
