import React, { useState } from 'react';
import { FolderPlus, KeyRound } from 'lucide-react';
import type { CaseFile } from '../types.ts';

interface PlayerCodeGateProps {
  username: string;
  onRedeemCode: (code: string) => Promise<CaseFile>;
  onUnlocked: (caseFile: CaseFile) => void;
}

export const PlayerCodeGate: React.FC<PlayerCodeGateProps> = ({
  username,
  onRedeemCode,
  onUnlocked,
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Voer een dossiercode in.');
      return;
    }
    setLoading(true);
    try {
      const unlocked = await onRedeemCode(trimmed);
      onUnlocked(unlocked);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Code kon niet worden geverifieerd.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center forensic-grid-bg rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="w-full max-w-md bg-white dark:bg-[#0F151D] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
              Welkom, {username}
            </p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              Dossiercode invoeren
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
              Voer de toegangscode van uw uitgeprinte politiedossier in om de zaak
              toe te voegen aan uw overzicht en te starten met spelen.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="redeem-case-code"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Dossier- of spelcode
            </label>
            <input
              id="redeem-case-code"
              type="text"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="bijv. ZAAK-047"
              className="w-full px-3.5 py-2.5 text-sm font-mono uppercase tracking-wider rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
            <span>{loading ? 'Controleren...' : 'Mysterie toevoegen & openen'}</span>
          </button>
        </form>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-4 leading-relaxed">
          Na het toevoegen blijft het dossier gekoppeld aan uw Google-account zodat u
          op elk apparaat verder kunt spelen.
        </p>
      </div>
    </div>
  );
};
