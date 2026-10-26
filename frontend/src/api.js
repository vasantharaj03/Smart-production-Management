/*
 * Data layer.
 *  - Reads  (request): call the backend; unavailable dashboard data falls back to empty values, not sample metrics.
 *  - Writes (send):    always talk to the real backend and THROW the server's message on failure,
 *                      so a form can never say "saved" when nothing was saved.
 * Backend answers look like { success, message, data }; we hand the UI only `data`.
 * To use an ngrok backend later, set VITE_API_BASE=https://xxxx.ngrok-free.app in frontend/.env
 */
import { getToken } from "./api/auth.js";
import { API_BASE } from "./api/config.js";

export { API_BASE };
const FORCE_DEMO = import.meta.env.VITE_USE_MOCK === "true";
const V1 = "/api/v1";

const setSource = (v) => { window.__dataSource = v; window.dispatchEvent(new CustomEvent("datasource", { detail: v })); };

const headers = (hasBody, extra = {}) => ({
  ...(hasBody ? { "Content-Type": "application/json" } : {}),
  "ngrok-skip-browser-warning": "true",   // skips the ngrok interstitial page
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  ...extra,
});

const unwrap = (raw) => (raw && typeof raw === "object" && "success" in raw && "data" in raw ? raw.data : raw);

async function request(url, options = {}, fallback) {
  if (FORCE_DEMO) { setSource("offline"); return fallback; }
  try {
    const res = await fetch(API_BASE + url, { ...options, headers: headers(!!options.body, options.headers) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = unwrap(await res.json());
    setSource("live");
    // Supply empty values for sections absent from a real response without inventing metrics.
    return fallback && typeof fallback === "object" && !Array.isArray(fallback) && data && typeof data === "object" && !Array.isArray(data)
      ? { ...fallback, ...data } : data;
  } catch (e) {
    console.warn("API unavailable; using empty dashboard values:", url, e.message);
    setSource("offline");
    return fallback;
  }
}

/* Section lists: show the real error (e.g. "not allowed", "server down") in a red message instead of an empty table. */
async function read(url, fallback) {
  try {
    let res;
    try { res = await fetch(API_BASE + url, { headers: headers(false) }); } catch { throw new Error("Cannot reach the server. Is the backend running?"); }
    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }
    if (!res.ok || (json && json.success === false)) throw new Error(json?.message || `Could not load data (HTTP ${res.status})`);
    return unwrap(json);
  } catch (e) {
    window.dispatchEvent(new CustomEvent("apierror", { detail: e.message }));
    return fallback;
  }
}

async function send(url, method, body) {
  if (FORCE_DEMO) throw new Error("Demo mode is on (VITE_USE_MOCK=true): nothing can be saved.");
  let res;
  try {
    res = await fetch(API_BASE + url, { method, headers: headers(body !== undefined), body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok || (json && json.success === false)) {
    const detail = Array.isArray(json?.data) ? json.data.map((e) => `${(e.loc || []).slice(-1)[0]}: ${e.msg}`).join("; ") : "";
    throw new Error(json?.message ? (detail ? `${json.message} (${detail})` : json.message) : `Request failed (HTTP ${res.status})`);
  }
  return unwrap(json);
}

const emptyAdminDashboard = {
  kpis: {
    config: { percent: 0, active: 0, total: 0, lastChange: "never", version: "0.1.0" },
    users: { active: 0, operators: 0, managers: 0, admins: 0, newRequests: 0 },
    products: { total: 0, active: 0, draft: 0, archived: 0, modifiedToday: 0 },
    machines: { total: 0, active: 0, maintenance: 0, setup: 0, syncErrors: 0 },
  },
  activity: [],
  reconciliation: [],
  audit: [],
};

const emptySupervisorDashboard = {
  products: [], machines: [], shifts: [], assigned_shift: null, target: 0, targets: [], produced: 0, downtime: [], trend: [],
};

const emptyManagerDashboard = {
  oee: { value: 0, delta: 0, availability: 0, performance: 0, quality: 0 },
  output: { actual: 0, plan: 0, topProduct: "-", bars: [] },
  productionReport: { start: "", end: "", produced: 0, target: 0, defective: 0, daily: [], products: [] },
  utilization: { percent: 0, activeLines: 0, totalLines: 0, activeMachines: 0, totalMachines: 0 },
  cost: { total: 0, energy: 0, labor: 0, scrap: 0 },
  oeeTrend: [], pareto: [], alerts: [], machines: [], plan: [], reports: [],
};

const reports = [
  { name: "Full Daily Summary", type: "PDF" }, { name: "Weekly OEE Report", type: "Excel" },
  { name: "Downtime Log", type: "PDF" }, { name: "Scrap & Defect Analysis", type: "PDF" },
  { name: "Machine Performance", type: "Excel" },
];

/* ---- dashboards ---- */
export const getAdminData = (range = "today") => request(`${V1}/admin/dashboard?range=${range}`, {}, emptyAdminDashboard);
export const getSupervisorData = () => request(`${V1}/supervisor/dashboard`, {}, emptySupervisorDashboard);
export const getManagerData = (range = "daily") => request(`${V1}/manager/dashboard?range=${range}`, {}, emptyManagerDashboard);

/* ---- supervisor ---- */
export const submitShiftEntry = (body) => send(`${V1}/production/shift-entry`, "POST", body);
export const logDowntime = (body) => send(`${V1}/downtime`, "POST", body);
export const setMachineStatus = (id, status) => send(`${V1}/machines/${id}/status`, "PATCH", { status });
export const getQuality = () => read(`${V1}/quality/summary`, { byMachine: [], recent: [] });

/* ---- shared ---- */
export const getAlerts = (range = "weekly") => read(`${V1}/alerts?range=${range}`, []);
export const getNotifications = () => request(`${V1}/notifications`, {}, []);   // for the bell: no error toast if it fails
export const getMachines = () => read(`${V1}/machines`, []);
export const getReports = () => read(`${V1}/reports`, reports);
export const changePassword = (current, next) => send(`${V1}/me/password`, "POST", { current, new: next });
export const pingApi = async () => { const t = performance.now(); await fetch(`${API_BASE}${V1}/health`, { headers: headers(false) }); return Math.round(performance.now() - t); };

/* Reports need the login header, so download through fetch instead of window.open */
export async function downloadReport(name, type) {
  const normalizedType = String(type).trim().toLowerCase();
  if (!["pdf", "excel"].includes(normalizedType)) {
    throw new Error(`Unsupported report format: ${type}`);
  }
  let res;
  try { res = await fetch(`${API_BASE}${V1}/reports/download?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`, { headers: headers(false) }); }
  catch { throw new Error("Cannot reach the server. Is the backend running?"); }
  if (!res.ok) {
    let msg = `Report failed (HTTP ${res.status})`;
    try { msg = (await res.json()).message || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  const expectedMime = normalizedType === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const responseMime = (res.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (responseMime !== expectedMime) {
    throw new Error(`Expected ${normalizedType.toUpperCase()} data but the server returned ${responseMime || "an unknown format"}.`);
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error("The server returned an empty report.");
  const extension = normalizedType === "pdf" ? "pdf" : "xlsx";
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${name.replace(/[^\w]+/g, "_")}.${extension}`,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---- manager ---- */
export const getAnalytics = (range = "weekly") => read(`${V1}/manager/analytics?range=${range}`, { machines: [], lines: [] });
export const getManagerSupervisors = () => read(`${V1}/manager/supervisors`, []);
export const assignManagerSupervisorShift = (userId, body) =>
  send(`${V1}/manager/supervisors/${userId}/shift`, "PATCH", body);
export const unassignManagerSupervisorShift = (userId, body = {}) =>
  send(`${V1}/manager/supervisors/${userId}/shift`, "DELETE", body);
export const getTargets = (date = "") => read(`${V1}/targets${date ? `?date=${date}` : ""}`, []);
export const getTargetReportManagers = () => read(`${V1}/target-reports/managers`, []);
export const sendTargetProgressReport = (body) => send(`${V1}/target-reports`, "POST", body);
export const getManagerTargetReports = () => read(`${V1}/manager/target-reports`, []);
export const reviewManagerTargetReport = (reportId) =>
  send(`${V1}/manager/target-reports/${reportId}/review`, "PATCH");
export const getProductProduction = (date = "", shift = "") => {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (shift) params.set("shift", shift);
  const query = params.toString();
  return read(`${V1}/production/products${query ? `?${query}` : ""}`, []);
};
export const addTarget = (body) => send(`${V1}/targets`, "POST", body);

/* ---- admin ---- */
export const getUsers = () => read(`${V1}/admin/users`, []);
export const createUser = (body) => send(`${V1}/admin/users`, "POST", body);
export const patchUser = (id, body) => send(`${V1}/admin/users/${id}`, "PATCH", body);
export const getProducts = () => read(`${V1}/products`, []);
export const addProduct = (body) => send(`${V1}/products`, "POST", body);
export const patchProduct = (id, body) => send(`${V1}/products/${id}`, "PATCH", body);
export const addMachine = (body) => send(`${V1}/machines`, "POST", body);
export const patchMachine = (id, body) => send(`${V1}/machines/${id}`, "PATCH", body);
export const getShifts = () => read(`${V1}/shifts`, []);
export const addShift = (body) => send(`${V1}/shifts`, "POST", body);
export const patchShift = (id, body) => send(`${V1}/shifts/${id}`, "PATCH", body);
export const getAudit = () => read(`${V1}/admin/audit?limit=300`, []);
export const checkDb = () => request(`${V1}/health/db`, {}, null);