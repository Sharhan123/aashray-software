import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';
export type DialogField = { name: string; label: string; initialValue?: string; type?: 'text' | 'password' | 'number'; required?: boolean; minLength?: number; placeholder?: string };
export type DialogOptions = { title: string; description: string; confirmLabel?: string; destructive?: boolean; fields?: DialogField[] };
type FeedbackApi = { toast: (message: string, tone?: ToastTone) => void; ask: (options: DialogOptions) => Promise<Record<string, string> | null> };

export const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider.');
  return value;
}
