import { store } from '../store.js';
import { mastery } from '../gamify.js';
import { isConfigured, isSignedIn, authSkipped, getSession, meta } from '../sync.js';
import { versionLine } from '../version.js';
import { el, appendAll, plural } from '../ui.js';
import { navigate } from '../app.js';

/** Uitnodiging om in te loggen, zolang synchroniseren nog niet aanstaat. */
function syncCard() {
  if (!isConfigured()) return null;
  if (isSignedIn() || !authSkipped()) return null;
  return el('div', { class: 'panel', style: 'margin-bottom:var(--space-6)' }, [
    el('h3', { style: 'margin-bottom:var(--space-1)', text: 'Je werkt zonder account' }),
    el('p', { class: 'small muted', text: 'Je kaarten staan alleen op dit apparaat. Log in en ze lopen gelijk met je andere apparaten.' }),
    el('button', {
      class: 'btn btn-primary btn-block',
      onclick: () => navigate('#/inloggen'),
      text: 'Alsnog inloggen',
    }),
  ]);
}

/** Voettekst met de versie, zodat je zonder zoeken ziet wat je voor je hebt. */
function footer() {
  const session = isSignedIn() ? getSession() : null;
  const last = meta().lastSync;
  const bits = [`Kaartjes ${versionLine()}`];
  if (session) {
    bits.push(`ingelogd als ${session.email || 'onbekend'}`);
    if (last) bits.push(`gesynchroniseerd ${new Intl.DateTimeFormat('nl-NL', { timeStyle: 'short' }).format(new Date(last))}`);
  }
  return el('p', {
    class: 'small muted',
    style: 'text-align:center;margin:var(--space-8) 0 0',
    text: bits.join(' · '),
  });
}

function deckCard(deck) {
  const counts = store.counts(deck.id);
  const pct = mastery(store.deckCards(deck.id));
  const label = counts.due ? `${counts.due} te doen` : counts.total ? 'bij' : 'leeg';
  const tone = counts.due ? 'due' : counts.total ? 'done' : '';

  return el('div', { class: 'deck-card' }, [
    el('div', { class: 'deck-head' }, [
      el('h3', { text: deck.name }),
      el('span', { class: `badge-pill ${tone}`, text: label }),
    ]),
    el('div', { class: 'small muted', text: `${counts.new} nieuw · ${pct}% onder de knie` }),
    el('div', { class: 'bar' }, [el('i', { style: `width:${pct}%` })]),
    el('div', { class: 'row', style: 'margin-top:4px' }, [
      el('button', {
        class: 'btn btn-primary grow',
        disabled: counts.due === 0,
        onclick: () => navigate(`#/study/${deck.id}`),
        text: counts.due ? 'Start review' : 'Klaar',
      }),
      el('button', {
        class: 'btn btn-secondary btn-sm',
        onclick: () => navigate(`#/deck/${deck.id}`),
        text: 'Beheer',
      }),
    ]),
  ]);
}

export function mount(root) {
  const decks = store.listDecks();
  const total = store.counts();

  if (!decks.length) {
    appendAll(
      root,
      el('section', { class: 'empty' }, [
        el('div', { class: 'big', text: '🍂' }),
        el('h1', { text: 'Nog geen decks' }),
        el('p', { class: 'muted', text: 'Laat een AI je lesstof omzetten naar kaarten en plak het resultaat hier.' }),
        el('button', { class: 'btn btn-primary', onclick: () => navigate('#/add'), text: 'Kaarten toevoegen' }),
      ]),
      syncCard(),
      footer()
    );
    return;
  }

  appendAll(
    root,
    el('section', {}, [
      el('h1', { style: 'margin-bottom:4px', text: total.due ? 'Zo, aan de slag?' : 'Alles bij' }),
      el('p', {
        class: 'muted',
        style: 'margin-bottom:var(--space-6)',
        text: total.due
          ? `Je hebt vandaag nog ${plural(total.due, 'kaart', 'kaarten')} te doen.`
          : 'Er staat vandaag niets meer klaar. Morgen weer.',
      }),
      syncCard(),
      total.due
        ? el('button', {
            class: 'btn btn-primary btn-block',
            style: 'margin-bottom:var(--space-6)',
            onclick: () => navigate('#/study'),
            text: `Alles leren — ${total.due} kaarten`,
          })
        : null,
      el('div', { class: 'grid-decks' }, decks.map(deckCard)),
      el('div', { class: 'row', style: 'margin-top:var(--space-6);justify-content:center' }, [
        el('button', { class: 'btn btn-secondary', onclick: () => navigate('#/add'), text: '+ Kaarten toevoegen' }),
      ]),
      footer(),
    ])
  );
}
