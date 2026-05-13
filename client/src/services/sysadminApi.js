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
export const getWorkshops     = (token) => request('/api/sysadmin/workshops', {}, token);
export const getWorkshop      = (id, token) => request(`/api/sysadmin/workshops/${id}`, {}, token);
export const createWorkshop   = (data, token) => request('/api/sysadmin/workshops', { method: 'POST', body: data }, token);
export const updateWorkshop   = (id, data, token) => request(`/api/sysadmin/workshops/${id}`, { method: 'PATCH', body: data }, token);

export const getSysAdmins     = (token) => request('/api/sysadmin/sysadmins', {}, token);
export const createSysAdmin   = (data, token) => request('/api/sysadmin/sysadmins', { method: 'POST', body: data }, token);
export const deleteSysAdmin   = (id, token) => request(`/api/sysadmin/sysadmins/${id}`, { method: 'DELETE' }, token);

export const getWorkshopUsers   = (id, token) => request(`/api/sysadmin/workshops/${id}/users`, {}, token);
export const createWorkshopUser = (workshopId, data, token) =>
  request(`/api/sysadmin/workshops/${workshopId}/users`, { method: 'POST', body: data }, token);
export const updateWorkshopUser = (workshopId, userId, data, token) =>
  request(`/api/sysadmin/workshops/${workshopId}/users/${userId}`, { method: 'PATCH', body: data }, token);
export const deleteWorkshopUser = (workshopId, userId, token) =>
  request(`/api/sysadmin/workshops/${workshopId}/users/${userId}`, { method: 'DELETE' }, token);
