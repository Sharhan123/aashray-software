const API_URL = import.meta.env.VITE_API_URL ?? '/api';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const NO_REFRESH_PATHS = new Set(['/auth/csrf', '/auth/login', '/auth/refresh', '/auth/logout']);

let csrfToken = '';
let csrfRequest: Promise<string> | null = null;
let sessionRefresh: Promise<boolean | null> | null = null;

async function loadCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = fetch(`${API_URL}/auth/csrf`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not verify this request. Refresh and try again.');
        const data = await response.json() as { csrfToken: string };
        csrfToken = data.csrfToken;
        return csrfToken;
      })
      .finally(() => { csrfRequest = null; });
  }
  return csrfRequest;
}

async function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!SAFE_METHODS.has(method) && path !== '/auth/login') {
    await loadCsrfToken();
    headers.set('X-CSRF-Token', csrfToken);
  }
  return fetch(`${API_URL}${path}`, { ...init, credentials: 'include', headers });
}

async function refreshSession(): Promise<boolean | null> {
  if (!sessionRefresh) {
    const rotate = async () => {
      // Another tab may already have rotated the shared cookies while this tab
      // waited for the cross-tab lock. Reuse that session before rotating again.
      const current = await fetchApi('/auth/me');
      if (current.ok) {
        const data = await current.json() as { user: import('../types').User };
        window.dispatchEvent(new CustomEvent('aashray:session-refreshed', { detail: data.user }));
        return true;
      }
      if (current.status !== 401) return null;
      const response = await fetchApi('/auth/refresh', { method: 'POST' });
      if (!response.ok) return response.status === 401 ? false : null;
      const data = await response.json() as { user: import('../types').User };
      window.dispatchEvent(new CustomEvent('aashray:session-refreshed', { detail: data.user }));
      return true;
    };
    sessionRefresh = (async () => {
      const lockManager = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: { request<T>(name: string, callback: () => Promise<T>): Promise<T> } }).locks;
      return lockManager ? lockManager.request('aashray-session-refresh', rotate) : rotate();
    })()
      .catch(() => null)
      .finally(() => { sessionRefresh = null; });
  }
  return sessionRefresh;
}

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response = await fetchApi(path, init);
  if (response.status === 401 && !NO_REFRESH_PATHS.has(path)) {
    const refreshed = await refreshSession();
    if (refreshed) response = await fetchApi(path, init);
    if (refreshed === false || (refreshed && response.status === 401)) window.dispatchEvent(new Event('aashray:auth-expired'));
  }
  return response;
}

async function throwApiError(response: Response, fallback: string): Promise<never> {
  const data = await response.json().catch(() => ({})) as { error?: string };
  throw new Error(data.error ?? fallback);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authenticatedFetch(path, init);
  if (!response.ok) return throwApiError(response, 'Something went wrong. Please try again.');
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function refreshCsrf() {
  csrfToken = '';
  return loadCsrfToken();
}

export async function login(email: string, password: string) {
  await refreshCsrf();
  const headers = new Headers({ 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken });
  const response = await fetch(`${API_URL}/auth/login`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ email, password }) });
  if (!response.ok) return throwApiError(response, 'Could not sign in. Please try again.');
  return response.json() as Promise<{ user: import('../types').User }>;
}

export const currentUser = () => request<{ user: import('../types').User }>('/auth/me');

export async function logout() {
  await request<void>('/auth/logout', { method: 'POST' });
  csrfToken = '';
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
  download: async (path: string, fileName: string) => {
    const response = await authenticatedFetch(path);
    if (!response.ok) return throwApiError(response, 'Download failed.');
    const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
  },
};
