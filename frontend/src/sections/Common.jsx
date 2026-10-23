import { useEffect, useState } from "react";
import { Card } from "../components/Layout.jsx";
import { summarizeMachineAlerts } from "../data/productionStream.js";
import { API_BASE, changePassword, downloadReport, getAlerts, getReports } from "../api.js";

/* Green/red message bar that disappears by itself after 3 seconds. ok("saved") / fail(error) */
export function useToast() {
  const [t, setT] = useState(null);
  useEffect(() => {
    if (!t) return undefined;
    const timer = setTimeout(() => setT(null), 3000);
    return () => clearTimeout(timer);
  }, [t]);
  // failed list loads (see api.js read()) arrive here as red messages
  useEffect(() => {
    const onErr = (e) => setT({ m: e.detail, err: true });
    window.addEventListener("apierror", onErr);
    return () => window.removeEventListener("apierror", onErr);
  }, []);
  const ok = (m) => setT({ m, err: false });
  const fail = (e) => setT({ m: e?.message || String(e), err: true });
  const node = t && <div className={`toast ${t.err ? "err" : ""}`} onClick={() => setT(null)}>{t.m}</div>;
  return { node, ok, fail };
}

/* Loads data when mounted (and again when reload() is called or deps change). */
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {   // the top-bar Refresh button reloads every section too
    const h = () => setTick((n) => n + 1);
    window.addEventListener("appRefresh", h);
    return () => window.removeEventListener("appRefresh", h);
  }, []);
  useEffect(() => {
    let live = true;
    fn().then((d) => live && setData(d));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return [data, () => setTick((n) => n + 1)];
}

export const Empty = ({ children = "Nothing to show yet." }) => <p className="note-box">{children}</p>;
export const Busy = () => <p className="note-box">Loading…</p>;

/* Wrap an async action: shows success or the server's error. */
export const useAction = (toast) => async (fn, okMsg) => {
  try { await fn(); if (okMsg) toast.ok(okMsg); return true; } catch (e) { toast.fail(e); return false; }
};

const dotColor = { high: "#d63031", medium: "#e9b949", low: "#f2c94c" };

export function AlertsSection({ streamEvents }) {
  const [range, setRange] = useState("weekly");
  const [databaseList] = useLoad(() => streamEvents === undefined ? getAlerts(range) : Promise.resolve([]), [range]);
  const list = streamEvents === undefined ? databaseList : summarizeMachineAlerts(streamEvents);
  const [ack, setAck] = useState([]);
  const open = (list || []).filter((a) => !ack.includes(a.machine + a.text));
  return (
    <Card title={streamEvents === undefined ? "Alerts" : "Synthetic Stream Alerts"} right={streamEvents === undefined && <div className="seg">{["daily", "weekly", "monthly"].map((r) => <button key={r} className={r === range ? "on" : ""} onClick={() => setRange(r)}>{r[0].toUpperCase() + r.slice(1)}</button>)}</div>}>
      {!list ? <Busy /> : (
        <table className="table">
          <thead><tr><th>Priority</th><th>Machine / Line</th><th>Alert</th><th>Value</th><th></th></tr></thead>
          <tbody>
            {open.length === 0 && <tr><td colSpan="5">{streamEvents === undefined ? "No open alerts for this period." : "No active alerts in the latest machine events."}</td></tr>}
            {open.map((a, i) => (
              <tr key={i}>
                <td><span className="dot" style={{ background: dotColor[a.level] }}>!</span></td>
                <td>{a.machine}</td><td>{a.text}</td>
                <td>{a.duration}<small className="block">{a.action}</small></td>
                <td><button className="btn blue sm" onClick={() => setAck([...ack, a.machine + a.text])}>Acknowledge</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="note-box" style={{ marginTop: 12 }}>Alerts are calculated from saved data: downtime over 60 minutes, defect rate over 5%, OEE under 80%.</p>
    </Card>
  );
}

export function ReportsSection({ toast }) {
  const [list] = useLoad(getReports);
  const [busy, setBusy] = useState("");
  const go = async (r) => {
    setBusy(r.name);
    try { await downloadReport(r.name, r.type); toast.ok(`${r.name} downloaded.`); } catch (e) { toast.fail(e); }
    setBusy("");
  };
  return (
    <Card title="Reports & Exports">
      {!list ? <Busy /> : <div className="tiles">{list.map((r) => <button key={r.name} className="tile navy" disabled={busy === r.name} onClick={() => go(r)}>{busy === r.name ? "Preparing…" : `${r.name} (${r.type})`}</button>)}</div>}
      <p className="note-box" style={{ marginTop: 12 }}>Reports download in their listed format. Energy Usage needs energy data, which is not tracked yet.</p>
    </Card>
  );
}

export function SettingsSection({ user, toast }) {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const save = async () => {
    if (f.next !== f.again) return toast.fail(new Error("The new passwords do not match."));
    try { await changePassword(f.current, f.next); toast.ok("Password changed."); setF({ current: "", next: "", again: "" }); } catch (e) { toast.fail(e); }
  };
  return (
    <div className="grid g2">
      <Card title="My Account">
        <table className="table"><tbody>
          <tr><td>Name</td><td>{user.name || user.full_name}</td></tr>
          <tr><td>Email</td><td>{user.email}</td></tr>
          <tr><td>Role</td><td>{user.role}</td></tr>
          <tr><td>Server</td><td>{API_BASE || "Same origin (Vite proxy)"}</td></tr>
          <tr><td>Data</td><td>{window.__dataSource === "live" ? "Live from the database" : "Database data unavailable"}</td></tr>
        </tbody></table>
        <p className="note-box" style={{ marginTop: 12 }}>Use the moon/sun button in the top bar to switch light and dark mode.</p>
      </Card>
      <Card title="Change Password">
        <div className="stack">
          <label className="field">Current password<input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></label>
          <label className="field">New password (8+ characters)<input type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></label>
          <label className="field">Repeat new password<input type="password" autoComplete="new-password" value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></label>
          <button className="btn green" onClick={save}>Update password<span className="arrow">↗</span></button>
        </div>
      </Card>
    </div>
  );
}