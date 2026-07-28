import { store } from '../store.js';
import { RATING, previewIntervals } from '../srs.js';
import { renderMarkup, renderCloze } from '../markup.js';
import { badges, unlockedIds, totalXp, streak } from '../gamify.js';
import { el, clear, toast } from '../ui.js';
import { icon } from '../icons.js';
import { setChrome, navigate } from '../app.js';

const GRADES = [
  { rating: RATING.AGAIN, label: 'Weer fout' },
  { rating: RATING.HARD, label: 'Moeilijk' },
  { rating: RATING.GOOD, label: 'Goed' },
  { rating: RATING.EASY, label: 'Makkelijk' },
];

const CONFETTI_COLORS = ['var(--color-accent)', 'var(--color-accent-2)', 'var(--color-accent-400)', 'var(--color-accent-2-400)'];

export function mount(root, params = {}) {
  const deckId = params.id || null;
  const deck = deckId ? store.getDeck(deckId) : null;
  if (deckId && !deck) {
    root.append(el('div', { class: 'notice error', text: 'Deze deck bestaat niet meer.' }));
    return;
  }

  const cutoff = store.settings.dayCutoffHour;
  const session = {
    answered: 0,
    correct: 0,
    startedWith: Math.max(1, store.counts(deckId).due),
    shownAt: Date.now(),
    xpStart: totalXp(store.stats),
    badgesStart: unlockedIds(badges({ stats: store.stats, cards: store.allCards() }, Date.now(), cutoff)),
  };

  let card = null;
  let revealed = false;

  const progressFill = el('i', { style: 'width:0%' });
  const counter = el('div', { class: 'session-counter' }, [icon('flame', 15), el('span', { text: '0/0' })]);
  const undoBtn = el('button', { class: 'round-btn', 'aria-label': 'Ongedaan maken', onclick: doUndo }, [icon('undo', 17)]);

  setChrome([
    el('button', {
      class: 'round-btn',
      'aria-label': 'Sluiten',
      onclick: () => navigate(deck ? `#/deck/${deck.id}` : '#/'),
    }, [icon('close', 18)]),
    el('div', { class: 'bar tall grow', style: 'flex:1' }, [progressFill]),
    counter,
    undoBtn,
  ]);

  const stage = el('section', { class: 'study-main' });
  const hint = el('div', { class: 'kbd-hint', text: 'Spatie = omdraaien · 1-4 = beoordelen · U = ongedaan maken' });
  root.append(stage, hint);

  function questionHtml(c) {
    return c.type === 'cloze' ? renderCloze(c.text, c.clozeIndex, false) : renderMarkup(c.front);
  }

  function answerHtml(c) {
    return c.type === 'cloze' ? renderCloze(c.text, c.clozeIndex, true) : renderMarkup(c.back);
  }

  function updateChrome() {
    const done = session.answered;
    const left = store.counts(deckId).due;
    const total = Math.max(session.startedWith, done + left);
    progressFill.style.width = `${Math.round((done / total) * 100)}%`;
    counter.lastChild.textContent = `${Math.min(done + 1, total)}/${total}`;
    undoBtn.disabled = !store.canUndo();
  }

  function showCard() {
    revealed = false;
    session.shownAt = Date.now();

    const flip = el('div', { class: 'flip', onclick: () => reveal() }, [
      el('div', { class: 'flip-inner' }, [
        el('div', { class: 'face front' }, [
          el('span', { class: 'kicker', text: card.type === 'cloze' ? 'Vul aan' : 'Vraag' }),
          el('div', { class: 'qa-text', html: questionHtml(card) }),
          card.hint && card.type !== 'cloze' ? el('div', { class: 'qa-hint', text: card.hint }) : null,
          el('span', { class: 'tap-hint', text: 'Tik om het antwoord te zien' }),
        ]),
        el('div', { class: 'face back' }, [
          el('span', { class: 'kicker', text: 'Antwoord' }),
          el('div', { class: 'qa-text', html: answerHtml(card) }),
          card.note ? el('div', { class: 'qa-note', html: renderMarkup(card.note) }) : null,
          card.tags?.length ? el('div', { class: 'tag-row' }, card.tags.map((t) => el('span', { class: 'tag', text: t }))) : null,
        ]),
      ]),
    ]);

    const showBtn = el('button', { class: 'btn btn-primary', onclick: () => reveal(), text: 'Toon antwoord' });
    clear(stage).append(flip, showBtn);
    stage.dataset.state = 'question';
    updateChrome();
  }

  function reveal() {
    if (!card || revealed) return;
    revealed = true;
    stage.querySelector('.flip')?.classList.add('revealed');
    const preview = previewIntervals(card.srs, Date.now(), store.settings.srs);
    const grades = el('div', { class: 'grades' },
      GRADES.map((g) =>
        el('button', { class: 'grade', dataset: { rating: g.rating }, onclick: () => answer(g.rating) }, [
          el('span', { text: g.label }),
          el('small', { text: preview[g.rating] }),
        ])));
    stage.lastElementChild.replaceWith(grades);
    stage.dataset.state = 'answer';
  }

  function answer(rating) {
    if (!card || !revealed) return;
    store.answer(card.id, rating, Date.now(), Date.now() - session.shownAt);
    session.answered++;
    if (rating >= RATING.HARD) session.correct++;
    next();
  }

  function doUndo() {
    const restored = store.undo();
    if (!restored) return;
    session.answered = Math.max(0, session.answered - 1);
    card = restored;
    showCard();
    reveal();
    toast('Ongedaan gemaakt');
  }

  function next() {
    card = store.nextCard(deckId, Date.now(), session);
    if (!card) return finish();
    showCard();
  }

  function finish() {
    updateChrome();
    stage.dataset.state = 'done';

    const accuracyPct = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;
    const gainedXp = Math.max(0, totalXp(store.stats) - session.xpStart);
    const days = streak(store.stats, Date.now(), cutoff);
    const now = badges({ stats: store.stats, cards: store.allCards() }, Date.now(), cutoff);
    const fresh = now.find((b) => b.unlocked && !session.badgesStart.has(b.id));
    const stillDue = store.counts(deckId).due;

    const confetti = accuracyPct >= 80 && session.answered >= 5
      ? Array.from({ length: 26 }, (_, i) =>
          el('div', {
            class: 'confetti',
            style: `left:${Math.round(Math.random() * 96)}%;background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};animation-delay:${(Math.random() * 0.9).toFixed(2)}s`,
          }))
      : [];

    clear(stage).append(
      el('div', { class: 'summary' }, [
        ...confetti,
        el('div', { class: 'kicker', style: 'margin-bottom:var(--space-2)', text: session.answered ? 'Sessie voltooid' : 'Niets te doen' }),
        session.answered ? el('div', { class: 'score', text: `${accuracyPct}%` }) : el('div', { class: 'score', text: '🌱' }),
        el('p', {
          class: 'muted',
          style: 'margin-bottom:var(--space-4)',
          text: session.answered
            ? `${session.answered} ${session.answered === 1 ? 'kaart' : 'kaarten'} geoefend · +${gainedXp} XP`
            : 'Alle kaarten van deze deck zijn al geleerd of staan gepland voor later.',
        }),
        fresh
          ? el('div', { class: 'unlock' }, [
              icon('medal', 22),
              el('div', {}, [
                el('div', { style: 'font-weight:700;font-size:13px', text: 'Badge ontgrendeld' }),
                el('div', { style: 'font-size:12px;opacity:.85', text: fresh.name }),
              ]),
            ])
          : null,
        el('div', { class: 'session-counter', style: 'justify-content:center;margin-bottom:var(--space-6)' }, [
          icon('flame', 15),
          `${days} ${days === 1 ? 'dag' : 'dagen'} op rij`,
        ]),
        el('div', { class: 'row', style: 'flex-wrap:nowrap' }, [
          el('button', {
            class: 'btn btn-secondary grow',
            onclick: () => navigate(deck ? `#/deck/${deck.id}` : '#/'),
            text: 'Terug naar decks',
          }),
          stillDue
            ? el('button', {
                class: 'btn btn-primary grow',
                onclick: () => { session.answered = 0; session.correct = 0; session.startedWith = Math.max(1, stillDue); next(); },
                text: 'Nog een keer',
              })
            : null,
        ]),
      ])
    );
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!revealed) reveal();
      else answer(RATING.GOOD);
    } else if (['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault();
      answer(Number(event.key));
    } else if (event.key.toLowerCase() === 'u') {
      doUndo();
    } else if (event.key === 'Escape') {
      navigate(deck ? `#/deck/${deck.id}` : '#/');
    }
  }

  document.addEventListener('keydown', onKey);
  next();

  return () => document.removeEventListener('keydown', onKey);
}
