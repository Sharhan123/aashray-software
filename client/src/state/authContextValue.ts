import { createContext } from 'react';
import type { AuthState } from '../types';

export interface AuthContextValue { state: AuthState; signIn(email: string, password: string): Promise<void>; signOut(): Promise<void> }
export const AuthContext = createContext<AuthContextValue | null>(null);
