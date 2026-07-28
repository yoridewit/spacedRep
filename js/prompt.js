/**
 * De vaste opdracht die je aan een externe AI geeft. Eén bron van waarheid:
 * de app toont hem, docs/AI-PROMPT.md legt hem uit.
 */

export const FORMAT_EXAMPLE = `{
  "deck": "Naam van het onderwerp",
  "description": "Korte omschrijving (optioneel)",
  "cards": [
    {
      "front": "Vraag of begrip",
      "back": "Het antwoord, kort en concreet",
      "hint": "Optionele tip",
      "note": "Optionele extra uitleg, pas zichtbaar na het antwoord",
      "tags": ["hoofdstuk-1"]
    },
    {
      "type": "cloze",
      "text": "De mitochondriën zijn de {{c1::energiefabriek}} van de {{c2::cel}}.",
      "tags": ["biologie"]
    }
  ]
}`;

export function buildPrompt({ topic = '', count = 25, language = 'Nederlands' } = {}) {
  const subject = topic.trim() || '[plak hier je lesstof, of beschrijf het onderwerp]';
  return `Je maakt flashcards voor spaced repetition (Anki-stijl).

LESSTOF:
${subject}

OPDRACHT:
Maak ongeveer ${count} flashcards over deze stof, in het ${language}.

REGELS:
1. Eén feit per kaart. Geen samengestelde vragen ("en", "ook", opsommingen van 5 dingen).
2. De voorkant is een concrete vraag of een begrip; de achterkant is het kortst mogelijke juiste antwoord.
3. Geen ja/nee-vragen en geen vragen die je kunt raden uit de vraag zelf.
4. Gebruik de woorden uit de stof; verzin niets bij wat er niet staat.
5. Voor definities, jaartallen, formules en lijstjes: gebruik cloze-kaarten met {{c1::...}}.
   Meerdere gaten in één zin mag: {{c1::...}} en {{c2::...}} worden aparte kaarten.
6. Maximaal ~200 tekens per kant. Langere toelichting hoort in "note".
7. Zet bij elke kaart 1-2 tags (bijvoorbeeld het hoofdstuk of subonderwerp).

UITVOER:
Geef uitsluitend geldige JSON terug in exact dit formaat, zonder tekst eromheen:

${FORMAT_EXAMPLE}`;
}
