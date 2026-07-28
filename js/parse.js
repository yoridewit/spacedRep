/**
 * Import-parser. Slikt het officiële JSON-formaat, maar is bewust tolerant:
 * AI's leveren nu eenmaal net iets andere sleutels of plakken er een code-fence omheen.
 */

export class ParseError extends Error {}

const FRONT_KEYS = ['front', 'q', 'question', 'vraag', 'voorkant', 'term', 'prompt'];
const BACK_KEYS = ['back', 'a', 'answer', 'antwoord', 'achterkant', 'definition', 'definitie', 'response'];
const HINT_KEYS = ['hint', 'tip', 'clue'];
const NOTE_KEYS = ['note', 'notes', 'extra', 'toelichting', 'uitleg', 'explanation'];
const TEXT_KEYS = ['text', 'tekst', 'sentence', 'zin', 'cloze'];
const TAG_KEYS = ['tags', 'tag', 'labels', 'onderwerpen'];
const NAME_KEYS = ['deck', 'deckName', 'name', 'naam', 'title', 'titel'];
const CARD_KEYS = ['cards', 'kaarten', 'items', 'flashcards', 'notes'];

const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs;

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    // ook case-insensitive matchen
    const found = Object.keys(obj).find((o) => o.toLowerCase() === k.toLowerCase());
    if (found && obj[found] !== undefined && obj[found] !== null && obj[found] !== '') return obj[found];
  }
  return undefined;
}

function asText(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('\n');
  if (typeof value === 'object') return '';
  return String(value).replace(/\r\n/g, '\n').trim();
}

function asTags(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[,;]/);
  return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))].slice(0, 12);
}

/** Haalt ```json ... ``` fences weg en knipt losse tekst voor/na het JSON-blok af. */
function stripFences(input) {
  let text = input.trim();
  const fence = text.match(/```(?:json|jsonc|javascript)?\s*\n([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  return text;
}

function extractJsonBlock(text) {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start = firstArr === -1 || (firstObj !== -1 && firstObj < firstArr) ? firstObj : firstArr;
  if (start === -1) return null;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  if (end <= start) return null;
  return text.slice(start, end + 1);
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const block = extractJsonBlock(text);
    if (!block) return undefined;
    try {
      return JSON.parse(block);
    } catch {
      // laatste redmiddel: trailing komma's die AI's er soms in laten staan
      try {
        return JSON.parse(block.replace(/,(\s*[}\]])/g, '$1'));
      } catch {
        return undefined;
      }
    }
  }
}

export function clozeNumbers(text) {
  const nums = new Set();
  for (const m of String(text).matchAll(CLOZE_RE)) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

export function hasCloze(text) {
  return clozeNumbers(text).length > 0;
}

function normalizeCard(raw, warnings, index) {
  if (typeof raw === 'string') {
    const split = splitLine(raw);
    if (!split) {
      warnings.push(`Kaart ${index + 1} overgeslagen: geen scheidingsteken gevonden.`);
      return [];
    }
    raw = { front: split[0], back: split[1] };
  }
  if (Array.isArray(raw)) raw = { front: raw[0], back: raw[1], hint: raw[2] };
  if (!raw || typeof raw !== 'object') {
    warnings.push(`Kaart ${index + 1} overgeslagen: onbegrepen vorm.`);
    return [];
  }

  const tags = asTags(pick(raw, TAG_KEYS));
  const hint = asText(pick(raw, HINT_KEYS));
  const note = asText(pick(raw, NOTE_KEYS));
  const type = String(pick(raw, ['type', 'soort']) || '').toLowerCase();
  const text = asText(pick(raw, TEXT_KEYS));

  if (type === 'cloze' || (!pick(raw, FRONT_KEYS) && hasCloze(text))) {
    if (!text) {
      warnings.push(`Kaart ${index + 1} overgeslagen: cloze zonder "text".`);
      return [];
    }
    const nums = clozeNumbers(text);
    if (!nums.length) {
      warnings.push(`Kaart ${index + 1} overgeslagen: cloze zonder {{c1::...}}.`);
      return [];
    }
    return nums.map((n) => ({ type: 'cloze', text, clozeIndex: n, front: '', back: '', hint, note, tags }));
  }

  const front = asText(pick(raw, FRONT_KEYS));
  const back = asText(pick(raw, BACK_KEYS));
  if (!front && !back) {
    warnings.push(`Kaart ${index + 1} overgeslagen: leeg.`);
    return [];
  }
  if (!front || !back) {
    warnings.push(`Kaart ${index + 1} overgeslagen: ${front ? 'antwoord' : 'vraag'} ontbreekt.`);
    return [];
  }
  return [{ type: 'basic', front, back, hint, note, tags, text: '' }];
}

const SEPARATORS = ['\t', ' :: ', '::', ' | ', '|', ' ; ', ' - '];

function splitLine(line) {
  for (const sep of SEPARATORS) {
    const idx = line.indexOf(sep);
    if (idx > 0 && idx < line.length - sep.length) {
      const front = line.slice(0, idx).trim();
      const back = line.slice(idx + sep.length).trim();
      if (front && back) return [front, back];
    }
  }
  return null;
}

/** Fallback voor platte tekst: "vraag :: antwoord" per regel, of Q:/A:-blokken. */
function parsePlainText(text, warnings) {
  const lines = text.split('\n');
  const cards = [];
  let deckName = '';
  let pending = null;

  const flush = () => {
    if (pending && pending.front && pending.back) {
      cards.push({ type: 'basic', front: pending.front.trim(), back: pending.back.trim(), hint: '', note: '', tags: [], text: '' });
    }
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }

    const deckMatch = line.match(/^#\s*(?:deck|onderwerp)?\s*:?\s*(.+)$/i);
    if (deckMatch && !deckName && !cards.length) { deckName = deckMatch[1].trim(); continue; }

    const q = line.match(/^(?:Q|V|Vraag|Question)\s*[:.)-]\s*(.+)$/i);
    if (q) { flush(); pending = { front: q[1], back: '' }; continue; }

    const a = line.match(/^(?:A|Antwoord|Answer)\s*[:.)-]\s*(.+)$/i);
    if (a && pending) { pending.back = a[1]; flush(); continue; }

    if (pending) { pending.back += (pending.back ? '\n' : '') + line; continue; }

    if (hasCloze(line)) {
      for (const n of clozeNumbers(line)) {
        cards.push({ type: 'cloze', text: line, clozeIndex: n, front: '', back: '', hint: '', note: '', tags: [] });
      }
      continue;
    }

    const split = splitLine(line);
    if (split) {
      cards.push({ type: 'basic', front: split[0], back: split[1], hint: '', note: '', tags: [], text: '' });
    } else {
      warnings.push(`Regel overgeslagen: "${line.slice(0, 60)}"`);
    }
  }
  flush();
  return { name: deckName, description: '', cards };
}

function normalizeDeck(raw, warnings, fallbackName) {
  let cardsRaw;
  let name = fallbackName;
  let description = '';

  if (Array.isArray(raw)) {
    cardsRaw = raw;
  } else {
    cardsRaw = pick(raw, CARD_KEYS);
    const n = pick(raw, NAME_KEYS);
    if (typeof n === 'string' && n.trim()) name = n.trim();
    description = asText(pick(raw, ['description', 'omschrijving', 'beschrijving', 'summary']));
    if (!cardsRaw && (pick(raw, FRONT_KEYS) || pick(raw, TEXT_KEYS))) cardsRaw = [raw];
  }

  if (!Array.isArray(cardsRaw)) {
    throw new ParseError('Geen lijst met kaarten gevonden. Verwacht een veld "cards" met een array.');
  }

  const cards = [];
  cardsRaw.forEach((c, i) => cards.push(...normalizeCard(c, warnings, i)));
  return { name: name || 'Naamloze deck', description, cards };
}

/**
 * @returns {{decks: Array<{name: string, description: string, cards: Array}>, warnings: string[]}}
 */
export function parseImport(input, fallbackName = 'Nieuwe deck') {
  const text = String(input || '').trim();
  if (!text) throw new ParseError('Er is niets geplakt.');

  const warnings = [];
  const cleaned = stripFences(text);
  const data = tryJson(cleaned);

  let decks;
  if (data !== undefined) {
    const multi = !Array.isArray(data) && data && typeof data === 'object' ? pick(data, ['decks', 'dekken']) : undefined;
    if (Array.isArray(multi)) {
      decks = multi.map((d, i) => normalizeDeck(d, warnings, `${fallbackName} ${i + 1}`));
    } else {
      decks = [normalizeDeck(data, warnings, fallbackName)];
    }
  } else {
    const deck = parsePlainText(cleaned, warnings);
    if (!deck.cards.length) {
      throw new ParseError(
        'Kon dit niet lezen als JSON of als "vraag :: antwoord"-regels. Controleer of je het volledige JSON-blok hebt geplakt.'
      );
    }
    decks = [{ ...deck, name: deck.name || fallbackName }];
  }

  const total = decks.reduce((n, d) => n + d.cards.length, 0);
  if (!total) throw new ParseError('Er zijn geen bruikbare kaarten gevonden.');
  return { decks, warnings };
}

/** Sleutel om dubbele kaarten bij herimport te herkennen. */
export function cardKey(card) {
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return card.type === 'cloze'
    ? `cloze:${card.clozeIndex}:${norm(card.text)}`
    : `basic:${norm(card.front)}`;
}
