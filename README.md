# Kaartjes

Een flashcard-webapp met spaced repetition (Anki-achtig), gemaakt om op je
iPhone te draaien én op je pc te gebruiken om kaarten toe te voegen.

- **AI maakt de kaarten.** Je laat een externe AI je lesstof omzetten naar een
  vast JSON-formaat en plakt dat in de app. De app hoeft zelf geen AI aan te
  roepen — er is dus geen API-sleutel en geen account nodig.
- **Anki-achtig leren.** SM-2-planner met leerstappen, ease-factor, herleren na
  fouten en daglimieten voor nieuwe kaarten en herhalingen.
- **Werkt offline.** Alles staat in je eigen browser; geen server, geen tracking.
- **Voortgang die motiveert.** Streak, XP, niveaus, badges en een oefenkalender.

## Snel starten

1. Zet de map op een webserver (zie [Publiceren](#publiceren-op-github-pages)) of
   draai hem lokaal:
   ```bash
   npx http-server -p 8080 .
   # of: python3 -m http.server 8080
   ```
2. Open de app, ga naar **Toevoegen** en kopieer de opdracht.
3. Plak die opdracht samen met je lesstof in ChatGPT, Claude of Gemini.
4. Plak het JSON-antwoord terug in stap 2 en druk op **Verwerken**.
5. **Start review** en leren maar.

Het formaat staat in [`docs/AI-PROMPT.md`](docs/AI-PROMPT.md); er ligt een
voorbeeld in [`samples/voorbeeld-deck.json`](samples/voorbeeld-deck.json).

## Op je iPhone

Open de app in Safari → deelknop → **Zet op beginscherm**. Daarna start hij
schermvullend op, werkt hij offline en staat hij tussen je andere apps.

> Bewaar je kaarten niet alleen op je telefoon: iOS ruimt websitegegevens op als
> je een site lang niet gebruikt. Als beginschermapp is dat risico klein, maar
> maak af en toe een back-up via **Instellingen → Back-up downloaden**.

## Op je pc, en van pc naar telefoon

Dezelfde URL werkt op je pc; het scherm wordt breder en je kunt met het
toetsenbord leren (spatie = omdraaien, 1-4 = beoordelen, U = ongedaan maken).
Je voortgang staat per apparaat apart — kaarten toevoegen op je pc doe je zo:

| Manier | Hoe | Wanneer handig |
| --- | --- | --- |
| **Deel-link** | Deck openen → *Deel-link kopiëren* → link naar jezelf appen/mailen → op je telefoon openen | Snelste manier voor één deck |
| **Bestand** | Deck openen → *Exporteren (JSON)* → bestand naar je telefoon → *Bestand kiezen* | Grote decks |
| **Bibliotheek** | Zet een JSON-bestand in de map `decks/` en noem het in `decks/index.json` | Als je de app zelf host en decks in de repo bijhoudt |
| **Back-up** | **Instellingen → Back-up downloaden** en op het andere toestel terugzetten | Alles overzetten, inclusief voortgang |

Een deck opnieuw importeren is veilig: bestaande kaarten worden overgeslagen en
je voortgang blijft staan.

## Publiceren op GitHub Pages

Er is geen build-stap; de map is de website.

1. Push naar GitHub.
2. **Settings → Pages → Source: Deploy from a branch**, kies je branch en `/root`.
3. Open `https://<gebruiker>.github.io/<repo>/` op je telefoon.

## Hoe de planning werkt

Elke kaart heeft een status: `new` → `learning` → `review`, en `relearning` als
je een geleerde kaart fout hebt.

- **Opnieuw** — je wist het antwoord niet; kaart terug naar de eerste leerstap, ease −0.20, interval gehalveerd.
- **Moeilijk** — interval × 1,2, ease −0.15.
- **Goed** — interval × ease (start 2,5).
- **Makkelijk** — interval × ease × 1,3, ease +0.15.

Nieuwe kaarten doorlopen eerst de leerstappen (standaard 1 en 10 minuten) en
krijgen daarna een interval van 1 dag. Intervallen krijgen een kleine spreiding
zodat niet alles op dezelfde dag terugkomt. De dag rolt om 4 uur 's nachts om,
zodat laat doorleren nog bij gisteren telt. Alles is instelbaar onder
**Instellingen → Planning**.

## Onder de motorkap

```
index.html            de hele app-schil
css/app.css           design system ("Organic": Caprasimo + Figtree)
js/app.js             router en kop
js/srs.js             SM-2-planner
js/store.js           opslag (localStorage), wachtrij en daglimieten
js/parse.js           import-parser (JSON + platte tekst)
js/markup.js          veilige mini-markdown en cloze-weergave
js/gamify.js          streak, XP, niveaus, badges
js/views/*.js         schermen
sw.js                 service worker voor offline gebruik
decks/                optionele bibliotheek die naast de app staat
tools/make-icons.py   genereert de PNG-iconen
tests/run.js          tests voor planner, parser en opmaak
```

Geen dependencies, geen build-stap: gewoon ES-modules die de browser zelf laadt.

```bash
node tests/run.js        # 35 tests
python3 tools/make-icons.py
```

## Privacy

Alles blijft lokaal in je browser: decks, kaarten, voortgang en statistiek. Er
gaat niets naar een server, ook niet naar een AI — het omzetten van je lesstof
doe je zelf, buiten de app om.
