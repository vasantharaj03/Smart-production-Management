import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Shell, Card, Donut, Pill, CountUp, Loading } from "../components/Layout.jsx";
import { getAdminData, pingApi } from "../api.js";
import { Sparkline, downloadCSV } from "../components/Extras.jsx";
import { ProductionStreamPanel, StreamMetric } from "../components/ProductionStream.jsx";
import { ShiftTargetProgress } from "../components/ShiftTargetProgress.jsx";
import { summarizeMachineAlerts, summarizeProductionEvents } from "../data/productionStream.js";
import { useProductionStream } from "../hooks/useProductionStream.js";
import { useToast, AlertsSection, ReportsSection, SettingsSection } from "../sections/Common.jsx";
import { UserManagement, MasterData, SystemConfig, AuditLogs } from "../sections/Admin.jsx";

const Health = ({ title, series, unit, color, note }) => (
  <Card title={title}>
    <div className="big">{series[series.length - 1].toFixed(0)}<span> {unit}</span></div>
    <Sparkline data={series} color={color} />
    {note && <small className="block">{note}</small>}
  </Card>
);

/* Real API response time: pings /health every 5 seconds. */
function useLatency() {
  const [s, setS] = useState([0, 0]);
  useEffect(() => {
    let live = true;
    const tick = () => pingApi().then((ms) => live && setS((a) => [...a.slice(-23), ms])).catch(() => {});
    tick();
    const t = setInterval(tick, 5000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return s;
}

// shortcut tile -> where it goes (null = not built yet)
const shortcuts = { "Manage Shifts": "System Config", "KPI Formula Editor": null, "Database Connectors": "System Config", "Backup & Restore": null, "Security Policies": "User Management", "Email Templates": null };
const NAV = ["Dashboard", "System Config", "User Management", "Master Data", "Audit Logs", "Reports", "Alerts", "Settings"];
const TITLES = { Dashboard: "Admin System Dashboard", "System Config": "System Configuration", "User Management": "User Management", "Master Data": "Master Data",
  "Audit Logs": "Audit Logs", Reports: "Reports", Alerts: "Alerts", Settings: "Settings" };

export default function AdminDashboard({ user, onLogout }) {
  const [section, setSection] = useState("Dashboard");
  const [range, setRange] = useState("today");
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const toast = useToast();
  const stream = useProductionStream();
  const streamSummary = summarizeProductionEvents(stream.events);
  const streamNotifications = summarizeMachineAlerts(stream.events).map((alert) => ({
    id: `stream:${alert.id}`,
    level: alert.level,
    text: `${alert.machine}: ${alert.text}`,
    time: alert.time,
  }));
  const latency = useLatency();
  const load = () => getAdminData(range).then(setD);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [range]); // auto-refresh every 15s
  if (!d) return <Loading />;
  const k = d.kpis;
  const logs = d.audit.filter((a) => Object.values(a).join(" ").toLowerCase().includes(q.toLowerCase()));
  const share = (a, b) => (b ? (a / b) * 100 : 0);
  const totalUsers = k.users.operators + k.users.managers + k.users.admins;
  const go = (tile) => (shortcuts[tile] ? setSection(shortcuts[tile]) : toast.fail(new Error(`${tile} is not built yet.`)));

  const main = (
    <>
      <div className="grid g4">
        <Card title="System Config Status">
          <div className="kpi"><Donut percent={k.config.percent} color="#1fa971" /><div><div className="big"><CountUp value={k.config.percent} suffix="%" /> <span>Configured</span></div><small>Modules Active: {k.config.active}/{k.config.total} | Last Change: {k.config.lastChange}</small></div></div>
          <Pill>Config Ver: {k.config.version}</Pill>
        </Card>
        <Card title="User Management">
          <div className="kpi"><Donut percent={share(k.users.active, totalUsers)} color="#1a8f73" /><div><div className="big"><CountUp value={k.users.active} /> <span>Active Users</span></div><small>Operators: {k.users.operators}, Managers: {k.users.managers}, Admins: {k.users.admins}</small></div></div>
          <Pill tone="blue">+{k.users.newRequests} New (7 days)</Pill>
        </Card>
        <Card title="Master Data - Products">
          <div className="kpi"><Donut percent={share(k.products.active, k.products.total)} color="#e9b949" /><div><div className="big"><CountUp value={k.products.total} /> <span>Products</span></div><small>Active: {k.products.active}, Draft: {k.products.draft}, Archived: {k.products.archived}</small></div></div>
          <Pill tone="yellow">+{k.products.modifiedToday} Modified (Today)</Pill>
        </Card>
        <Card title="Master Data - Machines">
          <div className="kpi"><Donut percent={share(k.machines.active, k.machines.total)} color="#3ddc97" /><div><div className="big"><CountUp value={k.machines.total} /> <span>Machines</span></div><small>Running: {k.machines.active}, Maintenance: {k.machines.maintenance}, Idle: {k.machines.setup}</small></div></div>
          <Pill tone={k.machines.syncErrors ? "red" : "green"}>{k.machines.syncErrors ? `${k.machines.syncErrors} Machines Down` : "No Machines Down"}</Pill>
        </Card>
      </div>

      <div className="grid g-chart-table">
        <Card title="User Activity & Request Trends (7 Days)">
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={d.activity}>
                <CartesianGrid vertical={false} stroke="#e5e9f0" />
                <XAxis dataKey="day" /><YAxis allowDecimals={false} /><Tooltip /><Legend verticalAlign="top" />
                <Bar dataKey="logins" name="Logins" stackId="a" fill="#0f6b57" />
                <Bar dataKey="dataEntry" name="Data Entry" stackId="a" fill="#e9b949" />
                <Bar dataKey="adminActions" name="Admin Actions" stackId="a" fill="#3ddc97" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Master Data Reconciliation Status">
          <table className="table">
            <thead><tr><th>Master List</th><th>Total Records</th><th>Reconciled (%)</th><th>Unreconciled (count)</th></tr></thead>
            <tbody>{d.reconciliation.map((r) => (
              <tr key={r.list}><td>{r.list}</td><td>{r.total}</td><td>{r.pct}%</td><td className={r.unreconciled ? "bad" : "good"}>{r.unreconciled}</td></tr>
            ))}</tbody>
          </table>
          <small className="block">Products/Machines: share used in production records. Shifts: records that have a shift.</small>
        </Card>
      </div>

      <div className="grid g-short-audit">
        <Card title="System Configuration Shortcuts">
          <div className="tiles">{Object.keys(shortcuts).map((s) => <button key={s} className="tile" onClick={() => go(s)}>{s}</button>)}</div>
        </Card>
        <Card title="Recent Audit Logs (Detail)" right={
          <div className="tools">
            <input className="search" placeholder="Search logs…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn blue sm" onClick={() => downloadCSV("audit-logs.csv", logs)}>Export CSV</button>
          </div>}>
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Target Entity</th><th>Details</th></tr></thead>
              <tbody>{logs.length === 0 && <tr><td colSpan="5">{q ? `No logs match “${q}”.` : "No activity recorded yet."}</td></tr>}{logs.map((a, i) => (
                <tr key={i}><td>{a.time}</td><td>{a.user}</td><td>{a.action}</td><td>{a.target}</td><td>{a.details}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      </div>
      <ShiftTargetProgress dailyProduction={stream.dailyProduction} />
      <ProductionStreamPanel events={stream.events} status={stream.status} />
      <div className="grid g3">
        <StreamMetric title="Synthetic events / minute" value={streamSummary.eventsLastMinute} detail={`Backend stream: ${stream.status}`} />
        <StreamMetric title="Machines reporting" value={streamSummary.machines.length} detail="Unique machines in the synthetic stream" />
        <Health title="API Response Time" series={latency} unit="ms" color="#3ddc97" note="Measured live against the server" />
      </div>
    </>
  );

  const view = {
    Dashboard: main,
    "System Config": <SystemConfig toast={toast} />,
    "User Management": <UserManagement toast={toast} me={user} />,
    "Master Data": <MasterData toast={toast} />,
    "Audit Logs": <AuditLogs />,
    Reports: <ReportsSection toast={toast} />,
    Alerts: <AlertsSection streamEvents={stream.events} />,
    Settings: <SettingsSection user={user} toast={toast} />,
  }[section];

  return (
    <Shell user={user} roleLabel="Admin" onLogout={onLogout} onRefresh={load}
      nav={NAV} active={section} onNavigate={setSection} title={TITLES[section]}
      notifications={streamNotifications}
      extra={section === "Dashboard" && <select className="select" value={range} onChange={(e) => setRange(e.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select>}>
      {toast.node}
      {view}
    </Shell>
  );
}
