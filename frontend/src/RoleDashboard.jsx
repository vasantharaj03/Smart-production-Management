import AdminDashboard from "./dashboards/AdminDashboard.jsx";
import SupervisorDashboard from "./dashboards/SupervisorDashboard.jsx";
import ManagerDashboard from "./dashboards/ManagerDashboard.jsx";

// Picks the dashboard from the logged-in user's role.
export default function RoleDashboard({ user, onLogout }) {
  switch (user?.role) {
    case "admin": return <AdminDashboard user={user} onLogout={onLogout} />;
    case "supervisor": return <SupervisorDashboard user={user} onLogout={onLogout} />;
    case "manager": return <ManagerDashboard user={user} onLogout={onLogout} />;
    default: return <p style={{ padding: 40 }}>No access: unknown role "{user?.role}".</p>;
  }
}
