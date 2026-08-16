'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Script from 'next/script';
import { api, setToken, getToken } from '@/lib/api';
import { Logo } from '@/components/Logo';

/** Minimal typings for the slice of Google Identity Services we actually use. */
interface GoogleCredentialResponse { credential?: string; select_by?: string }
interface GoogleIdConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}
interface GoogleButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  logo_alignment?: 'left' | 'center';
  width?: number;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfig) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
          cancel: () => void;
        };
      };
    };
  }
}

// Inlined at build time, so it must be referenced as a full static expression.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const googleBox = useRef<HTMLDivElement>(null);

  useEffect(() => { if (getToken()) router.replace('/dashboard'); }, [router]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID && process.env.NODE_ENV === 'development') {
      console.warn('Google sign-in hidden: NEXT_PUBLIC_GOOGLE_CLIENT_ID is not set');
    }
  }, []);

  /**
   * Same success path as email/password: store the token and go to the
   * dashboard. The backend's /auth/google is find-or-create, so this one
   * button covers both signing in and signing up.
   */
  const onGoogleCredential = useCallback(async (response: GoogleCredentialResponse) => {
    if (!response?.credential) { setError('Google sign-in was cancelled.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.google(response.credential);
      if (res.success && res.data) { setToken(res.data.token); router.replace('/dashboard'); }
      else setError(res.message || 'Google sign-in failed.');
    } catch (e) {
      console.error('[login] google sign-in failed', e);
      setError('Google sign-in failed. Check the console for details.');
    } finally {
      // finally, not a trailing call: anything thrown above must not leave the
      // button stuck on "Please wait…" with no explanation.
      setLoading(false);
    }
  }, [router]);

  // GIS captures the callback once at initialize(); route it through a ref so it
  // always reaches the current closure instead of the one from first render.
  const credentialHandler = useRef(onGoogleCredential);
  useEffect(() => { credentialHandler.current = onGoogleCredential; });

  const renderGoogleButton = useCallback(() => {
    const box = googleBox.current;
    const gid = window.google?.accounts?.id;
    if (!box || !gid) return;
    // Google's button takes a pixel width, so match the card and re-render on
    // resize. Clearing first stops buttons stacking on re-render / StrictMode.
    box.innerHTML = '';
    gid.renderButton(box, {
      type: 'standard',
      // 'outline' in both themes on purpose: filled_black/filled_blue sit the G
      // on a white disc, which reads as a badge stuck on a button. Outline uses
      // the bare multicolour G, and a light pill is the standard, high-contrast
      // treatment on a dark surface.
      theme: 'outline',
      size: 'large',
      shape: 'pill', // matches the app's pill buttons
      text: 'continue_with',
      logo_alignment: 'center', // keeps the G tight to the label instead of far left
      width: Math.round(Math.min(400, Math.max(200, box.offsetWidth || 320))),
    });
  }, []);

  useEffect(() => {
    if (!gisReady || !GOOGLE_CLIENT_ID) return;
    const gid = window.google?.accounts?.id;
    if (!gid) return;

    gid.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => credentialHandler.current(response),
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    renderGoogleButton();

    // Google's button takes a pixel width, so re-render it when the card resizes.
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(t); t = setTimeout(renderGoogleButton, 150); };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [gisReady, renderGoogleButton]);

  const submit = async () => {
    setError('');
    if (!email || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'register' && password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.register(email, password, name || undefined);
      if (res.success && res.data) { setToken(res.data.token); router.replace('/dashboard'); }
      else setError(res.message || 'Something went wrong.');
    } catch (e) {
      console.error('[login] sign-in failed', e);
      setError('Something went wrong. Check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tv-login">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="tv-card">
        <div className="tv-brand"><Logo size={26} className="tv-logo" /><span className="tv-word">Trove</span></div>
        <h1 className="tv-h1">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="tv-sub">Save anything, find everything.</p>

        {mode === 'register' && (
          <input className="tv-input" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input className="tv-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="tv-input" type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />

        {error && <div className="tv-error">{error}</div>}

        <button className="tv-primary" onClick={submit} disabled={loading}>
          {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        {/* Shown in both modes — Google sign-in creates the account if needed.
            Hidden entirely (divider included) when no client ID is configured. */}
        {GOOGLE_CLIENT_ID && (
          <>
            <div className="tv-or"><span>or</span></div>
            <div className="tv-gbtn" ref={googleBox} />
            <Script
              src="https://accounts.google.com/gsi/client"
              strategy="afterInteractive"
              onReady={() => setGisReady(true)}
              onError={() => setError('Could not load Google sign-in.')}
            />
          </>
        )}

        <div className="tv-switch">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button className="tv-link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.tv-login{position:relative;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:var(--font-sans);color:var(--label);letter-spacing:-0.01em;
  background:
    radial-gradient(900px 560px at 12% -10%, var(--wash-1), transparent 62%),
    radial-gradient(760px 480px at 92% 108%, var(--wash-2), transparent 58%),
    var(--base);}
:where(.tv-login button){font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;
  transition:background var(--dur-fast) var(--ease),color var(--dur-fast) var(--ease),
    box-shadow var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease),filter var(--dur-fast) var(--ease);}
:where(.tv-login button):active{transform:scale(.97);}

/* frosted card floating on the wash */
.tv-card{width:400px;max-width:100%;padding:34px 32px;border-radius:var(--r-xl);
  background:var(--material-thick);
  -webkit-backdrop-filter:var(--material-blur);backdrop-filter:var(--material-blur);
  box-shadow:var(--shadow-3);animation:tv-card-in var(--dur) var(--ease) both;}
@keyframes tv-card-in{from{opacity:0;transform:translateY(10px) scale(.98);}to{opacity:1;transform:none;}}

.tv-brand{display:flex;align-items:center;gap:10px;margin-bottom:26px;}
.tv-logo{color:var(--accent);flex-shrink:0;}
.tv-word{font-size:21px;font-weight:600;letter-spacing:-0.035em;}
.tv-h1{font-size:26px;font-weight:700;letter-spacing:-0.032em;line-height:1.2;}
.tv-sub{font-size:14px;color:var(--label-2);margin:8px 0 26px;}

.tv-input{width:100%;height:46px;padding:0 15px;margin-bottom:11px;border:none;border-radius:var(--r-md);
  background:var(--fill-2);font-size:15px;color:var(--label);outline:none;
  transition:background var(--dur-fast) var(--ease),box-shadow var(--dur-fast) var(--ease);}
.tv-input::placeholder{color:var(--label-3);}
.tv-input:focus{background:var(--surface);box-shadow:0 0 0 4px var(--accent-ring);}

.tv-error{font-size:13.5px;color:var(--danger);background:var(--danger-soft);
  padding:10px 13px;border-radius:var(--r-sm);margin:4px 0 13px;line-height:1.45;}

.tv-primary{width:100%;height:48px;margin-top:6px;border-radius:var(--r-pill);
  background:var(--accent-fill);color:var(--on-accent);font-size:15px;font-weight:600;box-shadow:var(--shadow-1);}
.tv-primary:hover:not(:disabled){filter:brightness(1.07);box-shadow:var(--shadow-2);}
.tv-primary:disabled{opacity:.55;cursor:default;transform:none;}

.tv-or{display:flex;align-items:center;gap:12px;margin:20px 0 16px;
  font-size:12px;font-weight:500;letter-spacing:.02em;color:var(--label-3);}
.tv-or::before,.tv-or::after{content:'';flex:1;height:1px;background:var(--separator);}
/* min-height reserves the row so the card doesn't jump when GIS paints */
.tv-gbtn{display:flex;justify-content:center;min-height:44px;}
/* Google owns the button itself; we only give its wrapper the same depth,
   hover lift and press-scale as .tv-primary so the two read as one system. */
.tv-gbtn > div{border-radius:var(--r-pill);box-shadow:var(--shadow-1);
  transition:box-shadow var(--dur-fast) var(--ease),transform var(--dur-fast) var(--ease);}
.tv-gbtn > div:hover{box-shadow:var(--shadow-2);}
.tv-gbtn > div:active{transform:scale(.97);}

.tv-switch{font-size:13.5px;color:var(--label-2);text-align:center;margin-top:22px;}
.tv-link{color:var(--accent-text);font-weight:600;padding:2px 4px;border-radius:var(--r-xs);}
.tv-link:hover{background:var(--accent-soft);}

@media (max-width:520px){
  .tv-card{padding:28px 22px;}
  .tv-h1{font-size:23px;}
}
`;
