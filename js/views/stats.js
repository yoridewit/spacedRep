import { store } from '../store.js';
import { totalXp, levelInfo, streak, calendar, weekly, badges, mastery, accuracy } from '../gamify.js';
import { el, plural } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../app.js';

const HEAT = ['var(--color-neutral-200)', 'var(--color-accent-300)', 'var(--color-accent-500)', 'var(--color-accent-700)'];

function barColor(pct) {
  if (pct === null) return 'var(--color-neutral-200)';
  if (pct >= 80) return 'var(--color-accent-2-500)';
  if (pct >= 50) return 'var(--color-accent-500)';
  return 'var(--color-accent-300)';
}

export function mount(root) {
  const cutoff = store.settings.dayCutoffHour;
  const cards = store.allCards();
  const xp = totalXp(store.stats);
  const level = levelInfo(xp);
  const days = streak(store.stats, Date.now(), cutoff);
  const today = store.today();
  const mature = cards.filter((c) => c.srs.state === 'review' && c.srs.interval >= 21).length;

  if (!cards.length) {
    root.append(
      el('section', { class: 'empty' }, [
        el('div', { class: 'big', text: '📈' }),
        el('h1', { text: 'Nog niets te zien' }),
        el('p', { class: 'muted', text: 'Zodra je kaarten hebt geoefend verschijnt hier je voortgang.' }),
        el('button', { class: 'btn btn-primary', onclick: () => navigate('#/add'), text: 'Kaarten toevoegen' }),
      ])
    );
    return;
  }

  const heat = calendar(store.stats, 5, Date.now(), cutoff);
  const week = weekly(store.stats, Date.now(), cutoff);
  const badgeList = badges({ stats: store.stats, cards }, Date.now(), cutoff);

  root.append(
    el('h1', { text: 'Jouw voortgang' }),

    el('div', { class: 'panel', style: 'display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap' }, [
      el('div', { class: 'level-ring', text: String(level.level) }),
      el('div', { style: 'flex:1;min-width:180px' }, [
        el('div', { style: 'font-size:13px;font-weight:700;margin-bottom:6px', text: `Niveau ${level.level} · ${xp} XP` }),
        el('div', { class: 'bar tall' }, [el('i', { style: `width:${level.progressPct}%` })]),
        el('div', { class: 'small muted', style: 'margin-top:6px', text: `Nog ${level.needed - level.into} XP tot niveau ${level.level + 1}` }),
      ]),
      el('div', { class: 'chip flame' }, [icon('flame'), `${days} ${days === 1 ? 'dag' : 'dagen'} op rij`]),
    ]),

    el('div', { class: 'stat-cards', style: 'margin-bottom:var(--space-4)' }, [
      stat(today.reviews, 'Vandaag'),
      stat(accuracy(today) === null ? '–' : `${accuracy(today)}%`, 'Score vandaag'),
      stat(cards.length, 'Kaarten'),
      stat(mature, 'Beklijfd'),
    ]),

    el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-4)' }, [
      el('div', { class: 'panel' }, [
        el('h4', { text: 'Oefenkalender' }),
        el('div', { class: 'calendar' },
          heat.map((cell) =>
            el('div', {
              style: `background:${HEAT[cell.level]}`,
              title: `${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' }).format(new Date(cell.ts))}: ${cell.reviews}`,
            }))),
        el('div', { class: 'legend' }, [
          el('span', { text: 'Minder' }),
          ...HEAT.map((color) => el('i', { style: `background:${color}` })),
          el('span', { text: 'Meer' }),
        ]),
      ]),

      el('div', { class: 'panel' }, [
        el('h4', { text: 'Score deze week' }),
        el('div', { class: 'week' },
          week.map((day) =>
            el('div', { class: 'col' }, [
              el('i', {
                style: `height:${day.accuracy ?? 0}%;background:${barColor(day.accuracy)}`,
                title: day.reviews ? `${day.reviews} kaarten · ${day.accuracy}%` : 'niets geoefend',
              }),
              el('span', { text: day.label }),
            ]))),
      ]),
    ]),

    el('h2', { class: 'section-title', text: 'Badges' }),
    el('div', { class: 'badges' },
      badgeList.map((b) =>
        el('div', { class: `badge ${b.unlocked ? '' : 'locked'}` }, [
          el('div', { class: 'icon' }, [icon('medal', 20)]),
          el('div', {}, [
            el('div', { style: 'font-size:13px;font-weight:700', text: b.name }),
            el('div', { class: 'small muted', text: b.desc }),
          ]),
        ]))),

    el('h2', { class: 'section-title', text: 'Decks' }),
    el('div', { style: 'display:flex;flex-direction:column;gap:var(--space-2)' },
      store.listDecks().map((deck) => {
        const pct = mastery(store.deckCards(deck.id));
        return el('div', { class: 'deck-progress' }, [
          el('span', { class: 'name', text: deck.name }),
          el('div', { class: 'bar grow' }, [el('i', { style: `width:${pct}%` })]),
          el('span', { class: 'small muted', style: 'width:40px;text-align:right', text: `${pct}%` }),
        ]);
      })),

    el('p', { class: 'small muted', style: 'margin-top:var(--space-6)', text: `In totaal ${plural(cards.length, 'kaart', 'kaarten')} verdeeld over ${plural(store.listDecks().length, 'deck', 'decks')}.` })
  );
}

function stat(value, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'num', text: String(value) }),
    el('div', { class: 'lbl', text: label }),
  ]);
}
