# Kaartjes

Een flashcard-webapp met spaced repetition (Anki-achtig), gemaakt om op je
iPhone te draaien én op je pc te gebruiken om kaarten toe te voegen.

- **AI maakt de kaarten.** Je laat een externe AI je lesstof omzetten naar een
  vast JSON-formaat en plakt dat in de app. De app hoeft zelf geen AI aan te
  roepen — er is dus geen API-sleutel en geen account nodig. De opdracht die je
  meekrijgt is gebouwd op Wozniak's twintig regels voor het formuleren van
  kennis, en past het aantal kaarten aan op de hoeveelheid stof.
- **Anki-achtig leren.** SM-2-planner met leerstappen, ease-factor, herleren na
  fouten en daglimieten voor nieuwe kaarten en herhalingen.
- **Werkt offline.** Alles staat in je eigen browser; geen server nodig.
- **Synchroniseren tussen apparaten** (optioneel) via je eigen Supabase-project,
  met een echte merge in plaats van "laatste wint".
- **Voortgang die motiveert.** Dagdoel, streak met vriezers, XP, niveaus met
  naam, prestaties in tredes en een oefenkalender.

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

Het makkelijkst is [synchroniseren via Supabase](#synchroniseren-via-supabase):
dan lopen kaarten én voortgang vanzelf gelijk. Zonder sync staat alles per
apparaat apart en zet je kaarten zo over:

| Manier | Hoe | Wanneer handig |
| --- | --- | --- |
| **Deel-link** | Deck openen → *Deel-link kopiëren* → link naar jezelf appen/mailen → op je telefoon openen | Snelste manier voor één deck |
| **Bestand** | Deck openen → *Exporteren (JSON)* → bestand naar je telefoon → *Bestand kiezen* | Grote decks |
| **Bibliotheek** | Zet een JSON-bestand in de map `decks/` en noem het in `decks/index.json` | Als je de app zelf host en decks in de repo bijhoudt |
| **Back-up** | **Instellingen → Back-up downloaden** en op het andere toestel terugzetten | Alles overzetten, inclusief voortgang |

Een deck opnieuw importeren is veilig: bestaande kaarten worden overgeslagen en
je voortgang blijft staan.

## Synchroniseren via Supabase

Optioneel, maar aan te raden als je op twee apparaten werkt. De app praat
rechtstreeks met de Auth- en REST-endpoints van je project — geen SDK, geen
build-stap, en offline werkt gewoon door.

1. Draai [`supabase/schema.sql`](supabase/schema.sql) in de SQL-editor van je
   project. Dat maakt de tabel `sync_state` met row level security: elke
   gebruiker kan alleen bij zijn eigen rij.
2. Vul je project-URL en **anon key** in [`config.js`](config.js) in (te vinden
   onder Project Settings → API). Die sleutel is bedoeld om publiek te zijn; RLS
   doet het echte werk. Zo hoort het bij de app, niet bij het apparaat: op een
   nieuw toestel hoef je daarna **alleen nog in te loggen**.
3. Maak in de app een account aan met e-mail en wachtwoord en log in. Staat
   *Confirm email* aan in je project, klik dan eenmalig op de bevestigingslink.

Wil je die gegevens liever niet in de repo, laat `config.js` dan leeg: de app
vraagt er dan zelf om onder **Instellingen → Synchroniseren**, en de knop
*Koppeling delen met ander apparaat* geeft je een link met de projectgegevens
erin zodat je die sleutel niet hoeft over te typen.

Er wordt gesynchroniseerd terwijl je bezig bent (een paar tellen nadat het stil
wordt), als je de app wegklikt of weer opent, zodra je weer online komt, en met
de knop **Synchroniseren**. Je kunt dus halverwege een set stoppen op je pc en
op je telefoon verdergaan waar je gebleven was — ook de daglimieten lopen mee.

### Hoe het samenvoegen werkt

Er staat één rij per gebruiker met de hele stand als `jsonb` en een `revision`.
Opslaan gebeurt alleen als die revision nog klopt; anders wordt er opnieuw
opgehaald en samengevoegd. Twee apparaten kennen elkaars id's niet, dus er wordt
op inhoud gematcht (`js/merge.js`):

- decks op hun naam, kaarten op hun voorkant — dezelfde regel waarmee de import
  dubbele kaarten herkent;
- staat een kaart aan beide kanten, dan wint de planning van de kant waar hij
  het **laatst geoefend** is;
- verwijderde kaarten en decks blijven weg, tenzij je er op het andere apparaat
  ná het verwijderen nog mee bezig bent geweest;
- dagstatistiek wordt per apparaat bijgehouden: bij het samenvoegen wordt per
  emmertje de hoogste stand genomen en is het totaal gewoon de som. Oefen je op
  één dag 10 kaarten op je pc en 5 op je telefoon, dan staat er 15 — en twee keer
  synchroniseren telt nooit dubbel.

Instellingen volgen de laatst gewijzigde kant; alleen het thema blijft een
voorkeur per apparaat. Het antwoordlogboek wordt niet gesynchroniseerd — dat is
puur lokale historie.

## Publiceren op Vercel

De repo importeren is genoeg; er is geen framework en geen build-stap nodig.
[`vercel.json`](vercel.json) regelt de rest:

- **Build Command** `node tools/write-config.mjs` schrijft `config.js` uit de
  omgevingsvariabelen van je Vercel-project. Zet onder Settings → Environment
  Variables `SUPABASE_URL` en `SUPABASE_PUBLISHABLE_KEY`; laat je ze weg, dan
  komt er een lege `config.js` en stel je sync in de app zelf in.
- `sw.js`, `index.html` en `config.js` krijgen `must-revalidate`, lettertypen een
  jaar cache. Zo zie je een nieuwe versie meteen.

De **Production Branch** staat onder Settings → Git. Vercel neemt daar bij het
importeren de default branch van de repo over; wijzig je de default branch later,
dan verandert die instelling *niet* mee. Pushes naar andere branches worden
preview-deploys met een eigen URL — handig, maar niet je productie-URL.

## Publiceren elders

Er is geen build-stap, dus elke statische host werkt. Op GitHub Pages:
Settings → Pages → *Deploy from a branch*, kies je branch en `/root`. Vul dan
`config.js` zelf in, of laat hem leeg en stel synchroniseren in de app in —
`tools/write-config.mjs` draait daar immers niet.

In [`.github/workflows/ci.yml`](.github/workflows/ci.yml) draaien alleen de
tests; die workflow raakt de site niet aan.

### Wat wel en niet geheim kan blijven

Kaartjes is een statische app: alles wat de browser nodig heeft, kan de bezoeker
lezen. Een secret houdt een waarde uit je repo en uit je git-geschiedenis, maar
zodra hij in `config.js` staat is hij onderdeel van de pagina. Dat is geen
probleem, want:

- de **publiceerbare (anon) sleutel** is daar ook voor bedoeld — hij zegt alleen
  *welk* project je bedoelt. Wat ermee mag, bepaalt row level security, en die
  laat iedereen alleen bij zijn eigen rij;
- de **geheime sleutel** (`sb_secret_…` of een JWT met `service_role`) omzeilt RLS
  volledig en hoort dus alleen op een server. Zet je hem toch in de app of in de
  uitrol, dan weigeren allebei hem (`js/keycheck.js`).

Heb je die geheime sleutel ooit ergens geplakt waar hij niet hoort: draai hem om
via Project Settings → API keys.

## Hoe de voortgang werkt

Bewust zo ontworpen dat de tellers meebewegen met *leren*, niet met doorklikken.

**XP** — 1 punt omdat je de kaart zag, +2 als je hem wist, en nog eens +2 als
het een kaart was die je al drie weken of langer kende. Een nieuwe kaart leren
levert +3 op. Een kaart wegklikken met "Opnieuw" levert dus het minimum op; een
oude kaart die nog steeds zit, het meest. Zonder dat verschil wordt het lonend
om makkelijke kaarten te malen — precies de bekendste kritiek op dit soort
systemen.

**Niveaus** — elk niveau kost 50 × het niveaunummer aan XP, dus ze worden
steeds duurder. Elke fase heeft een naam: Zaadje, Spruit, Struik, Boom, Woud,
Oerbos. Je ziet altijd hoeveel XP je nog van het volgende niveau af bent.

**Dagdoel** — standaard 20 kaarten, in te stellen. Haal je het, dan is er een
bonus van 10 XP. De balk staat op je startscherm en als ring bij je statistiek:
zichtbare voortgang naar een doel is wat mensen over de streep trekt
(goal-gradient effect).

**Streak met vriezers** — je verdient een vriezer per vijf geoefende dagen,
maximaal twee op voorraad. Mis je een dag, dan wordt er automatisch een ingezet
en loopt je reeks door; in de kalender houdt die dag een randje. Dit is de
meest aangehaalde reden dat mensen na een misser terugkomen in plaats van af te
haken. Alleen gisteren kan bevroren worden — een reeks van vorige week
repareren zou hem betekenisloos maken.

**Prestaties in tredes** — zes prestaties met elk vier tredes (Brons, Zilver,
Goud, Meester), bijvoorbeeld Volhouder (3/7/30/100 dagen op rij) en Beklijfd
(25/100/500/2000 kaarten die je al drie weken kent). Je ziet je huidige trede,
hoeveel je nog van de volgende af bent, en de lijst staat gesorteerd op wat het
dichtst bij is.

## Hoe de planning werkt

Elke kaart heeft een status: `new` → `learning` → `review`, en `relearning` als
je een geleerde kaart fout hebt.

- **Opnieuw** — je wist het antwoord niet; kaart terug naar de eerste leerstap, ease −0.20, interval gehalveerd.
- **Moeilijk** — interval × 1,2, ease −0.15.
- **Goed** — interval × ease (start 2,5).
- **Makkelijk** — interval × ease × 1,3, ease +0.15.

Tijdens het overhoren kun je op elke kaartzijde de tekst rechtstreeks
bijwerken (potloodje — de tekst wordt een invoerveld, Esc annuleert en
Ctrl/Cmd+Enter slaat op) of de kaart weggooien (prullenbak, met bevestiging).
Je blijft daarbij gewoon in je sessie.

Nieuwe kaarten doorlopen eerst de leerstappen (standaard 1 en 10 minuten) en
krijgen daarna een interval van 1 dag. Intervallen krijgen een kleine spreiding
zodat niet alles op dezelfde dag terugkomt. De dag rolt om 4 uur 's nachts om,
zodat laat doorleren nog bij gisteren telt. Alles is instelbaar onder
**Instellingen → Planning**.

## Onder de motorkap

```
index.html            de hele app-schil
config.js             je Supabase-gegevens (optioneel)
vercel.json           build-commando en cache-headers voor Vercel
css/app.css           design system ("Organic": Caprasimo + Figtree)
js/app.js             router en kop
js/srs.js             SM-2-planner
js/store.js           opslag (localStorage), wachtrij en daglimieten
js/parse.js           import-parser (JSON + platte tekst)
js/markup.js          veilige mini-markdown en cloze-weergave
js/gamify.js          streak, XP, niveaus, badges
js/daystats.js        dagtellers per apparaat
js/device.js          id van dit apparaat (blijft lokaal)
js/keycheck.js        weigert geheime Supabase-sleutels
js/merge.js           samenvoegen van twee apparaten
js/sync.js            Supabase-client (auth + REST via fetch)
js/views/*.js         schermen
sw.js                 service worker voor offline gebruik
decks/                optionele bibliotheek die naast de app staat
tools/make-icons.py   genereert de PNG-iconen
tools/write-config.mjs schrijft config.js bij het uitrollen
supabase/schema.sql   tabel + RLS voor synchronisatie
tests/run.js          tests voor planner, parser, opmaak, merge en sync
```

Geen dependencies, geen build-stap: gewoon ES-modules die de browser zelf laadt.

```bash
node tests/run.js        # 58 tests
python3 tools/make-icons.py
```

## Privacy

Zonder synchronisatie blijft alles in je browser: decks, kaarten, voortgang en
statistiek. Zet je sync aan, dan staat diezelfde stand in *jouw* Supabase-project,
afgeschermd per account met row level security. Er gaat nooit iets naar een AI —
het omzetten van je lesstof doe je zelf, buiten de app om.
