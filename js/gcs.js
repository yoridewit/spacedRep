/**
 * Glasgow Coma Score — losse oefenmodule, niet gekoppeld aan de kaarten of
 * spaced repetition. Eén bron van waarheid voor de scoretabel (gebruikt door
 * zowel de spiekknop als de oefenvragen, zodat de bewoordingen altijd kloppen)
 * en een bank met realistische EMV-combinaties om uit te oefenen.
 */

export const GCS_DOMAINS = [
  {
    key: 'eye',
    label: 'Ogen (E)',
    options: [
      { score: 4, text: 'Opent de ogen spontaan' },
      { score: 3, text: 'Opent de ogen op aanspreken' },
      { score: 2, text: 'Opent de ogen op een pijnprikkel' },
      { score: 1, text: 'Opent de ogen niet' },
    ],
  },
  {
    key: 'verbal',
    label: 'Verbaal (V)',
    options: [
      { score: 5, text: 'Georiënteerd, normaal gesprek mogelijk' },
      { score: 4, text: 'Verward, gedesoriënteerd gesprek' },
      { score: 3, text: 'Spreekt inadequate woorden — losse woorden, geen gesprek' },
      { score: 2, text: 'Maakt onverstaanbare geluiden (kreunen)' },
      { score: 1, text: 'Geen verbale reactie' },
    ],
  },
  {
    key: 'motor',
    label: 'Motoriek (M)',
    options: [
      { score: 6, text: 'Voert opdrachten uit' },
      { score: 5, text: 'Lokaliseert de pijnprikkel (gerichte afweerbeweging)' },
      { score: 4, text: 'Trekt terug bij pijn (ongerichte afweerbeweging)' },
      { score: 3, text: 'Abnormaal buigen op pijn (decorticatie)' },
      { score: 2, text: 'Strekken op pijn (decerebratie)' },
      { score: 1, text: 'Geen motorische reactie' },
    ],
  },
];

/** Tekst uit de tabel bij een score, voor een gegeven domein ('eye'/'verbal'/'motor'). */
export function findingText(domainKey, score) {
  const domain = GCS_DOMAINS.find((d) => d.key === domainKey);
  return domain?.options.find((o) => o.score === score)?.text || '';
}

/**
 * Realistische scenario's: klinische situaties uit de praktijk, elk met de
 * bijbehorende EMV. De weergegeven bevindingen komen rechtstreeks uit
 * GCS_DOMAINS — hier staan alleen de scores en een korte context.
 */
export const GCS_SCENARIOS = [
  { context: 'Eenzijdig auto-ongeval, bestuurder bekneld.', eye: 1, verbal: 1, motor: 1 },
  { context: 'Reanimatie zojuist gestaakt, circulatie hersteld.', eye: 1, verbal: 1, motor: 2 },
  { context: 'Val van drie meter hoogte, hoofdletsel.', eye: 1, verbal: 1, motor: 3 },
  { context: 'GHB-intoxicatie, diep buiten bewustzijn.', eye: 1, verbal: 1, motor: 4 },
  { context: 'Ernstig traumatisch hersenletsel na motorongeval.', eye: 1, verbal: 2, motor: 4 },
  { context: 'Groot herseninfarct, ernstige uitval.', eye: 2, verbal: 1, motor: 3 },
  { context: 'Opioïden-overdosis, ademhaling traag.', eye: 2, verbal: 2, motor: 4 },
  { context: 'Subduraal hematoom, bewustzijn verslechtert.', eye: 2, verbal: 2, motor: 5 },
  { context: 'Postictale fase, kort na een epileptisch insult.', eye: 2, verbal: 2, motor: 5 },
  { context: 'Ernstige sepsis, zeer suf en ziek.', eye: 2, verbal: 3, motor: 5 },
  { context: 'Fors alcoholintoxicatie, sterk vertraagde reacties.', eye: 2, verbal: 3, motor: 6 },
  { context: 'CVA met rechterzijdige uitval.', eye: 3, verbal: 3, motor: 5 },
  { context: 'Meningitis, toenemende sufheid.', eye: 3, verbal: 3, motor: 6 },
  { context: 'Hypoglykemie, verward maar aanspreekbaar.', eye: 3, verbal: 4, motor: 6 },
  { context: 'Postoperatieve sufheid, net wakker uit narcose.', eye: 3, verbal: 4, motor: 6 },
  { context: 'Lichte intoxicatie, licht verward gesprek.', eye: 4, verbal: 4, motor: 6 },
  { context: 'Lichte hersenschudding na val van de fiets.', eye: 4, verbal: 5, motor: 6 },
  { context: 'Paniekaanval, hyperventileert maar reageert normaal.', eye: 4, verbal: 5, motor: 6 },
];

export function totalOf(scores) {
  return (scores.eye || 0) + (scores.verbal || 0) + (scores.motor || 0);
}

/** Kiest een willekeurig scenario, met een simpele "niet twee keer achter elkaar hetzelfde". */
export function pickScenario(excludeIndex = -1) {
  if (GCS_SCENARIOS.length <= 1) return { index: 0, scenario: GCS_SCENARIOS[0] };
  let index;
  do {
    index = Math.floor(Math.random() * GCS_SCENARIOS.length);
  } while (index === excludeIndex);
  return { index, scenario: GCS_SCENARIOS[index] };
}
