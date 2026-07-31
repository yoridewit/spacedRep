# Het formaat waarin je AI kaarten aanlevert

De app leest JSON. Geef een AI (ChatGPT, Claude, Gemini, …) je lesstof plus de
opdracht hieronder, en plak het antwoord in **Toevoegen → 2. Plak het antwoord**.

In de app staat dezelfde opdracht onder **Toevoegen → Kopieer opdracht**, met je
eigen onderwerp er al in verwerkt.

## De opdracht

De app stelt hem voor je samen. Twee dingen passen zich aan:

- **Het aantal kaarten volgt de hoeveelheid stof.** Eén alinea van 70 woorden
  levert een vraag om 3 tot 5 kaarten op, een hoofdstuk van 900 woorden om 20
  tot 50. Je kunt het ook vastzetten op ongeveer een aantal naar keuze.
- **Kies je een bestaande deck**, dan gaan de vragen die er al in staan mee in
  de opdracht, met het verzoek er geen dubbele van te maken. Zo vul je een deck
  aan in plaats van hem te verdubbelen.

De regels in de opdracht komen uit Wozniak's *Twenty Rules of Formulating
Knowledge* — de standaard voor het schrijven van flashcards — aangevuld met de
bevinding van Dunlosky e.a. (2013) dat doorvragen ("waarom is dat zo?") boven
losse feiten uitkomt:

1. **Eén feit per kaart**, met het kortst mogelijke antwoord (het
   minimum-informatieprincipe). Moet je een zin antwoorden, dan moet de kaart
   gesplitst worden.
2. **Geen opsommingen** en geen "noem de vijf …": lijsten worden losse kaarten
   of cloze-kaarten waarin telkens één element wegvalt.
3. **Cloze** voor definities, jaartallen, formules en vaste uitdrukkingen.
4. **Eén mogelijk antwoord** per vraag; geen ja/nee, niets waarvan het antwoord
   al in de vraag zit.
5. **Interferentie bestrijden**: bij kaarten die op elkaar lijken hoort het
   onderscheidende kenmerk of de context in de vraag.
6. **Waarom- en hoe-vragen** naast wat-vragen.
7. **Redundantie mag**: dezelfde kern van een andere kant benaderen helpt, een
   letterlijk identieke vraag niet.
8. Kort en concreet, ongeveer 200 tekens per kant; bronnen en jaartallen in
   `note`.
9. Eén of twee tags per kaart.

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
