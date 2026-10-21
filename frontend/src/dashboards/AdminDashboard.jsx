import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Shell, Card, Donut, Pill, CountUp, Loading } from "../components/Layout.jsx";
import { getAdminData } from "../api.js";
import { Sparkline, useLiveSeries, downloadCSV } from "../components/Extras.jsx";

const Health = ({ title, series, unit, color }) => (
  <Card title={title}>
    <div className="big">{series[series.length - 1].toFixed(0)}<span> {unit}</span></div>
    <Sparkline data={series} color={color} />
  </Card>
);

const shortcuts = ["Manage Shifts", "KPI Formula Editor", "Database Connectors", "Backup & Restore", "Security Policies", "Email Templates"];

export default function AdminDashboard({ user, onLogout }) {
  const [range, setRange] = useState("today");
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const sessions = useLiveSeries(28, 4);
  const latency = useLiveSeries(120, 40);
  const lag = useLiveSeries(3, 2);
  const load = () => getAdminData(range).then(setD);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [range]); // auto-refresh every 15s
  if (!d) return <Loading />;
  const k = d.kpis;
  const logs = d.audit.filter((a) => Object.values(a).join(" ").toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell user={user} roleLabel="Admin" onLogout={onLogout} onRefresh={load}
      nav={["Dashboard", "System Config", "User Management", "Master Data", "Audit Logs", "Reports", "Alerts", "Settings"]}
      title="Admin System Dashboard"
      extra={<select className="select" value={range} onChange={(e) => setRange(e.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option></select>}>
      <div className="grid g4">
        <Card title="System Config Status">
          <div className="kpi"><Donut percent={k.config.percent} color="#1fa971" /><div><div className="big"><CountUp value={k.config.percent} suffix="%" /> <span>Configured</span></div><small>Modules Active: {k.config.active}/{k.config.total} | Last Change: {k.config.lastChange}</small></div></div>
          <Pill>Config Ver: {k.config.version}</Pill>
        </Card>
        <Card title="User Management">
          <div className="kpi"><Donut percent={70} color="#1a8f73" /><div><div className="big"><CountUp value={k.users.active} /> <span>Active Users</span></div><small>Operators: {k.users.operators}, Managers: {k.users.managers}, Admins: {k.users.admins}</small></div></div>
          <Pill tone="blue">+{k.users.newRequests} New Requests</Pill>
        </Card>
        <Card title="Master Data - Products">
          <div className="kpi"><Donut percent={(k.products.active / k.products.total) * 100} color="#e9b949" /><div><div className="big"><CountUp value={k.products.total} /> <span>Products</span></div><small>Active: {k.products.active}, Draft: {k.products.draft}, Archived: {k.products.archived}</small></div></div>
          <Pill tone="yellow">+{k.products.modifiedToday} Modified (Today)</Pill>
        </Card>
        <Card title="Master Data - Machines">
          <div className="kpi"><Donut percent={(k.machines.active / k.machines.total) * 100} color="#3ddc97" /><div><div className="big"><CountUp value={k.machines.total} /> <span>Machines</span></div><small>Active: {k.machines.active}, Maintenance: {k.machines.maintenance}, Setup: {k.machines.setup}</small></div></div>
          <Pill tone={k.machines.syncErrors ? "red" : "green"}>{k.machines.syncErrors ? `${k.machines.syncErrors} Sync Errors` : "No Sync Errors"}</Pill>
        </Card>
      </div>

      <div className="grid g-chart-table">
        <Card title="User Activity & Request Trends (7 Days)">
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={d.activity}>
                <CartesianGrid vertical={false} stroke="#e5e9f0" />
                <XAxis dataKey="day" /><YAxis /><Tooltip /><Legend verticalAlign="top" />
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
        </Card>
      </div>

      <div className="grid g-short-audit">
        <Card title="System Configuration Shortcuts">
          <div className="tiles">{shortcuts.map((s) => <button key={s} className="tile">{s}</button>)}</div>
        </Card>
        <Card title="Recent Audit Logs (Detail)" right={
          <div className="tools">
            <input className="search" placeholder="Search logs…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn blue sm" onClick={() => downloadCSV("audit-logs.csv", logs)}>Export CSV</button>
          </div>}>
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Target Entity</th><th>Details</th></tr></thead>
              <tbody>{logs.length === 0 && <tr><td colSpan="5">No logs match “{q}”.</td></tr>}{logs.map((a, i) => (
                <tr key={i}><td>{a.time}</td><td>{a.user}</td><td>{a.action}</td><td>{a.target}</td><td>{a.details}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      </div>
      <div className="grid g3">
        <Health title="Live Sessions" series={sessions} unit="users" color="#0f6b57" />
        <Health title="API Response Time" series={latency} unit="ms" color="#3ddc97" />
        <Health title="Database Sync Lag" series={lag} unit="sec" color="#e9b949" />
      </div>
    </Shell>
  );
}