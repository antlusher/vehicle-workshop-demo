const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(token),
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new Event('auth:logout'));
    }
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

export async function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } });
}

export async function register(email, password) {
  return request('/api/auth/register', { method: 'POST', body: { email, password } });
}

export async function logout(token) {
  return request('/api/auth/logout', { method: 'POST' }, token);
}

export async function forgotPassword(email) {
  return request('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(token, password) {
  return request('/api/auth/reset-password', { method: 'POST', body: { token, password } });
}

export async function subscribe(token) {
  return request('/api/auth/subscribe', { method: 'POST' }, token);
}

export async function getProfile(token) {
  return request('/api/auth/me', { method: 'GET' }, token);
}

export async function fetchProjects(token) {
  return request('/api/projects', { method: 'GET' }, token);
}

export async function createProject(identifier, token) {
  return request('/api/projects', { method: 'POST', body: { identifier } }, token);
}

export async function createProjectManual(manualData, token) {
  return request('/api/projects', { method: 'POST', body: { manualData } }, token);
}

export async function updateProjectVehicle(projectId, data, token) {
  return request(`/api/projects/${projectId}/vehicle`, { method: 'PATCH', body: data }, token);
}

export async function getProject(projectId, token) {
  return request(`/api/projects/${projectId}`, { method: 'GET' }, token);
}

export async function closeProject(projectId, token) {
  return request(`/api/projects/${projectId}/close`, { method: 'POST' }, token);
}

export async function reopenProject(projectId, token) {
  return request(`/api/projects/${projectId}/reopen`, { method: 'POST' }, token);
}

export async function clearProjectHistory(projectId, token) {
  return request(`/api/projects/${projectId}/clear`, { method: 'POST' }, token);
}

export async function archiveProject(projectId, token) {
  return request(`/api/projects/${projectId}/archive`, { method: 'POST' }, token);
}

export async function restoreProject(projectId, token) {
  return request(`/api/projects/${projectId}/restore`, { method: 'POST' }, token);
}

export async function getProjects(token, { archived = false } = {}) {
  return request(`/api/projects${archived ? '?archived=true' : ''}`, {}, token);
}

export async function fetchProjectSpecs(projectId, token) {
  return request(`/api/projects/${projectId}/specs`, { method: 'POST' }, token);
}

export async function askAI(projectId, question, token, chatMode) {
  return request('/api/ai/ask', { method: 'POST', body: { projectId, question, chatMode } }, token);
}

export async function confirmSuggestion(projectId, historyId, text, token) {
  return request('/api/ai/confirm-suggestion', { method: 'POST', body: { projectId, historyId, text } }, token);
}
