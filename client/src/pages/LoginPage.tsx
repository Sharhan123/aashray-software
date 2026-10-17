import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AashrayLogo } from '../components/BrandMark';
import { useAuth } from '../state/useAuth';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address.').max(254), password: z.string().min(1, 'Enter your password.').max(200) });
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { signIn } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [visible, setVisible] = useState(false); const [serverError, setServerError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema), mode: 'onBlur' });
  const onSubmit = handleSubmit(async (values) => {
    setServerError('');
    try { await signIn(values.email, values.password); navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true }); }
    catch (error) { setServerError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.'); }
  });

  return <main className="login-page">
    <section className="login-form-side" aria-labelledby="welcome-title">
      <div className="mobile-brand"><AashrayLogo className="login-brand-logo" /></div>
      <div className="login-content">
        <div className="login-kicker"><span className="kicker-line" /> SECURE TEAM ACCESS</div>
        <h1 id="welcome-title">Welcome<br className="desktop-break" /> <span>back.</span></h1>
        <p className="login-intro">Sign in to manage your Aashray workspace.</p>
        <form className="login-form" onSubmit={onSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="email">Email address</label>
            <div className={`input-wrap ${errors.email ? 'input-invalid' : ''}`}><Mail size={18} /><input id="email" autoComplete="username" inputMode="email" placeholder="you@aashrayhospitality.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} {...register('email')} /></div>
            {errors.email && <p className="field-error" id="email-error">{errors.email.message}</p>}
          </div>
          <div className="field-group">
            <label htmlFor="password">Password</label>
            <div className={`input-wrap ${errors.password ? 'input-invalid' : ''}`}><LockKeyhole size={18} /><input id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} {...register('password')} /><button className="password-toggle" type="button" onClick={() => setVisible((shown) => !shown)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {errors.password && <p className="field-error" id="password-error">{errors.password.message}</p>}
          </div>
          {serverError && <div className="form-alert" role="alert"><ShieldCheck size={17} />{serverError}</div>}
          <button className="sign-in-button" type="submit" disabled={isSubmitting}>{isSubmitting ? <><span className="button-spinner" /> Signing in…</> : <>Sign in to workspace <ArrowRight size={18} /></>}</button>
        </form>
        <div className="secure-note"><span><ShieldCheck size={16} /></span><p>Your connection is protected with secure, encrypted access.</p></div>
      </div>
      <footer className="login-footer"><span>© {new Date().getFullYear()} Aashray Hospitality</span><span className="sign-in-help"><KeyRound size={13} /> Contact your workspace administrator for help.</span></footer>
    </section>
    <aside className="login-art" aria-label="Aashray Hospitality resident management">
      <div className="art-gradient" /> <div className="art-grid" />
      <div className="art-brand"><AashrayLogo className="login-brand-logo" /></div>
      <div className="art-message"><div className="art-overline"><Sparkles size={15} /> A CALMER WAY TO MANAGE</div><h2>Room to grow.<br /><span>Space to thrive.</span></h2><p>Your residents, rooms and operations, thoughtfully brought together.</p></div>
      <div className="residence-illustration" aria-hidden="true">
        <div className="sun-orbit orbit-one" /><div className="sun-orbit orbit-two" /><div className="sun-disc" />
        <div className="building building-back"><i /><i /><i /><i /></div>
        <div className="building building-front"><div className="building-roof" /><div className="building-label">AASHRAY <small>RESIDENCES</small></div><div className="window-grid"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="door" /><div className="balcony-line" /></div>
        <div className="plant plant-left"><i /><i /><i /><b /></div><div className="plant plant-right"><i /><i /><i /><b /></div>
        <div className="ground-line" />
      </div>
      <div className="art-bottom"><span className="art-dot" /> A better stay starts with a better system <span>01 / 01</span></div>
    </aside>
  </main>;
}
