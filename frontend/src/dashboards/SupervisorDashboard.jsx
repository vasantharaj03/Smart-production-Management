import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Shell, Card } from "../components/Layout.jsx";
import { getSupervisorData } from "../api.js";
import { ProductionStreamPanel } from "../components/ProductionStream.jsx";
import { ShiftTargetProgress } from "../components/ShiftTargetProgress.jsx";
import { SupervisorTargetProgressReport } from "../components/TargetProgressReports.jsx";
import { latestMachineEvents, summarizeMachineAlerts } from "../data/productionStream.js";
import { useProductionStream } from "../hooks/useProductionStream.js";
import { useToast, AlertsSection, ReportsSection, SettingsSection } from "../sections/Common.jsx";
import { MachinesSection, QualitySection } from "../sections/Supervisor.jsx";

const NAV = ["Dashboard", "Machines", "Quality", "Reports", "Alerts", "Settings"];
const TITLES = {
  Dashboard: "Supervisor Dashboard",
  Machines: "Machines",
  Quality: "Quality",
  Reports: "Reports",
  Alerts: "Alerts",
  Settings: "Settings",
};

export default function SupervisorDashboard({ user, onLogout }) {
  const [section, setSection] = useState("Dashboard");
  const [dashboardData, setDashboardData] = useState(null);
  const toast = useToast();
  const stream = useProductionStream();
  useEffect(() => {
    const loadAssignment = () => getSupervisorData().then(setDashboardData);
    loadAssignment();
    const timer = window.setInterval(loadAssignment, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  const streamNotifications = summarizeMachineAlerts(stream.events).map((alert) => ({
    id: `stream:${alert.id}`,
    level: alert.level,
    text: `${alert.machine}: ${alert.text}`,
    time: alert.time,
  }));
  const downtimeByMachine = latestMachineEvents(stream.events).map((event) => ({
    machine: event.machine.code,
    minutes: event.machine.downtimeMinutes,
  }));
  const targetProgress = (
    <ShiftTargetProgress dailyProduction={stream.dailyProduction} currentShiftOnly />
  );
  const charts = (
    <Card title="Latest Downtime by Machine (Synthetic Stream)">
      <div className="chart"><ResponsiveContainer>
        <LineChart data={downtimeByMachine}>
          <CartesianGrid vertical={false} stroke="#e5e9f0" />
          <XAxis dataKey="machine" />
          <YAxis />
          <Tooltip />
          <Legend verticalAlign="top" />
          <Line type="monotone" dataKey="minutes" name="Downtime (minutes)" stroke="#e9b949" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer></div>
    </Card>
  );

  const view = {
    Dashboard: <>
      <Card title="My Assigned Shift">
        <div className="big">{dashboardData?.assigned_shift?.shift_name || "No shift assigned"}</div>
        <small>
          {dashboardData?.assigned_shift
            ? "Production entries are recorded against this shift. Contact your manager to request a change."
            : "Ask your manager to assign you to an A, B, or C shift."}
        </small>
      </Card>
      {targetProgress}
      <SupervisorTargetProgressReport dailyProduction={stream.dailyProduction} toast={toast} />
      {charts}
      <ProductionStreamPanel events={stream.events} status={stream.status} />
    </>,
    Machines: <MachinesSection streamEvents={stream.events} />,
    Quality: <QualitySection streamEvents={stream.events} />,
    Reports: <ReportsSection toast={toast} />,
    Alerts: <AlertsSection streamEvents={stream.events} />,
    Settings: <SettingsSection user={user} toast={toast} />,
  }[section];

  return (
    <Shell user={user} roleLabel="Production Supervisor" onLogout={onLogout}
      nav={NAV} active={section} onNavigate={setSection} title={TITLES[section]}
      notifications={streamNotifications}>
      {toast.node}
      {view}
    </Shell>
  );
}
