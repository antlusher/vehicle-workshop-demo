const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, options = {}, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const getDashboard = (token) =>
  request('/api/admin/dashboard', {}, token);

export const getUsers = (token) =>
  request('/api/admin/users?limit=200', {}, token);

export const createUser = (data, token) =>
  request('/api/admin/users', { method: 'POST', body: data }, token);

export const getUser = (id, token) =>
  request(`/api/admin/users/${id}`, {}, token);

export const updateUser = (id, data, token) =>
  request(`/api/admin/users/${id}`, { method: 'PATCH', body: data }, token);

export const forceLogout = (id, token) =>
  request(`/api/admin/users/${id}/logout`, { method: 'POST' }, token);

export const getAiRequests = (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/admin/ai-requests${qs ? '?' + qs : ''}`, {}, token);
};

export const getAiStats = (token) =>
  request('/api/admin/ai-requests/stats', {}, token);

export const getConversation = (projectId, token) =>
  request(`/api/admin/projects/${projectId}/conversation`, {}, token);

export const getLearningStats = (token) =>
  request('/api/admin/learning', {}, token);

export const getProjects = (token) =>
  request('/api/admin/projects', {}, token);

export const getKnowledgeBase = (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/admin/knowledge-base${qs ? '?' + qs : ''}`, {}, token);
};

export const createKbEntry = (data, token) =>
  request('/api/admin/knowledge-base', { method: 'POST', body: data }, token);

export const updateKbEntry = (id, data, token) =>
  request(`/api/admin/knowledge-base/${id}`, { method: 'PUT', body: data }, token);

export const deleteKbEntry = (id, token) =>
  request(`/api/admin/knowledge-base/${id}`, { method: 'DELETE' }, token);

export async function parsePdf(file, token) {
  const formData = new FormData();
  formData.append('pdf', file);
  const res = await fetch(`${BASE_URL}/api/admin/knowledge/parse-pdf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export const importPdfChunks = (chunks, token) =>
  request('/api/admin/knowledge/import-chunks', { method: 'POST', body: { chunks } }, token);

export const trainingChat = (question, history, token) =>
  request('/api/ai/training', { method: 'POST', body: { question, history } }, token);

export const extractKnowledge = (text, token) =>
  request('/api/ai/extract-knowledge', { method: 'POST', body: { text } }, token);

export const getCustomerStats = (id, token) =>
  request(`/api/admin/customers/${id}/stats`, {}, token);

export function estimateCost(inputTokens, outputTokens) {
  const cost = (inputTokens * 0.000003) + (outputTokens * 0.000015);
  return cost.toFixed(4);
}
