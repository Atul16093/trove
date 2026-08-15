'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, getToken } from '@/lib/api';
import { Logo } from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (getToken()) router.replace('/dashboard'); }, [router]);

  const submit = async () => {
    setError('');
    if (!email || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'register' && password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    const res = mode === 'login' ? await api.login(email, password) : await api.register(email, password, name || undefined);
    setLoading(false);
    if (res.success && res.data) { setToken(res.data.token); router.replace('/dashboard'); }
    else setError(res.message || 'Something went wrong.');
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
.tv-login{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
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

.tv-switch{font-size:13.5px;color:var(--label-2);text-align:center;margin-top:22px;}
.tv-link{color:var(--accent-text);font-weight:600;padding:2px 4px;border-radius:var(--r-xs);}
.tv-link:hover{background:var(--accent-soft);}

@media (max-width:520px){
  .tv-card{padding:28px 22px;}
  .tv-h1{font-size:23px;}
}
`;
