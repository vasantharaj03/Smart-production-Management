import { useEffect, useState } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Shell, Card, Loading } from "../components/Layout.jsx";
import { getSupervisorData, submitShiftEntry, logDowntime } from "../api.js";
import { DefectBadge, ShiftProgress, ReasonChips, DowntimeTimer } from "../components/Extras.jsx";

const minutesBetween = (a, b) => {
  const [h1, m1] = a.split(":").map(Number), [h2, m2] = b.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
};

const Select = ({ label, value, onChange, options }) => (
  <label className="field">{label}<select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select></label>
);

export default function SupervisorDashboard({ user, onLogout }) {
  const [d, setD] = useState(null);
  const [downtime, setDowntime] = useState([]);
  const [msg, setMsg] = useState("");
  const [entry, setEntry] = useState({ product: "", machine: "", shift: "", total: 45000, good: 43500, defective: 1500 });
  const [dt, setDt] = useState({ machine: "", reason: "", start: "10:15", end: "11:00" });

  const load = () => getSupervisorData().then((x) => {
    setD(x); setDowntime(x.downtime);
    setEntry((e) => ({ ...e, product: x.products[0], machine: x.machines[0], shift: x.shifts[0] }));
    setDt((t) => ({ ...t, machine: x.machines[0] }));
  });
  useEffect(() => { load(); }, []);
  if (!d) return <Loading />;

  const setE = (k, v) => setEntry((e) => ({ ...e, [k]: v }));
  const total = Number(entry.total), good = Number(entry.good), defective = Number(entry.defective);
  const mismatch = good + defective !== total;

  const submit = async () => {
    if (mismatch) return setMsg("Good + defective quantity must equal total manufactured.");
    await submitShiftEntry({ ...entry, total, good, defective });
    setMsg("Shift entry submitted.");
  };
  const addDowntime = async () => {
    const mins = minutesBetween(dt.start, dt.end);
    if (!dt.reason || mins <= 0) return setMsg("Enter a reason and an end time after the start time.");
    await logDowntime(dt);
    setDowntime([{ machine: dt.machine.split(" ").slice(0, 2).join(" "), reason: dt.reason, start: dt.start, end: dt.end, duration: `${mins}m` }, ...downtime]);
    setDt({ ...dt, reason: "" }); setMsg("Downtime logged.");
  };

  const chart = [
    { name: "Total", value: total / 1000, color: "#0f6b57" }, { name: "Good", value: good / 1000, color: "#3ddc97" },
    { name: "Defective", value: defective / 1000, color: "#e9b949" }, { name: "Target", value: d.target, color: "#3ddc97" },
  ];

  return (
    <Shell user={user} roleLabel="Production Supervisor" onLogout={onLogout} onRefresh={load}
      nav={["Dashboard", "Entry Forms", "Machines", "Quality", "Reports", "Alerts", "Settings"]}
      title="Entry Forms - Shift Production & Downtime">
      {msg && <div className="toast" onClick={() => setMsg("")}>{msg}</div>}
      <div className="grid g2">
        <Card title="Shift Production Entry">
          <div className="form2">
            <Select label="Product" value={entry.product} onChange={(v) => setE("product", v)} options={d.products} />
            <Select label="Machine" value={entry.machine} onChange={(v) => setE("machine", v)} options={d.machines} />
            <Select label="Shift" value={entry.shift} onChange={(v) => setE("shift", v)} options={d.shifts} />
            <label className="field">Total Manufactured<div className="unit"><input type="number" value={entry.total} onChange={(e) => setE("total", e.target.value)} /><span>units</span></div></label>
            <label className="field">Good Quantity<div className="unit"><input type="number" value={entry.good} onChange={(e) => setE("good", e.target.value)} /><span>units</span></div></label>
            <label className="field">Defective Quantity<div className="unit"><input type="number" value={entry.defective} onChange={(e) => setE("defective", e.target.value)} /><span>units</span></div></label>
          </div>
          {mismatch && <small className="bad">Good + defective ({good + defective}) does not match total ({total}).</small>}
          <DefectBadge defective={defective} total={total} />
          <ShiftProgress value={good} target={d.target * 1000} />
          <button className="btn green full" onClick={submit}>Submit Entry<span className="arrow">↗</span></button>
        </Card>

        <Card title="Downtime Event Logger">
          <div className="form2">
            <Select label="Machine" value={dt.machine} onChange={(v) => setDt({ ...dt, machine: v })} options={d.machines} />
            <label className="field">Reason<input value={dt.reason} placeholder="e.g. Packaging material jam" onChange={(e) => setDt({ ...dt, reason: e.target.value })} /></label>
            <label className="field">Start Time<input type="time" value={dt.start} onChange={(e) => setDt({ ...dt, start: e.target.value })} /></label>
            <label className="field">End Time<input type="time" value={dt.end} onChange={(e) => setDt({ ...dt, end: e.target.value })} /></label>
          </div>
          <ReasonChips value={dt.reason} onPick={(r) => setDt({ ...dt, reason: r })} />
          <DowntimeTimer onStart={(t) => setDt((x) => ({ ...x, start: t }))} onStop={(t) => setDt((x) => ({ ...x, end: t }))} />
          <button className="btn blue" style={{ marginTop: 10 }} onClick={addDowntime}>Log Event</button>
          <table className="table">
            <thead><tr><th>Machine</th><th>Reason</th><th>Start</th><th>End</th><th>Duration</th></tr></thead>
            <tbody>{downtime.map((r, i) => <tr key={i}><td>{r.machine}</td><td>{r.reason}</td><td>{r.start}</td><td>{r.end}</td><td>{r.duration}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Production Quantities vs Target (Current Shift)">
          <div className="chart"><ResponsiveContainer>
            <BarChart data={chart}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="name" /><YAxis unit="k" /><Tooltip />
              <Bar dataKey="value" name="Units (thousands)" radius={[8, 8, 0, 0]}>{chart.map((c) => <Cell key={c.name} fill={c.color} />)}</Bar>
            </BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Downtime Frequency and Duration Trend (7 Days)">
          <div className="chart"><ResponsiveContainer>
            <LineChart data={d.trend}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Legend verticalAlign="top" />
              <Line type="monotone" dataKey="events" name="Downtime Events (count)" stroke="#0f6b57" strokeWidth={2} />
              <Line type="monotone" dataKey="minutes" name="Total Duration (minutes)" stroke="#e9b949" strokeWidth={2} />
            </LineChart></ResponsiveContainer></div>
        </Card>
      </div>
    </Shell>
  );
}