import { useCallback, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';
import { FeedbackContext, type DialogOptions, type ToastTone } from './feedbackContext';

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: ToastTone }[]>([]);
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const resolver = useRef<((value: Record<string, string> | null) => void) | null>(null);
  const sequence = useRef(0);
  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++sequence.current; setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
  }, []);
  const ask = useCallback((options: DialogOptions) => new Promise<Record<string, string> | null>((resolve) => { resolver.current = resolve; setDialog(options); }), []);
  function finish(value: Record<string, string> | null) { const resolve = resolver.current; resolver.current = null; setDialog(null); resolve?.(value); }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); finish(Object.fromEntries(form.entries()) as Record<string, string>); }
  return <FeedbackContext.Provider value={{ toast, ask }}>
    {children}
    <div className="react-toast-stack" aria-live="polite" aria-atomic="false">{toasts.map((item) => <div key={item.id} className={`react-toast toast-${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'}>{item.tone === 'error' ? <CircleAlert size={17}/> : <Check size={17}/>}<span>{item.message}</span><button aria-label="Dismiss notification" onClick={() => setToasts((items) => items.filter((entry) => entry.id !== item.id))}><X size={15}/></button></div>)}</div>
    {dialog && <div className="react-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(null); }}><section className="react-dialog" role="dialog" aria-modal="true" aria-labelledby="react-dialog-title"><button className="react-dialog-close" type="button" aria-label="Close dialog" onClick={() => finish(null)}><X size={18}/></button><h2 id="react-dialog-title">{dialog.title}</h2><p>{dialog.description}</p><form onSubmit={submit}>{dialog.fields?.map((field) => <label className="business-field" key={field.name}><span>{field.label}</span><input className="business-input" name={field.name} type={field.type ?? 'text'} defaultValue={field.initialValue} placeholder={field.placeholder} required={field.required ?? true} minLength={field.minLength}/></label>)}<div className="react-dialog-actions"><button type="button" className="business-secondary" onClick={() => finish(null)}>Cancel</button><button type="submit" className={dialog.destructive ? 'business-destructive' : 'business-primary'}>{dialog.confirmLabel ?? 'Continue'}</button></div></form></section></div>}
  </FeedbackContext.Provider>;
}
