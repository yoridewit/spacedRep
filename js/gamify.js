/**
 * Voortgang: XP, niveaus, dagdoel, streak (met vriezer) en prestaties.
 *
 * Alles wordt afgeleid uit de dagstatistiek en de kaarten die de store toch al
 * bijhoudt; het enige dat apart wordt opgeslagen zijn de gebruikte vriezers.
 *
 * Drie keuzes, met reden:
 *
 * 1. XP beloont onthouden, niet doorklikken. Een kaart die je al weken kent en
 *    nog steeds goed hebt levert het meest op; een kaart wegklikken met
 *    "Opnieuw" levert alleen het minimum. Anders wordt het interessant om veel
 *    makkelijke kaarten te malen, en dat is precies wat de kritiek op dit soort
 *    systemen is: de teller loopt terwijl je niets leert.
 *
 * 2. Niveaus worden langzamer, met een naam per fase. Een getal dat eeuwig
 *    doortelt zegt niets; "Struik" of "Woud" onthoud je wel.
 *
 * 3. Een streak mag niet breken door één drukke dag. Je verdient vriezers door
 *    vol te houden en die worden automatisch ingezet — de bekendste reden dat
 *    mensen na een gemiste dag tóch terugkomen.
 */

import { dayKey, DAY, RATING } from './srs.js';
import { dayTotal } from './daystats.js';

// ── XP ───────────────────────────────────────────────────────────────────

export const XP_SEEN = 1;          // je hebt de kaart gezien
export const XP_CORRECT = 2;       // en je wist hem
export const XP_MATURE_BONUS = 2;  // een kaart die je al weken kent
export const XP_NEW_CARD = 3;      // iets nieuws geleerd
export const XP_DAILY_GOAL = 10;   // dagdoel gehaald

export const MATURE_DAYS = 21;

/**
 * @param {number} rating
 * @param {{wasNew?: boolean, mature?: boolean}} context
 */
export function xpForAnswer(rating, context = {}) {
  const { wasNew = false, mature = false } = typeof context === 'boolean' ? { wasNew: context } : context;
  let xp = XP_SEEN;
  if (rating >= RATING.GOOD) {
    xp += XP_CORRECT;
    if (mature) xp += XP_MATURE_BONUS;
  }
  if (wasNew) xp += XP_NEW_CARD;
  return xp;
}

export function totalXp(stats) {
  return Object.values(stats).reduce((sum, day) => sum + dayTotal(day).xp, 0);
}

// ── niveaus ──────────────────────────────────────────────────────────────

export const TIERS = [
  { from: 1, name: 'Zaadje', description: 'Je eerste kaarten' },
  { from: 5, name: 'Spruit', description: 'Het begint te lopen' },
  { from: 10, name: 'Struik', description: 'Je hebt er een gewoonte van gemaakt' },
  { from: 20, name: 'Boom', description: 'Stevig geworteld' },
  { from: 35, name: 'Woud', description: 'Een heel bos aan kennis' },
  { from: 50, name: 'Oerbos', description: 'Zeldzaam gebied' },
];

/** Wat niveau `level` kost om te halen. Elk niveau wordt iets duurder. */
export function xpToNext(level) {
  return 50 * Math.max(1, level);
}

/** De hele ladder, met de fase waar je nu in zit gemarkeerd. */
export function tierLadder(level) {
  return TIERS.map((tier, index) => {
    const next = TIERS[index + 1];
    return {
      ...tier,
      to: next ? next.from - 1 : null,
      current: level >= tier.from && (!next || level < next.from),
      reached: level >= tier.from,
    };
  });
}

export function tierFor(level) {
  let found = TIERS[0];
  for (const tier of TIERS) if (level >= tier.from) found = tier;
  return found;
}

function nextTierFor(level) {
  return TIERS.find((tier) => tier.from > level) || null;
}

export function levelInfo(xp) {
  let level = 1;
  let rest = Math.max(0, xp);
  while (rest >= xpToNext(level) && level < 500) {
    rest -= xpToNext(level);
    level++;
  }
  const needed = xpToNext(level);
  return {
    xp,
    level,
    into: rest,
    needed,
    progressPct: Math.round((rest / needed) * 100),
    tier: tierFor(level).name,
    description: tierFor(level).description,
    nextTier: nextTierFor(level),
  };
}

// ── dagdoel ──────────────────────────────────────────────────────────────

export const DEFAULT_DAILY_GOAL = 20;

export function dailyProgress(stats, goal = DEFAULT_DAILY_GOAL, now = Date.now(), cutoffHour = 4) {
  const done = dayTotal(stats[dayKey(now, cutoffHour)]).reviews;
  const target = Math.max(1, goal);
  return { done, goal: target, reached: done >= target, progressPct: Math.min(100, Math.round((done / target) * 100)) };
}

// ── streak, met vriezer ──────────────────────────────────────────────────

export const MAX_FREEZES = 2;
export const DAYS_PER_FREEZE = 5;

const studied = (stats, key) => dayTotal(stats[key]).reviews > 0;

/**
 * Aaneengesloten dagen. Een dag telt mee als je geoefend hebt, of als er een
 * vriezer op staat. Vandaag nog niets gedaan breekt de reeks niet.
 */
export function streak(stats, { used = {}, now = Date.now(), cutoffHour = 4 } = {}) {
  let count = 0;
  for (let i = 0; i < 3650; i++) {
    const key = dayKey(now - i * DAY, cutoffHour);
    if (studied(stats, key)) count++;
    else if (used[key]) count++;
    else if (i > 0) break;
  }
  return count;
}

/** Verdiende vriezers: eentje per vijf geoefende dagen, maximaal twee op voorraad. */
export function freezesAvailable(stats, used = {}) {
  const days = Object.keys(stats).filter((key) => studied(stats, key)).length;
  const earned = Math.floor(days / DAYS_PER_FREEZE);
  return Math.max(0, Math.min(MAX_FREEZES, earned - Object.keys(used).length));
}

/**
 * Bepaalt of er een vriezer op gisteren gezet moet worden. Alleen gisteren:
 * een reeks van vorige week repareren zou de streak betekenisloos maken.
 * @returns {string|null} de dag die bevroren moet worden
 */
export function freezeToApply(stats, used = {}, now = Date.now(), cutoffHour = 4) {
  const yesterday = dayKey(now - DAY, cutoffHour);
  if (studied(stats, yesterday) || used[yesterday]) return null;
  const before = dayKey(now - 2 * DAY, cutoffHour);
  if (!studied(stats, before) && !used[before]) return null; // er was geen reeks om te redden
  if (freezesAvailable(stats, used) <= 0) return null;
  return yesterday;
}

// ── overige afgeleiden ───────────────────────────────────────────────────

export function accuracy(day) {
  const total = dayTotal(day);
  if (!total.reviews) return null;
  return Math.round(((total.reviews - total.again) / total.reviews) * 100);
}

/**
 * Percentage van een deck dat "onder de knie" is: rijp telt vol, en tussen het
 * afstuderen uit de leerfase en rijp worden loopt het krediet geleidelijk op
 * (anders staat de balk weken lang vast op precies 50%, wat lijkt op een fout).
 */
export function mastery(cards) {
  if (!cards.length) return 0;
  let score = 0;
  for (const card of cards) {
    const s = card.srs;
    if (s.state !== 'review') continue;
    score += s.interval >= MATURE_DAYS ? 1 : 0.5 + 0.5 * Math.min(1, s.interval / MATURE_DAYS);
  }
  return Math.round((score / cards.length) * 100);
}

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

export function weekly(stats, now = Date.now(), cutoffHour = 4) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const ts = now - i * DAY;
    const day = dayTotal(stats[dayKey(ts, cutoffHour)]);
    out.push({ label: WEEKDAYS[new Date(ts).getDay()], reviews: day.reviews, accuracy: accuracy(day) });
  }
  return out;
}

// ── prestaties ───────────────────────────────────────────────────────────

const TIER_NAMES = ['Brons', 'Zilver', 'Goud', 'Meester'];

const ACHIEVEMENTS = [
  {
    id: 'volhouder',
    name: 'Volhouder',
    unit: 'dagen op rij',
    tiers: [3, 7, 30, 100],
    value: (c) => c.streak,
  },
  {
    id: 'kilometers',
    name: 'Kilometervreter',
    unit: 'kaarten beantwoord',
    tiers: [100, 1000, 5000, 20000],
    value: (c) => c.answered,
  },
  {
    id: 'beklijfd',
    name: 'Beklijfd',
    unit: 'kaarten die je al 3 weken kent',
    tiers: [25, 100, 500, 2000],
    value: (c) => c.mature,
  },
  {
    id: 'scherp',
    name: 'Scherpschutter',
    unit: 'dagen met 90% of hoger (bij 20+ kaarten)',
    tiers: [1, 10, 50, 200],
    value: (c) => c.sharpDays,
  },
  {
    id: 'doelbewust',
    name: 'Doelbewust',
    unit: 'dagen je dagdoel gehaald',
    tiers: [5, 25, 100, 365],
    value: (c) => c.goalDays,
  },
  {
    id: 'verzamelaar',
    name: 'Verzamelaar',
    unit: 'kaarten in je decks',
    tiers: [100, 500, 2000, 10000],
    value: (c) => c.cards,
  },
];

/**
 * @param {{stats: object, cards: Array, used?: object, dailyGoal?: number}} input
 * @returns {Array} prestaties met hun huidige trede en de voortgang naar de volgende
 */
export function achievements({ stats, cards, used = {}, dailyGoal = DEFAULT_DAILY_GOAL }, now = Date.now(), cutoffHour = 4) {
  const days = Object.values(stats).map(dayTotal);
  const context = {
    streak: streak(stats, { used, now, cutoffHour }),
    answered: days.reduce((n, d) => n + d.reviews, 0),
    mature: cards.filter((c) => c.srs.state === 'review' && c.srs.interval >= MATURE_DAYS).length,
    sharpDays: days.filter((d) => d.reviews >= 20 && accuracy(d) >= 90).length,
    goalDays: days.filter((d) => d.reviews >= Math.max(1, dailyGoal)).length,
    cards: cards.length,
  };

  return ACHIEVEMENTS.map((achievement) => {
    const value = achievement.value(context);
    const reached = achievement.tiers.filter((threshold) => value >= threshold).length;
    const next = achievement.tiers[reached] ?? null;
    const previous = reached > 0 ? achievement.tiers[reached - 1] : 0;
    const span = next ? next - previous : 1;
    return {
      id: achievement.id,
      name: achievement.name,
      unit: achievement.unit,
      value,
      tier: reached,                                   // 0 = nog niet behaald
      tierName: reached > 0 ? TIER_NAMES[reached - 1] : null,
      nextTierName: next ? TIER_NAMES[reached] : null,
      goal: next,
      progressPct: next ? Math.min(100, Math.round(((value - previous) / span) * 100)) : 100,
      remaining: next ? Math.max(0, next - value) : 0,
      complete: next === null,
    };
  });
}

/** Momentopname om na een sessie te kunnen zien wat er nieuw is. */
export function achievementTiers(list) {
  return Object.fromEntries(list.map((a) => [a.id, a.tier]));
}

export function newlyEarned(before = {}, after = []) {
  return after.filter((a) => a.tier > (before[a.id] ?? 0));
}
