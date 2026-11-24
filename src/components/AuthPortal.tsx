import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Mail,
  Moon,
  Shield,
  Sun,
  User,
  UserPlus,
} from 'lucide-react';
import {
  registerWithEmailAccount,
  registerWithUsernameAccount,
  sendResetPasswordForEmail,
  signInWithGoogleAccount,
  signInWithIdentifierAndPassword,
} from '../firebaseStore.ts';

interface AuthPortalProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  authLoading?: boolean;
  externalError?: string | null;
}

function mapFirebaseAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('auth/invalid-credential') ||
    msg.includes('auth/wrong-password') ||
    msg.includes('auth/user-not-found')
  ) {
    return 'Onjuiste gebruikersnaam, e-mailadres of wachtwoord.';
  }
  if (msg.includes('auth/email-already-in-use')) {
    return 'Deze gebruikersnaam of dit e-mailadres is al in gebruik. Kies een andere naam of log in.';
  }
  if (msg.includes('auth/weak-password')) {
    return 'Het wachtwoord moet minimaal 6 tekens lang zijn.';
  }
  if (msg.includes('auth/invalid-email')) {
    return 'Vul een geldig e-mailadres of een geldige gebruikersnaam in.';
  }
  if (msg.includes('auth/too-many-requests')) {
    return 'Te veel mislukte pogingen. Wacht even en probeer het daarna opnieuw.';
  }
  if (
    msg.includes('auth/operation-not-allowed') ||
    msg.includes('auth/admin-restricted-operation')
  ) {
    return 'Inloggen met e-mail/wachtwoord is nog niet ingeschakeld in Firebase Console (Authentication → Sign-in method → Email/Password).';
  }
  if (msg.includes('popup-closed-by-user')) {
    return 'Het Google-aanmeldscherm is gesloten voordat het inloggen was voltooid.';
  }
  if (msg.includes('popup-blocked')) {
    return 'De pop-up voor Google-inloggen is geblokkeerd door je browser. Sta pop-ups toe of log in met e-mail/gebruikersnaam.';
  }
  if (msg.includes('auth/network-request-failed')) {
    return 'Netwerkfout tijdens het aanmelden. Controleer je internetverbinding en probeer het opnieuw.';
  }
  if (msg.includes('unauthorized-domain')) {
    return 'Dit domein is nog niet toegevoegd onder Geautoriseerde domeinen in Firebase Authentication.';
  }
  return err instanceof Error ? err.message : 'Aanmelden is mislukt. Probeer het opnieuw.';
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  theme,
  onToggleTheme,
  authLoading = false,
  externalError = null,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registerMethod, setRegisterMethod] = useState<'username' | 'email'>('username');

  const [identifier, setIdentifier] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerDisplayName, setRegisterDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await signInWithIdentifierAndPassword(identifier, password);
      } else {
        if (password !== confirmPassword) {
          throw new Error('De twee wachtwoorden komen niet overeen.');
        }
        if (registerMethod === 'username') {
          await registerWithUsernameAccount(registerUsername, password);
        } else {
          await registerWithEmailAccount(registerEmail, password, registerDisplayName);
        }
      }
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await sendResetPasswordForEmail(identifier);
      setNotice(
        `Er is een wachtwoord-herstelmail verstuurd naar ${identifier.trim().toLowerCase()}.`
      );
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await signInWithGoogleAccount();
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const activeError = error || externalError;
  const busy = loading || authLoading;

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

        {/* Right Sign-In & Registration Panel */}
        <section className="lg:col-span-5 flex items-center justify-center p-6 sm:p-10 lg:p-12 forensic-grid-bg">
          <div className="w-full max-w-md bg-white dark:bg-[#0F151D] border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-sm space-y-5">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 mb-2">
                <Shield className="w-4 h-4" />
                <span>Beveiligde toegang via Firebase</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Aanmelden bij Teiscomysterics
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Log in met je gebruikersnaam of e-mailadres en wachtwoord, of kies voor Google.
              </p>
            </div>

            {/* Mode Switcher: Login vs Register */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#090D12] border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setNotice(null);
                }}
                className={`inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'login'
                    ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Inloggen</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setNotice(null);
                }}
                className={`inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'register'
                    ? 'bg-white dark:bg-[#17202B] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Account aanmaken</span>
              </button>
            </div>

            {activeError && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-300"
              >
                {activeError}
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-300"
              >
                {notice}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
              {mode === 'login' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Gebruikersnaam of e-mailadres
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="bijv. detective_jan of naam@voorbeeld.nl"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRegisterMethod('username')}
                      className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-[11px] font-medium rounded-lg border transition-colors ${
                        registerMethod === 'username'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Met gebruikersnaam</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegisterMethod('email')}
                      className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-[11px] font-medium rounded-lg border transition-colors ${
                        registerMethod === 'email'
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Met e-mailadres</span>
                    </button>
                  </div>

                  {registerMethod === 'username' ? (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Kies een gebruikersnaam
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={registerUsername}
                        onChange={(e) => setRegisterUsername(e.target.value)}
                        placeholder="bijv. detective_jan (min. 3 tekens)"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Naam (optioneel)
                        </label>
                        <input
                          type="text"
                          value={registerDisplayName}
                          onChange={(e) => setRegisterDisplayName(e.target.value)}
                          placeholder="bijv. Rechercheur Jan"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          E-mailadres
                        </label>
                        <input
                          type="email"
                          required
                          autoComplete="email"
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                          placeholder="naam@voorbeeld.nl"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Wachtwoord
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={busy}
                      className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50"
                    >
                      Wachtwoord vergeten?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={mode === 'register' ? 6 : 1}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Minimaal 6 tekens' : '••••••••'}
                    className="w-full pl-3 pr-9 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Bevestig wachtwoord
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Herhaal wachtwoord"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white transition-colors"
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {busy
                    ? 'Bezig...'
                    : mode === 'login'
                      ? 'Inloggen'
                      : 'Account aanmaken'}
                </span>
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
              <span className="mx-3 text-[11px] font-medium text-slate-400">of</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#090D12] text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              <LogIn className="w-4 h-4 text-emerald-500" />
              <span>Inloggen met Google</span>
            </button>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1 leading-relaxed">
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Speler / Rechercheur:</strong>{' '}
                Maak eenvoudig een account aan met een gebruikersnaam of e-mailadres, en voer daarna
                de dossiercode in (bijv.{' '}
                <code className="font-mono text-emerald-600 dark:text-emerald-400">ZAAK-047</code>).
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-200">Beheerder / Maker:</strong>{' '}
                Log in met Google (of stel na Google-login een wachtwoord in om ook met e-mail &amp;
                wachtwoord in te loggen).
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
