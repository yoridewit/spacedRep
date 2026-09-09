import { GCS_DOMAINS, findingText, totalOf, pickScenario } from '../gcs.js';
import { el, clear, appendAll } from '../ui.js';

/** De volledige scoretabel, voor de spiekknop. */
function referenceTable() {
  return el('div', { class: 'panel gcs-reference' },
    GCS_DOMAINS.map((domain) =>
      el('div', { class: 'gcs-reference-col' }, [
        el('h4', { text: domain.label }),
        el('ul', {}, domain.options.map((o) =>
          el('li', {}, [el('strong', { text: String(o.score) }), ` — ${o.text}`]))),
      ])));
}

export function mount(root) {
  let lastIndex = -1;
  let current = null;
  let selection = { eye: null, verbal: null, motor: null };
  let checked = false;
  const session = { correct: 0, total: 0 };

  const tableSection = el('div', { hidden: true });
  tableSection.append(referenceTable());

  const tableToggle = el('button', {
    class: 'btn btn-secondary btn-sm',
    text: 'Spiek: toon scoretabel',
    onclick: () => {
      tableSection.hidden = !tableSection.hidden;
      tableToggle.textContent = tableSection.hidden ? 'Spiek: toon scoretabel' : 'Verberg scoretabel';
    },
  });

  const scoreLine = el('p', { class: 'small muted' });
  const scenarioBox = el('div', { class: 'panel' });

  function updateScoreLine() {
    scoreLine.textContent = session.total
      ? `${session.correct}/${session.total} scenario's helemaal goed`
      : 'Nog geen scenario\'s geprobeerd.';
  }

  function next() {
    const picked = pickScenario(lastIndex);
    lastIndex = picked.index;
    current = picked.scenario;
    selection = { eye: null, verbal: null, motor: null };
    checked = false;
    render();
  }

  function pickerRow(domain) {
    const row = el('div', { class: 'gcs-picker' });
    for (const option of domain.options) {
      const btn = el('button', {
        type: 'button',
        class: 'gcs-pick-btn',
        text: String(option.score),
        onclick: () => {
          if (checked) return;
          selection[domain.key] = option.score;
          render();
        },
      });
      if (selection[domain.key] === option.score) btn.classList.add('is-selected');
      if (checked) {
        if (option.score === current[domain.key]) btn.classList.add('is-correct');
        else if (option.score === selection[domain.key]) btn.classList.add('is-wrong');
      }
      row.append(btn);
    }
    return row;
  }

  function domainBlock(domain) {
    return el('div', { class: 'gcs-domain' }, [
      el('div', { class: 'small', style: 'font-weight:700;margin-bottom:2px', text: domain.label }),
      el('div', { class: 'small muted', style: 'margin-bottom:6px', text: findingText(domain.key, current[domain.key]) }),
      pickerRow(domain),
    ]);
  }

  function render() {
    const allPicked = selection.eye && selection.verbal && selection.motor;
    const nodes = [
      el('p', { class: 'small muted', style: 'margin-bottom:var(--space-3)', text: current.context }),
      ...GCS_DOMAINS.map(domainBlock),
    ];

    if (!checked) {
      nodes.push(
        el('button', {
          class: 'btn btn-primary btn-block',
          style: 'margin-top:var(--space-4)',
          disabled: !allPicked,
          onclick: () => {
            checked = true;
            session.total++;
            const allCorrect = GCS_DOMAINS.every((d) => selection[d.key] === current[d.key]);
            if (allCorrect) session.correct++;
            updateScoreLine();
            render();
          },
          text: 'Controleer',
        })
      );
    } else {
      const allCorrect = GCS_DOMAINS.every((d) => selection[d.key] === current[d.key]);
      const yourTotal = totalOf(selection);
      const correctTotal = totalOf(current);
      nodes.push(
        el('div', {
          class: `notice ${allCorrect ? 'ok' : 'error'}`,
          style: 'margin-top:var(--space-4)',
          text: allCorrect
            ? `Helemaal goed — EMV ${current.eye}+${current.verbal}+${current.motor} = ${correctTotal}.`
            : `Niet helemaal — jouw score was ${yourTotal}, de juiste EMV is ${current.eye}+${current.verbal}+${current.motor} = ${correctTotal}.`,
        }),
        el('button', {
          class: 'btn btn-secondary btn-block',
          style: 'margin-top:var(--space-3)',
          onclick: next,
          text: 'Volgende scenario',
        })
      );
    }

    appendAll(clear(scenarioBox), nodes);
  }

  root.append(
    el('h1', { text: 'Glasgow Coma Score oefenen' }),
    el('p', { class: 'muted', style: 'margin-bottom:var(--space-4)', text: 'Een realistische situatie, jij vult de E, M en V in. Losse oefening, telt niet mee voor je kaarten of streak.' }),
    el('div', { class: 'row', style: 'margin-bottom:var(--space-3)' }, [tableToggle]),
    tableSection,
    scoreLine,
    scenarioBox
  );

  updateScoreLine();
  next();
}
