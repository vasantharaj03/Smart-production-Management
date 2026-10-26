import { useEffect, useState } from "react";
import { LiveClock, NotificationBell } from "./Extras.jsx";
import { getNotifications } from "../api.js";

/* ---------- Icons (inline SVG, no extra library) ---------- */
const P = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  db: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3z M21 12c0 1.66-4 3-9 3s-9-1.34-9-3 M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  pulse: "M22 12h-4l-3 9L9 3l-3 9H2",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z",
  cpu: "M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3",
  check: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  bars: "M12 20V10 M18 20V4 M6 20v-4",
  cal: "M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
};
const ICON = {
  Dashboard: "grid", "System Config": "sliders", "User Management": "users", "Master Data": "db", "Audit Logs": "file",
  Reports: "file", Alerts: "bell", Settings: "sliders", "Entry Forms": "edit", Machines: "cpu", Quality: "check",
  "OEE Analytics": "pulse", "Line Performance": "bars", "Resource Planning": "cal",
};
export const Icon = ({ name, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {P[name].split(" M").map((d, i) => <path key={i} d={(i ? "M" : "") + d} />)}
  </svg>
);

/* ---------- Theme (light / dark) ---------- */
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    window.dispatchEvent(new CustomEvent("app-theme-change", { detail: theme }));
  }, [theme]);
  useEffect(() => {
    const syncTheme = (event) => setTheme(event.detail);
    window.addEventListener("app-theme-change", syncTheme);
    return () => window.removeEventListener("app-theme-change", syncTheme);
  }, []);
  return [theme, () => setTheme((t) => (t === "light" ? "dark" : "light"))];
}

const todayText = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function Shell({ user, roleLabel, nav, title, onLogout, onRefresh, extra, notifications, children, active: activeProp, onNavigate }) {
  // Controlled when the page passes `active`; otherwise keeps its own state (old behaviour).
  const [inner, setInner] = useState(nav[0]);
  const active = activeProp ?? inner;
  const setActive = (n) => { setInner(n); onNavigate?.(n); };
  const [stamp, setStamp] = useState(new Date());
  const [spin, setSpin] = useState(false);
  const [src, setSrc] = useState(window.__dataSource || "offline");
  const [theme, toggleTheme] = useTheme();
  const [notes, setNotes] = useState([]);
  const loadNotes = () => getNotifications().then((list) => setNotes((list || []).map((item, index) => ({
    id: item.id || `${item.text}-${index}`,
    level: item.level || "medium",
    text: item.text || "Production update",
    time: item.time || "",
  }))));
  useEffect(() => {
    loadNotes();
    const t = setInterval(loadNotes, 10_000);
    window.addEventListener("appRefresh", loadNotes);
    return () => { clearInterval(t); window.removeEventListener("appRefresh", loadNotes); };
  }, []);
  const notificationItems = [...notes, ...(notifications || [])].filter(
    (item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index,
  );
  const refresh = () => { setStamp(new Date()); setSpin(true); setTimeout(() => setSpin(false), 700); onRefresh?.(); window.dispatchEvent(new Event("appRefresh")); };
  useEffect(() => { const t = setInterval(() => setStamp(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { const h = (e) => setSrc(e.detail); window.addEventListener("datasource", h); return () => window.removeEventListener("datasource", h); }, []);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="product"><span className="p-icon"><Icon name="bars" size={20} /></span><div><b>smart<i>prod</i></b><small>INDUSTRIAL INTELLIGENCE</small></div></div>
        <nav>
          {nav.map((n) => (
            <button key={n} className={n === active ? "active" : ""} onClick={() => setActive(n)}>
              <Icon name={ICON[n] || "grid"} />{n}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <div className="avatar">{user.name?.[0]}</div>
          <div><b>{user.name}</b><small>{roleLabel}</small></div>
          <button className="logout" onClick={onLogout}><Icon name="out" size={16} /> Log out</button>
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div><span className="eyebrow">{roleLabel} workspace</span><h1>{title}<i className="tdot">.</i></h1><small>{todayText()}</small></div>
          <div className="actions">
            {extra}
            <LiveClock />
            <NotificationBell items={notificationItems} />
            <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle theme">{theme === "light" ? "☾" : "☀"}</button>
            <button className="btn dark" onClick={refresh}>Refresh<span className={`arrow ${spin ? "spin" : ""}`}>↻</span></button>
          </div>
        </header>
        {children}
        <footer className="status"><i className="live" /> System Status: <span className="ok">Online</span> | Last Updated: {stamp.toLocaleTimeString()} | Data: <b className={src === "live" ? "ok" : "warn"}>{src === "live" ? "Live" : "Offline"}</b></footer>
      </main>
    </div>
  );
}

/* Card with a spotlight that follows the mouse */
export const Card = ({ title, className = "", children, right }) => (
  <section className={`card ${className}`}
    onMouseMove={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
      e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
    }}>
    {title && <div className="card-head"><h3>{title}</h3>{right}</div>}
    {children}
  </section>
);

/* Donut that animates from 0 */
export function Donut({ percent, color = "#2f9e44", size = 64, track }) {
  const [p, setP] = useState(0);
  useEffect(() => { const t = setTimeout(() => setP(percent), 150); return () => clearTimeout(t); }, [percent]);
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="donut" style={{ "--glow": color }}>
      <circle cx="32" cy="32" r={r} fill="none" stroke={track || "var(--track)"} strokeWidth="8" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 32 32)" className="donut-arc" />
    </svg>
  );
}

/* Number that counts up */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 1100 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(value);
    let raf, start;
    const tick = (t) => {
      if (start === undefined) start = t;
      const p = Math.min((t - start) / duration, 1);
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{prefix}{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>;
}

export const Pill = ({ tone = "grey", children }) => <span className={`pill ${tone}`}>{children}</span>;

export const Loading = () => (
  <div className="loading">
    <div className="grid g4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>
    <div className="grid g2"><div className="skeleton tall" /><div className="skeleton tall" /></div>
  </div>
);