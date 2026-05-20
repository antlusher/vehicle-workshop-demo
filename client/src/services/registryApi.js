const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path, options = {}, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// Engines
export const getEngines = (token) => request('/api/registry/engines', {}, token);
export const getEngine = (id, token) => request(`/api/registry/engines/${id}`, {}, token);
export const createEngine = (data, token) => request('/api/registry/engines', { method: 'POST', body: data }, token);
export const updateEngine = (id, data, token) => request(`/api/registry/engines/${id}`, { method: 'PUT', body: data }, token);
export const deleteEngine = (id, token) => request(`/api/registry/engines/${id}`, { method: 'DELETE' }, token);

// Transmissions
export const getTransmissions = (token) => request('/api/registry/transmissions', {}, token);
export const getTransmission = (id, token) => request(`/api/registry/transmissions/${id}`, {}, token);
export const createTransmission = (data, token) => request('/api/registry/transmissions', { method: 'POST', body: data }, token);
export const updateTransmission = (id, data, token) => request(`/api/registry/transmissions/${id}`, { method: 'PUT', body: data }, token);
export const deleteTransmission = (id, token) => request(`/api/registry/transmissions/${id}`, { method: 'DELETE' }, token);

// Vehicle Types
export const getVehicleTypes = (token, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request(`/api/registry/vehicle-types${qs ? '?' + qs : ''}`, {}, token);
};
export const getVehicleType = (id, token) => request(`/api/registry/vehicle-types/${id}`, {}, token);
export const createVehicleType = (data, token) => request('/api/registry/vehicle-types', { method: 'POST', body: data }, token);
export const updateVehicleType = (id, data, token) => request(`/api/registry/vehicle-types/${id}`, { method: 'PUT', body: data }, token);
export const deleteVehicleType = (id, token) => request(`/api/registry/vehicle-types/${id}`, { method: 'DELETE' }, token);
