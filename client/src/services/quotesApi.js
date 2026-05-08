const BASE = '/api/quotes';

async function request(url, options = {}, token) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const searchParts = (q, { make, model, engineCode } = {}, token) => {
  const params = new URLSearchParams({ q: q || '' });
  if (make) params.set('make', make);
  if (model) params.set('model', model);
  if (engineCode) params.set('engine_code', engineCode);
  return request(`${BASE}/parts/search?${params}`, {}, token);
};

export const getSettings = (token) => request(`${BASE}/settings`, {}, token);
export const updateSettings = (data, token) => request(`${BASE}/settings`, { method: 'PATCH', body: data }, token);

export const getQuotes = (projectId, token) =>
  request(`${BASE}?project_id=${projectId}`, {}, token);

export const createQuote = (data, token) =>
  request(BASE, { method: 'POST', body: data }, token);

export const updateQuote = (id, data, token) =>
  request(`${BASE}/${id}`, { method: 'PATCH', body: data }, token);

export const deleteQuote = (id, token) =>
  request(`${BASE}/${id}`, { method: 'DELETE' }, token);

export const addLine = (quoteId, data, token) =>
  request(`${BASE}/${quoteId}/lines`, { method: 'POST', body: data }, token);

export const updateLine = (quoteId, lineId, data, token) =>
  request(`${BASE}/${quoteId}/lines/${lineId}`, { method: 'PATCH', body: data }, token);

export const deleteLine = (quoteId, lineId, token) =>
  request(`${BASE}/${quoteId}/lines/${lineId}`, { method: 'DELETE' }, token);
