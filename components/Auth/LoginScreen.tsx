import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, ShieldCheck, UserRound, Zap } from 'lucide-react';

interface LoginScreenProps {
  isSupabaseConfigured: boolean;
  error?: string | null;
  expiredMessage?: string | null;
  onLogin: (identifier: string, password: string) => Promise<void>;
}

const FAILURES_KEY   = 'lopar_login_failures';
const LOCK_UNTIL_KEY = 'lopar_login_lock_until';
const MAX_FAILURES   = 5;
const LOCK_MS        = 5 * 60 * 1000;

const readFailures  = () => Number(localStorage.getItem(FAILURES_KEY)   ?? 0);
const readLockUntil = () => Number(localStorage.getItem(LOCK_UNTIL_KEY) ?? 0);

// ─── reCAPTCHA-style widget ───────────────────────────────────────────────────

const HumanCheckbox: React.FC<{ verified: boolean; onVerify: () => void }> = ({ verified, onVerify }) => {
  const [verifying, setVerifying] = useState(false);

  const handleClick = () => {
    if (verified || verifying) return;
    setVerifying(true);
    setTimeout(() => { setVerifying(false); onVerify(); }, 1_400);
  };

  return (
    <div className="flex items-center justify-between rounded-[4px] border border-[#c1c1c1] bg-[#f9f9f9] px-4 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.10)]">
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={handleClick}
          aria-label="No soy un robot"
          style={{ cursor: verified ? 'default' : 'pointer' }}
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 border-[#c1c1c1] bg-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          {verifying && (
            <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v3l2.5-2.5L12 0v3a9 9 0 100 18v-3l-2.5 2.5L12 24v-3a8 8 0 01-8-8z" />
            </svg>
          )}
          {!verifying && verified && (
            <svg className="h-4 w-4 text-[#4285f4]" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <span className="select-none text-sm text-[#444]">No soy un robot</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="32" fill="#4285f4"/>
          <path d="M32 14a18 18 0 1 0 18 18A18 18 0 0 0 32 14zm0 4a14 14 0 1 1-14 14 14 14 0 0 1 14-14z" fill="white" fillOpacity="0.3"/>
          <path d="M32 20a12 12 0 1 0 12 12A12 12 0 0 0 32 20zm-1 17.5l-5.5-5.5 2.1-2.1 3.4 3.4 7.4-7.4 2.1 2.1z" fill="white"/>
        </svg>
        <span className="text-[9px] font-semibold leading-none text-[#555]">reCAPTCHA</span>
        <span className="text-[8px] leading-none text-[#999]">Privacidad · Términos</span>
      </div>
    </div>
  );
};

// ─── Input wrapper ────────────────────────────────────────────────────────────

const InputField: React.FC<{
  label: string;
  icon: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, icon, right, children }) => (
  <div className="space-y-1.5">
    <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{label}</span>
    <div className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 transition-all focus-within:border-orange-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-orange-500/10">
      <span className="text-slate-400 transition group-focus-within:text-orange-500">{icon}</span>
      {children}
      {right}
    </div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

const LoginScreen: React.FC<LoginScreenProps> = ({ isSupabaseConfigured, error, expiredMessage, onLogin }) => {
  const [step,       setStep]       = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [verified,   setVerified]   = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lockUntil,  setLockUntil]  = useState(readLockUntil);

  const lockSeconds = useMemo(() => {
    const r = lockUntil - Date.now();
    return r > 0 ? Math.ceil(r / 1000) : 0;
  }, [lockUntil]);

  React.useEffect(() => {
    if (lockSeconds <= 0) return;
    const id = setInterval(() => setLockUntil(readLockUntil()), 1_000);
    return () => clearInterval(id);
  }, [lockSeconds]);

  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!identifier.trim()) {
      setLocalError('Ingresa tu usuario o correo para continuar.');
      return;
    }
    setStep(2);
  };

  const goBack = () => {
    setStep(1);
    setLocalError(null);
    setPassword('');
    setVerified(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!isSupabaseConfigured) { setLocalError('Supabase no está configurado.'); return; }
    if (lockSeconds > 0)       { setLocalError(`Demasiados intentos. Espera ${lockSeconds}s.`); return; }
    if (!password.trim())      { setLocalError('Ingresa tu contraseña.'); return; }
    if (!verified)             { setLocalError('Completa la verificación "No soy un robot".'); return; }

    setLoading(true);
    try {
      await onLogin(identifier, password);
      localStorage.removeItem(FAILURES_KEY);
      localStorage.removeItem(LOCK_UNTIL_KEY);
    } catch (err) {
      const failures = readFailures() + 1;
      localStorage.setItem(FAILURES_KEY, String(failures));
      if (failures >= MAX_FAILURES) {
        const nextLock = Date.now() + LOCK_MS;
        localStorage.setItem(LOCK_UNTIL_KEY, String(nextLock));
        setLockUntil(nextLock);
        localStorage.setItem(FAILURES_KEY, '0');
      }
      setLocalError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
      setVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const displayError = localError || error || expiredMessage;
  const failuresLeft = MAX_FAILURES - readFailures();

  return (
    <div className="flex min-h-screen">

      {/* ── LEFT: photo panel ──────────────────────────────────────────────── */}
      <div className="relative hidden w-1/2 md:flex md:flex-col">
        {/* Photo */}
        <img
          src="/imagen-login-01.jpg"
          alt="Instalaciones GRUPO LOPAR"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Gradient overlay — lighter to show more of the photo */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-900/40 to-slate-950/80" />

        {/* Vertical layout: top → center → bottom */}
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">

          {/* Top: small logo badge */}
          <div className="flex items-center gap-3">

          </div>

          {/* Center: hero branding */}
          <div>
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-gradient-to-br from-orange-500 to-orange-700 shadow-2xl shadow-orange-900/60 ring-4 ring-white/10">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
                <path d="M3 17h18v2a1 1 0 01-1 1H4a1 1 0 01-1-1v-2z" fill="white" fillOpacity="0.95"/>
                <path d="M12 3C8.5 3 5.5 5.5 5 9H4a1 1 0 00-1 1v4h18v-4a1 1 0 00-1-1h-1C18.5 5.5 15.5 3 12 3z" fill="white"/>
              </svg>
              <Zap className="absolute h-3 w-3 translate-x-5 translate-y-4 fill-orange-300 text-orange-300" />
            </div>

            <h1 className="text-6xl font-black leading-[0.95] tracking-tight text-white xl:text-7xl">
              GRUPO<br />
              <span className="text-orange-400">LOPAR</span>
            </h1>
            <p className="mt-4 text-base font-black uppercase tracking-[0.35em] text-white/60">
              Industrial OS
            </p>
            <p className="mt-5 max-w-[280px] text-sm font-medium leading-relaxed text-slate-300/80">
              Sistema de gestión industrial para sucursales, materiales y concretera.
            </p>
          </div>

          {/* Bottom: areas + footer */}
          <div className="space-y-4">
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30">Áreas del sistema</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Materiales', dot: 'bg-blue-400'   },
                { label: 'Concretera', dot: 'bg-green-400'  },
                { label: 'Logística',  dot: 'bg-amber-400'  },
                { label: 'Global',     dot: 'bg-purple-400' },
              ].map(({ label, dot }) => (
                <div key={label} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 backdrop-blur-sm">
                  <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  <span className="text-xs font-bold tracking-wide text-white/70">{label}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[10px] text-white/25">© {new Date().getFullYear()} Grupo Lopar. Todos los derechos reservados.</p>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                <span className="text-[9px] font-bold text-emerald-400">Sesión segura</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── RIGHT: form panel ──────────────────────────────────────────────── */}
      <div className="flex w-full items-center justify-center bg-slate-50 px-6 py-10 md:w-1/2">
        <div className="w-full max-w-sm">

          {/* Card */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-[0_8px_48px_rgba(0,0,0,0.09)] xl:p-10">

            {/* Step indicator */}
            <div className="mb-7 flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? 'w-6 bg-orange-500' : 'w-3 bg-slate-200'}`} />
                <span className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? 'w-6 bg-orange-500' : 'w-3 bg-slate-200'}`} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Paso {step} de 2
              </span>
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-2xl font-black tracking-tight text-slate-900">
                {step === 1 ? 'Iniciar sesión' : 'Verificar identidad'}
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                {step === 1
                  ? 'Ingresa tu usuario corporativo para continuar.'
                  : 'Ingresa tu contraseña y confirma que no eres un robot.'}
              </p>
            </div>

            {/* Error */}
            {displayError && (
              <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                <svg className="mt-0.5 h-4 w-4 shrink-0 fill-current" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                </svg>
                <span>{displayError}</span>
              </div>
            )}

            {/* Supabase warning */}
            {!isSupabaseConfigured && (
              <div className="mb-5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">
                Configura <code className="font-black">VITE_SUPABASE_URL</code> y <code className="font-black">VITE_SUPABASE_ANON_KEY</code>.
              </div>
            )}

            {/* ── STEP 1: identifier ── */}
            {step === 1 && (
              <form onSubmit={goToStep2} className="space-y-5">
                <InputField label="Usuario o correo" icon={<UserRound className="h-4 w-4" />}>
                  <input
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                    placeholder="usuario@empresa.com"
                    autoComplete="username"
                    autoFocus
                  />
                </InputField>

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:from-orange-600 hover:to-orange-500 hover:shadow-xl hover:shadow-orange-600/25 active:scale-[0.98]"
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            )}

            {/* ── STEP 2: password + captcha ── */}
            {step === 2 && (
              <form onSubmit={submit} className="space-y-5">
                {/* Identifier pill (read-only) */}
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                      <UserRound className="h-3.5 w-3.5 text-orange-600" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{identifier}</span>
                  </div>
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-orange-500 transition hover:text-orange-700"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Cambiar
                  </button>
                </div>

                {/* Password */}
                <InputField
                  label="Contraseña"
                  icon={<Lock className="h-4 w-4" />}
                  right={
                    <button
                      type="button"
                      onClick={() => setShowPass(p => !p)}
                      className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                      aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                >
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    autoFocus
                  />
                </InputField>

                {/* reCAPTCHA */}
                <div className="space-y-1.5">
                  <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Verificación</span>
                  <HumanCheckbox verified={verified} onVerify={() => setVerified(true)} />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || lockSeconds > 0}
                  className="mt-2 w-full rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-slate-900/20 transition-all duration-200 hover:from-orange-600 hover:to-orange-500 hover:shadow-xl hover:shadow-orange-600/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
                      </svg>
                      Validando acceso...
                    </span>
                  ) : lockSeconds > 0 ? (
                    `Bloqueado — espera ${lockSeconds}s`
                  ) : (
                    'Iniciar sesión'
                  )}
                </button>

                {/* Attempts warning */}
                {lockSeconds === 0 && readFailures() > 0 && (
                  <p className="text-center text-[11px] font-semibold text-amber-600">
                    {failuresLeft} intento{failuresLeft !== 1 ? 's' : ''} restante{failuresLeft !== 1 ? 's' : ''} antes del bloqueo
                  </p>
                )}
              </form>
            )}
          </div>

          {/* Below card: footer */}
          <p className="mt-5 text-center text-[11px] text-slate-400">
            Sistema de uso interno — acceso restringido al personal autorizado
          </p>
        </div>
      </div>

    </div>
  );
};

export default LoginScreen;