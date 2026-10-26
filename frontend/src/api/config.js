const configuredApiBase =
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE || "";
const normalizedApiBase = configuredApiBase.replace(/\/+$/, "");

export const API_BASE = normalizedApiBase.endsWith("/api/v1")
  ? normalizedApiBase.slice(0, -"/api/v1".length)
  : normalizedApiBase;

export const API_V1_BASE = `${API_BASE}/api/v1`;
