import React, { useState } from 'react';
import { LogIn, Moon, Shield, Sun } from 'lucide-react';
import { signInWithGoogleAccount } from '../firebaseStore.ts';

interface AuthPortalProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  authLoading?: boolean;
  externalError?: string | null;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  theme,
  onToggleTheme,
  authLoading = false,
  externalError = null,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogleAccount();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('popup-closed-by-user')) {
        setError('Het Google-aanmeldscherm is gesloten voordat het inloggen was voltooid.');
      } else if (msg.includes('unauthorized-domain')) {
        setError(
          'Dit domein is nog niet toegevoegd onder Geautoriseerde domeinen in Firebase Authentication.'
        );
      } else {
        setError('Inloggen met Google is mislukt. Probeer het opnieuw.');
      }
    } finally {
      setLoading(false);
    }
  };

  const activeError = error || externalError;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#080C10] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar strictly obeying 3-zone contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 dark:border-slate-800/90 bg-white/80 dark:bg-[#0B1016]/90 backdrop-blur-sm">
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display">
          Teiscomysterics
        </span>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <span className="whitespace-nowrap shrink-0">Digitaal Politiesysteem</span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">Cloud Dossiers &amp; Communities</span>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#121923] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            aria-label="Wissel licht of donker thema"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Lichte modus' : 'Donkere modus'}</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left Atmospheric Visual Anchor */}
        <section className="lg:col-span-7 relative flex flex-col justify-between p-8 lg:p-12 overflow-hidden bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800/90">
          {!imgFailed ? (
            <img
              src="./src/assets/images/evidence_crime_scene_1795419420849.jpg"
              alt="Mistige havenkade van Kraaiendonk bij nacht"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover opacity-55"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#0C1821] to-emerald-950/60" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080C10] via-[#080C10]/65 to-[#080C10]/40" />

          <div className="relative z-10 max-w-xl">
            <p className="text-xs font-mono text-emerald-400 tracking-wider mb-3">
              Politie-archief · Kraaiendonk &amp; Omstreken
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight leading-tight text-balance">
              Digitaal politiesysteem voor fysieke en online mysteries.
            </h1>
            <p className="mt-4 text-base text-slate-300 leading-relaxed max-w-prose">
              Ontwerp interactieve dorpskaarten en herbruikbare communities, stel verdachten
              samen met een pixel-vingerafdrukstudio en bewaar alles veilig in de cloud voor
              zowel makers als rechercheurs.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-6 pt-8 mt-8 border-t border-slate-700/60 max-w-2xl">
            <div>
              <h2 className="text-sm font-semibold text-white">01. Case Bouwer (Beheerder)</h2>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Teken het dorp, beheer communities en personen, teken pixel-vingerafdrukken,
                plaats sporen op bewijsstukken en druk het papieren politiedossier af.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">02. Recherche Portaal (Speler)</h2>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Voer een dossiercode in, doorzoek adressen en bewoners, vergelijk
                vingerafdrukken en bewaar persoonlijke aantekeningen in Firestore.
              </p>
            </div>
          </div>
        </section>

        {/* Right Google Sign-In Panel */}
        <section className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12 forensic-grid-bg">
          <div className="w-full max-w-md bg-white dark:bg-[#0F151D] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 mb-2">
                <Shield className="w-4 h-4" />
                <span>Beveiligde toegang via Firebase</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Aanmelden bij Teiscomysterics
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Log in met je Google-account. Alle dossiers, dorpskaarten, communities,
                vingerafdrukken en persoonlijke aantekeningen worden automatisch opgeslagen.
              </p>
            </div>

            {activeError && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300"
              >
                {activeError}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading || authLoading}
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {loading || authLoading ? 'Aanmelden...' : 'Inloggen met Google'}
              </span>
            </button>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1.5 leading-relaxed">
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Speler / Rechercheur:</strong>{' '}
                Na inloggen voer je de toegangscode van het papieren dossier in (bijv.{' '}
                <code className="font-mono text-emerald-600 dark:text-emerald-400">ZAAK-047</code>).
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Beheerder / Maker:</strong>{' '}
                Het ingestelde beheerdersaccount krijgt automatisch toegang tot de Bouwer Versie.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
