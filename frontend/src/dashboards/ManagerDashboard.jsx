import { useEffect, useState } from "react";
import { BarChart, Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Shell, Card, Donut, CountUp, Loading } from "../components/Layout.jsx";
import { getManagerData, downloadReport } from "../api.js";
import { MachineFloor } from "../components/Extras.jsx";
import { ProductionStreamPanel } from "../components/ProductionStream.jsx";
import { ShiftTargetProgress } from "../components/ShiftTargetProgress.jsx";
import { ManagerTargetProgressReports } from "../components/TargetProgressReports.jsx";
import { summarizeMachineAlerts, summarizeProductionEvents } from "../data/productionStream.js";
import { useProductionStream } from "../hooks/useProductionStream.js";
import { useToast, AlertsSection, ReportsSection, SettingsSection } from "../sections/Common.jsx";
import {
  LinePerformance,
  ManagerSupervisorManagement,
  OeeAnalytics,
  ResourcePlanning,
} from "../sections/Manager.jsx";

const dot = { high: "#d63031", medium: "#e9b949", low: "#f2c94c" };
const NAV = ["Dashboard", "Manage Supervisor", "OEE Analytics", "Line Performance", "Resource Planning", "Alerts", "Reports", "Settings"];
const TITLES = { Dashboard: "Manager Performance Dashboard", "OEE Analytics": "OEE Analytics", "Line Performance": "Line Performance",
  "Manage Supervisor": "Manage Supervisor", "Resource Planning": "Resource Planning", Alerts: "Alerts", Reports: "Reports", Settings: "Settings" };

function localTodayIso() {
  const current = new Date();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
}

export default function ManagerDashboard({ user, onLogout }) {
  const [section, setSection] = useState("Dashboard");
  const [range, setRange] = useState("daily");
  const [d, setD] = useState(null);
  const [ack, setAck] = useState([]);
  const toast = useToast();
  const stream = useProductionStream();
  const load = () => getManagerData(range).then(setD);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [range]); // auto-refresh every 15s
  if (!d) return <Loading />;

  const summary = summarizeProductionEvents(stream.events);
  const liveByProduct = {};
  const liveDefectsByProduct = {};
  for (const [key, production] of Object.entries(stream.dailyProduction)) {
    const productCode = key.split("|")[1];
    liveByProduct[productCode] = (liveByProduct[productCode] || 0) + (Number(production.produced) || 0);
    liveDefectsByProduct[productCode] = (liveDefectsByProduct[productCode] || 0) + (Number(production.defective) || 0);
  }
  const liveProductNames = Object.fromEntries(
    stream.events.map((event) => [event.product.code, event.product.name]),
  );
  const todayIso = localTodayIso();
  const includesToday = d.productionReport.end === todayIso;
  const savedToday = d.productionReport.daily[d.productionReport.daily.length - 1]?.produced || 0;
  const currentDayProduced = Math.max(savedToday, Object.values(liveByProduct).reduce((sum, value) => sum + value, 0));
  const savedDefectsToday = d.productionReport.daily[d.productionReport.daily.length - 1]?.defective || 0;
  const currentDayDefects = Math.max(savedDefectsToday, Object.values(liveDefectsByProduct).reduce((sum, value) => sum + value, 0));
  const reportProducts = d.productionReport.products.map((product) => ({
    ...product,
    produced: includesToday
      ? Math.max(product.produced, liveByProduct[product.product_code] || 0)
      : product.produced,
    defective: includesToday
      ? Math.max(product.defective, liveDefectsByProduct[product.product_code] || 0)
      : product.defective,
  }));
  for (const [productCode, produced] of Object.entries(liveByProduct)) {
    if (includesToday && !reportProducts.some((product) => product.product_code === productCode)) {
      reportProducts.push({
        product_code: productCode,
        product_name: liveProductNames[productCode] || productCode,
        produced,
        defective: liveDefectsByProduct[productCode] || 0,
        target: 0,
      });
    }
  }
  const productionReport = {
    ...d.productionReport,
    produced: includesToday
      ? d.productionReport.produced - savedToday + currentDayProduced
      : d.productionReport.produced,
    defective: includesToday
      ? d.productionReport.defective - savedDefectsToday + currentDayDefects
      : d.productionReport.defective,
    daily: d.productionReport.daily.map((day, index, days) => (
      includesToday && index === days.length - 1
        ? { ...day, produced: currentDayProduced, defective: currentDayDefects }
        : day
    )),
    products: reportProducts,
  };
  const recordedOutput = Number(d.output.actual) || 0;
  const liveOutput = Object.values(stream.dailyProduction).reduce(
    (total, production) => total + (Number(production.produced) || 0),
    0,
  );
  const hasRecordedOutput = recordedOutput > 0;
  const producedOutput = Math.max(recordedOutput, liveOutput);
  const plannedOutput = Number(d.output.plan) || 0;
  const gap = plannedOutput - producedOutput;
  const alerts = summarizeMachineAlerts(stream.events);
  const open = alerts.filter((a) => !ack.includes(a.machine + a.text));
  const defectsByProduct = summary.productionSnapshots.reduce((totals, event) => {
    const product = event.product.name;
    totals[product] = (totals[product] || 0) + event.production.defective;
    return totals;
  }, {});
  const pareto = Object.entries(defectsByProduct)
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);
  const defectTotal = pareto.reduce((sum, item) => sum + item.count, 0);
  const defectChart = pareto.reduce((acc, item, index) => {
    const running = item.count + (acc[index - 1]?.running || 0);
    acc.push({ ...item, cumulative: defectTotal ? Math.round((running / defectTotal) * 100) : 0, running });
    return acc;
  }, []);
  const liveTrend = stream.events.slice(-30).map((event) => ({
    time: new Date(event.timestamp).toLocaleTimeString(),
    oee: event.kpis.oee,
  }));
  const liveMachines = summary.machines.map((event) => ({
    name: event.machine.code,
    fullName: event.machine.name,
    status: ({ RUNNING: "running", IDLE: "idle", DOWN: "down", MAINTENANCE: "maint" })[event.machine.status] || "idle",
    oee: event.kpis.oee,
    reason: event.machine.downtimeMinutes ? `${event.machine.downtimeMinutes} min downtime` : "",
  }));
  const livePlan = summary.machines.map((event) =>
    `${event.shift}: ${event.product.name} on ${event.machine.name}`
  );
  const download = async (r) => { try { await downloadReport(r.name, r.type); toast.ok(`${r.name} downloaded.`); } catch (e) { toast.fail(e); } };

  const periodReport = (
    <div className="grid g2">
      <Card title={`${range[0].toUpperCase() + range.slice(1)} Production Report`}>
        <div className="production-report-summary">
          <div><small>Total produced</small><b>{productionReport.produced.toLocaleString()} units</b></div>
          <div><small>Assigned target</small><b>{productionReport.target.toLocaleString()} units</b></div>
          <div><small>Defective</small><b>{productionReport.defective.toLocaleString()} units</b></div>
        </div>
        <div className="chart"><ResponsiveContainer>
          <BarChart data={productionReport.daily}>
            <CartesianGrid vertical={false} stroke="#e5e9f0" />
            <XAxis dataKey="date" interval="preserveStartEnd" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="produced" name="Produced" fill="#12806a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="target" name="Assigned target" fill="#e9b949" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
        <small className="block">Saved records and Manager-assigned targets for {productionReport.start} to {productionReport.end}; today's output includes the latest synthetic snapshots.</small>
      </Card>
      <Card title="Product Summary">
        {productionReport.products.length === 0
          ? <p className="note-box">No saved production or assigned targets are available for this period.</p>
          : <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Product</th><th>Produced</th><th>Target</th><th>Remaining</th><th>Status</th></tr></thead>
              <tbody>{productionReport.products.map((product) => {
                const complete = product.target > 0 && product.produced >= product.target;
                return <tr key={product.product_code}>
                  <td><b>{product.product_code}</b> {product.product_name}</td>
                  <td>{product.produced.toLocaleString()}</td>
                  <td>{product.target ? product.target.toLocaleString() : "—"}</td>
                  <td>{product.target ? Math.max(0, product.target - product.produced).toLocaleString() : "—"}</td>
                  <td>{complete ? <span className="completion-status">Completed</span> : product.target ? "In progress" : "No target"}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
      </Card>
    </div>
  );

  const main = (
    <>
      <ManagerTargetProgressReports toast={toast} />
      {periodReport}
      <ShiftTargetProgress dailyProduction={stream.dailyProduction} showHeader={false} />
      <div className="grid g4">
        <Card title="Synthetic Production OEE">
          <div className="kpi"><Donut percent={summary.oee} color="#1fa971" track="#d63031" size={84} />
            <div><div className="big"><CountUp value={summary.oee} decimals={1} suffix="%" /> <span>OEE</span></div>
              <small>Average of the latest event for each reporting machine</small></div></div>
          <small>Synthetic stream {stream.status} | Targets are set in Resource Planning</small>
        </Card>
        <Card title="Production Output vs. Plan">
          <div className="kpi">
            <div className="mini-bars">{stream.events.slice(-7).map((event, i) => <i key={`${event.timestamp}-${i}`} style={{ height: `${Math.max(2, Math.min(60, event.production.total / 2))}px` }} />)}</div>
            <div><div className="big"><CountUp value={producedOutput / 1000} suffix="k" /> / {plannedOutput / 1000}k <span>units</span></div><small>{hasRecordedOutput ? "Produced quantity vs. the fixed database target" : "Current stream production vs. the fixed database target"}</small></div>
          </div>
          {plannedOutput === 0 ? <span className="pill grey">No target available</span>
            : gap > 0 ? <span className="pill red">Short -{(gap / 1000).toFixed(1)}k units</span>
            : <span className="pill green">Ahead +{(-gap / 1000).toFixed(1)}k units</span>}
          <small className="block">{hasRecordedOutput ? "Production data refreshes from the database and synthetic stream." : `Synthetic stream: ${stream.status}`}</small>
        </Card>
        <Card title="Factory Utilization">
          <div className="kpi"><Donut percent={summary.machines.length ? (summary.machines.filter((event) => event.machine.status === "RUNNING").length / summary.machines.length) * 100 : 0} color="#1a8f73" size={84} /><div className="big"><CountUp value={summary.machines.length ? (summary.machines.filter((event) => event.machine.status === "RUNNING").length / summary.machines.length) * 100 : 0} suffix="%" /> <span>Running</span></div></div>
          <small>Running machines: {summary.machines.filter((event) => event.machine.status === "RUNNING").length}/{summary.machines.length} reporting</small>
        </Card>
        <Card title="Operational Costs">
          <div className="kpi"><Donut percent={d.cost.energy} color="#3ddc97" size={84} /><div className="big"><CountUp value={d.cost.total} prefix="$" /></div></div>
          {d.cost.total === 0 ? <small>Cost tracking is not set up yet.</small> : <small>Energy: {d.cost.energy}% | Labor: {d.cost.labor}% | Scrap: {d.cost.scrap}%</small>}
        </Card>
      </div>

      <div className="grid g2">
        <Card title="Synthetic OEE Trend - Recent Stream Events">
          <div className="chart"><ResponsiveContainer>
            <BarChart data={liveTrend}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="time" interval="preserveStartEnd" /><YAxis domain={[0, 100]} unit="%" /><Tooltip />
              <Bar dataKey="oee" name="OEE" fill="#0f6b57" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Synthetic Defect Counts by Product">
          {defectChart.length === 0 ? <p className="note-box">No defects received from the stream yet.</p> : (
            <>
              <div className="chart"><ResponsiveContainer>
                <ComposedChart data={defectChart}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="cause" /><YAxis yAxisId="l" /><YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" /><Tooltip /><Legend verticalAlign="top" />
                  <Bar yAxisId="l" dataKey="count" name="Defect counts" fill="#0f6b57" radius={[6, 6, 0, 0]} />
                  <Line yAxisId="r" dataKey="cumulative" name="Cumulative (%)" stroke="#6b8a83" strokeWidth={2} />
                </ComposedChart></ResponsiveContainer></div>
              <small>Product with most defects: {defectChart[0].cause} ({defectChart[0].count} units)</small>
            </>
          )}
        </Card>
      </div>

      <div className="grid g-alerts">
        <Card title="Machine Floor - Synthetic Status">{liveMachines.length === 0 ? <p className="note-box">Waiting for machines to report on the synthetic stream.</p> : <MachineFloor machines={liveMachines} />}</Card>
        <Card title="OEE Detail Availability">
          <p className="note-box">The stream reports combined OEE, but does not send availability, performance, and quality components separately.</p>
        </Card>
      </div>

      <div className="grid g-alerts">
        <ProductionStreamPanel events={stream.events} status={stream.status} />
        <Card title="Active High-Priority Alerts">
          <table className="table">
            <thead><tr><th>Priority</th><th>Machine/Line</th><th>Alert Description</th><th>Duration</th><th></th></tr></thead>
            <tbody>{open.length === 0 && <tr><td colSpan="5">{alerts.length ? "All alerts acknowledged. Nice work." : "No active alerts in the latest machine events."}</td></tr>}{open.map((a, i) => (
              <tr key={i}><td><span className={`dot ${a.level}`} style={{ background: dot[a.level] }}>!</span></td><td>{a.machine}</td><td>{a.text}</td><td>{a.duration}<small className="block">{a.action}</small></td><td><button className="btn blue sm" onClick={() => setAck([...ack, a.machine + a.text])}>Acknowledge</button></td></tr>
            ))}</tbody>
          </table>
        </Card>
        <Card title="Production Planning & Export Tools">
          <div className="plan-export">
            <div><h4>Latest Shift Plan from Stream</h4><ul className="plan">{livePlan.length === 0 && <li>Waiting for target and shift data from the stream.</li>}{livePlan.map((p) => <li key={p}>{p}</li>)}</ul></div>
            <div><h4>Quick Reports & Exports</h4>
              <div className="tiles">{d.reports.map((r) => <button key={r.name} className="tile navy" onClick={() => download(r)}>{r.name} ({r.type})</button>)}</div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );

  const view = {
    Dashboard: main,
    "Manage Supervisor": <ManagerSupervisorManagement toast={toast} />,
    "OEE Analytics": <OeeAnalytics streamEvents={stream.events} />,
    "Line Performance": <LinePerformance streamEvents={stream.events} />,
    "Resource Planning": <ResourcePlanning toast={toast} dailyProduction={stream.dailyProduction} />,
    Alerts: <AlertsSection streamEvents={stream.events} />,
    Reports: <ReportsSection toast={toast} />,
    Settings: <SettingsSection user={user} toast={toast} />,
  }[section];

  return (
    <Shell user={user} roleLabel="Production Manager" onLogout={onLogout} onRefresh={load}
      nav={NAV} active={section} onNavigate={setSection} title={TITLES[section]}
      notifications={alerts.map((alert) => ({
        id: `stream:${alert.id}`,
        level: alert.level,
        text: `${alert.machine}: ${alert.text}`,
        time: alert.time,
      }))}
      extra={section === "Dashboard" && <div className="seg">{["daily", "weekly", "monthly"].map((r) => <button key={r} className={r === range ? "on" : ""} onClick={() => setRange(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}</div>}>
      {toast.node}
      {view}
    </Shell>
  );
}
