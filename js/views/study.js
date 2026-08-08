import { store } from '../store.js';
import { RATING, previewIntervals } from '../srs.js';
import { renderMarkup, renderCloze, cardSummary } from '../markup.js';
import { achievements, achievementTiers, newlyEarned, totalXp, streak, dailyProgress, levelInfo, XP_DAILY_GOAL } from '../gamify.js';
import { el, clear, appendAll, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { setChrome, navigate } from '../app.js';
import { syncQuietly } from '../sync.js';

const GRADES = [
  { rating: RATING.AGAIN, label: 'Opnieuw' },
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
    tiersStart: achievementTiers(achievements(achievementInput(), Date.now(), cutoff)),
  };

  let card = null;
  let revealed = false;
  let editing = false;
  let peekBtn = null;

  function achievementInput() {
    return {
      stats: store.stats,
      cards: store.allCards(),
      used: store.freezes.used,
      dailyGoal: store.settings.dailyGoal,
    };
  }

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

  // Je XP moet zichtbaar bewegen terwijl je bezig bent; anders is een niveau
  // alleen een woord dat je achteraf ergens leest.
  const levelFill = el('i');
  const levelText = el('span');
  const levelStrip = el('a', { class: 'level-strip', href: '#/stats' }, [
    el('div', { class: 'row', style: 'justify-content:space-between;flex-wrap:nowrap;margin-bottom:5px' }, [
      el('span', { class: 'small', style: 'font-weight:700', id: 'level-name' }),
      levelText,
    ]),
    el('div', { class: 'bar' }, [levelFill]),
  ]);
  const hint = el('div', { class: 'kbd-hint', text: 'Spatie = omdraaien · 1-4 = beoordelen · Backspace = nog eens bekijken · E = bewerken · U = ongedaan maken' });
  root.append(stage, levelStrip, hint);

  let level = levelInfo(totalXp(store.stats));

  function paintLevel() {
    level = levelInfo(totalXp(store.stats));
    levelStrip.querySelector('#level-name').textContent = `${level.tier} · niveau ${level.level}`;
    levelText.className = 'small muted';
    levelText.textContent = `${level.into}/${level.needed} XP`;
    levelFill.style.width = `${level.progressPct}%`;
  }

  /**
   * Kort "+5 XP" dat omhoog zweeft. Hangt bewust in de body: het speelveld
   * wordt meteen na het antwoord leeggemaakt voor de volgende kaart.
   */
  function flashXp(amount, bonus) {
    const bubble = el('div', { class: 'xp-bubble', text: `+${amount} XP` });
    document.body.append(bubble);
    setTimeout(() => bubble.remove(), 1100);
    if (bonus) toast(`Dagdoel gehaald — bonus van ${XP_DAILY_GOAL} XP`, 3200);
  }

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

  /** Knopjes rechtsboven op een kaartzijde; die mogen de kaart niet omdraaien. */
  function faceTools(side) {
    return el('div', { class: 'face-tools', onclick: (event) => event.stopPropagation() }, [
      el('button', {
        class: 'face-tool',
        'aria-label': side === 'front' ? 'Vraag bewerken' : 'Antwoord bewerken',
        title: 'Bewerken',
        onclick: () => startEdit(side),
      }, [icon('pencil', 15)]),
      el('button', {
        class: 'face-tool danger',
        'aria-label': 'Kaart verwijderen',
        title: 'Verwijderen',
        onclick: removeCard,
      }, [icon('trash', 15)]),
    ]);
  }

  function faceContent(side) {
    if (side === 'front') {
      return [
        faceTools('front'),
        el('span', { class: 'kicker', text: card.type === 'cloze' ? 'Vul aan' : 'Vraag' }),
        el('div', { class: 'qa-text', html: questionHtml(card) }),
        card.hint && card.type !== 'cloze' ? el('div', { class: 'qa-hint', text: card.hint }) : null,
        el('span', { class: 'tap-hint', text: 'Tik om het antwoord te zien' }),
      ];
    }
    return [
      faceTools('back'),
      el('span', { class: 'kicker', text: 'Antwoord' }),
      el('div', { class: 'qa-text', html: answerHtml(card) }),
      card.note ? el('div', { class: 'qa-note', html: renderMarkup(card.note) }) : null,
      card.tags?.length ? el('div', { class: 'tag-row' }, card.tags.map((t) => el('span', { class: 'tag', text: t }))) : null,
    ];
  }

  /** Tekent één zijde opnieuw, zonder de kaart om te klappen. */
  function paintFace(side) {
    const face = stage.querySelector(`.face.${side}`);
    if (face) appendAll(clear(face), faceContent(side));
  }

  function showCard() {
    revealed = false;
    editing = false;

    session.shownAt = Date.now();

    const flip = el('div', { class: 'flip', onclick: () => (revealed ? peekFlip() : reveal()) }, [
      el('div', { class: 'flip-inner' }, [
        el('div', { class: 'face front' }, faceContent('front')),
        el('div', { class: 'face back' }, faceContent('back')),
      ]),
    ]);

    const showBtn = el('button', { class: 'btn btn-primary reveal-btn', onclick: () => reveal(), text: 'Toon antwoord' });
    clear(stage).append(flip, showBtn);
    stage.dataset.state = 'question';
    updateChrome();
  }

  /**
   * Bewerken gebeurt in de kaart zelf: de tekst wordt een invoerveld met de
   * cursor erin. Bij een cloze-kaart bewerken beide zijden dezelfde zin.
   */
  function startEdit(side) {
    if (!card || editing) return;
    editing = true;

    const face = stage.querySelector(`.face.${side}`);
    const target = face?.querySelector('.qa-text');
    if (!target) { editing = false; return; }

    const isCloze = card.type === 'cloze';
    const current = isCloze ? card.text : side === 'front' ? card.front : card.back;

    const area = el('textarea', { class: 'qa-edit', rows: '3', 'aria-label': 'Tekst van de kaart' });
    area.value = current;

    // De knop "Toon antwoord" doet tijdens het bewerken niets; laat dat ook zien.
    const revealBtn = stage.querySelector('.reveal-btn');
    if (revealBtn) revealBtn.disabled = true;

    const stop = () => {
      editing = false;
      if (revealBtn) revealBtn.disabled = false;
      paintFace('front');
      paintFace('back');
    };

    const save = () => {
      const text = area.value.trim();
      if (!text) return toast('De tekst mag niet leeg zijn');
      if (text !== current) {
        store.updateCard(card.id, isCloze ? { text } : side === 'front' ? { front: text } : { back: text });
        toast('Opgeslagen');
      }
      stop();
    };

    const editor = el('div', { class: 'qa-editor', onclick: (event) => event.stopPropagation() }, [
      area,
      el('div', { class: 'row', style: 'flex-wrap:nowrap;justify-content:center' }, [
        el('button', { class: 'btn btn-secondary btn-sm', text: 'Annuleren', onclick: stop }),
        el('button', { class: 'btn btn-primary btn-sm', text: 'Opslaan', onclick: save }),
      ]),
      isCloze ? el('span', { class: 'small muted', text: 'Gaten schrijf je als {{c1::antwoord}}' }) : null,
    ]);

    target.replaceWith(editor);
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);

    area.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); stop(); }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
    });
  }

  async function removeCard() {
    if (!card || editing) return;
    const ok = await confirmDialog({
      title: 'Deze kaart verwijderen?',
      message: cardSummary(card),
      confirmLabel: 'Verwijderen',
      danger: true,
    });
    if (!ok) return;
    store.deleteCard(card.id);
    toast('Kaart verwijderd');
    next();
  }

  function reveal() {
    if (!card || revealed || editing) return;
    revealed = true;
    stage.querySelector('.flip')?.classList.add('revealed');
    const preview = previewIntervals(card.srs, Date.now(), store.settings.srs);
    const grades = el('div', { class: 'grades' },
      GRADES.map((g) =>
        el('button', { class: 'grade', dataset: { rating: g.rating }, onclick: () => answer(g.rating) }, [
          el('span', { text: g.label }),
          el('small', { text: preview[g.rating] }),
        ])));
    peekBtn = el('button', { class: 'btn btn-secondary btn-sm peek-btn', onclick: peekFlip }, [icon('flip', 14), ' Nog eens bekijken']);
    const peekRow = el('div', { class: 'row', style: 'justify-content:center;margin-bottom:var(--space-2)' }, [peekBtn]);
    stage.lastElementChild.replaceWith(peekRow, grades);
    stage.dataset.state = 'answer';
  }

  /**
   * Zolang je nog niet hebt beoordeeld mag je terugklappen naar de vraag om
   * hem nog eens te lezen — dat telt niet mee als beoordelen.
   */
  function peekFlip() {
    if (!card || !revealed || editing) return;
    const flip = stage.querySelector('.flip');
    if (!flip) return;
    const showingBack = flip.classList.toggle('revealed');
    if (peekBtn) appendAll(clear(peekBtn), icon('flip', 14), showingBack ? ' Nog eens bekijken' : ' Terug naar het antwoord');
  }

  function answer(rating) {
    if (!card || !revealed) return;
    const before = level.level;
    const result = store.answer(card.id, rating, Date.now(), Date.now() - session.shownAt);
    session.answered++;
    if (rating >= RATING.HARD) session.correct++;
    flashXp(result.xp, result.goalBonus);
    paintLevel();
    if (level.level > before) {
      session.levelUp = { ...level };
      toast(`Niveau ${level.level} — ${level.tier}`, 3200);
    }
    next();
  }

  function doUndo() {
    const restored = store.undo();
    if (!restored) return;
    session.answered = Math.max(0, session.answered - 1);
    card = restored;
    showCard();
    reveal();
    paintLevel();
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
    levelStrip.style.display = 'none';
    if (session.answered) syncQuietly();

    const accuracyPct = session.answered ? Math.round((session.correct / session.answered) * 100) : 0;
    const gainedXp = Math.max(0, totalXp(store.stats) - session.xpStart);
    const days = streak(store.stats, { used: store.freezes.used, cutoffHour: cutoff });
    const goal = dailyProgress(store.stats, store.settings.dailyGoal, Date.now(), cutoff);
    const fresh = newlyEarned(session.tiersStart, achievements(achievementInput(), Date.now(), cutoff))[0];
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
        session.levelUp
          ? el('div', { class: 'levelup' }, [
              el('div', { class: 'levelup-badge', text: String(session.levelUp.level) }),
              el('div', {}, [
                el('div', { style: 'font-weight:700;font-size:13px', text: `Niveau ${session.levelUp.level} bereikt` }),
                el('div', { style: 'font-size:12px;opacity:.85', text: `${session.levelUp.tier} — ${session.levelUp.description || ''}`.trim().replace(/ —$/, '') }),
              ]),
            ])
          : el('div', { style: 'margin-bottom:var(--space-4);text-align:left' }, [
              el('div', { class: 'small muted', style: 'margin-bottom:6px', text: `${level.tier} · niveau ${level.level} — nog ${level.needed - level.into} XP tot niveau ${level.level + 1}` }),
              el('div', { class: 'bar' }, [el('i', { style: `width:${level.progressPct}%` })]),
            ]),
        fresh
          ? el('div', { class: 'unlock' }, [
              icon('medal', 22),
              el('div', {}, [
                el('div', { style: 'font-weight:700;font-size:13px', text: `${fresh.tierName} ontgrendeld` }),
                el('div', { style: 'font-size:12px;opacity:.85', text: `${fresh.name} — ${fresh.value} ${fresh.unit}` }),
              ]),
            ])
          : null,
        session.answered
          ? el('div', { style: 'margin-bottom:var(--space-4)' }, [
              el('div', { class: 'small muted', style: 'margin-bottom:6px', text: goal.reached ? `Dagdoel gehaald: ${goal.done} van ${goal.goal} kaarten` : `Dagdoel: ${goal.done} van ${goal.goal} kaarten` }),
              el('div', { class: 'bar' }, [el('i', { style: `width:${goal.progressPct}%;background:${goal.reached ? 'var(--color-accent-2-500)' : 'var(--color-accent)'}` })]),
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
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      peekFlip();
    } else if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      startEdit(stage.querySelector('.flip')?.classList.contains('revealed') ? 'back' : 'front');
    } else if (event.key.toLowerCase() === 'u') {
      doUndo();
    } else if (event.key === 'Escape') {
      navigate(deck ? `#/deck/${deck.id}` : '#/');
    }
  }

  document.addEventListener('keydown', onKey);
  paintLevel();
  next();

  return () => document.removeEventListener('keydown', onKey);
}
