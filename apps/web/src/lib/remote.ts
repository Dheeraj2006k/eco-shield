'use client';

/** Client for the FastAPI backend (remote data source). */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const remoteAvailable = () => API_URL.length > 0;

let cached: { token: string; exp: number } | null = null;

export async function getToken(force = false): Promise<string> {
  if (!force && cached && cached.exp > Date.now() + 30_000) return cached.token;
  const r = await fetch('/api/backend-token', { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 401 ? 'Session expired — sign in again' : 'Could not obtain backend token');
  const j = (await r.json()) as { token: string; expires_in: number };
  cached = { token: j.token, exp: Date.now() + j.expires_in * 1000 };
  return j.token;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const go = async (force: boolean) => {
    const token = await getToken(force);
    return fetch(`${API_URL}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  };
  let r = await go(false);
  if (r.status === 401) r = await go(true);
  if (!r.ok) {
    let detail = r.statusText;
    try {
      const j = await r.json();
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    } catch {}
    throw new ApiError(r.status, detail);
  }
  return (await r.json()) as T;
}

export interface StateHandlers {
  onState: (data: unknown) => void;
  onStatus: (s: 'connecting' | 'live' | 'error', detail?: string) => void;
}

/** Opens /ws/state with automatic reconnect (fresh token each attempt). Returns a close function. */
export function connectState(h: StateHandlers): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  const open = async () => {
    if (closed) return;
    h.onStatus('connecting');
    try {
      const token = await getToken(attempts > 0);
      ws = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/ws/state?token=${encodeURIComponent(token)}`);
    } catch (e) {
      schedule((e as Error).message);
      return;
    }
    ws.onopen = () => {
      attempts = 0;
      h.onStatus('live');
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (m.type === 'state') h.onState(m.data);
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = (ev) => {
      if (!closed) schedule(ev.code === 4401 ? 'Backend rejected the token' : 'Connection lost');
    };
  };
  const schedule = (why: string) => {
    if (closed) return;
    attempts++;
    h.onStatus('error', why);
    retry = setTimeout(open, Math.min(15_000, 2000 * attempts));
  };
  open();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    ws?.close();
  };
}
