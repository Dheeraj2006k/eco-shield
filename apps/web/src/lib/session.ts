'use client';

import { create } from 'zustand';
import { can } from '@iris/config';
import type { Capability, Role } from '@iris/types';

interface SessionState {
  user: { name: string; role: Role } | null;
  loaded: boolean;
  load: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  loaded: false,
  load: async () => {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' });
      if (r.ok) set({ user: (await r.json()).user, loaded: true });
      else set({ user: null, loaded: true });
    } catch {
      set({ user: null, loaded: true });
    }
  },
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    set({ user: null });
    window.location.href = '/login';
  },
}));

/** Capability check for the signed-in user. UI gating only — the server enforces the same rules. */
export function useCan(cap: Capability): boolean {
  const role = useSession((s) => s.user?.role);
  return can(role, cap);
}
