import { store } from '../store.js';
import { parseImport, ParseError } from '../parse.js';
import { cardSummary, cardAnswerSummary } from '../markup.js';
import { buildPrompt, suggestCardRange, countWords } from '../prompt.js';
import { el, clear, toast, copyToClipboard, pickFile, decodeShare, plural } from '../ui.js';
import { navigate } from '../app.js';

const LIBRARY_URL = 'decks/index.json';

export function mount(root, params = {}) {
  let parsed = null;

  const status = el('div');
  const preview = el('div');
  const library = el('div');

  // ── 1. de opdracht voor je AI ──
  const topicInput = el('textarea', {
    class: 'input',
    placeholder: 'Plak hier je lesstof, of typ het onderwerp (bijvoorbeeld "hoofdstuk 3, celdeling")',
    style: 'min-height:110px;font-family:var(--font-body);font-size:16px',
  });

  // Waar het heen gaat, meteen bovenaan: bij een bestaande deck krijgt de AI de
  // vragen die er al in staan mee, zodat je geen dubbele kaarten terugkrijgt.
  const deckSelect = el('select', { class: 'input' }, [
    el('option', { value: '', text: 'Nieuwe deck' }),
    ...store.listDecks().map((d) => el('option', { value: d.id, text: `${d.name} (${store.deckCards(d.id).length})` })),
  ]);

  const amountSelect = el('select', { class: 'input' }, [
    el('option', { value: 'auto', text: 'Automatisch — past zich aan je stof aan' }),
    ...[5, 10, 15, 20, 30, 50].map((n) => el('option', { value: String(n), text: `Ongeveer ${n} kaarten` })),
  ]);

  const amountHint = el('span', { class: 'help' });
  const promptBox = el('textarea', { class: 'input', readonly: true, style: 'min-height:180px;display:none' });

  function chosenDeck() {
    return deckSelect.value ? store.getDeck(deckSelect.value) : null;
  }

  function promptOptions() {
    const deck = chosenDeck();
    const range = suggestCardRange(topicInput.value);
    const fixed = amountSelect.value === 'auto' ? null : Number(amountSelect.value);
    return {
      topic: topicInput.value,
      min: fixed ? Math.max(3, Math.round(fixed * 0.8)) : range.min,
      max: fixed ? Math.round(fixed * 1.2) : range.max,
      deckName: deck?.name || '',
      existing: deck ? store.deckCards(deck.id).map((c) => cardSummary(c)) : [],
    };
  }

  const refreshPrompt = () => {
    const options = promptOptions();
    promptBox.value = buildPrompt(options);

    const words = countWords(topicInput.value);
    const deck = chosenDeck();
    const parts = [];
    if (amountSelect.value === 'auto') {
      parts.push(words
        ? `${words} woorden stof — de opdracht vraagt om ${options.min} tot ${options.max} kaarten.`
        : 'Nog geen stof geplakt; de opdracht vraagt voorlopig om 12 tot 20 kaarten.');
    } else {
      parts.push(`De opdracht vraagt om ${options.min} tot ${options.max} kaarten.`);
    }
    if (deck) parts.push(`De ${options.existing.length} vragen die al in "${deck.name}" staan gaan mee, zodat je geen dubbele krijgt.`);
    amountHint.textContent = parts.join(' ');
  };

  topicInput.addEventListener('input', refreshPrompt);
  amountSelect.addEventListener('change', refreshPrompt);
  deckSelect.addEventListener('change', refreshPrompt);
  refreshPrompt();

  // ── 2. het antwoord terugplakken ──
  const input = el('textarea', {
    class: 'input',
    placeholder: 'Plak hier het antwoord van de AI (JSON), of regels in de vorm:\n\nvraag :: antwoord',
  });

  root.append(
    el('h1', { text: 'Kaarten toevoegen' }),
    el('p', { class: 'muted', style: 'margin-bottom:var(--space-5)', text: 'Laat een AI je lesstof omzetten, plak het resultaat en klaar.' }),

    el('div', { class: 'panel' }, [
      el('h3', { text: '1. Laat een AI de kaarten maken' }),
      el('p', { class: 'small muted', text: 'Kopieer de opdracht hieronder en plak hem in ChatGPT, Claude of Gemini. Wat je terugkrijgt hoef je alleen nog maar in stap 2 te plakken.' }),
      el('label', { class: 'field' }, [
        el('span', { class: 'label', text: 'Je lesstof of onderwerp' }),
        topicInput,
        el('span', { class: 'help', text: 'Mag leeg blijven — dan zet je de stof zelf onder de opdracht in je AI-gesprek.' }),
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'label', text: 'Waar komen de kaarten?' }),
        deckSelect,
      ]),
      el('label', { class: 'field' }, [
        el('span', { class: 'label', text: 'Aantal kaarten' }),
        amountSelect,
        amountHint,
      ]),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-primary',
          text: 'Kopieer opdracht',
          onclick: async () => {
            refreshPrompt();
            toast((await copyToClipboard(promptBox.value)) ? 'Opdracht gekopieerd' : 'Kopiëren lukte niet — selecteer de tekst zelf');
          },
        }),
        el('button', {
          class: 'btn btn-secondary',
          text: 'Toon opdracht',
          onclick: (e) => {
            const visible = promptBox.style.display !== 'none';
            promptBox.style.display = visible ? 'none' : 'block';
            e.currentTarget.textContent = visible ? 'Toon opdracht' : 'Verberg opdracht';
          },
        }),
      ]),
      promptBox,
    ]),

    el('div', { class: 'panel' }, [
      el('h3', { text: '2. Plak het antwoord' }),
      el('p', { class: 'small muted', text: 'Plak hier wat de AI je gaf. Losse regels als "vraag :: antwoord" werken ook, net als een bestand dat je eerder hebt geëxporteerd.' }),
      input,
      el('div', { class: 'row', style: 'margin-top:var(--space-3)' }, [
        el('button', { class: 'btn btn-primary', text: 'Verwerken', onclick: () => handleParse(input.value) }),
        el('button', {
          class: 'btn btn-secondary',
          text: 'Bestand kiezen',
          onclick: async () => {
            const file = await pickFile();
            if (!file) return;
            input.value = file.text;
            handleParse(file.text, file.name.replace(/\.[^.]+$/, ''));
          },
        }),
      ]),
    ]),

    status,
    preview,
    library
  );


  function handleParse(text, fallbackName = 'Nieuwe deck') {
    clear(status);
    clear(preview);
    parsed = null;
    try {
      parsed = parseImport(text, fallbackName);
    } catch (err) {
      const message = err instanceof ParseError ? err.message : `Onverwachte fout: ${err.message}`;
      status.append(el('div', { class: 'notice error', text: message }));
      return;
    }
    renderPreview();
    preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPreview() {
    const total = parsed.decks.reduce((n, d) => n + d.cards.length, 0);
    status.append(
      el('div', { class: 'notice ok', text: `${plural(total, 'kaart', 'kaarten')} gevonden in ${plural(parsed.decks.length, 'deck', 'decks')}.` })
    );
    if (parsed.warnings.length) {
      status.append(
        el('div', { class: 'notice warn' }, [
          el('div', { text: `${plural(parsed.warnings.length, 'regel', 'regels')} overgeslagen:` }),
          el('ul', {}, parsed.warnings.slice(0, 6).map((w) => el('li', { text: w }))),
        ])
      );
    }

    const single = parsed.decks.length === 1;
    const nameInput = el('input', { class: 'input', type: 'text', placeholder: 'Naam van de deck' });
    nameInput.value = parsed.decks[0].name;

    const targetSelect = el('select', { class: 'input' }, [
      el('option', { value: '', text: 'Nieuwe deck' }),
      ...store.listDecks().map((d) => el('option', { value: d.id, text: `${d.name} (${store.deckCards(d.id).length})` })),
    ]);
    const preselected = deckSelect.value && store.getDeck(deckSelect.value);
    const existing = preselected || (single ? store.findDeckByName(parsed.decks[0].name) : null);
    if (existing) targetSelect.value = existing.id;

    const nameField = el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Naam' }), nameInput]);
    const syncName = () => { nameField.style.display = targetSelect.value ? 'none' : 'block'; };
    targetSelect.addEventListener('change', syncName);
    syncName();

    const sample = parsed.decks[0].cards.slice(0, 8);
    preview.append(
      el('div', { class: 'panel' }, [
        el('h3', { text: '3. Waar moet het heen?' }),
        single
          ? el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Deck' }), targetSelect])
          : el('p', { class: 'small muted', text: 'Er zitten meerdere decks in dit bestand; ze worden op naam samengevoegd of nieuw aangemaakt.' }),
        single ? nameField : null,
        el('button', {
          class: 'btn btn-primary btn-block',
          text: `${total} kaarten toevoegen`,
          onclick: () => doImport(single ? targetSelect.value : null, nameInput.value),
        }),
        el('p', { class: 'small muted', style: 'margin:var(--space-2) 0 0', text: 'Kaarten die al in de deck staan worden overgeslagen, dus opnieuw importeren is veilig.' }),
      ]),
      el('div', { class: 'panel' }, [
        el('h4', { text: 'Zo zien je kaarten eruit' }),
        ...sample.map((c) =>
          el('div', { class: 'browse-item', style: 'cursor:default' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'q', text: cardSummary(c) }),
              el('div', { class: 'a', text: cardAnswerSummary(c) }),
            ]),
          ])),
        parsed.decks[0].cards.length > sample.length
          ? el('p', { class: 'small muted', style: 'margin:var(--space-3) 0 0', text: `… en nog ${parsed.decks[0].cards.length - sample.length} kaarten.` })
          : null,
      ])
    );
  }

  function doImport(targetId, newName) {
    let added = 0;
    let skipped = 0;
    let lastDeckId = targetId || null;
    parsed.decks.forEach((d, index) => {
      const wantedName = index === 0 ? newName?.trim() || d.name : d.name;
      let deck = index === 0 && targetId ? store.getDeck(targetId) : store.findDeckByName(wantedName);
      if (!deck) deck = store.createDeck(wantedName, d.description);
      const result = store.addCards(deck.id, d.cards);
      added += result.added;
      skipped += result.skipped;
      lastDeckId = deck.id;
    });
    toast(skipped ? `${added} toegevoegd · ${skipped} dubbel overgeslagen` : `${added} kaarten toegevoegd`);
    navigate(lastDeckId ? `#/deck/${lastDeckId}` : '#/');
  }

  // ── deel-link van een ander apparaat ──
  if (params.share) {
    decodeShare(params.share)
      .then((payload) => {
        input.value = JSON.stringify(payload, null, 2);
        handleParse(input.value, payload.deck || 'Gedeelde deck');
      })
      .catch(() => {
        status.append(el('div', { class: 'notice error', text: 'Deze deel-link kon niet gelezen worden. Kopieer de volledige link opnieuw.' }));
      });
  }

  loadLibrary(library, handleParse);
}

/**
 * Kant-en-klare decks die bij de app zijn meegeleverd (decks/index.json).
 * Bedoeld om de app te kunnen proberen zonder eerst een AI aan het werk te
 * zetten; hoe je er zelf een toevoegt staat in de README, niet in de app.
 */
async function loadLibrary(container, handleParse) {
  let index;
  try {
    const res = await fetch(LIBRARY_URL, { cache: 'no-cache' });
    if (!res.ok) return;
    index = await res.json();
  } catch {
    return;
  }
  const entries = (Array.isArray(index) ? index : index.decks || [])
    .map((entry) => (typeof entry === 'string' ? { file: entry, name: entry.replace(/\.json$/i, '') } : entry))
    .filter((entry) => entry && entry.file);
  if (!entries.length) return;

  clear(container).append(
    el('div', { class: 'panel' }, [
      el('h3', { text: 'Of pak een voorbeelddeck' }),
      el('p', { class: 'small muted', text: 'Kant-en-klaar, om de app even te proberen. Je kunt het later gewoon verwijderen.' }),
      ...entries.map((entry) =>
        el('div', { class: 'browse-item', style: 'cursor:default' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 'q', text: entry.name || entry.file }),
            el('div', {
              class: 'small muted',
              text: [entry.description, entry.cards ? `${entry.cards} kaarten` : null].filter(Boolean).join(' · '),
            }),
          ]),
          el('button', {
            class: 'btn btn-secondary btn-sm',
            text: 'Toevoegen',
            onclick: async () => {
              try {
                const res = await fetch(`decks/${entry.file}`, { cache: 'no-cache' });
                if (!res.ok) throw new Error(`kon ${entry.file} niet laden`);
                handleParse(await res.text(), entry.name || entry.file);
              } catch (err) {
                toast(err.message);
              }
            },
          }),
        ])),
    ])
  );
}
