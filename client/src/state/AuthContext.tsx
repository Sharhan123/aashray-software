import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { currentUser, login as loginRequest, logout as logoutRequest } from '../lib/api';
import type { AuthState } from '../types';
import { AuthContext } from './authContextValue';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  useEffect(() => { let alive = true; currentUser().then(({ user }) => { if (alive) setState({ status: 'authenticated', user }); }).catch(() => { if (alive) setState({ status: 'anonymous' }); }); return () => { alive = false; }; }, []);
  useEffect(() => {
    const sessionRefreshed = (event: Event) => { const user = (event as CustomEvent<import('../types').User>).detail; if (user) setState({ status: 'authenticated', user }); };
    const authExpired = () => setState({ status: 'anonymous' });
    window.addEventListener('aashray:session-refreshed', sessionRefreshed);
    window.addEventListener('aashray:auth-expired', authExpired);
    return () => { window.removeEventListener('aashray:session-refreshed', sessionRefreshed); window.removeEventListener('aashray:auth-expired', authExpired); };
  }, []);
  const signIn = useCallback(async (email: string, password: string) => { const { user } = await loginRequest(email, password); setState({ status: 'authenticated', user }); }, []);
  const signOut = useCallback(async () => { try { await logoutRequest(); } finally { setState({ status: 'anonymous' }); } }, []);
  const value = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
