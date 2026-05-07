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

export const getReport = (projectId, token) =>
  request(`/api/reports/${projectId}`, {}, token);

export const saveReport = (projectId, data, token) =>
  request(`/api/reports/${projectId}`, { method: 'POST', body: data }, token);

export const publishReport = (projectId, token) =>
  request(`/api/reports/${projectId}/publish`, { method: 'POST' }, token);

export const unpublishReport = (projectId, token) =>
  request(`/api/reports/${projectId}/unpublish`, { method: 'POST' }, token);

export const getImages = (projectId, token) =>
  request(`/api/reports/${projectId}/images`, {}, token);

export async function uploadImages(projectId, files, token) {
  const formData = new FormData();
  files.forEach((f) => formData.append('images', f));
  const res = await fetch(`${BASE_URL}/api/reports/${projectId}/images`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export const updateImageCaption = (projectId, imageId, caption, token) =>
  request(`/api/reports/${projectId}/images/${imageId}`, { method: 'PATCH', body: { caption } }, token);

export const deleteImage = (projectId, imageId, token) =>
  request(`/api/reports/${projectId}/images/${imageId}`, { method: 'DELETE' }, token);

export const imageUrl = (filename) => `${BASE_URL}/uploads/${filename}`;
