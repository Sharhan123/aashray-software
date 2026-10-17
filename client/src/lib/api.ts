const API_URL = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/auth/login' && !csrfToken) await refreshCsrf();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...init.headers as Record<string, string> };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/auth/login') headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include', headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? 'Something went wrong. Please try again.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

let csrfToken = '';
export async function refreshCsrf() {
  const data = await request<{ csrfToken: string }>('/auth/csrf');
  csrfToken = data.csrfToken;
  return csrfToken;
}
export async function login(email: string, password: string) {
  await refreshCsrf();
  return request<{ user: import('../types').User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), headers: { 'X-CSRF-Token': csrfToken } });
}
export const currentUser = () => request<{ user: import('../types').User }>('/auth/me');
export async function logout() {
  if (!csrfToken) await refreshCsrf();
  await request<void>('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
  csrfToken = '';
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
  download: async (path: string, fileName: string) => {
    const response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
    if (!response.ok) { const data = await response.json().catch(() => ({})) as { error?: string }; throw new Error(data.error ?? 'Download failed.'); }
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
  },
};
