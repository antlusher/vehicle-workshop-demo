const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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

export const getMyVehicles = (token) => request('/api/customer/vehicles', {}, token);
export const getVehicleJobs = (vehicleId, token) => request(`/api/customer/vehicles/${vehicleId}/jobs`, {}, token);
export const getJobReport = (projectId, token) => request(`/api/customer/jobs/${projectId}`, {}, token);

// Admin customer management
export const getCustomers = (token) => request('/api/admin/customers', {}, token);
export const createCustomer = (data, token) => request('/api/admin/customers', { method: 'POST', body: data }, token);
export const getCustomerVehicles = (customerId, token) => request(`/api/admin/customers/${customerId}/vehicles`, {}, token);
export const linkVehicle = (customerId, registration, token) =>
  request(`/api/admin/customers/${customerId}/vehicles`, { method: 'POST', body: { registration } }, token);
export const unlinkVehicle = (customerId, vehicleId, token) =>
  request(`/api/admin/customers/${customerId}/vehicles/${vehicleId}`, { method: 'DELETE' }, token);
export const updateCustomer = (customerId, data, token) =>
  request(`/api/admin/customers/${customerId}`, { method: 'PATCH', body: data }, token);
