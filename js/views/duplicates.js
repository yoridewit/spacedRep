import { store } from '../store.js';
import { findDuplicateGroups } from '../dedupe.js';
import { cardSummary, cardAnswerSummary } from '../markup.js';
import * as images from '../images.js';
import { el, clear, appendAll, toast, plural } from '../ui.js';
import { navigate } from '../app.js';

/** Korte omschrijving van hoe ver een kaart al is, om te helpen kiezen welke je bewaart. */
function progressLabel(card) {
  const s = card.srs;
  if (s.state === 'new') return 'nog nooit geoefend';
  if (s.state === 'learning' || s.state === 'relearning') return 'nog aan het leren';
  return `interval ${plural(s.interval, 'dag', 'dagen')}, ${plural(s.reps, 'keer', 'keer')} geoefend`;
}

function cardRow(card, { onRemoved }) {
  const row = el('div', { class: 'browse-item', style: 'cursor:default;align-items:flex-start' }, [
    el('div', { class: 'grow' }, [
      el('div', { class: 'q', text: cardSummary(card) }),
      el('div', { class: 'a', text: cardAnswerSummary(card) }),
      el('div', { class: 'small muted', style: 'margin-top:4px', text: progressLabel(card) }),
    ]),
    el('button', {
      class: 'btn btn-danger btn-sm',
      text: 'Verwijderen',
      onclick: () => {
        images.deleteImage(card.frontImage);
        images.deleteImage(card.backImage);
        store.deleteCard(card.id);
        toast('Kaart verwijderd');
        onRemoved();
      },
    }),
  ]);
  return row;
}

function groupPanel(group, { onChange }) {
  const deck = store.getDeck(group.deckId);
  const list = el('div');
  let cards = group.cards;

  function paint() {
    clear(list);
    if (cards.length < 2) { onChange(); return; }
    appendAll(list, cards.map((card, i) =>
      cardRow(card, {
        onRemoved: () => {
          cards = cards.filter((c) => c.id !== card.id);
          paint();
        },
      })
    ));
  }
  paint();

  return el('div', { class: 'panel' }, [
    el('h3', { style: 'margin-bottom:var(--space-2)', text: deck ? deck.name : 'Onbekende deck' }),
    el('p', { class: 'small muted', style: 'margin-bottom:var(--space-3)', text: 'Waarschijnlijk dezelfde kaart. Bekijk welke klopt en verwijder de rest — de nieuwste staat bovenaan.' }),
    list,
  ]);
}

export function mount(root) {
  const cards = store.allCards();
  const groups = findDuplicateGroups(cards);

  root.append(
    el('h1', { text: 'Dubbele kaarten' }),
    el('p', { class: 'muted', style: 'margin-bottom:var(--space-5)', text: 'Kaarten met een identieke voorkant of achterkant, maar niet allebei — het patroon dat de oude synchronisatie-bug kon achterlaten. Er wordt hier niets automatisch verwijderd.' })
  );

  if (!groups.length) {
    root.append(
      el('section', { class: 'empty' }, [
        el('div', { class: 'big', text: '✅' }),
        el('h1', { text: 'Geen dubbele kaarten gevonden' }),
        el('p', { class: 'muted', text: 'Niets te doen — je decks zien er schoon uit.' }),
        el('button', { class: 'btn btn-secondary', onclick: () => navigate('#/settings'), text: 'Terug naar instellingen' }),
      ])
    );
    return;
  }

  const container = el('div');
  const summary = el('p', { class: 'small muted', style: 'margin-bottom:var(--space-4)' });

  function updateSummary() {
    const left = container.querySelectorAll('.panel').length;
    summary.textContent = left ? `${plural(left, 'mogelijk duplicaat', 'mogelijke duplicaten')} gevonden.` : 'Alles opgeruimd.';
    if (!left) {
      appendAll(clear(container),
        el('section', { class: 'empty' }, [
          el('div', { class: 'big', text: '✅' }),
          el('h1', { text: 'Klaar' }),
          el('button', { class: 'btn btn-secondary', onclick: () => navigate('#/settings'), text: 'Terug naar instellingen' }),
        ])
      );
    }
  }

  appendAll(root, summary, container);

  for (const group of groups) {
    const panel = groupPanel(group, {
      onChange: () => { panel.remove(); updateSummary(); },
    });
    container.append(panel);
  }
  updateSummary();
}
