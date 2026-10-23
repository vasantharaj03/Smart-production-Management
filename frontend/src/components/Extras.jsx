import { useEffect, useRef, useState } from "react";
import "../extras.css";

/* ---------- helpers ---------- */
export function downloadCSV(filename, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

const hhmm = () => new Date().toTimeString().slice(0, 5);

/* ---------- top bar: clock + shift ---------- */
export function LiveClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const h = t.getHours();
  const shift = h >= 6 && h < 14 ? "A" : h >= 14 && h < 22 ? "B" : "C";
  return (
    <div className="clock">
      <b>{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</b>
      <small>Shift {shift}</small>
    </div>
  );
}

/* ---------- notification bell ---------- */
export function NotificationBell({ items = [] }) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState(() => new Set());
  const markSeen = () => setSeenIds((current) => new Set([...current, ...items.map((item) => item.id)]));
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const unread = items.filter((item) => !seenIds.has(item.id)).length;
  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" aria-label="Notifications" onClick={() => { setOpen(!open); markSeen(); }}>
        🔔{unread > 0 && <i className="badge">{unread}</i>}
      </button>
      {open && (
        <div className="drop">
          <div className="drop-head"><b>Notifications</b><button onClick={markSeen}>Mark all read</button></div>
          {items.length === 0 ? <p className="empty">You're all caught up.</p> : items.map((n) => (
            <div key={n.id} className="note"><span className={`lvl ${n.level}`} /><div><div>{n.text}</div><small>{n.time}</small></div></div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- sparkline ---------- */
export function Sparkline({ data, color = "#0f6b57", h = 54 }) {
  const w = 220, min = Math.min(...data), max = Math.max(...data), r = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / r) * (h - 12)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const id = useRef("sg" + Math.random().toString(36).slice(2)).current;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="spark">
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ---------- supervisor helpers ---------- */
export function DefectBadge({ defective, total }) {
  const rate = total ? (defective / total) * 100 : 0;
  const tone = rate < 2 ? "green" : rate < 4 ? "yellow" : "red";
  return <span className={`pill ${tone}`}>Defect rate {rate.toFixed(1)}%</span>;
}

export function ShiftProgress({ value, target }) {
  const pct = target ? (value / target) * 100 : 0;
  return (
    <div className="progress">
      <div className="progress-top"><small>Good units vs shift target</small><b>{target ? `${pct.toFixed(0)}%` : "No target set"}</b></div>
      <div className="bar"><i style={{ width: `${Math.min(100, pct)}%` }} className={pct >= 100 ? "done" : ""} /></div>
    </div>
  );
}

const REASONS = ["Material jam", "Maintenance", "Power cut", "Changeover", "Operator break"];
export const ReasonChips = ({ value, onPick }) => (
  <div className="chips">{REASONS.map((r) => <button key={r} type="button" className={value === r ? "on" : ""} onClick={() => onPick(r)}>{r}</button>)}</div>
);

/* Start when the stoppage begins, stop when it ends: fills start and end time. */
export function DowntimeTimer({ onStart, onStop }) {
  const [from, setFrom] = useState(null);
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!from) return;
    const i = setInterval(() => setSec(Math.floor((Date.now() - from) / 1000)), 500);
    return () => clearInterval(i);
  }, [from]);
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const toggle = () => {
    if (from) { onStop(hhmm()); setFrom(null); }
    else { setSec(0); setFrom(Date.now()); onStart(hhmm()); }
  };
  return (
    <button type="button" className={`stopwatch ${from ? "run" : ""}`} onClick={toggle}>
      {from ? <>■ Stop downtime <b>{fmt(sec)}</b></> : "▶ Start downtime now"}
    </button>
  );
}

const LABEL = { running: "Running", idle: "Idle", down: "Down", maint: "Maintenance" };
export function MachineFloor({ machines }) {
  const [filter, setFilter] = useState("all");
  const [pick, setPick] = useState(null);
  const count = (s) => machines.filter((m) => m.status === s).length;
  const shown = filter === "all" ? machines : machines.filter((m) => m.status === filter);
  return (
    <>
      <div className="chips">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>All {machines.length}</button>
        {Object.keys(LABEL).map((s) => <button key={s} className={`${s} ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>{LABEL[s]} {count(s)}</button>)}
      </div>
      <div className="floor">
        {shown.map((m) => (
          <button key={m.name} className={`mtile ${m.status} ${pick?.name === m.name ? "sel" : ""}`} onClick={() => setPick(m)} title={`${m.name}: ${LABEL[m.status]}`}>
            <b>{m.name}</b><small>{m.status === "down" ? "DOWN" : `${m.oee}%`}</small>
          </button>
        ))}
      </div>
      <div className="floor-detail">
        {pick ? <><b>{pick.name}</b> is {LABEL[pick.status].toLowerCase()}, OEE {pick.oee}%{pick.reason ? `, ${pick.reason}` : ""}.</> : "Select a machine to see details."}
      </div>
    </>
  );
}
