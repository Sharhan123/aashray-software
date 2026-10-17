export type Role = 'SUPER_ADMIN' | 'STAFF';
export interface User { id: string; name: string; email: string; role: Role; permissions: string[] }
export type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: User };
