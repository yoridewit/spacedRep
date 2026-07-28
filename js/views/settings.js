import { store, DEFAULT_SETTINGS } from '../store.js';
import { DEFAULT_CONFIG } from '../srs.js';
import { el, toast, confirmDialog, downloadJson, pickFile, plural } from '../ui.js';
import { refresh } from '../app.js';

function field(label, control, help) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'label', text: label }),
    control,
    help ? el('span', { class: 'help', text: help }) : null,
  ]);
}

function numberInput(value, { min = 0, max = 9999, step = 1 } = {}) {
  const input = el('input', { class: 'input', type: 'number', min: String(min), max: String(max), step: String(step) });
  input.value = String(value);
  return input;
}

export function mount(root) {
  const s = store.settings;

  const newPerDay = numberInput(s.newPerDay, { min: 0, max: 999 });
  const maxReviews = numberInput(s.maxReviewsPerDay, { min: 0, max: 9999 });
  const cutoff = numberInput(s.dayCutoffHour, { min: 0, max: 12 });
  const theme = el('select', { class: 'input' }, [
    el('option', { value: 'auto', text: 'Automatisch (systeem)' }),
    el('option', { value: 'dark', text: 'Donker' }),
    el('option', { value: 'light', text: 'Licht' }),
  ]);
  theme.value = s.theme;

  const steps = el('input', { class: 'input', type: 'text' });
  steps.value = s.srs.learningSteps.join(', ');
  const relearnSteps = el('input', { class: 'input', type: 'text' });
  relearnSteps.value = s.srs.relearningSteps.join(', ');
  const graduating = numberInput(s.srs.graduatingInterval, { min: 1, max: 30 });
  const easyInterval = numberInput(s.srs.easyInterval, { min: 1, max: 60 });
  const maxInterval = numberInput(s.srs.maximumInterval, { min: 1, max: 36500 });

  const parseSteps = (text, fallback) => {
    const list = text.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return list.length ? list : fallback;
  };

  const saveAll = () => {
    store.updateSettings({
      newPerDay: Number(newPerDay.value) || 0,
      maxReviewsPerDay: Number(maxReviews.value) || 0,
      dayCutoffHour: Math.min(12, Math.max(0, Number(cutoff.value) || 0)),
      theme: theme.value,
      srs: {
        learningSteps: parseSteps(steps.value, DEFAULT_CONFIG.learningSteps),
        relearningSteps: parseSteps(relearnSteps.value, DEFAULT_CONFIG.relearningSteps),
        graduatingInterval: Number(graduating.value) || DEFAULT_CONFIG.graduatingInterval,
        easyInterval: Number(easyInterval.value) || DEFAULT_CONFIG.easyInterval,
        maximumInterval: Number(maxInterval.value) || DEFAULT_CONFIG.maximumInterval,
      },
    });
    toast('Opgeslagen');
  };

  for (const control of [newPerDay, maxReviews, cutoff, theme, steps, relearnSteps, graduating, easyInterval, maxInterval]) {
    control.addEventListener('change', saveAll);
  }

  const cardCount = store.allCards().length;
  const deckCount = store.listDecks().length;

  root.append(
    el('h1', { text: 'Instellingen' }),
    el('h2', { class: 'section-title', text: 'Dagelijks' }),
    el('div', { class: 'panel' }, [
      field('Nieuwe kaarten per dag', newPerDay, 'Hoeveel nieuwe kaarten je per dag maximaal krijgt. 20 is een prima start.'),
      field('Maximaal herhalingen per dag', maxReviews, 'Rem voor drukke dagen. Kaarten die je niet haalt schuiven door.'),
      field('Nieuwe dag begint om (uur)', cutoff, 'Standaard 4 uur, zodat laat doorleren nog bij gisteren telt.'),
    ]),

    el('h2', { class: 'section-title', text: 'Weergave' }),
    el('div', { class: 'panel' }, [field('Thema', theme)]),

    el('h2', { class: 'section-title', text: 'Planning' }),
    el('div', { class: 'panel' }, [
      field('Leerstappen (minuten)', steps, 'Stappen voor een nieuwe kaart, bijvoorbeeld "1, 10".'),
      field('Herleerstappen (minuten)', relearnSteps, 'Stappen na een fout antwoord op een geleerde kaart.'),
      field('Eerste interval na leren (dagen)', graduating),
      field('Interval bij "Makkelijk" (dagen)', easyInterval),
      field('Maximaal interval (dagen)', maxInterval),
      el('button', {
        class: 'btn btn-secondary btn-sm',
        text: 'Terug naar standaard',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Planning terugzetten?', message: 'De standaardwaarden worden hersteld. Je voortgang blijft.', confirmLabel: 'Terugzetten' });
          if (!ok) return;
          store.updateSettings({ srs: { ...DEFAULT_CONFIG } });
          refresh();
        },
      }),
    ]),

    el('h2', { class: 'section-title', text: 'Back-up' }),
    el('div', { class: 'panel' }, [
      el('p', { class: 'small muted', text: `${plural(cardCount, 'kaart', 'kaarten')} in ${plural(deckCount, 'deck', 'decks')}. Alles staat alleen in deze browser — maak af en toe een back-up.` }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: 'Back-up downloaden',
          onclick: () => downloadJson(`kaartjes-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup()),
        }),
        el('button', {
          class: 'btn btn-secondary btn-sm',
          text: 'Back-up terugzetten',
          onclick: async () => {
            const file = await pickFile('.json,application/json');
            if (!file) return;
            const ok = await confirmDialog({
              title: 'Back-up terugzetten?',
              message: 'Alles wat nu in de app staat wordt vervangen door de inhoud van dit bestand.',
              confirmLabel: 'Terugzetten',
              danger: true,
            });
            if (!ok) return;
            try {
              store.importBackup(JSON.parse(file.text));
              toast('Back-up teruggezet');
              refresh();
            } catch (err) {
              toast(err.message);
            }
          },
        }),
      ]),
      el('button', {
        class: 'btn btn-danger btn-sm',
        style: 'margin-top:10px',
        text: 'Alles wissen',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Alles wissen?',
            message: 'Alle decks, kaarten en voortgang worden verwijderd. Dit kan niet ongedaan gemaakt worden.',
            confirmLabel: 'Wissen',
            danger: true,
          });
          if (!ok) return;
          store.wipe();
          toast('Alles gewist');
          refresh();
        },
      }),
    ]),

    el('h2', { class: 'section-title', text: 'Over' }),
    el('div', { class: 'panel' }, [
      el('p', { class: 'small muted', text: 'Kaartjes werkt offline en slaat niets op een server op. Op je iPhone: deel-knop in Safari → "Zet op beginscherm" voor een echte app-ervaring.' }),
      el('p', { class: 'small muted', text: `Standaard: ${DEFAULT_SETTINGS.newPerDay} nieuwe kaarten en ${DEFAULT_SETTINGS.maxReviewsPerDay} herhalingen per dag.` }),
    ])
  );
}
