import { create } from 'zustand';
import type { Environment, Role } from '@latimer-woods-tech/studio-core';

interface SessionState {
  token: string | null;
  env: Environment | null;
  user: { id: string; email: string; role: Role } | null;
  expiresAt: number | null;

  login: (token: string, env: Environment, expiresAt: number) => void;
  logout: () => void;
  hydrate: () => void;
  isAuthed: () => boolean;
}

const STORAGE_KEY = 'studio.session';

export const useSession = create<SessionState>((set, get) => ({
  token: null,
  env: null,
  user: null,
  expiresAt: null,

  login: (token, env, expiresAt) => {
    const payload = decodeJwt(token);
    const user = payload
      ? { id: payload.userId, email: payload.userEmail, role: payload.role }
      : null;
    const next = { token, env, user, expiresAt };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    set(next);
  },

  logout: () => {
    sessionStorage.removeItem(STORAGE_KEY);
    set({ token: null, env: null, user: null, expiresAt: null });
  },

  hydrate: () => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Omit<SessionState, 'login' | 'logout' | 'hydrate' | 'isAuthed'>;
      if (!parsed.expiresAt || parsed.expiresAt < Date.now()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      set(parsed);
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  },

  isAuthed: () => {
    const s = get();
    return !!s.token && !!s.expiresAt && s.expiresAt > Date.now();
  },
}));

interface DecodedPayload {
  userId: string;
  userEmail: string;
  role: Role;
}

function decodeJwt(token: string): DecodedPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1]!;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json) as unknown;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).userId !== 'string' ||
      typeof (parsed as Record<string, unknown>).userEmail !== 'string' ||
      typeof (parsed as Record<string, unknown>).role !== 'string'
    ) {
      return null;
    }
    return parsed as DecodedPayload;
  } catch {
    return null;
  }
}
