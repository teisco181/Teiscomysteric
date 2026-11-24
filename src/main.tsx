import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function resetLocalPreferencesAndReload(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('teiscomysterics_theme');
      window.localStorage.removeItem('teiscomysterics_view_mode');
      window.localStorage.removeItem('teiscomysterics_active_case');
    }
  } catch {
    // Ignore storage access errors
  }
  window.location.reload();
}

function renderPlainFatalScreen(rootEl: HTMLElement, message: string): void {
  rootEl.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.minHeight = '100vh';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.backgroundColor = '#080C10';
  wrapper.style.color = '#F1F5F9';
  wrapper.style.padding = '24px';
  wrapper.style.fontFamily = 'system-ui, -apple-system, sans-serif';

  const card = document.createElement('div');
  card.style.maxWidth = '460px';
  card.style.width = '100%';
  card.style.borderRadius = '12px';
  card.style.border = '1px solid rgba(244, 63, 94, 0.45)';
  card.style.backgroundColor = '#0F151D';
  card.style.padding = '24px';
  card.style.boxSizing = 'border-box';

  const heading = document.createElement('h1');
  heading.textContent = 'Teiscomysterics kon niet volledig laden';
  heading.style.fontSize = '18px';
  heading.style.fontWeight = '700';
  heading.style.margin = '0 0 12px 0';
  heading.style.color = '#FFFFFF';

  const body = document.createElement('p');
  body.textContent = message;
  body.style.fontSize = '13px';
  body.style.lineHeight = '1.5';
  body.style.margin = '0 0 16px 0';
  body.style.color = '#CBD5E1';
  body.style.wordBreak = 'break-word';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.flexWrap = 'wrap';
  actions.style.gap = '8px';

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.textContent = 'Pagina opnieuw laden';
  reloadBtn.style.padding = '8px 14px';
  reloadBtn.style.fontSize = '12px';
  reloadBtn.style.fontWeight = '600';
  reloadBtn.style.borderRadius = '8px';
  reloadBtn.style.border = 'none';
  reloadBtn.style.cursor = 'pointer';
  reloadBtn.style.backgroundColor = '#059669';
  reloadBtn.style.color = '#FFFFFF';
  reloadBtn.addEventListener('click', () => window.location.reload());

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Instellingen resetten';
  resetBtn.style.padding = '8px 14px';
  resetBtn.style.fontSize = '12px';
  resetBtn.style.fontWeight = '600';
  resetBtn.style.borderRadius = '8px';
  resetBtn.style.border = '1px solid #334155';
  resetBtn.style.cursor = 'pointer';
  resetBtn.style.backgroundColor = '#1E293B';
  resetBtn.style.color = '#E2E8F0';
  resetBtn.addEventListener('click', resetLocalPreferencesAndReload);

  actions.appendChild(reloadBtn);
  actions.appendChild(resetBtn);
  card.appendChild(heading);
  card.appendChild(body);
  card.appendChild(actions);
  wrapper.appendChild(card);
  rootEl.appendChild(wrapper);
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Onbekende fout bij laden.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex items-center justify-center bg-[#080C10] text-slate-100 p-6"
          style={{ backgroundColor: '#080C10', color: '#F1F5F9', minHeight: '100vh' }}
        >
          <div
            className="max-w-md w-full rounded-xl border border-rose-500/40 bg-[#0F151D] p-6 space-y-4"
            style={{ backgroundColor: '#0F151D' }}
          >
            <h1 className="text-lg font-bold text-white">
              Teiscomysterics kon niet volledig laden
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                Pagina opnieuw laden
              </button>
              <button
                type="button"
                onClick={resetLocalPreferencesAndReload}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                Instellingen resetten
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');

async function bootstrap(): Promise<void> {
  if (!rootElement) return;

  let mounted = false;

  window.addEventListener('error', (event) => {
    if (!mounted && rootElement.childElementCount === 0) {
      renderPlainFatalScreen(
        rootElement,
        event.message || 'Onverwachte scriptfout tijdens het opstarten.'
      );
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!mounted && rootElement.childElementCount === 0) {
      const reason =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? 'Onbekende laadfout.');
      renderPlainFatalScreen(rootElement, reason);
    }
  });

  try {
    const { default: App } = await import('./App.tsx');
    mounted = true;
    createRoot(rootElement).render(
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    );
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'De applicatie kon niet worden gestart. Probeer de pagina te herladen.';
    renderPlainFatalScreen(rootElement, msg);
  }
}

void bootstrap();
