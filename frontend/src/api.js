/*
 * Data layer. Each function calls the backend; if the call fails it falls back to mock data,
 * so the UI works before the API is ready. Replace the URLs with the real endpoints
 * and adjust the response shapes (they match the mock objects below).
 */
const token = () => { try { return JSON.parse(localStorage.getItem("user"))?.token; } catch { return null; } };

async function request(url, options = {}, fallback) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return fallback;
  }
}

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const adminMock = {
  kpis: {
    config: { percent: 95, active: 12, total: 13, lastChange: "2h ago", version: "3.2.1" },
    users: { active: 28, operators: 15, managers: 8, admins: 5, newRequests: 3 },
    products: { total: 112, active: 98, draft: 10, archived: 4, modifiedToday: 2 },
    machines: { total: 48, active: 45, maintenance: 2, setup: 1, syncErrors: 0 },
  },
  activity: days.map((d, i) => ({ day: d, logins: [12, 17, 18, 15, 20, 17, 10][i], dataEntry: [13, 17, 13, 12, 14, 17, 11][i], adminActions: [16, 19, 13, 11, 18, 16, 11][i] })),
  reconciliation: [
    { list: "Products", total: 112, pct: 98.2, unreconciled: 2 },
    { list: "Machines", total: 48, pct: 100, unreconciled: 0 },
    { list: "Shifts", total: 28, pct: 98.3, unreconciled: 0 },
  ],
  audit: [
    { time: "10:31:05 AM", user: "A. Thompson", action: "Updated Product", target: "P012 Shampoo Sachet", details: "Price updated to $1.25" },
    { time: "10:25:33 AM", user: "S. Lee", action: "Created User", target: "New Operator Account", details: "User ID: Opr_88" },
    { time: "10:15:11 AM", user: "A. Thompson", action: "Modified Machine", target: "Pack 02 Packaging Machine", details: "Max speed changed to 210/m" },
    { time: "10:10:02 AM", user: "System", action: "DB Backup", target: "Full System Backup", details: "Completed successfully" },
  ],
};

const supervisorMock = {
  products: ["P012 Shampoo Sachet", "P015 Conditioner Sachet"],
  machines: ["Pack 01 Packaging Machine", "Pack 02 Packaging Machine", "Fill 01 Filling Machine"],
  shifts: ["A – Day", "B – Evening", "C – Night"],
  target: 40,
  downtime: [
    { machine: "Pack 02", reason: "Material Jam", start: "10:15", end: "11:00", duration: "45m" },
    { machine: "Fill 01", reason: "Maintenance", start: "09:30", end: "09:45", duration: "15m" },
  ],
  trend: days.map((d, i) => ({ day: d, events: [8.5, 6.8, 17, 6.8, 14, 6.8, 3.5][i], minutes: [3.5, 10.2, 6.8, 14, 15.5, 17, 5][i] })),
};

const managerMock = {
  oee: { value: 85.5, delta: 2.1, availability: 88.5, performance: 91.2, quality: 96.6 },
  output: { actual: 145000, plan: 160000, topProduct: "P012 Shampoo Sachet", bars: [8, 11, 14, 17, 20, 23, 25] },
  utilization: { percent: 78, activeLines: 5, totalLines: 6, activeMachines: 42, totalMachines: 48 },
  cost: { total: 21500, energy: 45, labor: 35, scrap: 20 },
  oeeTrend: Array.from({ length: 30 }, (_, i) => ({ date: `${i + 1}`, availability: 30 + ((i * 7) % 15), performance: 25 + ((i * 5) % 12), quality: 28 + ((i * 3) % 10) })),
  pareto: [
    { cause: "Contamination", count: 42 }, { cause: "Seal fail", count: 33 }, { cause: "Mislabel", count: 16 },
    { cause: "Underfill", count: 15 }, { cause: "Overfill", count: 11 }, { cause: "Torn pack", count: 9 }, { cause: "Other", count: 4 },
  ],
  alerts: [
    { level: "high", machine: "Line 3 - Packing", text: "Extended Downtime (> 60m)", duration: "65m", action: "Action Required" },
    { level: "medium", machine: "Machine Pack 02", text: "High Defect Rate (> 5%)", duration: "5.1% (30m)", action: "Review quality log" },
    { level: "low", machine: "Machine Fill 01", text: "OEE Below 80%", duration: "79%", action: "Monitor closely" },
  ],
  plan: ["Shift A: P012 Shampoo Sachet on Line 1", "Shift B: P012 Shampoo Sachet on Line 1", "Shift C: P012 Shampoo Sachet on Line 1", "Shift D: P012 Shampoo Sachet on Line 1"],
  reports: [
    { name: "Full Daily Summary", type: "PDF" }, { name: "Weekly OEE Report", type: "Excel" }, { name: "Downtime Log", type: "PDF" },
    { name: "Scrap & Defect Analysis", type: "PDF" }, { name: "Machine Performance", type: "Excel" }, { name: "Energy Usage", type: "PDF" },
  ],
};

export const getAdminData = (range = "today") => request(`/api/admin/dashboard?range=${range}`, {}, adminMock);
export const getSupervisorData = () => request("/api/supervisor/dashboard", {}, supervisorMock);
export const getManagerData = (range = "daily") => request(`/api/manager/dashboard?range=${range}`, {}, managerMock);
export const submitShiftEntry = (body) => request("/api/production/shift-entry", { method: "POST", body: JSON.stringify(body) }, { ok: true });
export const logDowntime = (body) => request("/api/downtime", { method: "POST", body: JSON.stringify(body) }, { ok: true });
export const downloadReport = (name, type) => window.open(`/api/reports/download?name=${encodeURIComponent(name)}&type=${type}`, "_blank");
