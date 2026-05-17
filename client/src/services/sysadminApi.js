const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, options = {}, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const getSysStats      = (token) => request('/api/sysadmin/stats', {}, token);
export const actAs            = (workshopId, token) => request(`/api/sysadmin/act-as/${workshopId}`, { method: 'POST' }, token);
export const exitActAs        = (actorToken, token) => request('/api/sysadmin/act-as', { method: 'DELETE', body: { actorToken } }, token);
export const getWorkshops     = (token) => request('/api/sysadmin/workshops', {}, token);
export const getWorkshop      = (id, token) => request(`/api/sysadmin/workshops/${id}`, {}, token);
export const createWorkshop   = (data, token) => request('/api/sysadmin/workshops', { method: 'POST', body: data }, token);
export const updateWorkshop   = (id, data, token) => request(`/api/sysadmin/workshops/${id}`, { method: 'PATCH', body: data }, token);

export const getBrainEntries  = (token, params = {}) => {
  const q = new URLSearchParams(params).toString();
  return request(`/api/sysadmin/brain${q ? '?' + q : ''}`, {}, token);
};
export const createBrainEntry = (data, token) => request('/api/sysadmin/brain', { method: 'POST', body: data }, token);
export const updateBrainEntry = (id, data, token) => request(`/api/sysadmin/brain/${id}`, { method: 'PATCH', body: data }, token);
export const deleteBrainEntry = (id, token) => request(`/api/sysadmin/brain/${id}`, { method: 'DELETE' }, token);
export const promoteToGlobal  = (id, token) => request(`/api/sysadmin/brain/promote/${id}`, { method: 'POST' }, token);

export const getSysAdmins     = (token) => request('/api/sysadmin/sysadmins', {}, token);
export const createSysAdmin   = (data, token) => request('/api/sysadmin/sysadmins', { method: 'POST', body: data }, token);
export const deleteSysAdmin   = (id, token) => request(`/api/sysadmin/sysadmins/${id}`, { method: 'DELETE' }, token);

export const getWorkshopAnalytics = (id, token) => request(`/api/sysadmin/workshops/${id}/analytics`, {}, token);
export const getWorkshopUsers   = (id, token) => request(`/api/sysadmin/workshops/${id}/users`, {}, token);
export const createWorkshopUser = (workshopId, data, token) =>
  request(`/api/sysadmin/workshops/${workshopId}/users`, { method: 'POST', body: data }, token);
export const updateWorkshopUser = (workshopId, userId, data, token) =>
  request(`/api/sysadmin/workshops/${workshopId}/users/${userId}`, { method: 'PATCH', body: data }, token);
export const deleteWorkshopUser = (workshopId, userId, token) =>
  request(`/api/sysadmin/workshops/${workshopId}/users/${userId}`, { method: 'DELETE' }, token);

// RAG Traces
export const getTraces         = (params, token) => request(`/api/sysadmin/traces?${new URLSearchParams(params)}`, {}, token);
export const getTraceStats     = (token) => request('/api/sysadmin/traces/stats', {}, token);
export const getTrace          = (id, token) => request(`/api/sysadmin/traces/${id}`, {}, token);
export const evaluateTrace     = (id, token) => request(`/api/sysadmin/traces/${id}/evaluate`, { method: 'POST' }, token);
export const evaluatePending   = (limit, token) => request('/api/sysadmin/traces/evaluate-pending', { method: 'POST', body: { limit } }, token);
export const getKbQuality      = (token) => request('/api/sysadmin/kb-quality', {}, token);
