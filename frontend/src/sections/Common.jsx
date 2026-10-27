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
      <p className="note-box" style={{ marginTop: 12 }}>PDF reports download as PDF files; Excel reports download as .xlsx workbooks. Energy usage is omitted until the system records energy data.</p>
    </Card>
  );
}

export function SettingsSection({ user, toast }) {
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const syncTheme = (event) => setTheme(event.detail);
    window.addEventListener("app-theme-change", syncTheme);
    return () => window.removeEventListener("app-theme-change", syncTheme);
  }, []);
  const changeTheme = (nextTheme) => {
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent("app-theme-change", { detail: nextTheme }));
  };
  const save = async () => {
    if (!f.current || !f.next || !f.again) return toast.fail(new Error("Complete all password fields."));
    if (f.next.length < 8) return toast.fail(new Error("The new password must contain at least 8 characters."));
    if (f.next !== f.again) return toast.fail(new Error("The new passwords do not match."));
    setSaving(true);
    try {
      await changePassword(f.current, f.next);
      toast.ok("Password changed.");
      setF({ current: "", next: "", again: "" });
    } catch (error) {
      toast.fail(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="settings-page">
      <div className="settings-intro">
        <div>
          <span className="eyebrow">Workspace preferences</span>
          <p>Manage your account security and personalize your production workspace.</p>
        </div>
        <span className="pill green">Settings apply across all dashboards</span>
      </div>
      <div className="settings-grid">
        <Card title="My account" className="settings-account">
          <div className="settings-profile">
            <div className="settings-avatar">{(user?.name || user?.full_name || "U").slice(0, 1).toUpperCase()}</div>
            <div>
              <h3>{user?.name || user?.full_name || "User"}</h3>
              <p>{user?.email || "No email available"}</p>
            </div>
            <span className="pill green">{String(user?.role || "user").replaceAll("_", " ")}</span>
          </div>
          <div className="settings-details">
            <div><span>Account role</span><b>{String(user?.role || "Unknown").replaceAll("_", " ")}</b></div>
            <div><span>Connection</span><b>{API_BASE || "Same origin"}</b></div>
            <div><span>Production data</span><b className={window.__dataSource === "live" ? "good" : "warn"}>{window.__dataSource === "live" ? "Live database" : "Offline / unavailable"}</b></div>
          </div>
          <p className="note-box settings-note">Access and dashboard features are controlled by your assigned account role.</p>
        </Card>
        <div className="settings-stack">
          <Card title="Appearance" className="settings-appearance">
            <p className="settings-help">Choose a comfortable theme. Your choice is saved in this browser and shared across every role dashboard.</p>
            <div className="appearance-options" role="group" aria-label="Color theme">
              {[
                { value: "light", label: "Light", detail: "Bright production floor" },
                { value: "dark", label: "Dark", detail: "Low-light workspace" },
              ].map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`appearance-option ${theme === option.value ? "selected" : ""}`}
                  aria-pressed={theme === option.value}
                  onClick={() => changeTheme(option.value)}
                >
                  <span className={`appearance-preview ${option.value}`} aria-hidden="true"><i /><i /><i /></span>
                  <span><b>{option.label}</b><small>{option.detail}</small></span>
                  <span className="appearance-check" aria-hidden="true">{theme === option.value ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Change password" className="settings-password">
            <p className="settings-help">Use a unique password with at least 8 characters to protect your production account.</p>
            <div className="settings-password-fields">
              <label className="field">Current password<input type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} /></label>
              <label className="field">New password<input type="password" autoComplete="new-password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} /></label>
              <label className="field">Repeat new password<input type="password" autoComplete="new-password" minLength={8} value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} /></label>
              <button type="button" className="btn green" disabled={saving} onClick={save}>{saving ? "Updating…" : "Update password"}<span className="arrow">↗</span></button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}