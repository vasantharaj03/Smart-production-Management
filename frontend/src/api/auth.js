const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1";

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

export function registerAccount({ full_name, email, password }) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ full_name, email, password }),
  });
}

export function login({ email, password }) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getProfile(token) {
  return request("/auth/me", { token });
}
