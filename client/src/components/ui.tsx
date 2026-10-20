import { LoaderCircle, Search, ChevronDown, X, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Theme = 'light' | 'dark';
function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem('aashray-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Storage may be disabled; fall back to the system preference. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
      // Workspace theme rules are scoped to the app shell, while the pre-paint
      // theme bootstrap and browser color scheme live on the document root.
      document.querySelector<HTMLElement>('.app-shell')?.setAttribute('data-theme', theme);
    try { window.localStorage.setItem('aashray-theme', theme); } catch { /* Theme still applies for this session. */ }
  }, [theme]);
  return <button type="button" className={`theme-toggle ${className}`.trim()} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><span className="theme-toggle-icon">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</span><span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span></button>;
}

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'icon';
export function Button({ variant = 'secondary', label, children, className = '', ...props }: { variant?: ButtonVariant; label?: string; children?: ReactNode; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClass = { primary: 'business-primary', secondary: 'business-secondary', destructive: 'business-destructive', ghost: 'business-ghost', icon: 'business-icon-button' }[variant];
  return <button {...props} className={`${variantClass} ${className}`.trim()} aria-label={label ?? props['aria-label']}>{children}</button>;
}

export function LoadingScreen() { return <div className="loading-screen" role="status"><LoaderCircle className="spin" size={24} /><span>Preparing your workspace</span></div>; }
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action && <div className="heading-action">{action}</div>}</div>;
}
export function EmptyState({ title, body, icon }: { title: string; body: string; icon?: ReactNode }) { return <div className="empty-state"><div className="empty-icon">{icon ?? <Search size={20} />}</div><h3>{title}</h3><p>{body}</p></div>; }
export function StatusBadge({ children }: { children: ReactNode }) { return <span className="status-badge"><span />{children}</span>; }
export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) { return <Button variant="icon" label={label} onClick={onClick}>{children}</Button>; }
export function CloseButton({ onClick }: { onClick: () => void }) { return <IconButton label="Close navigation" onClick={onClick}><X size={19} /></IconButton>; }
export function ProfileButton({ name, email, onClick }: { name: string; email: string; onClick: () => void }) { return <button className="profile-button" onClick={onClick}><span className="avatar">{name.slice(0,1).toUpperCase()}</span><span className="profile-copy"><b>{name}</b><small>{email}</small></span><ChevronDown size={15} /></button>; }
