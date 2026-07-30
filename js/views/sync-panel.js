/** Het blok "Synchronisatie" in de instellingen. */

import * as sync from '../sync.js';
import { el, clear, toast, confirmDialog, copyToClipboard, encodeShare, decodeShare, plural } from '../ui.js';
import { refresh } from '../app.js';

function relativeTime(ts) {
  if (!ts) return 'nog niet';
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 60) return 'zojuist';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min geleden`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} uur geleden`;
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
}

function summaryText(summary) {
  if (!summary) return 'Bijgewerkt';
  const parts = [];
  if (summary.decksAdded) parts.push(plural(summary.decksAdded, 'deck', 'decks'));
  if (summary.cardsAdded) parts.push(`${plural(summary.cardsAdded, 'kaart', 'kaarten')} erbij`);
  if (summary.cardsUpdated) parts.push(`${summary.cardsUpdated} bijgewerkt`);
  return parts.length ? `Gesynchroniseerd — ${parts.join(', ')}` : 'Gesynchroniseerd';
}

export function syncPanel(params = {}) {
  const panel = el('div', { class: 'panel' });
  const status = el('div');

  // Koppeling die via een link van een ander apparaat binnenkomt.
  if (params.sync) {
    decodeShare(params.sync)
      .then((config) => {
        sync.setConfig(config);
        render();
        note('Koppeling overgenomen. Log in met hetzelfde account als op je andere apparaat.');
      })
      .catch((err) => note(err instanceof sync.SyncError ? err.message : 'Deze koppel-link kon niet gelezen worden.', 'error'));
  }

  function note(message, kind = 'ok') {
    clear(status).append(el('div', { class: `notice ${kind}`, style: 'margin:var(--space-3) 0 0', text: message }));
  }

  function render() {
    clear(panel);
    if (!sync.isConfigured()) return renderSetup();
    if (!sync.isSignedIn()) return renderLogin();
    return renderConnected();
  }

  function renderSetup() {
    const url = el('input', { class: 'input', type: 'url', placeholder: 'https://xxxx.supabase.co', autocapitalize: 'off', autocorrect: 'off' });
    const key = el('input', { class: 'input', type: 'text', placeholder: 'anon key (publiek)', autocapitalize: 'off', autocorrect: 'off' });

    panel.append(
      el('p', { class: 'small muted', text: 'Koppel je Supabase-project om decks en voortgang tussen je telefoon en pc gelijk te houden. Draai eerst supabase/schema.sql in de SQL-editor van je project.' }),
      el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Project-URL' }), url]),
      el('label', { class: 'field' }, [
        el('span', { class: 'label', text: 'Anon key' }),
        key,
        el('span', { class: 'help', text: 'Te vinden onder Project Settings → API. Deze sleutel is bedoeld om publiek te zijn; je gegevens zijn beschermd met row level security.' }),
      ]),
      el('button', {
        class: 'btn btn-primary btn-block',
        text: 'Koppelen',
        onclick: () => {
          try {
            sync.setConfig({ url: url.value, anonKey: key.value });
            render();
          } catch (err) {
            note(err.message, 'error');
          }
        },
      }),
      status
    );
  }

  function renderLogin() {
    const email = el('input', { class: 'input', type: 'email', placeholder: 'je@email.nl', autocapitalize: 'off', autocorrect: 'off' });
    const password = el('input', { class: 'input', type: 'password', placeholder: 'wachtwoord' });
    const config = sync.getConfig();

    const run = async (action) => {
      if (!email.value.trim() || !password.value) return note('Vul je e-mailadres en wachtwoord in.', 'warn');
      try {
        if (action === 'in') {
          await sync.signIn(email.value, password.value);
        } else {
          const { confirmationNeeded } = await sync.signUp(email.value, password.value);
          if (confirmationNeeded) {
            return note('Account aangemaakt. Bevestig je e-mailadres via de mail van Supabase en log daarna in.', 'warn');
          }
        }
        note('Ingelogd, even synchroniseren…');
        const summary = await sync.syncNow();
        toast(summaryText(summary));
        refresh();
      } catch (err) {
        note(err.message, 'error');
      }
    };

    panel.append(
      el('p', { class: 'small muted', text: `Gekoppeld aan ${config.url.replace('https://', '')}. Log in met hetzelfde account op al je apparaten.` }),
      el('label', { class: 'field' }, [el('span', { class: 'label', text: 'E-mail' }), email]),
      el('label', { class: 'field' }, [el('span', { class: 'label', text: 'Wachtwoord' }), password]),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn-primary grow', text: 'Inloggen', onclick: () => run('in') }),
        el('button', { class: 'btn btn-secondary', text: 'Account aanmaken', onclick: () => run('up') }),
      ]),
      el('button', {
        class: 'btn btn-secondary btn-sm',
        style: 'margin-top:var(--space-3)',
        text: 'Ander project koppelen',
        onclick: () => { sync.clearConfig(); render(); },
      }),
      status
    );
  }

  function renderConnected() {
    const session = sync.getSession();
    const last = sync.meta().lastSync;

    panel.append(
      el('p', { class: 'small muted', text: `Ingelogd als ${session.email || 'onbekend'} · laatst gesynchroniseerd ${relativeTime(last)}.` }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-primary grow',
          text: 'Synchroniseren',
          onclick: async (e) => {
            const button = e.currentTarget;
            button.disabled = true;
            button.textContent = 'Bezig…';
            try {
              const summary = await sync.syncNow();
              toast(summaryText(summary));
              refresh();
            } catch (err) {
              note(err.message, 'error');
              button.disabled = false;
              button.textContent = 'Synchroniseren';
            }
          },
        }),
        el('button', {
          class: 'btn btn-secondary',
          text: 'Uitloggen',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Uitloggen?',
              message: 'Je decks en voortgang blijven op dit apparaat staan; er wordt alleen niet meer gesynchroniseerd.',
              confirmLabel: 'Uitloggen',
            });
            if (!ok) return;
            await sync.signOut();
            render();
          },
        }),
      ]),
      el('button', {
        class: 'btn btn-secondary btn-sm',
        style: 'margin-top:var(--space-3)',
        text: 'Koppeling delen met ander apparaat',
        onclick: async () => {
          const token = await encodeShare(sync.getConfig());
          const url = `${location.origin}${location.pathname}#/sync/${token}`;
          if (navigator.share) {
            try {
              await navigator.share({ title: 'Kaartjes koppelen', url });
              return;
            } catch { /* geannuleerd */ }
          }
          toast((await copyToClipboard(url)) ? 'Link gekopieerd — open hem op je andere apparaat' : 'Kopiëren lukte niet');
        },
      }),
      el('p', { class: 'small muted', style: 'margin:var(--space-3) 0 0', text: 'Er wordt automatisch gesynchroniseerd bij het openen van de app en na elke leersessie.' }),
      status
    );
  }

  render();
  return panel;
}
