import React, { useState } from 'react';
import { Lock, Moon, Shield, Sun, UserCheck, UserPlus } from 'lucide-react';
import { api } from '../api.ts';
import type { AuthStatus, AuthUser } from '../types.ts';

interface AuthPortalProps {
  authStatus: AuthStatus;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onAuthenticated: (user: AuthUser, token: string) => void;
}

type AuthTab = 'login' | 'register' | 'claim-admin';

export const AuthPortal: React.FC<AuthPortalProps> = ({
  authStatus,
  theme,
  onToggleTheme,
  onAuthenticated,
}) => {
  const canClaimAdmin = !authStatus.adminClaimed && !authStatus.hasEnvAdminPasscode;
  const [tab, setTab] = useState<AuthTab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUser = username.trim();
    if (cleanUser.length < 3) {
      setError('Gebruikersnaam moet minimaal 3 tekens bevatten.');
      return;
    }
    if (password.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens bevatten.');
      return;
    }
    if ((tab === 'register' || tab === 'claim-admin') && password !== confirmPassword) {
      setError('De ingevoerde wachtwoorden komen niet overeen.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await api.login(cleanUser, password);
        onAuthenticated(res.user, res.token);
      } else if (tab === 'register') {
        const res = await api.register(cleanUser, password);
        onAuthenticated(res.user, res.token);
      } else {
        const res = await api.claimAdmin(cleanUser, password);
        onAuthenticated(res.user, res.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authenticatie mislukt.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#080C10] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar strictly obeying 3-zone contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-200 dark:border-slate-800/90 bg-white/80 dark:bg-[#0B1016]/90 backdrop-blur-sm">
        <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display">
          Teiscomysterics
        </span>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError(null);
            }}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Inloggen
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError(null);
            }}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Speler Registreren
          </button>
          {canClaimAdmin && (
            <button
              type="button"
              onClick={() => {
                setTab('claim-admin');
                setError(null);
              }}
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Beheerder Instellen
            </button>
          )}
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
              src="/src/assets/images/evidence_crime_scene_1795419420849.jpg"
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
              Ontwerp interactieve dorpskaarten, stel verdachtenprofielen samen met een
              pixel-vingerafdrukstudio en plaats sporen op bewijsstukken. Spelers loggen in
              met een lokale gebruikersnaam om het papieren dossier online op te lossen.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-6 pt-8 mt-8 border-t border-slate-700/60 max-w-2xl">
            <div>
              <h2 className="text-sm font-semibold text-white">01. Case Bouwer (Beheerder)</h2>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Teken het dorp, beheer inwoners, teken pixel-vingerafdrukken, zet sporen op
                bewijsstukken en druk het papieren politiedossier af.
              </p>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">02. Recherche Portaal (Speler)</h2>
              <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                Doorzoek adressen en bewoners, vergelijk vingerafdrukken uit het papieren dossier
                en bewaar persoonlijke aantekeningen.
              </p>
            </div>
          </div>
        </section>

        {/* Right Auth Panel */}
        <section className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12 forensic-grid-bg">
          <div className="w-full max-w-md bg-white dark:bg-[#0F151D] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {tab === 'login' && 'Toegang tot het systeem'}
                {tab === 'register' && 'Nieuw recherche-account'}
                {tab === 'claim-admin' && 'Beheerder-account instellen'}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Geen e-mailadres nodig. Kies alleen een lokale gebruikersnaam en wachtwoord.
              </p>
            </div>

            {/* Segmented Mode Control */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                }}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === 'login'
                    ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Inloggen
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError(null);
                }}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  tab === 'register'
                    ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Registreren
              </button>
              {canClaimAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setTab('claim-admin');
                    setError(null);
                  }}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    tab === 'claim-admin'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  Beheerder
                </button>
              )}
            </div>

            {tab === 'claim-admin' && canClaimAdmin && (
              <div className="mb-5 p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed">
                Eerste configuratie: claim het lokale beheerder-account om mysteries,
                dorpskaarten, vingerafdrukken en bewijsstukken te maken. Dit kan eenmalig.
              </div>
            )}

            {authStatus.hasEnvAdminPasscode && tab === 'login' && (
              <div className="mb-5 p-3.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
                Beheerdertoegang is geconfigureerd via serverinstellingen (gebruikersnaam{' '}
                <code className="font-mono font-semibold">admin</code>).
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="auth-username"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Gebruikersnaam
                </label>
                <input
                  id="auth-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={tab === 'claim-admin' ? 'bijv. hoofdrechercheur' : 'bijv. speurder_anna'}
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090D12] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Wachtwoord
                </label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimaal 6 tekens"
                  className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090D12] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {(tab === 'register' || tab === 'claim-admin') && (
                <div>
                  <label
                    htmlFor="auth-confirm"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Wachtwoord bevestigen
                  </label>
                  <input
                    id="auth-confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Herhaal wachtwoord"
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#090D12] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

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
                {tab === 'login' && <Lock className="w-4 h-4" />}
                {tab === 'register' && <UserPlus className="w-4 h-4" />}
                {tab === 'claim-admin' && <Shield className="w-4 h-4" />}
                <span>
                  {loading
                    ? 'Bezig...'
                    : tab === 'login'
                    ? 'Inloggen'
                    : tab === 'register'
                    ? 'Speler aanmaken'
                    : 'Beheerder activeren'}
                </span>
              </button>
            </form>

            {canClaimAdmin && tab !== 'claim-admin' && (
              <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Ben je de maker van het mysterie?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTab('claim-admin');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  Beheerder instellen
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
