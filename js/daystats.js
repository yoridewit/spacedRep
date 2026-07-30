/**
 * Dagstatistiek, bijgehouden per apparaat.
 *
 * Waarom per apparaat: bij het samenvoegen wordt per teller de hoogste stand
 * genomen, zodat twee keer synchroniseren niets dubbel telt. Zou je één
 * gedeelde teller per dag hebben, dan zou "10 op de pc" en "5 op de telefoon"
 * 10 worden in plaats van 15. Met een emmertje per apparaat is de hoogste stand
 * per emmertje precies goed, en het totaal is gewoon de som.
 *
 * Vorm: stats['2026-07-28'] = { 'dev_abc': {...tellers}, 'dev_xyz': {...} }
 */

export const COUNTERS = ['new', 'reviews', 'again', 'hard', 'good', 'easy', 'ms', 'xp'];

export function emptyDay() {
  return { new: 0, reviews: 0, again: 0, hard: 0, good: 0, easy: 0, ms: 0, xp: 0 };
}

/** Oude vorm (tellers direct op de dag) of al opgeteld totaal. */
export function isFlat(entry) {
  return Boolean(entry) && COUNTERS.some((field) => typeof entry[field] === 'number');
}

/** Zet een dag om naar de vorm met emmertjes; oude gegevens gaan naar 'legacy'. */
export function normalizeDay(entry) {
  if (!entry) return {};
  return isFlat(entry) ? { legacy: { ...emptyDay(), ...entry } } : entry;
}

/**
 * Telt alle apparaten van één dag bij elkaar op. Geef je er al een opgetelde
 * (platte) dag in, dan komt die er ongewijzigd uit — zo is dit veilig te
 * gebruiken zonder eerst te hoeven kijken welke vorm je hebt.
 */
export function dayTotal(entry) {
  if (!entry) return emptyDay();
  if (isFlat(entry)) return { ...emptyDay(), ...entry };
  const total = emptyDay();
  for (const bucket of Object.values(entry)) {
    for (const field of COUNTERS) total[field] += Number(bucket?.[field]) || 0;
  }
  return total;
}

/** Samenvoegen van dezelfde dag van twee kanten: per apparaat de hoogste stand. */
export function mergeDay(a, b) {
  const left = normalizeDay(a);
  const right = normalizeDay(b);
  const out = {};
  for (const device of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const one = left[device] || {};
    const two = right[device] || {};
    const bucket = {};
    for (const field of new Set([...Object.keys(one), ...Object.keys(two)])) {
      bucket[field] = Math.max(Number(one[field]) || 0, Number(two[field]) || 0);
    }
    out[device] = bucket;
  }
  return out;
}
