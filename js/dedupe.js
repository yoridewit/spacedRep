/**
 * Dubbele kaarten opsporen.
 *
 * Een oude bug in het samenvoegen tussen apparaten kon een bewerkte vraag of
 * antwoord laten verdubbelen in plaats van bijwerken (zie merge.js). Dit
 * scant op precies dat patroon: kaarten in dezelfde deck met een identieke
 * voorkant maar een andere achterkant, of andersom.
 *
 * Puur signalerend — er wordt hier nooit iets verwijderd. Heel korte
 * antwoorden ("Ja", "4") worden overgeslagen omdat die toevallig vaak
 * hetzelfde zijn tussen totaal verschillende kaarten.
 */

const MIN_LEN = 6;

const norm = (text) => String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Voor cloze-kaarten is voor- en achterkant dezelfde onderliggende zin. */
function sideKeys(card) {
  if (card.type === 'cloze') {
    const key = norm(card.text);
    return { front: key, back: key };
  }
  return { front: norm(card.front), back: norm(card.back) };
}

function touchedAt(card) {
  return card.updatedAt || card.created || 0;
}

/**
 * @param {Array} cards alle kaarten (uit meerdere decks, zoals store.allCards())
 * @returns {Array<{deckId: string, cards: Array}>} groepen van 2+ kaarten die
 *   waarschijnlijk dezelfde kaart zijn, nieuwste eerst per groep.
 */
export function findDuplicateGroups(cards) {
  const byDeck = new Map();
  for (const card of cards) {
    if (!byDeck.has(card.deckId)) byDeck.set(card.deckId, []);
    byDeck.get(card.deckId).push(card);
  }

  const groups = [];
  for (const [deckId, deckCards] of byDeck) {
    const reported = new Set();
    for (const side of ['front', 'back']) {
      const buckets = new Map();
      for (const card of deckCards) {
        const key = sideKeys(card)[side];
        if (!key || key.length < MIN_LEN) continue;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(card);
      }
      for (const group of buckets.values()) {
        if (group.length < 2) continue;
        const fingerprint = group.map((c) => c.id).sort().join('|');
        if (reported.has(fingerprint)) continue;
        reported.add(fingerprint);
        groups.push({ deckId, cards: [...group].sort((a, b) => touchedAt(b) - touchedAt(a)) });
      }
    }
  }
  return groups;
}
