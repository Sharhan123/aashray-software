import { LoaderCircle, Search, ChevronDown, X } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

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
