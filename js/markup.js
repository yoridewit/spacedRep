/**
 * Veilige mini-markdown. Er wordt altijd eerst geëscaped: kaartinhoud komt van
 * een AI en mag nooit als HTML uitgevoerd worden.
 */

const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/gs;

// Sentinels voor code-fragmenten. Stuurtekens worden uit de invoer gestript,
// dus kaarttekst kan ze nooit zelf bevatten.
const B_OPEN = '\u0001';
const B_CLOSE = '\u0002';
const BLOCK_RE = /\u0001(\d+)\u0002/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(CONTROL_RE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/**
 * Opmaak toepassen op tekst die al geëscaped is (en dus veilige HTML mag bevatten
 * die de aanroeper zelf heeft ingevoegd, zoals cloze-spans).
 */
function toHtml(escaped) {
  const blocks = [];
  const stash = (html) => {
    blocks.push(html);
    return `${B_OPEN}${blocks.length - 1}${B_CLOSE}`;
  };

  // Code eerst uit de weg zetten, zodat opmaakregels er niet in worden toegepast.
  const prepared = String(escaped)
    .replace(/\r\n/g, '\n')
    .replace(/```([\s\S]*?)```/g, (_, code) =>
      stash(`<pre><code>${code.replace(/^\n/, '').replace(/\n$/, '')}</code></pre>`))
    .replace(/`([^`\n]+)`/g, (_, code) => stash(`<code>${code}</code>`));

  const out = [];
  let list = null;
  const closeList = () => {
    if (list) { out.push(`</${list}>`); list = null; }
  };

  for (const line of prepared.split('\n')) {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*•]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }
    if (numbered) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }
    closeList();
    if (!trimmed) continue;
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  closeList();

  return out.join('\n').replace(BLOCK_RE, (_, i) => blocks[Number(i)]);
}

export function renderMarkup(text) {
  return toHtml(escapeHtml(text));
}

/**
 * Vervangt cloze-markers. `reveal` bepaalt of het doelgat ingevuld getoond wordt.
 * Gaten met een ander nummer worden altijd gewoon uitgeschreven.
 */
export function renderCloze(text, clozeIndex, reveal) {
  const withGaps = escapeHtml(text).replace(CLOZE_RE, (_, num, answer, hint) => {
    if (Number(num) !== Number(clozeIndex)) return answer;
    if (reveal) return `<span class="cloze">${answer}</span>`;
    return hint ? `<span class="cloze-gap">[${hint}]</span>` : '<span class="cloze-gap">[ ... ]</span>';
  });
  return toHtml(withGaps);
}

/** Korte, platte samenvatting van een kaart voor lijstweergaves. */
export function cardSummary(card) {
  const raw = card.type === 'cloze'
    ? String(card.text || '').replace(CLOZE_RE, (_, num, answer) =>
        (Number(num) === Number(card.clozeIndex) ? `[${answer}]` : answer))
    : card.front;
  return String(raw || '').replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim();
}

export function cardAnswerSummary(card) {
  const raw = card.type === 'cloze' ? String(card.text || '').replace(CLOZE_RE, '$2') : card.back;
  return String(raw || '').replace(/[`*_~]/g, '').replace(/\s+/g, ' ').trim();
}
