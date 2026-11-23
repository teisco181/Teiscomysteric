import { staticStore } from './staticStore.ts';
import type {
  AuthStatus,
  AuthUser,
  CaseFile,
  MapTemplate,
  PlayerNote,
} from './types.ts';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let backendAvailablePromise: Promise<boolean> | null = null;

async function hasBackend(): Promise<boolean> {
  if (!backendAvailablePromise) {
    backendAvailablePromise = (async () => {
      try {
        const res = await fetch('./api/auth/status');
        const contentType = res.headers.get('content-type') ?? '';
        return res.ok && contentType.includes('application/json');
      } catch {
        return false;
      }
    })();
  }
  return backendAvailablePromise;
}

async function request<T>(
  url: string,
  options: RequestInit = {},
  token: string | null = null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const normalizedUrl = url.startsWith('/api/') ? `.${url}` : url;
  const res = await fetch(normalizedUrl, {
    ...options,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) {
    throw new ApiError(data.error || 'Er is een fout opgetreden.', res.status);
  }
  return data;
}

export const api = {
  getAuthStatus: async (): Promise<AuthStatus> => {
    if (await hasBackend()) {
      return request<AuthStatus>('/api/auth/status');
    }
    return staticStore.getAuthStatus();
  },

  claimAdmin: async (
    username: string,
    password: string
  ): Promise<{ user: AuthUser; token: string }> => {
    if (await hasBackend()) {
      return request<{ user: AuthUser; token: string }>('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    }
    return staticStore.claimAdmin(username, password);
  },

  register: async (
    username: string,
    password: string
  ): Promise<{ user: AuthUser; token: string }> => {
    if (await hasBackend()) {
      return request<{ user: AuthUser; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    }
    return staticStore.register(username, password);
  },

  login: async (
    username: string,
    password: string
  ): Promise<{ user: AuthUser; token: string }> => {
    if (await hasBackend()) {
      return request<{ user: AuthUser; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    }
    return staticStore.login(username, password);
  },

  listCases: async (token: string): Promise<{ cases: CaseFile[] }> => {
    if (await hasBackend()) {
      return request<{ cases: CaseFile[] }>('/api/cases', {}, token);
    }
    return staticStore.listCases(token);
  },

  redeemCaseCode: async (
    token: string,
    code: string
  ): Promise<{ caseFile: CaseFile; alreadyUnlocked: boolean }> => {
    if (await hasBackend()) {
      return request<{ caseFile: CaseFile; alreadyUnlocked: boolean }>(
        '/api/cases/redeem',
        { method: 'POST', body: JSON.stringify({ code }) },
        token
      );
    }
    return staticStore.redeemCaseCode(token, code);
  },

  createCase: async (
    token: string,
    payload: Partial<CaseFile>
  ): Promise<{ caseFile: CaseFile }> => {
    if (await hasBackend()) {
      return request<{ caseFile: CaseFile }>(
        '/api/cases',
        { method: 'POST', body: JSON.stringify(payload) },
        token
      );
    }
    return staticStore.createCase(token, payload);
  },

  updateCase: async (
    token: string,
    caseId: string,
    caseFile: CaseFile
  ): Promise<{ caseFile: CaseFile }> => {
    if (await hasBackend()) {
      return request<{ caseFile: CaseFile }>(
        `/api/cases/${encodeURIComponent(caseId)}`,
        { method: 'PUT', body: JSON.stringify(caseFile) },
        token
      );
    }
    return staticStore.updateCase(token, caseId, caseFile);
  },

  deleteCase: async (
    token: string,
    caseId: string
  ): Promise<{ deleted: boolean }> => {
    if (await hasBackend()) {
      return request<{ deleted: boolean }>(
        `/api/cases/${encodeURIComponent(caseId)}`,
        { method: 'DELETE' },
        token
      );
    }
    return staticStore.deleteCase(token, caseId);
  },

  getNotes: async (
    token: string,
    caseId: string
  ): Promise<{ note: PlayerNote }> => {
    if (await hasBackend()) {
      return request<{ note: PlayerNote }>(
        `/api/cases/${encodeURIComponent(caseId)}/notes`,
        {},
        token
      );
    }
    return staticStore.getNotes(token, caseId);
  },

  saveNotes: async (
    token: string,
    caseId: string,
    note: Partial<PlayerNote>
  ): Promise<{ note: PlayerNote }> => {
    if (await hasBackend()) {
      return request<{ note: PlayerNote }>(
        `/api/cases/${encodeURIComponent(caseId)}/notes`,
        { method: 'PUT', body: JSON.stringify(note) },
        token
      );
    }
    return staticStore.saveNotes(token, caseId, note);
  },

  listMaps: async (token: string): Promise<{ maps: MapTemplate[] }> => {
    if (await hasBackend()) {
      return request<{ maps: MapTemplate[] }>('/api/maps', {}, token);
    }
    return staticStore.listMaps(token);
  },

  createMap: async (
    token: string,
    payload: Partial<MapTemplate>
  ): Promise<{ mapTemplate: MapTemplate }> => {
    if (await hasBackend()) {
      return request<{ mapTemplate: MapTemplate }>(
        '/api/maps',
        { method: 'POST', body: JSON.stringify(payload) },
        token
      );
    }
    return staticStore.createMap(token, payload);
  },

  updateMap: async (
    token: string,
    mapId: string,
    payload: Partial<MapTemplate>
  ): Promise<{ mapTemplate: MapTemplate }> => {
    if (await hasBackend()) {
      return request<{ mapTemplate: MapTemplate }>(
        `/api/maps/${encodeURIComponent(mapId)}`,
        { method: 'PUT', body: JSON.stringify(payload) },
        token
      );
    }
    return staticStore.updateMap(token, mapId, payload);
  },

  deleteMap: async (
    token: string,
    mapId: string
  ): Promise<{ deleted: boolean }> => {
    if (await hasBackend()) {
      return request<{ deleted: boolean }>(
        `/api/maps/${encodeURIComponent(mapId)}`,
        { method: 'DELETE' },
        token
      );
    }
    return staticStore.deleteMap(token, mapId);
  },
};
