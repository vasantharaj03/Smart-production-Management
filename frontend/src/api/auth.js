import { API_V1_BASE } from "./config.js";
const TOKEN_KEY = "smartprod_access_token";
const WARMUP_CACHE_MS = 60_000;
let warmupPromise = null;
let lastWarmupAt = 0;

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

// Wake Render while the user is entering credentials, then share that request
// with login/profile calls instead of sending them while the instance is starting.
export function warmUpServer() {
  if (warmupPromise) return warmupPromise;
  if (Date.now() - lastWarmupAt < WARMUP_CACHE_MS) return Promise.resolve();

  warmupPromise = fetch(`${API_V1_BASE}/health`, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Backend health check failed (HTTP ${response.status}).`);
      }
      lastWarmupAt = Date.now();
    })
    .catch((error) => {
      throw new Error(`Could not connect to the backend: ${error.message}`);
    })
    .finally(() => {
      warmupPromise = null;
    });

  return warmupPromise;
}

// ---- make sure role is always lowercase, e.g. "Admin" -> "admin" ----
const normalizeUser = (user) =>
  user ? { ...user, role: String(user.role || "").toLowerCase() } : user;

async function request(path, { token, ...options } = {}) {
  const response = await fetch(`${API_V1_BASE}${path}`, {
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