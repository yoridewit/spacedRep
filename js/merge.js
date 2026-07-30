/**
 * Samenvoegen van twee kopieën van de gegevens (bijvoorbeeld telefoon en pc).
 *
 * Twee apparaten kennen elkaars id's niet: dezelfde kaart die je op allebei
 * importeert krijgt twee verschillende id's. Daarom wordt er op inhoud
 * gematcht — decks op hun naam, kaarten op hun voorkant — precies zoals de
 * import dubbele kaarten herkent.
 *
 * Regels, kort:
 *   - kaarten die maar aan één kant bestaan komen erbij;
 *   - staat een kaart aan beide kanten, dan wint de planning van de kant waar
 *     hij het laatst geoefend is;
 *   - verwijderde decks en kaarten blijven weg, tenzij de andere kant er ná de
 *     verwijdering nog mee bezig is geweest;
 *   - dagstatistiek neemt per dag de hoogste stand, zodat opnieuw
 *     synchroniseren nooit dubbel telt.
 *
 * De functies hieronder zijn puur: ze muteren hun invoer niet.
 */

import { cardKey } from './parse.js';

const norm = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Sleutel waarop een kaart tussen apparaten herkend wordt. */
export function contentKey(card, deckName) {
  return `${norm(deckName)}::${cardKey(card)}`;
}

export function emptyTombstones() {
  return { decks: {}, cards: {} };
}

/** Moment waarop een kaart voor het laatst "iets deed". */
function activity(card) {
  return Math.max(card.srs?.lastReview || 0, card.created || 0);
}

function mergeTombstones(a = {}, b = {}) {
  const out = { decks: { ...(a.decks || {}) }, cards: { ...(a.cards || {}) } };
  for (const kind of ['decks', 'cards']) {
    for (const [key, ts] of Object.entries(b[kind] || {})) {
      out[kind][key] = Math.max(out[kind][key] || 0, ts);
    }
  }
  return out;
}

/**
 * @param {object} local  de stand op dit apparaat
 * @param {object} remote de stand die van de server komt (mag null zijn)
 * @returns {{state: object, summary: {decksAdded: number, cardsAdded: number, cardsUpdated: number}}}
 */
export function mergeStates(local, remote) {
  const summary = { decksAdded: 0, cardsAdded: 0, cardsUpdated: 0 };
  if (!remote) return { state: local, summary };

  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);

  // ── decks ──────────────────────────────────────────────────────────────
  const decks = {};
  const byName = new Map();       // genormaliseerde naam -> id in het resultaat
  const remap = new Map();        // id aan de andere kant -> id in het resultaat

  const addDeck = (deck, from) => {
    const key = norm(deck.name);
    const buried = tombstones.decks[key] || 0;
    if (buried > (deck.created || 0)) return null; // verwijderd, en niet opnieuw aangemaakt

    const existingId = byName.get(key);
    if (existingId) {
      const existing = decks[existingId];
      existing.description = existing.description || deck.description || '';
      existing.created = Math.min(existing.created || Infinity, deck.created || Infinity);
      remap.set(deck.id, existingId);
      return existingId;
    }
    decks[deck.id] = { ...deck };
    byName.set(key, deck.id);
    remap.set(deck.id, deck.id);
    if (from === 'remote') summary.decksAdded++;
    return deck.id;
  };

  for (const deck of Object.values(local.decks || {})) addDeck(deck, 'local');
  for (const deck of Object.values(remote.decks || {})) addDeck(deck, 'remote');

  // ── kaarten ────────────────────────────────────────────────────────────
  const cards = {};
  const byContent = new Map();    // inhoudssleutel -> id in het resultaat

  const addCard = (card, from) => {
    const deckId = remap.get(card.deckId);
    if (!deckId || !decks[deckId]) return; // deck bestaat niet meer
    const key = contentKey(card, decks[deckId].name);

    const buried = tombstones.cards[key] || 0;
    if (buried > activity(card)) return;

    const existingId = byContent.get(key);
    if (!existingId) {
      const id = cards[card.id] ? `${card.id}x` : card.id;
      cards[id] = { ...card, id, deckId };
      byContent.set(key, id);
      if (from === 'remote') summary.cardsAdded++;
      return;
    }

    // Beide kanten kennen deze kaart: de laatst geoefende planning wint.
    const existing = cards[existingId];
    const mine = existing.srs?.lastReview || 0;
    const theirs = card.srs?.lastReview || 0;
    if (theirs > mine) {
      cards[existingId] = {
        ...card,
        id: existingId,
        deckId,
        created: Math.min(existing.created || Infinity, card.created || Infinity),
      };
      if (from === 'remote') summary.cardsUpdated++;
    } else {
      existing.created = Math.min(existing.created || Infinity, card.created || Infinity);
    }
  };

  for (const card of Object.values(local.cards || {})) addCard(card, 'local');
  for (const card of Object.values(remote.cards || {})) addCard(card, 'remote');

  // ── dagstatistiek ──────────────────────────────────────────────────────
  const stats = {};
  const days = new Set([...Object.keys(local.stats || {}), ...Object.keys(remote.stats || {})]);
  for (const day of days) {
    const a = local.stats?.[day] || {};
    const b = remote.stats?.[day] || {};
    const merged = {};
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
      merged[field] = Math.max(Number(a[field]) || 0, Number(b[field]) || 0);
    }
    stats[day] = merged;
  }

  // ── instellingen ───────────────────────────────────────────────────────
  // De nieuwste wint, behalve het thema: dat is een voorkeur per apparaat.
  const localAt = local.settings?.settingsUpdatedAt || 0;
  const remoteAt = remote.settings?.settingsUpdatedAt || 0;
  const settings = remoteAt > localAt
    ? { ...remote.settings, theme: local.settings?.theme ?? remote.settings?.theme }
    : local.settings;

  return { state: { decks, cards, stats, settings, tombstones }, summary };
}
