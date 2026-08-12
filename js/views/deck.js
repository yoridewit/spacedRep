import { store } from '../store.js';
import { cardSummary, cardAnswerSummary } from '../markup.js';
import { formatDelay } from '../srs.js';
import { mastery } from '../gamify.js';
import * as images from '../images.js';
import {
  el, clear, toast, dialog, confirmDialog, promptDialog,
  copyToClipboard, downloadJson, encodeShare, plural,
} from '../ui.js';
import { navigate, refresh } from '../app.js';

const PAGE = 60;

export function mount(root, params = {}) {
  const deck = store.getDeck(params.id);
  if (!deck) {
    root.append(
      el('div', { class: 'notice error', text: 'Deze deck bestaat niet (meer).' }),
      el('button', { class: 'btn btn-secondary', onclick: () => navigate('#/'), text: 'Terug naar overzicht' })
    );
    return;
  }

  const counts = store.counts(deck.id);
  const pct = mastery(store.deckCards(deck.id));
  const list = el('div');
  const search = el('input', { class: 'input', type: 'text', placeholder: 'Zoeken in deze deck…' });
  let limit = PAGE;

  root.append(
    el('div', { class: 'row', style: 'justify-content:space-between' }, [
      el('h1', { class: 'grow', style: 'margin:0', text: deck.name }),
      el('button', { class: 'btn btn-secondary btn-sm', text: 'Hernoemen', onclick: rename }),
    ]),
    el('p', { class: 'muted', style: 'margin-top:var(--space-2)', text: deck.description || `${plural(counts.total, 'kaart', 'kaarten')} · ${pct}% onder de knie` }),

    el('div', { class: 'panel' }, [
      el('div', { class: 'row', style: 'margin-bottom:var(--space-3)' }, [
        el('span', { class: 'badge-pill due', text: `${counts.new} nieuw` }),
        el('span', { class: 'badge-pill', text: `${counts.learning} leren` }),
        el('span', { class: 'badge-pill done', text: `${counts.review} herhalen` }),
      ]),
      el('div', { class: 'bar' }, [el('i', { style: `width:${pct}%` })]),
      el('button', {
        class: 'btn btn-primary btn-block',
        style: 'margin-top:var(--space-4)',
        disabled: counts.due === 0,
        onclick: () => navigate(`#/study/${deck.id}`),
        text: counts.due ? `Start review — ${counts.due} kaarten` : 'Geen kaarten te doen',
      }),
    ]),

    el('h2', { class: 'section-title', text: 'Kaarten' }),
    el('div', { class: 'row', style: 'margin-bottom:var(--space-2);flex-wrap:nowrap' }, [
      el('div', { class: 'grow' }, [search]),
      el('button', { class: 'btn btn-secondary btn-sm', text: '+ Kaart', onclick: () => editCard(null) }),
    ]),
    list,

    el('h2', { class: 'section-title', text: 'Deck' }),
    el('div', { class: 'panel' }, [
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn-secondary btn-sm', text: 'Deel-link kopiëren', onclick: share }),
        el('button', { class: 'btn btn-secondary btn-sm', text: 'Exporteren (JSON)', onclick: exportDeck }),
        el('button', { class: 'btn btn-secondary btn-sm', text: 'Voortgang resetten', onclick: resetProgress }),
        el('button', { class: 'btn btn-danger btn-sm', text: 'Deck verwijderen', onclick: remove }),
      ]),
    ])
  );

  search.addEventListener('input', () => { limit = PAGE; renderList(); });
  renderList();

  function matches(card, query) {
    if (!query) return true;
    const haystack = `${cardSummary(card)} ${cardAnswerSummary(card)} ${(card.tags || []).join(' ')}`.toLowerCase();
    return query.split(/\s+/).every((word) => haystack.includes(word));
  }

  function dueLabel(card) {
    const s = card.srs;
    if (s.state === 'new') return 'nieuw';
    const delta = s.due - Date.now();
    return delta <= 0 ? 'nu' : `over ${formatDelay(delta)}`;
  }

  function renderList() {
    const query = search.value.trim().toLowerCase();
    const cards = store.deckCards(deck.id)
      .filter((c) => matches(c, query))
      .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));

    clear(list);
    if (!cards.length) {
      list.append(el('p', { class: 'muted', text: query ? 'Niets gevonden.' : 'Deze deck is nog leeg.' }));
      return;
    }
    for (const card of cards.slice(0, limit)) {
      list.append(
        el('div', { class: 'browse-item', onclick: () => editCard(card) }, [
          el('div', { class: `dot ${card.srs.state}` }),
          el('div', { class: 'grow' }, [
            el('div', { class: 'q', text: cardSummary(card) }),
            el('div', { class: 'a', text: cardAnswerSummary(card) }),
          ]),
          el('div', { class: 'small muted', style: 'white-space:nowrap', text: dueLabel(card) }),
        ])
      );
    }
    if (cards.length > limit) {
      list.append(
        el('button', {
          class: 'btn btn-secondary btn-sm',
          style: 'margin-top:var(--space-3)',
          text: `Toon meer (${cards.length - limit})`,
          onclick: () => { limit += PAGE; renderList(); },
        })
      );
    }
  }

  async function editCard(card) {
    const isCloze = card?.type === 'cloze';
    const front = el('textarea', { class: 'input', style: 'min-height:90px', placeholder: isCloze ? 'Zin met {{c1::gaten}}' : 'Voorkant' });
    const back = el('textarea', { class: 'input', style: 'min-height:90px', placeholder: 'Achterkant' });
    const tags = el('input', { class: 'input', type: 'text', placeholder: 'tags, komma-gescheiden' });
    front.value = isCloze ? card.text : card?.front || '';
    back.value = card?.back || '';
    tags.value = (card?.tags || []).join(', ');

    // Cloze-kaarten delen hun tekst tussen voor- en achterkant, maar mogen wel
    // elk hun eigen afbeelding hebben — bijvoorbeeld de opgave met een foto,
    // het antwoord zonder, of andersom.
    const frontImage = imageField(isCloze ? 'Afbeelding bij de opgave' : 'Afbeelding bij de voorkant', card?.frontImage);
    const backImage = imageField(isCloze ? 'Afbeelding bij het antwoord' : 'Afbeelding bij de achterkant', card?.backImage);

    const result = await dialog((done) =>
      el('form', { method: 'dialog', onsubmit: (e) => e.preventDefault() }, [
        el('h3', { text: card ? 'Kaart bewerken' : 'Nieuwe kaart' }),
        el('label', { class: 'field' }, [el('span', { class: 'label', text: isCloze ? 'Tekst' : 'Voorkant' }), front]),
        isCloze ? null : el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Achterkant' }), back]),
        frontImage.node,
        backImage.node,
        el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Tags' }), tags]),
        el('div', { class: 'row', style: 'flex-wrap:nowrap' }, [
          el('button', { type: 'button', class: 'btn btn-secondary', text: 'Annuleren', onclick: () => done(null) }),
          el('button', { type: 'button', class: 'btn btn-primary', text: 'Opslaan', onclick: () => done('save') }),
        ]),
        card
          ? el('div', { class: 'row' }, [
              el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Voortgang resetten', onclick: () => done('reset') }),
              el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'Verwijderen', onclick: () => done('delete') }),
            ])
          : null,
      ]));

    if (!result) return;
    if (result === 'delete') {
      images.deleteImage(card.frontImage);
      images.deleteImage(card.backImage);
      store.deleteCard(card.id);
      toast('Kaart verwijderd');
    } else if (result === 'reset') {
      store.resetCard(card.id);
      toast('Voortgang gereset');
    } else {
      const tagList = tags.value.split(',').map((t) => t.trim()).filter(Boolean);
      const newFrontImage = frontImage.getId();
      const newBackImage = backImage.getId();
      if (card) {
        store.updateCard(card.id, isCloze
          ? { text: front.value.trim(), tags: tagList, frontImage: newFrontImage, backImage: newBackImage }
          : { front: front.value.trim(), back: back.value.trim(), tags: tagList, frontImage: newFrontImage, backImage: newBackImage });
      } else {
        if (!front.value.trim() || !back.value.trim()) return toast('Voor- en achterkant zijn allebei nodig');
        store.addCards(deck.id, [{
          type: 'basic', front: front.value.trim(), back: back.value.trim(), tags: tagList,
          frontImage: newFrontImage, backImage: newBackImage,
        }], { skipDuplicates: false });
      }
      toast('Opgeslagen');
    }
    refresh();
  }

  /**
   * Kies-foto / camera-knoppen met voorvertoning. De foto wordt meteen bij het
   * kiezen gecomprimeerd en bewaard — bij Annuleren blijft hij gewoon
   * ongebruikt staan, dat is onschuldiger dan de gebruiker op een upload laten
   * wachten na het klikken op Opslaan.
   */
  function imageField(label, initialId) {
    let currentId = initialId || null;
    const preview = el('div', { class: 'image-field-preview' });
    const gallery = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    const camera = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });

    function paint() {
      clear(preview);
      if (currentId) {
        const img = el('img', { class: 'image-field-thumb', alt: '' });
        images.imageUrl(currentId).then(({ url, error }) => {
          if (url) img.src = url;
          else img.replaceWith(el('div', { class: 'small muted', text: `Kon niet geladen worden${error ? ` (${error})` : ''}` }));
        });
        preview.append(
          img,
          el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Verwijderen', onclick: () => { currentId = null; paint(); } })
        );
      } else {
        preview.append(
          el('div', { class: 'row' }, [
            el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Kies foto', onclick: () => gallery.click() }),
            el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Maak foto', onclick: () => camera.click() }),
          ])
        );
      }
    }

    async function handle(input) {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        currentId = await images.saveImage(file);
        paint();
      } catch (err) {
        toast(`Afbeelding opslaan mislukt: ${err.message}`);
      }
    }

    gallery.addEventListener('change', () => handle(gallery));
    camera.addEventListener('change', () => handle(camera));
    paint();

    return {
      node: el('div', { class: 'field' }, [el('span', { class: 'label', text: label }), preview, gallery, camera]),
      getId: () => currentId,
    };
  }

  async function rename() {
    const name = await promptDialog({ title: 'Deck hernoemen', value: deck.name });
    if (!name) return;
    store.updateDeck(deck.id, { name: name.trim() });
    refresh();
  }

  function exportDeck() {
    const safe = deck.name.replace(/[^\w\d-]+/g, '-').toLowerCase().slice(0, 40) || 'deck';
    downloadJson(`${safe}.json`, store.exportDeck(deck.id));
  }

  async function share() {
    const payload = store.exportDeck(deck.id);
    const token = await encodeShare(payload);
    const url = `${location.origin}${location.pathname}#/share/${token}`;
    if (url.length > 12000) {
      toast('Deze deck is te groot voor een link — gebruik Exporteren');
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: deck.name, url });
        return;
      } catch { /* geannuleerd; dan maar kopiëren */ }
    }
    toast((await copyToClipboard(url)) ? 'Link gekopieerd — open hem op je andere apparaat' : 'Kopiëren lukte niet');
  }

  async function resetProgress() {
    const ok = await confirmDialog({
      title: 'Voortgang resetten?',
      message: 'Alle kaarten in deze deck worden weer als nieuw behandeld. De kaarten zelf blijven staan.',
      confirmLabel: 'Resetten',
      danger: true,
    });
    if (!ok) return;
    store.resetDeck(deck.id);
    toast('Voortgang gereset');
    refresh();
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `"${deck.name}" verwijderen?`,
      message: `${plural(counts.total, 'kaart wordt', 'kaarten worden')} definitief verwijderd, inclusief voortgang.`,
      confirmLabel: 'Verwijderen',
      danger: true,
    });
    if (!ok) return;
    for (const c of store.deckCards(deck.id)) {
      images.deleteImage(c.frontImage);
      images.deleteImage(c.backImage);
    }
    store.deleteDeck(deck.id);
    toast('Deck verwijderd');
    navigate('#/');
  }
}
