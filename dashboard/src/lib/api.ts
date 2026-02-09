const BASE_URL = '/api/v1';

// Auth can be either JWT token (dashboard login) or API key (legacy/programmatic)
let authToken = localStorage.getItem('ecf_auth_token') || '';
let authType: 'jwt' | 'apikey' = (localStorage.getItem('ecf_auth_type') as any) || 'jwt';

export function setAuthToken(token: string, type: 'jwt' | 'apikey') {
  authToken = token;
  authType = type;
  localStorage.setItem('ecf_auth_token', token);
  localStorage.setItem('ecf_auth_type', type);
}

// Backward compat
export function setApiKey(key: string) {
  setAuthToken(key, 'apikey');
}

export function getApiKey(): string {
  return authToken;
}

export function clearAuth() {
  authToken = '';
  authType = 'jwt';
  localStorage.removeItem('ecf_auth_token');
  localStorage.removeItem('ecf_auth_type');
}

// Legacy compat
export function clearApiKey() {
  clearAuth();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error?.message || data.message || `Error ${res.status}`);
  }

  return data.data ?? data;
}

// ==================== AUTH ====================
export const auth = {
  login: (email: string, password: string) =>
    fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Login failed');
      // Response is wrapped: { success: true, data: { token, tenant } }
      return json.data ?? json;
    }),

  register: (name: string, email: string, password: string) =>
    fetch(`${BASE_URL}/tenants/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.message || 'Registration failed');
      return data.data ?? data;
    }),

  getMe: () => request<any>('/tenants/me'),
  getStats: () => request<any>('/tenants/me/stats'),

  listKeys: () => request<any[]>('/auth/keys'),
  createKey: (name: string, isLive: boolean) =>
    request<any>('/auth/keys', {
      method: 'POST',
      body: JSON.stringify({ name, isLive, scopes: ['FULL_ACCESS'] }),
    }),
  revokeKey: (id: string) =>
    request<any>(`/auth/keys/${id}`, { method: 'DELETE' }),
  rotateKey: (id: string) =>
    request<any>(`/auth/keys/${id}/rotate`, { method: 'POST' }),
};

// ==================== COMPANIES ====================
export const companies = {
  list: () => request<any[]>('/companies'),
  get: (id: string) => request<any>(`/companies/${id}`),
  create: (data: any) =>
    request<any>('/companies', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/companies/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ==================== CERTIFICATES ====================
export const certificates = {
  list: (companyId: string) => request<any[]>(`/companies/${companyId}/certificates`),
  getActive: (companyId: string) => request<any>(`/companies/${companyId}/certificates/active`),
  upload: (companyId: string, p12Base64: string, passphrase: string) =>
    request<any>(`/companies/${companyId}/certificates`, {
      method: 'POST',
      body: JSON.stringify({ companyId, p12Base64, passphrase }),
    }),
};

// ==================== SEQUENCES ====================
export const sequences = {
  list: (companyId: string) => request<any[]>(`/sequences/${companyId}`),
  create: (data: any) =>
    request<any>('/sequences', { method: 'POST', body: JSON.stringify(data) }),
};

// ==================== INVOICES ====================
export const invoices = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/invoices${query}`);
  },
  get: (id: string) => request<any>(`/invoices/${id}`),
  create: (data: any) =>
    request<any>('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  void: (id: string, reason?: string) =>
    request<any>(`/invoices/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) }),
  poll: (id: string) =>
    request<any>(`/invoices/${id}/poll`, { method: 'POST' }),
  getXml: (id: string) =>
    fetch(`${BASE_URL}/invoices/${id}/xml`, {
      headers: { Authorization: `Bearer ${authToken}` },
    }).then((r) => r.text()),
  getPreviewUrl: (id: string) =>
    `${BASE_URL}/invoices/${id}/preview`,
};

// ==================== WEBHOOKS ====================
export const webhooks = {
  list: () => request<any[]>('/webhooks'),
  get: (id: string) => request<any>(`/webhooks/${id}`),
  create: (url: string, events: string[]) =>
    request<any>('/webhooks', { method: 'POST', body: JSON.stringify({ url, events }) }),
  delete: (id: string) =>
    request<any>(`/webhooks/${id}`, { method: 'DELETE' }),
};

// ==================== CONTINGENCY ====================
export const contingency = {
  list: () => request<any[]>('/contingency'),
  stats: () => request<any>('/contingency/stats'),
  retryOne: (invoiceId: string) =>
    request<any>(`/contingency/${invoiceId}/retry`, { method: 'POST' }),
  retryAll: () =>
    request<any>('/contingency/retry-all', { method: 'POST' }),
};

// ==================== HEALTH ====================
export const health = {
  check: () => request<any>('/health'),
};

// ==================== RNC LOOKUP ====================
export const rnc = {
  validate: (rncValue: string) => request<any>(`/rnc/${rncValue}/validate`),
  lookup: (rncValue: string) => request<any>(`/rnc/${rncValue}/lookup`),
};

// ==================== BUYERS / CUSTOMERS ====================
export const buyers = {
  list: (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<any>(`/buyers${query}`);
  },
  get: (id: string) => request<any>(`/buyers/${id}`),
  create: (data: any) =>
    request<any>('/buyers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    request<any>(`/buyers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  refreshDgii: (id: string) =>
    request<any>(`/buyers/${id}/refresh-dgii`, { method: 'POST' }),
};
