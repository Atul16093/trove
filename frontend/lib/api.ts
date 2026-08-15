const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const TOKEN_KEY = 'trove_token';
export const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export interface ApiResponse<T = any> { success: boolean; code: number; message: string; data: T | null; }

async function request<T>(path: string, opts: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth')) {
    clearToken();
    window.location.href = '/login';
  }
  return res.json();
}

export interface Category {
  uuid: string; slug: string; name: string; color: string;
  /** Defaults provisioned at signup. Renameable and recolorable, never deletable. */
  isSystem?: boolean; sortOrder?: number; count: number;
}
export interface Item {
  uuid: string; kind: 'link' | 'file'; url: string | null; title: string | null; summary: string | null; imageUrl: string | null;
  // Tracking-stripped and truncated for display; `url` stays intact for opening.
  displayUrl: string | null; note: string | null;
  sourceDomain: string | null; tags: string[]; caption: string | null; status: string;
  openCount: number; lastOpenedAt: string | null;
  category: { uuid: string; slug: string; name: string; color: string } | null;
  fileName: string | null; fileMime: string | null; fileSize: number | null;
  createdAt: string; updatedAt: string;
}

export interface ItemPatch { categoryUuid?: string; title?: string; note?: string | null; tags?: string[] }

export const api = {
  register: (email: string, password: string, displayName?: string) =>
    request<{ token: string; user: any }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) }),
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  google: (idToken: string) =>
    request<{ token: string; user: any }>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
  me: () => request<any>('/auth/me'),

  categories: () => request<Category[]>('/categories'),
  createCategory: (name: string, color?: string) => request<Category>('/categories', { method: 'POST', body: JSON.stringify({ name, color }) }),
  updateCategory: (uuid: string, patch: { name?: string; color?: string }) =>
    request<Category>(`/categories/${uuid}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  // Items are never lost: the server moves them to "Other" and reports how many.
  deleteCategory: (uuid: string) =>
    request<{ moved: number; movedTo: string | null }>(`/categories/${uuid}`, { method: 'DELETE' }),
  reorderCategories: (uuids: string[]) =>
    request<Category[]>('/categories/reorder', { method: 'PATCH', body: JSON.stringify({ uuids }) }),

  items: (params: { category?: string; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.category && params.category !== 'all') q.set('category', params.category);
    if (params.search) q.set('search', params.search);
    const qs = q.toString();
    return request<Item[]>(`/items${qs ? `?${qs}` : ''}`);
  },
  saveItem: (url: string, caption?: string) => request<Item>('/items', { method: 'POST', body: JSON.stringify({ url, caption, captureSource: 'web' }) }),
  updateItem: (uuid: string, patch: ItemPatch) => request<Item>(`/items/${uuid}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteItem: (uuid: string) => request(`/items/${uuid}`, { method: 'DELETE' }),
  openItem: (uuid: string) => request<{ openCount: number }>(`/items/${uuid}/open`, { method: 'POST' }),
  // Re-queues links that never finished enrichment (stuck processing / uncategorized).
  reprocessItems: () => request<{ queued: number }>('/items/reprocess', { method: 'POST' }),

  uploadFile: async (file: File, caption?: string): Promise<ApiResponse<Item>> => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    const res = await fetch(`${BASE}/files`, {
      method: 'POST',
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) }, // no content-type: browser sets the multipart boundary
      body: form,
    });
    return res.json();
  },
  // Files need the Bearer header, so we fetch the bytes and hand back a blob URL to open.
  fileBlobUrl: async (uuid: string): Promise<string | null> => {
    const token = getToken();
    const res = await fetch(`${BASE}/files/${uuid}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  },

  telegramStatus: () => request<{ connected: boolean; username: string | null }>('/telegram/status'),
  telegramConnect: () => request<{ deepLink: string; expiresAt: string }>('/telegram/connect', { method: 'POST' }),
};
