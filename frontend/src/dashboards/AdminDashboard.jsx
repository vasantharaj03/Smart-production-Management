import { useEffect, useState } from "react";
import { BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Shell, Card, Donut, CountUp, Loading } from "../components/Layout.jsx";
import { getManagerData, downloadReport } from "../api.js";
import { MachineFloor, demoMachines, OeeSimulator } from "../components/Extras.jsx";

const dot = { high: "#d63031", medium: "#e9b949", low: "#f2c94c" };

export default function ManagerDashboard({ user, onLogout }) {
  const [range, setRange] = useState("daily");
  const [d, setD] = useState(null);
  const [ack, setAck] = useState([]);
  const load = () => getManagerData(range).then(setD);
  useEffect(() => { load(); }, [range]);
  if (!d) return <Loading />;

  const short = d.output.plan - d.output.actual;
  const open = d.alerts.filter((a) => !ack.includes(a.machine));
  let run = 0; const total = d.pareto.reduce((s, p) => s + p.count, 0);
  const pareto = d.pareto.map((p) => { run += p.count; return { ...p, cumulative: Math.round((run / total) * 100) }; });

  return (
    <Shell user={user} roleLabel="Production Manager" onLogout={onLogout} onRefresh={load}
      nav={["Dashboard", "OEE Analytics", "Line Performance", "Resource Planning", "Alerts", "Reports", "Settings"]}
      title="Manager Performance Dashboard"
      extra={<div className="seg">{["daily", "weekly", "monthly"].map((r) => <button key={r} className={r === range ? "on" : ""} onClick={() => setRange(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}</div>}>
      <div className="grid g4">
        <Card title="Production Line OEE">
          <div className="kpi"><Donut percent={d.oee.value} color="#1fa971" track="#d63031" size={84} />
            <div><div className="big"><CountUp value={d.oee.value} decimals={1} suffix="%" /> <span>OEE</span></div><small className="good">Trending up (+{d.oee.delta}%)</small></div></div>
          <small>Availability: {d.oee.availability}% | Performance: {d.oee.performance}% | Quality: {d.oee.quality}%</small>
        </Card>
        <Card title="Production Output vs. Plan">
          <div className="kpi">
            <div className="mini-bars">{d.output.bars.map((h, i) => <i key={i} style={{ height: h * 2.4 }} />)}</div>
            <div><div className="big"><CountUp value={d.output.actual / 1000} suffix="k" /> / {d.output.plan / 1000}k <span>units</span></div><small>Daily Plan</small></div>
          </div>
          <span className="pill red">Short -{short / 1000}k units</span>
          <small className="block">Top Product: {d.output.topProduct}</small>
        </Card>
        <Card title="Factory Utilization">
          <div className="kpi"><Donut percent={d.utilization.percent} color="#1a8f73" size={84} /><div className="big"><CountUp value={d.utilization.percent} suffix="%" /> <span>Utilization</span></div></div>
          <small>Active Lines: {d.utilization.activeLines}/{d.utilization.totalLines} | Active Machines: {d.utilization.activeMachines}/{d.utilization.totalMachines}</small>
        </Card>
        <Card title="Operational Costs">
          <div className="kpi"><Donut percent={d.cost.energy} color="#3ddc97" size={84} /><div className="big"><CountUp value={d.cost.total} prefix="$" /></div></div>
          <small>Energy: {d.cost.energy}% | Labor: {d.cost.labor}% | Scrap: {d.cost.scrap}%</small>
        </Card>
      </div>

      <div className="grid g2">
        <Card title="High-Level OEE Trend - 30 Days">
          <div className="chart"><ResponsiveContainer>
            <BarChart data={d.oeeTrend}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="date" interval={2} /><YAxis domain={[0, 100]} unit="%" /><Tooltip /><Legend verticalAlign="top" />
              <Bar dataKey="availability" name="Availability" stackId="a" fill="#0f6b57" />
              <Bar dataKey="performance" name="Performance" stackId="a" fill="#e9b949" />
              <Bar dataKey="quality" name="Quality" stackId="a" fill="#3ddc97" />
            </BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Scrap & Defect Analysis">
          <div className="chart"><ResponsiveContainer>
            <ComposedChart data={pareto}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="cause" /><YAxis yAxisId="l" /><YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" /><Tooltip /><Legend verticalAlign="top" />
              <Bar yAxisId="l" dataKey="count" name="Defect counts" fill="#0f6b57" radius={[6, 6, 0, 0]} />
              <Line yAxisId="r" dataKey="cumulative" name="Cumulative (%)" stroke="#6b8a83" strokeWidth={2} />
            </ComposedChart></ResponsiveContainer></div>
          <small>Top Cause: {pareto[0].cause} ({pareto[0].count} counts)</small>
        </Card>
      </div>

      <div className="grid g-alerts">
        <Card title="Machine Floor - Live Status"><MachineFloor machines={d.machines || demoMachines()} /></Card>
        <Card title="OEE What-if Simulator"><OeeSimulator base={d.oee} /></Card>
      </div>

      <div className="grid g-alerts">
        <Card title="Active High-Priority Alerts">
          <table className="table">
            <thead><tr><th>Priority</th><th>Machine/Line</th><th>Alert Description</th><th>Duration</th><th></th></tr></thead>
            <tbody>{open.length === 0 && <tr><td colSpan="5">All alerts acknowledged. Nice work.</td></tr>}{open.map((a, i) => (
              <tr key={i}><td><span className={`dot ${a.level}`} style={{ background: dot[a.level] }}>!</span></td><td>{a.machine}</td><td>{a.text}</td><td>{a.duration}<small className="block">{a.action}</small></td><td><button className="btn blue sm" onClick={() => setAck([...ack, a.machine])}>Acknowledge</button></td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Production Planning & Export Tools">
          <div className="plan-export">
            <div><h4>Upcoming Shift Plan (Next 24h)</h4><ul className="plan">{d.plan.map((p) => <li key={p}>{p}</li>)}</ul></div>
            <div><h4>Quick Reports & Exports</h4>
              <div className="tiles">{d.reports.map((r) => <button key={r.name} className="tile navy" onClick={() => downloadReport(r.name, r.type)}>{r.name} ({r.type})</button>)}</div>
            </div>
          </div>
        </Card>
      </div>
    </Shell>
  );
}