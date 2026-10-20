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

/* Simulated live data. Replace with a websocket / polling call when the API is ready. */
export function useLiveSeries(base, spread, n = 24, ms = 2000) {
  const make = () => Math.max(0, base + (Math.random() - 0.5) * spread);
  const [s, setS] = useState(() => Array.from({ length: n }, make));
  useEffect(() => {
    const t = setInterval(() => setS((a) => [...a.slice(1), make()]), ms);
    return () => clearInterval(t);
  }, []);
  return s;
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
const DEMO_NOTES = [
  { id: 1, level: "high", text: "Line 3 - Packing: extended downtime (65m)", time: "2 min ago" },
  { id: 2, level: "medium", text: "Pack 02 defect rate reached 5.1%", time: "14 min ago" },
  { id: 3, level: "info", text: "Nightly database backup completed", time: "1 hr ago" },
];
export function NotificationBell({ items = DEMO_NOTES }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(items);
  const [seen, setSeen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const unread = seen ? 0 : list.length;
  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" aria-label="Notifications" onClick={() => { setOpen(!open); setSeen(true); }}>
        🔔{unread > 0 && <i className="badge">{unread}</i>}
      </button>
      {open && (
        <div className="drop">
          <div className="drop-head"><b>Notifications</b><button onClick={() => setList([])}>Clear all</button></div>
          {list.length === 0 ? <p className="empty">You're all caught up.</p> : list.map((n) => (
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
      <div className="progress-top"><small>Good units vs shift target</small><b>{pct.toFixed(0)}%</b></div>
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

/* ---------- manager: machine floor ---------- */
export const demoMachines = () =>
  Array.from({ length: 48 }, (_, i) => {
    const status = i % 11 === 5 ? "down" : i % 13 === 4 ? "idle" : i % 17 === 9 ? "maint" : "running";
    return { name: `L${Math.floor(i / 8) + 1}-M${(i % 8) + 1}`, status, oee: status === "running" ? 70 + ((i * 7) % 28) : status === "down" ? 0 : 40 + ((i * 3) % 20), reason: status === "down" ? "Material jam" : status === "maint" ? "Scheduled service" : "" };
  });

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

/* ---------- manager: OEE what-if ---------- */
export function OeeSimulator({ base }) {
  const init = { a: base.availability, p: base.performance, q: base.quality };
  const [v, setV] = useState(init);
  const oee = (v.a * v.p * v.q) / 10000;
  const baseOee = (init.a * init.p * init.q) / 10000;
  const diff = oee - baseOee;
  const Slider = ({ k, label }) => (
    <label className="slider">
      <span>{label}<b>{v[k].toFixed(1)}%</b></span>
      <input type="range" min="50" max="100" step="0.1" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
    </label>
  );
  return (
    <>
      <div className="sim-result">
        <div className="big">{oee.toFixed(1)}% <span>OEE</span></div>
        <span className={`pill ${diff > 0.05 ? "green" : diff < -0.05 ? "red" : "grey"}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(1)} pts vs now</span>
      </div>
      <Slider k="a" label="Availability" /><Slider k="p" label="Performance" /><Slider k="q" label="Quality" />
      <div className="sim-foot">
        <small>{oee >= 85 ? "Reaches the 85% world-class benchmark." : `${(85 - oee).toFixed(1)} pts below the 85% world-class benchmark.`}</small>
        <button className="btn blue sm" onClick={() => setV(init)}>Reset</button>
      </div>
    </>
  );
}