import { store } from '../store.js';
import {
  totalXp, levelInfo, streak, calendar, weekly, achievements, mastery, accuracy,
  dailyProgress, freezesAvailable, tierLadder, MAX_FREEZES,
} from '../gamify.js';
import { el, appendAll, plural } from '../ui.js';
import { icon } from '../icons.js';
import { navigate } from '../app.js';

const HEAT = ['var(--color-neutral-200)', 'var(--color-accent-300)', 'var(--color-accent-500)', 'var(--color-accent-700)'];

function barColor(pct) {
  if (pct === null) return 'var(--color-neutral-200)';
  if (pct >= 80) return 'var(--color-accent-2-500)';
  if (pct >= 50) return 'var(--color-accent-500)';
  return 'var(--color-accent-300)';
}

/** Ring met een percentage erin; gebruikt voor het dagdoel. */
function ring(pct, label, sub) {
  const size = 92;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, pct / 100));
  return el('div', { class: 'goal-ring' }, [
    el('div', {
      class: 'ring-svg',
      html: `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none"
          stroke="var(--color-neutral-200)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none"
          stroke="${pct >= 100 ? 'var(--color-accent-2-500)' : 'var(--color-accent)'}" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${circumference.toFixed(1)}"
          stroke-dashoffset="${offset.toFixed(1)}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>`,
    }),
    el('div', { class: 'ring-label' }, [
      el('strong', { text: label }),
      sub ? el('span', { text: sub }) : null,
    ]),
  ]);
}

function achievementRow(item) {
  return el('div', { class: `achievement ${item.tier ? '' : 'locked'}` }, [
    el('div', { class: `icon tier-${item.tier}` }, [icon('medal', 20)]),
    el('div', { class: 'grow' }, [
      el('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap;align-items:baseline' }, [
        el('div', { class: 'grow', style: 'font-size:13px;font-weight:700', text: item.name }),
        item.tierName ? el('span', { class: 'badge-pill done', text: item.tierName }) : null,
      ]),
      el('div', { class: 'small muted', text: item.complete
        ? `Alles behaald — ${item.value} ${item.unit}`
        : `${item.value} van ${item.goal} ${item.unit}` }),
      item.complete ? null : el('div', { class: 'bar', style: 'margin-top:6px' }, [el('i', { style: `width:${item.progressPct}%` })]),
      item.complete || !item.nextTierName
        ? null
        : el('div', { class: 'small muted', style: 'margin-top:4px', text: `Nog ${item.remaining} voor ${item.nextTierName}` }),
    ]),
  ]);
}

function stat(value, label) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'num', text: String(value) }),
    el('div', { class: 'lbl', text: label }),
  ]);
}

export function mount(root) {
  const cutoff = store.settings.dayCutoffHour;
  const cards = store.allCards();
  const used = store.freezes.used;
  const xp = totalXp(store.stats);
  const level = levelInfo(xp);
  const days = streak(store.stats, { used, cutoffHour: cutoff });
  const goal = dailyProgress(store.stats, store.settings.dailyGoal, Date.now(), cutoff);
  const today = store.today();
  const mature = cards.filter((c) => c.srs.state === 'review' && c.srs.interval >= 21).length;
  const freezes = freezesAvailable(store.stats, used);

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
  const list = achievements({ stats: store.stats, cards, used, dailyGoal: store.settings.dailyGoal }, Date.now(), cutoff);

  // Bijna-af eerst: dat is wat je vandaag nog kunt halen.
  const sorted = [...list].sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    return b.progressPct - a.progressPct;
  });

  appendAll(
    root,
    el('h1', { text: 'Jouw voortgang' }),

    el('div', { class: 'panel level-panel' }, [
      el('div', { class: 'level-ring', title: `Niveau ${level.level}` }, [String(level.level)]),
      el('div', { class: 'grow', style: 'min-width:180px' }, [
        el('div', { style: 'font-size:16px;font-family:var(--font-heading)', text: level.tier }),
        el('div', { class: 'small muted', style: 'margin-bottom:2px', text: level.description }),
        el('div', { class: 'small muted', style: 'margin-bottom:6px', text: `Niveau ${level.level} · ${xp} XP` }),
        el('div', { class: 'bar tall' }, [el('i', { style: `width:${level.progressPct}%` })]),
        el('div', { class: 'small muted', style: 'margin-top:6px', text: level.nextTier
          ? `Nog ${level.needed - level.into} XP tot niveau ${level.level + 1} · ${level.nextTier.name} vanaf niveau ${level.nextTier.from}`
          : `Nog ${level.needed - level.into} XP tot niveau ${level.level + 1}` }),
      ]),
    ]),

    el('div', { class: 'panel' }, [
      el('h4', { text: 'De ladder' }),
      el('p', { class: 'small muted', style: 'margin-top:0', text: 'Elk niveau kost meer XP dan het vorige. Waar je nu staat:' }),
      el('div', { class: 'ladder' },
        tierLadder(level.level).map((tier) =>
          el('div', { class: `rung ${tier.current ? 'current' : ''} ${tier.reached ? 'reached' : ''}` }, [
            el('div', { class: 'rung-dot' }),
            el('div', { class: 'grow' }, [
              el('div', { style: 'font-family:var(--font-heading);font-size:15px' }, [
                tier.name,
                el('span', { class: 'small muted', text: `  niveau ${tier.from}${tier.to ? `–${tier.to}` : ' en verder'}` }),
              ]),
              el('div', { class: 'small muted', text: tier.description }),
            ]),
            tier.current ? el('span', { class: 'badge-pill due', text: 'nu' }) : null,
          ]))),
    ]),

    el('div', { class: 'panel', style: 'display:flex;gap:var(--space-4);align-items:center;flex-wrap:wrap' }, [
      ring(goal.progressPct, `${goal.done}/${goal.goal}`, 'vandaag'),
      el('div', { class: 'grow', style: 'min-width:170px' }, [
        el('div', { style: 'font-family:var(--font-heading);font-size:16px', text: goal.reached ? 'Dagdoel gehaald' : 'Dagdoel' }),
        el('p', { class: 'small muted', style: 'margin:4px 0 var(--space-2)', text: goal.reached
          ? 'Mooi. Doorgaan mag, maar het hoeft niet meer.'
          : `Nog ${goal.goal - goal.done} ${goal.goal - goal.done === 1 ? 'kaart' : 'kaarten'} te gaan. Aan te passen bij Instellingen.` }),
        el('div', { class: 'row' }, [
          el('div', { class: 'chip flame' }, [icon('flame'), `${days} ${days === 1 ? 'dag' : 'dagen'} op rij`]),
          el('div', { class: 'chip olive', title: `Een vriezer redt je reeks als je een dag mist. Je verdient er een per 5 geoefende dagen, maximaal ${MAX_FREEZES}.` }, [
            `${freezes} ${freezes === 1 ? 'vriezer' : 'vriezers'}`,
          ]),
        ]),
      ]),
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
              class: used[new Date(cell.ts).toISOString().slice(0, 10)] ? 'frozen' : null,
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

    el('h2', { class: 'section-title', text: 'Prestaties' }),
    el('div', { class: 'achievements' }, sorted.map(achievementRow)),

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
