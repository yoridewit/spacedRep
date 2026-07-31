/**
 * De opdracht die je aan een externe AI geeft. Eén bron van waarheid: de app
 * toont hem, docs/AI-PROMPT.md legt hem uit.
 *
 * De regels komen uit Wozniak's "Twenty Rules of Formulating Knowledge" (de
 * standaard voor het schrijven van flashcards) en uit Dunlosky e.a. (2013),
 * dat overhoren en spreiding als enige technieken met hoge bewezen waarde
 * aanmerkt, met doorvragen ("waarom is dat zo?") als nuttige aanvulling.
 */

export const FORMAT_EXAMPLE = `{
  "deck": "Naam van het onderwerp",
  "description": "Korte omschrijving (optioneel)",
  "cards": [
    {
      "front": "Vraag of begrip",
      "back": "Het antwoord, kort en concreet",
      "hint": "Optionele tip",
      "note": "Optionele extra uitleg of bron, pas zichtbaar na het antwoord",
      "tags": ["hoofdstuk-1"]
    },
    {
      "type": "cloze",
      "text": "De mitochondriën zijn de {{c1::energiefabriek}} van de {{c2::cel}}.",
      "tags": ["biologie"]
    }
  ]
}`;

const MAX_EXISTING = 80;

export function countWords(text) {
  return (String(text || '').trim().match(/\S+/g) || []).length;
}

/**
 * Hoeveel kaarten past er redelijkerwijs in deze stof? Eén alinea levert een
 * handvol kaarten op, een heel hoofdstuk tientallen. Zonder stof (alleen een
 * onderwerp) valt het terug op een gewone reeks.
 */
export function suggestCardRange(text) {
  const words = countWords(text);
  if (!words) return { words, min: 12, max: 20 };
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const min = clamp(Math.round(words / 45), 3, 40);
  const max = clamp(Math.round(words / 18), min + 2, 60);
  return { words, min, max };
}

function existingBlock(fronts = []) {
  const list = fronts.filter(Boolean).slice(0, MAX_EXISTING);
  if (!list.length) return '';
  const lines = list.map((front) => `- ${String(front).replace(/\s+/g, ' ').slice(0, 90)}`).join('\n');
  const meer = fronts.length > list.length ? `\n(en nog ${fronts.length - list.length} andere)` : '';
  return `

STAAT ER AL IN:
Deze kaarten heb ik al. Maak er geen dubbele van; vul aan met wat er nog mist.
${lines}${meer}`;
}

/**
 * @param {object} options
 * @param {string} options.topic      de lesstof, of een omschrijving ervan
 * @param {number} options.min        ondergrens voor het aantal kaarten
 * @param {number} options.max        bovengrens
 * @param {string} options.deckName   naam van de deck waar het heen gaat
 * @param {string[]} options.existing voorkanten van kaarten die er al in staan
 */
export function buildPrompt({ topic = '', min, max, deckName = '', existing = [], language = 'Nederlands' } = {}) {
  const material = topic.trim();
  const range = suggestCardRange(material);
  const low = Number.isFinite(min) ? min : range.min;
  const high = Number.isFinite(max) ? max : range.max;

  const subject = material || '[plak hier je lesstof, of beschrijf het onderwerp]';
  const deckLine = deckName
    ? `\nDe kaarten horen bij een deck dat "${deckName}" heet; gebruik die naam als "deck".`
    : '';

  return `Je maakt flashcards voor spaced repetition (Anki-stijl). Ik ga ze zelf overhoren, dus de kwaliteit van de vraagstelling telt zwaarder dan het aantal.

LESSTOF:
${subject}

OPDRACHT:
Maak ${low} tot ${high} flashcards over deze stof, in het ${language}.${deckLine}
Laat het aantal van de stof afhangen: zit er weinig in, maak er dan weinig.
Liever ${low} scherpe kaarten dan ${high} opgerekte. Verzin niets bij wat er niet staat.

HOE JE EEN GOEDE KAART SCHRIJFT:
1. Eén feit per kaart. Het antwoord is zo kort als het kan zijn: een woord,
   een getal, een naam. Moet je een zin of langer antwoorden, splits de kaart.
2. Geen opsommingen en geen "noem de vijf ...". Zet een lijst om in losse
   kaarten, of in cloze-kaarten waarin telkens één element wegvalt.
3. Gebruik cloze-kaarten voor definities, jaartallen, formules en vaste
   uitdrukkingen: {{c1::het weggelaten stuk}}. Meerdere gaten in één zin mag;
   elk nummer wordt een eigen kaart.
4. Stel de vraag zo dat er maar één antwoord op past. Geen ja/nee-vragen, geen
   vragen waarvan het antwoord al in de vraag zit, en niets waarop "het hangt
   ervan af" het juiste antwoord is.
5. Voorkom verwarring tussen kaarten die op elkaar lijken. Zet er het
   onderscheidende kenmerk of de context bij ("In het Romeinse recht: ...")
   zodat je bij het overhoren weet welke van de twee bedoeld wordt.
6. Zet er waar het kan een waarom- of hoe-vraag bij, niet alleen wat-vragen:
   uitleggen waaróm iets zo is beklijft beter dan een los feit.
7. Dezelfde kern mag twee keer voorkomen als je hem van een andere kant
   benadert (begrip → definitie, en definitie → begrip). Letterlijk dezelfde
   vraag twee keer niet.
8. Houd de vraag kort en concreet. Maximaal ongeveer 200 tekens per kant;
   langere toelichting, een bron of een jaartal horen in "note".
9. Zet bij elke kaart 1 of 2 tags: het hoofdstuk of het subonderwerp.${existingBlock(existing)}

UITVOER:
Geef uitsluitend geldige JSON terug in exact dit formaat, zonder tekst eromheen:

${FORMAT_EXAMPLE}`;
}
