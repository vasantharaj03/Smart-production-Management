import "./dashboard.css";
import AdminDashboard from "./dashboards/AdminDashboard.jsx";
import SupervisorDashboard from "./dashboards/SupervisorDashboard.jsx";
import ManagerDashboard from "./dashboards/ManagerDashboard.jsx";

// Picks the dashboard from the logged-in user's role.
export default function RoleDashboard({ user, onLogout }) {
  const dashboardUser = { ...user, name: user?.name || user?.full_name };
  switch (String(user?.role || "").toLowerCase()) {
    case "admin": return <AdminDashboard user={dashboardUser} onLogout={onLogout} />;
    case "supervisor": return <SupervisorDashboard user={dashboardUser} onLogout={onLogout} />;
    case "manager": return <ManagerDashboard user={dashboardUser} onLogout={onLogout} />;
    default: return <p style={{ padding: 40 }}>No access: unknown role "{user?.role}".</p>;
  }
}
