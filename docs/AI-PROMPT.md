# Het formaat waarin je AI kaarten aanlevert

De app leest JSON. Geef een AI (ChatGPT, Claude, Gemini, …) je lesstof plus de
opdracht hieronder, en plak het antwoord in **Toevoegen → 2. Plak het antwoord**.

In de app staat dezelfde opdracht onder **Toevoegen → Kopieer opdracht**, met je
eigen onderwerp er al in verwerkt.

## De opdracht

> Je maakt flashcards voor spaced repetition (Anki-stijl).
>
> **LESSTOF:**
> *[plak hier je hoofdstuk, aantekeningen of samenvatting]*
>
> **OPDRACHT:**
> Maak ongeveer 25 flashcards over deze stof, in het Nederlands.
>
> **REGELS:**
> 1. Eén feit per kaart. Geen samengestelde vragen ("en", "ook", opsommingen van 5 dingen).
> 2. De voorkant is een concrete vraag of een begrip; de achterkant is het kortst mogelijke juiste antwoord.
> 3. Geen ja/nee-vragen en geen vragen die je kunt raden uit de vraag zelf.
> 4. Gebruik de woorden uit de stof; verzin niets bij wat er niet staat.
> 5. Voor definities, jaartallen, formules en lijstjes: gebruik cloze-kaarten met `{{c1::...}}`.
>    Meerdere gaten in één zin mag: `{{c1::...}}` en `{{c2::...}}` worden aparte kaarten.
> 6. Maximaal ~200 tekens per kant. Langere toelichting hoort in `note`.
> 7. Zet bij elke kaart 1-2 tags (bijvoorbeeld het hoofdstuk of subonderwerp).
>
> **UITVOER:**
> Geef uitsluitend geldige JSON terug in exact dit formaat, zonder tekst eromheen:
>
> ```json
> {
>   "deck": "Naam van het onderwerp",
>   "description": "Korte omschrijving (optioneel)",
>   "cards": [
>     {
>       "front": "Vraag of begrip",
>       "back": "Het antwoord, kort en concreet",
>       "hint": "Optionele tip",
>       "note": "Optionele extra uitleg, pas zichtbaar na het antwoord",
>       "tags": ["hoofdstuk-1"]
>     },
>     {
>       "type": "cloze",
>       "text": "De mitochondriën zijn de {{c1::energiefabriek}} van de {{c2::cel}}.",
>       "tags": ["biologie"]
>     }
>   ]
> }
> ```

## Velden

| Veld | Verplicht | Betekenis |
| --- | --- | --- |
| `deck` | nee | Naam van de deck. Bestaat die al, dan worden de kaarten daarin samengevoegd. |
| `description` | nee | Korte omschrijving, zichtbaar op het deckscherm. |
| `cards[].front` | ja (basis) | De voorkant: vraag of begrip. |
| `cards[].back` | ja (basis) | De achterkant: het antwoord. |
| `cards[].type` | nee | `"basic"` (standaard) of `"cloze"`. |
| `cards[].text` | ja (cloze) | Zin met `{{c1::antwoord}}`-gaten. Eventueel `{{c1::antwoord::hint}}`. |
| `cards[].hint` | nee | Tip die al bij de vraag zichtbaar is. |
| `cards[].note` | nee | Extra uitleg, pas zichtbaar bij het antwoord. |
| `cards[].tags` | nee | Lijst met labels; je kunt erop zoeken. |

Elk cloze-nummer wordt een aparte kaart: de zin hierboven levert er dus twee op.

## De parser is vergevingsgezind

Gaat de AI net iets anders zitten doen, dan komt het meestal alsnog goed:

- ```` ```json ... ``` ````-blokken en tekst eromheen worden weggeknipt.
- Andere sleutels werken ook: `vraag`/`antwoord`, `q`/`a`, `question`/`answer`,
  `term`/`definition`, `naam`, `kaarten`.
- Een kale lijst zonder `deck` mag: `[{"front": "...", "back": "..."}]`.
- Meerdere decks tegelijk: `{"decks": [ {...}, {...} ]}`.
- Een vergeten komma achteraan wordt hersteld.

Lukt JSON helemaal niet, dan mag je ook platte tekst plakken:

```
# Aardrijkskunde
Hoofdstad van Frankrijk :: Parijs
Hoofdstad van Spanje :: Madrid
```

of

```
V: Wat is DNA?
A: Het erfelijk materiaal in de celkern
```

Regels die de app niet begrijpt worden overgeslagen en netjes gemeld, zodat je
ziet wat er niet is meegekomen.

## Opnieuw importeren is veilig

Kaarten worden vergeleken op hun voorkant (hoofdletters en spaties tellen niet
mee). Importeer je dezelfde deck nog eens met tien kaarten erbij, dan komen
alleen die tien erbij en behoud je al je voortgang.
