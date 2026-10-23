const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";
const TOKEN_KEY = "smartprod_access_token";

// ---- token helpers (shared by App.jsx and api.js) ----
export const getToken = () =>
  localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

export function saveToken(token, remember = true) {
  clearToken();
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

// ---- make sure role is always lowercase, e.g. "Admin" -> "admin" ----
const normalizeUser = (user) =>
  user ? { ...user, role: String(user.role || "").toLowerCase() } : user;

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "The request could not be completed.");
  }
  return result.data;
}

export async function login({ email, password }) {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { ...data, user: normalizeUser(data.user) };
}

export async function getProfile(token) {
  return normalizeUser(await request("/auth/me", { token }));
}