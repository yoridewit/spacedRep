/**
 * SM-2 achtige scheduler, in de geest van Anki.
 *
 * Kaartstatus:
 *   new        - nog nooit gezien
 *   learning   - in de leerstappen (minuten)
 *   review     - normale herhaling (dagen)
 *   relearning - teruggevallen na "Opnieuw"
 */

export const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

export const RATING_LABELS = {
  1: 'Opnieuw',
  2: 'Lastig',
  3: 'Goed',
  4: 'Makkelijk',
};

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

export const DEFAULT_CONFIG = {
  learningSteps: [1, 10],   // minuten
  relearningSteps: [10],    // minuten
  graduatingInterval: 1,    // dagen, na afronden leerstappen met "Goed"
  easyInterval: 4,          // dagen, bij "Makkelijk" op een nieuwe kaart
  startingEase: 2.5,
  easyBonus: 1.3,
  hardFactor: 1.2,
  intervalModifier: 1.0,
  lapseMultiplier: 0.5,     // nieuw interval na "Opnieuw" = oud * dit
  minimumInterval: 1,       // dagen
  maximumInterval: 365 * 5, // dagen
  fuzz: true,
};

export function newSrsState(now = Date.now(), config = DEFAULT_CONFIG) {
  return {
    state: 'new',
    due: now,
    interval: 0,          // in dagen (0 zolang de kaart in leerstappen zit)
    ease: config.startingEase,
    step: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function fuzzInterval(days, config) {
  if (!config.fuzz || days < 3) return days;
  // Anki-achtige spreiding zodat kaarten niet allemaal op dezelfde dag terugkomen.
  const spread = days < 7 ? 0.15 : days < 30 ? 0.1 : 0.05;
  const delta = Math.max(1, Math.round(days * spread));
  const offset = Math.round((Math.random() * 2 - 1) * delta);
  return Math.max(1, days + offset);
}

function daysToDue(now, days) {
  return now + Math.round(days * DAY);
}

function stepDelay(steps, index) {
  const i = clamp(index, 0, steps.length - 1);
  return (steps[i] ?? 1) * MINUTE;
}

/**
 * Berekent de nieuwe SRS-state. Muteert niets: geeft een nieuw object terug.
 * `withFuzz` staat uit tijdens previews zodat de knoplabels stabiel zijn.
 */
export function schedule(srs, rating, now = Date.now(), config = DEFAULT_CONFIG, withFuzz = true) {
  const cfg = { ...config, fuzz: config.fuzz && withFuzz };
  const s = { ...srs };
  s.reps = (s.reps || 0) + 1;
  s.lastReview = now;

  const learning = s.state === 'new' || s.state === 'learning';

  if (learning) {
    const steps = cfg.learningSteps.length ? cfg.learningSteps : [10];
    const wasNew = s.state === 'new';
    switch (rating) {
      case RATING.AGAIN:
        s.state = 'learning';
        s.step = 0;
        s.due = now + stepDelay(steps, 0);
        break;
      case RATING.HARD:
        s.state = 'learning';
        s.step = wasNew ? 0 : s.step;
        s.due = now + stepDelay(steps, s.step);
        break;
      case RATING.GOOD: {
        const next = (wasNew ? 0 : s.step) + 1;
        if (next >= steps.length) {
          s.state = 'review';
          s.step = 0;
          s.interval = fuzzInterval(cfg.graduatingInterval, cfg);
          s.due = daysToDue(now, s.interval);
        } else {
          s.state = 'learning';
          s.step = next;
          s.due = now + stepDelay(steps, next);
        }
        break;
      }
      case RATING.EASY:
        s.state = 'review';
        s.step = 0;
        s.interval = fuzzInterval(cfg.easyInterval, cfg);
        s.due = daysToDue(now, s.interval);
        break;
    }
    return s;
  }

  if (s.state === 'relearning') {
    const steps = cfg.relearningSteps.length ? cfg.relearningSteps : [10];
    switch (rating) {
      case RATING.AGAIN:
        s.step = 0;
        s.due = now + stepDelay(steps, 0);
        break;
      case RATING.HARD:
        s.due = now + stepDelay(steps, s.step);
        break;
      case RATING.GOOD: {
        const next = s.step + 1;
        if (next >= steps.length) {
          s.state = 'review';
          s.step = 0;
          s.interval = clamp(fuzzInterval(s.interval || cfg.minimumInterval, cfg), cfg.minimumInterval, cfg.maximumInterval);
          s.due = daysToDue(now, s.interval);
        } else {
          s.step = next;
          s.due = now + stepDelay(steps, next);
        }
        break;
      }
      case RATING.EASY:
        s.state = 'review';
        s.step = 0;
        s.interval = clamp(fuzzInterval(Math.max(cfg.minimumInterval, (s.interval || 1) + 1), cfg), cfg.minimumInterval, cfg.maximumInterval);
        s.due = daysToDue(now, s.interval);
        break;
    }
    return s;
  }

  // state === 'review'
  const prev = Math.max(s.interval || 1, cfg.minimumInterval);
  switch (rating) {
    case RATING.AGAIN: {
      s.lapses = (s.lapses || 0) + 1;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.interval = clamp(Math.round(prev * cfg.lapseMultiplier), cfg.minimumInterval, cfg.maximumInterval);
      const steps = cfg.relearningSteps.length ? cfg.relearningSteps : [10];
      s.state = 'relearning';
      s.step = 0;
      s.due = now + stepDelay(steps, 0);
      break;
    }
    case RATING.HARD: {
      s.ease = Math.max(1.3, s.ease - 0.15);
      const raw = Math.max(prev + 1, prev * cfg.hardFactor * cfg.intervalModifier);
      s.interval = clamp(fuzzInterval(Math.round(raw), cfg), cfg.minimumInterval, cfg.maximumInterval);
      s.due = daysToDue(now, s.interval);
      break;
    }
    case RATING.GOOD: {
      const raw = Math.max(prev + 1, prev * s.ease * cfg.intervalModifier);
      s.interval = clamp(fuzzInterval(Math.round(raw), cfg), cfg.minimumInterval, cfg.maximumInterval);
      s.due = daysToDue(now, s.interval);
      break;
    }
    case RATING.EASY: {
      s.ease = s.ease + 0.15;
      const raw = Math.max(prev + 2, prev * s.ease * cfg.easyBonus * cfg.intervalModifier);
      s.interval = clamp(fuzzInterval(Math.round(raw), cfg), cfg.minimumInterval, cfg.maximumInterval);
      s.due = daysToDue(now, s.interval);
      break;
    }
  }
  return s;
}

/** Labels voor de vier knoppen: "1 min", "10 min", "3 d", ... */
export function previewIntervals(srs, now = Date.now(), config = DEFAULT_CONFIG) {
  const out = {};
  for (const rating of [RATING.AGAIN, RATING.HARD, RATING.GOOD, RATING.EASY]) {
    const next = schedule(srs, rating, now, config, false);
    out[rating] = formatDelay(next.due - now);
  }
  return out;
}

export function formatDelay(ms) {
  if (ms < 45 * 1000) return '<1 min';
  const minutes = ms / MINUTE;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)} u`;
  const days = hours / 24;
  if (days < 31) return `${Math.round(days)} d`;
  const months = days / 30.4;
  if (months < 12) return `${months < 2 ? months.toFixed(1) : Math.round(months)} mnd`;
  const years = days / 365;
  return `${years < 10 ? years.toFixed(1) : Math.round(years)} jr`;
}

/** Sleutel van de "leerdag": de dag rolt om op `cutoffHour` (net als Anki). */
export function dayKey(ts = Date.now(), cutoffHour = 4) {
  const d = new Date(ts - cutoffHour * 60 * MINUTE);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Einde van de huidige leerdag, gebruikt om "vandaag nog te doen" te bepalen. */
export function endOfDay(ts = Date.now(), cutoffHour = 4) {
  const d = new Date(ts - cutoffHour * 60 * MINUTE);
  d.setHours(0, 0, 0, 0);
  return d.getTime() + DAY + cutoffHour * 60 * MINUTE;
}
