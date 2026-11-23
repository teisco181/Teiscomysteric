import type {
  AuthStatus,
  AuthUser,
  CaseFile,
  PlayerNote,
} from './types.ts';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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

  const res = await fetch(url, {
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
  getAuthStatus: () => request<AuthStatus>('/api/auth/status'),

  claimAdmin: (username: string, password: string) =>
    request<{ user: AuthUser; token: string }>('/api/auth/claim-admin', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, password: string) =>
    request<{ user: AuthUser; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ user: AuthUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  listCases: (token: string) =>
    request<{ cases: CaseFile[] }>('/api/cases', {}, token),

  redeemCaseCode: (token: string, code: string) =>
    request<{ caseFile: CaseFile; alreadyUnlocked: boolean }>(
      '/api/cases/redeem',
      { method: 'POST', body: JSON.stringify({ code }) },
      token
    ),

  createCase: (token: string, payload: Partial<CaseFile>) =>
    request<{ caseFile: CaseFile }>(
      '/api/cases',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    ),

  updateCase: (token: string, caseId: string, caseFile: CaseFile) =>
    request<{ caseFile: CaseFile }>(
      `/api/cases/${encodeURIComponent(caseId)}`,
      { method: 'PUT', body: JSON.stringify(caseFile) },
      token
    ),

  deleteCase: (token: string, caseId: string) =>
    request<{ deleted: boolean }>(
      `/api/cases/${encodeURIComponent(caseId)}`,
      { method: 'DELETE' },
      token
    ),

  getNotes: (token: string, caseId: string) =>
    request<{ note: PlayerNote }>(
      `/api/cases/${encodeURIComponent(caseId)}/notes`,
      {},
      token
    ),

  saveNotes: (token: string, caseId: string, note: Partial<PlayerNote>) =>
    request<{ note: PlayerNote }>(
      `/api/cases/${encodeURIComponent(caseId)}/notes`,
      { method: 'PUT', body: JSON.stringify(note) },
      token
    ),
};
