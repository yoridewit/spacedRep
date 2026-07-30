/**
 * Streak, XP, niveaus en badges. Alles wordt afgeleid uit de dagstatistiek die
 * de store toch al bijhoudt — er is dus niets extra's om kwijt te raken.
 */

import { dayKey, DAY } from './srs.js';
import { dayTotal } from './daystats.js';

export const XP_PER_ANSWER = 2;
export const XP_CORRECT_BONUS = 1;
export const XP_NEW_CARD_BONUS = 3;
export const XP_PER_LEVEL = 120;

export function xpForAnswer(rating, wasNew) {
  return XP_PER_ANSWER + (rating >= 3 ? XP_CORRECT_BONUS : 0) + (wasNew ? XP_NEW_CARD_BONUS : 0);
}

export function totalXp(stats) {
  return Object.values(stats).reduce((sum, day) => sum + dayTotal(day).xp, 0);
}

export function levelInfo(xp) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const into = xp % XP_PER_LEVEL;
  return { level, xp, into, needed: XP_PER_LEVEL, progressPct: Math.round((into / XP_PER_LEVEL) * 100) };
}

/** Aantal aaneengesloten dagen met minstens één beantwoorde kaart. */
export function streak(stats, now = Date.now(), cutoffHour = 4) {
  let count = 0;
  for (let i = 0; i < 3650; i++) {
    const key = dayKey(now - i * DAY, cutoffHour);
    const day = dayTotal(stats[key]);
    if (day.reviews) count++;
    else if (i > 0) break; // vandaag nog niets gedaan telt niet als onderbreking
  }
  return count;
}

/** Score van een dag (of van een al opgeteld totaal). */
export function accuracy(day) {
  const total = dayTotal(day);
  if (!total.reviews) return null;
  return Math.round(((total.reviews - total.again) / total.reviews) * 100);
}

/** Percentage van een deck dat "onder de knie" is: rijp telt vol, jong half. */
export function mastery(cards) {
  if (!cards.length) return 0;
  let score = 0;
  for (const card of cards) {
    const s = card.srs;
    if (s.state !== 'review') continue;
    score += s.interval >= 21 ? 1 : 0.5;
  }
  return Math.round((score / cards.length) * 100);
}

/** Vijf weken activiteit voor de kalender, oudste eerst. */
export function calendar(stats, weeks = 5, now = Date.now(), cutoffHour = 4) {
  const days = weeks * 7;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const ts = now - i * DAY;
    const reviews = dayTotal(stats[dayKey(ts, cutoffHour)]).reviews;
    out.push({ ts, reviews, level: reviews === 0 ? 0 : reviews < 10 ? 1 : reviews < 30 ? 2 : 3 });
  }
  return out;
}

const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

/** Score per dag over de laatste zeven dagen. */
export function weekly(stats, now = Date.now(), cutoffHour = 4) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const ts = now - i * DAY;
    const day = dayTotal(stats[dayKey(ts, cutoffHour)]);
    out.push({
      label: WEEKDAYS[new Date(ts).getDay()],
      reviews: day.reviews,
      accuracy: accuracy(day),
    });
  }
  return out;
}

const BADGES = [
  { id: 'start', name: 'Eerste stap', desc: 'Je eerste kaart beantwoord', test: (c) => c.answered >= 1 },
  { id: 'honderd', name: 'Op dreef', desc: '100 kaarten beantwoord', test: (c) => c.answered >= 100 },
  { id: 'duizend', name: 'Doorbijter', desc: '1000 kaarten beantwoord', test: (c) => c.answered >= 1000 },
  { id: 'week', name: 'Volle week', desc: '7 dagen op rij geoefend', test: (c) => c.streak >= 7 },
  { id: 'maand', name: 'Maandmaker', desc: '30 dagen op rij geoefend', test: (c) => c.streak >= 30 },
  { id: 'scherp', name: 'Scherpschutter', desc: '90% score op een dag met 20+ kaarten', test: (c) => c.sharpDay },
  { id: 'rijp', name: 'Beklijfd', desc: '50 kaarten met een interval van 3 weken of meer', test: (c) => c.mature >= 50 },
  { id: 'bieb', name: 'Verzamelaar', desc: '500 kaarten in je decks', test: (c) => c.cards >= 500 },
];

/**
 * @param {{stats: object, cards: Array}} ctx
 * @returns {Array<{id, name, desc, unlocked}>}
 */
export function badges({ stats, cards }, now = Date.now(), cutoffHour = 4) {
  const days = Object.values(stats).map(dayTotal);
  const context = {
    answered: days.reduce((n, d) => n + d.reviews, 0),
    streak: streak(stats, now, cutoffHour),
    sharpDay: days.some((d) => d.reviews >= 20 && accuracy(d) >= 90),
    mature: cards.filter((c) => c.srs.state === 'review' && c.srs.interval >= 21).length,
    cards: cards.length,
  };
  return BADGES.map((b) => ({ id: b.id, name: b.name, desc: b.desc, unlocked: Boolean(b.test(context)) }));
}

export function unlockedIds(list) {
  return new Set(list.filter((b) => b.unlocked).map((b) => b.id));
}
