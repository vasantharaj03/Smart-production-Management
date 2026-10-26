import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "../components/Layout.jsx";
import { latestMachineEvents } from "../data/productionStream.js";
import { achievementPercent, targetProduction } from "../data/targetProduction.js";
import {
  addProduct,
  addTarget,
  assignManagerSupervisorShift,
  unassignManagerSupervisorShift,
  getMachines,
  getManagerSupervisors,
  getProducts,
  getShifts,
  getTargets,
} from "../api.js";
import { Busy, Empty, useLoad } from "./Common.jsx";

export function OeeAnalytics({ streamEvents }) {
  const chart = latestMachineEvents(streamEvents).map((event) => ({
    code: event.machine.code,
    machine: event.machine.name,
    status: event.machine.status,
    produced: event.production.total,
    defectRate: event.production.defectRate,
    oee: event.kpis.oee,
  }));
  return (
    <div className="stack">
      <Card title="Synthetic OEE by Machine">
        {chart.length === 0 ? <Empty>No machines yet.</Empty> : (
          <div className="chart"><ResponsiveContainer>
            <BarChart data={chart}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="code" /><YAxis domain={[0, 100]} unit="%" /><Tooltip />
              <Bar dataKey="oee" name="OEE" fill="#083d30" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
        )}
      </Card>
      <Card title="Machine Detail">
        <div className="scroll-x"><table className="table">
          <thead><tr><th>Machine</th><th>Status</th><th>Latest Output</th><th>Defect %</th><th>OEE %</th></tr></thead>
          <tbody>{chart.map((m) => <tr key={m.code}><td>{m.machine} ({m.code})</td><td>{m.status}</td><td>{m.produced.toLocaleString()}</td><td>{m.defectRate.toFixed(1)}%</td><td className={m.oee < 80 ? "bad" : ""}><b>{m.oee.toFixed(1)}%</b></td></tr>)}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

export function LinePerformance({ streamEvents }) {
  const machines = latestMachineEvents(streamEvents);
  return (
    <div className="grid g2">
      <Card title="Latest Output by Machine">
        {machines.length === 0 ? <Empty>Waiting for synthetic machine events from the backend.</Empty> : (
          <div className="chart"><ResponsiveContainer>
            <BarChart data={machines.map((event) => ({ machine: event.machine.code, produced: event.production.total }))}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="machine" /><YAxis /><Tooltip />
              <Bar dataKey="produced" name="Latest units produced" fill="#0f6b57" radius={[8, 8, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
        )}
      </Card>
      <Card title="Synthetic Machine Summary">
        <table className="table">
          <thead><tr><th>Machine</th><th>Status</th><th>Output</th><th>Downtime (min)</th><th>Defect %</th><th>OEE %</th></tr></thead>
          <tbody>{machines.map((event) => <tr key={event.machine.code}><td>{event.machine.name}</td><td>{event.machine.status}</td><td>{event.production.total.toLocaleString()}</td><td>{event.machine.downtimeMinutes}</td><td>{event.production.defectRate.toFixed(1)}%</td><td><b>{event.kpis.oee.toFixed(1)}%</b></td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function ResourcePlanning({ toast, dailyProduction = {} }) {
  const [day, setDay] = useState(today());
  const [targetRefresh, setTargetRefresh] = useState(0);
  const [targets, reload] = useLoad(() => getTargets(day), [day, targetRefresh]);
  const [products, reloadProducts] = useLoad(getProducts);
  const [machines] = useLoad(getMachines);
  const [shifts] = useLoad(getShifts);
  const [f, setF] = useState({ product: "", machine: "", shift: "", quantity: 10000 });
  const [np, setNp] = useState({ product_code: "", product_name: "" });

  useEffect(() => {
    const timer = window.setInterval(() => setTargetRefresh((value) => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeProducts = (products || []).filter((p) => p.is_active);
  const product = f.product || activeProducts[0]?.product_code || "";   // what the dropdown really shows

  const submit = async () => {
    if (!product) return toast.fail(new Error("Add a product first (box on the right)."));
    try {
      await addTarget({ product, machine: f.machine || undefined, shift: f.shift || undefined, quantity: Number(f.quantity), date: day });
      toast.ok("Target saved."); reload();
    } catch (e) { toast.fail(e); }
  };
  const saveProduct = async () => {
    try {
      await addProduct(np);
      toast.ok("Product added.");
      setF({ ...f, product: np.product_code.trim() });
      setNp({ product_code: "", product_name: "" });
      reloadProducts();
    } catch (e) { toast.fail(e); }
  };

  return (
    <div className="grid g2">
      <div className="stack">
        <Card title="Set a Production Target">
          <div className="form2">
            <label className="field">Date<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
            <label className="field">Product
              <select value={product} onChange={(e) => setF({ ...f, product: e.target.value })}>
                {activeProducts.length === 0 && <option value="">No products yet</option>}
                {activeProducts.map((p) => <option key={p.product_id} value={p.product_code}>{p.product_code} {p.product_name}</option>)}
              </select>
            </label>
            <label className="field">Machine (optional)<select value={f.machine} onChange={(e) => setF({ ...f, machine: e.target.value })}><option value="">Any machine</option>{(machines || []).map((m) => <option key={m.machine_id} value={m.machine_code}>{m.machine_name}</option>)}</select></label>
            <label className="field">Shift (optional)<select value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}><option value="">Any shift</option>{(shifts || []).map((x) => <option key={x.shift_id} value={x.shift_name}>{x.shift_name}</option>)}</select></label>
            <label className="field">Target quantity<div className="unit"><input type="number" min="1" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /><span>units</span></div></label>
          </div>
          <button className="btn green full" onClick={submit}>Save fixed target<span className="arrow">↗</span></button>
        </Card>
        <Card title="Add a Product">
          <div className="form2">
            <label className="field">Code<input value={np.product_code} placeholder="P030" onChange={(e) => setNp({ ...np, product_code: e.target.value })} /></label>
            <label className="field">Name<input value={np.product_name} placeholder="Face Wash Sachet" onChange={(e) => setNp({ ...np, product_name: e.target.value })} /></label>
          </div>
          <button className="btn blue full" onClick={saveProduct}>Add product<span className="arrow">↗</span></button>
        </Card>
      </div>
      <Card title={`Targets for ${day}`}>
        {!targets ? <Busy /> : targets.length === 0 ? <Empty>No targets for this day.</Empty> : (
          <table className="table">
            <thead><tr><th>Product</th><th>Machine</th><th>Shift</th><th>Target</th><th>Produced</th><th>Achievement</th></tr></thead>
            <tbody>{targets.map((t) => {
              const target = Number(t.target_quantity) || 0;
              const recordedProduction = Number(t.produced_quantity) || 0;
              const liveProduction = t.target_date === today()
                ? targetProduction(t, dailyProduction, targets || [])
                : { produced: 0 };
              const produced = Math.max(recordedProduction, liveProduction.produced);
              return <tr key={t.target_id}>
                <td>{t.product_code} {t.product_name}</td>
                <td>{t.machine_name || "Any"}</td>
                <td>{t.shift_name || "Any"}</td>
                <td>{target.toLocaleString()} units</td>
                <td>{produced.toLocaleString()} units{liveProduction.produced > recordedProduction ? " · Live" : ""}</td>
                <td>{target ? `${achievementPercent(produced, target).toFixed(1)}%` : "—"}</td>
              </tr>;
            })}</tbody>
          </table>
        )}
        <p className="note-box" style={{ marginTop: 12 }}>Produced quantity is summed from saved production entries matching the target's date, product, and any assigned machine or shift. Targets drive the Performance part of OEE and the Output vs Plan card.</p>
      </Card>
    </div>
  );
}

export function ManagerSupervisorManagement({ toast }) {
  const [supervisorRefresh, setSupervisorRefresh] = useState(0);
  const [supervisors, reloadSupervisors] = useLoad(getManagerSupervisors, [supervisorRefresh]);
  const [shifts] = useLoad(getShifts);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [unassigningId, setUnassigningId] = useState(null);
  const supervisorShifts = (shifts || []).filter(
    (shift) => shift.is_active && /^[ABC](?:\b|[-–—])/i.test(shift.shift_name),
  );

  useEffect(() => {
    const timer = window.setInterval(() => setSupervisorRefresh((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const saveAssignment = async (supervisor) => {
    const draft = drafts[supervisor.user_id] || {};
    const shiftId = draft.shiftId ?? supervisor.shift_id;
    if (!shiftId) {
      toast.fail(new Error("Select an A, B, or C shift before saving."));
      return;
    }
    setSavingId(supervisor.user_id);
    try {
      await assignManagerSupervisorShift(supervisor.user_id, {
        shift_id: Number(shiftId),
        reason: draft.reason || "",
      });
      toast.ok(`${supervisor.full_name}'s shift assignment was updated.`);
      setDrafts((current) => ({ ...current, [supervisor.user_id]: { shiftId, reason: "" } }));
      reloadSupervisors();
    } catch (error) {
      toast.fail(error);
    } finally {
      setSavingId(null);
    }
  };

  const unassign = async (supervisor) => {
    if (!window.confirm(`Unassign ${supervisor.full_name} from ${supervisor.shift_name}?`)) return;
    setUnassigningId(supervisor.user_id);
    try {
      await unassignManagerSupervisorShift(supervisor.user_id, {
        reason: drafts[supervisor.user_id]?.reason || "",
      });
      toast.ok(`${supervisor.full_name}'s shift was unassigned.`);
      setDrafts((current) => ({
        ...current,
        [supervisor.user_id]: { shiftId: "", reason: "" },
      }));
      reloadSupervisors();
    } catch (error) {
      toast.fail(error);
    } finally {
      setUnassigningId(null);
    }
  };

  return (
    <Card title="Manage Supervisor">
      {!supervisors ? <Busy /> : supervisors.length === 0 ? (
        <Empty>No supervisors are registered yet.</Empty>
      ) : (
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Supervisor</th><th>Current shift</th><th>Assign / rotate shift</th><th>Reason (optional)</th><th>Last recorded production</th><th>Actions</th></tr></thead>
            <tbody>{supervisors.map((supervisor) => {
              const draft = drafts[supervisor.user_id] || {};
              return (
                <tr key={supervisor.user_id}>
                  <td><b>{supervisor.full_name}</b><small className="block">{supervisor.email}{!supervisor.is_active && " · Inactive"}</small></td>
                  <td>{supervisor.shift_name || <span className="pill grey">Unassigned</span>}</td>
                  <td>
                    <div className="field">
                      <select
                        aria-label={`Shift for ${supervisor.full_name}`}
                        value={draft.shiftId ?? supervisor.shift_id ?? ""}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [supervisor.user_id]: { ...draft, shiftId: event.target.value },
                        }))}
                      >
                        <option value="">Select shift</option>
                        {supervisorShifts.map((shift) => (
                          <option key={shift.shift_id} value={shift.shift_id}>{shift.shift_name}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>
                    <div className="field">
                      <input
                        aria-label={`Reason for changing ${supervisor.full_name}'s shift`}
                        maxLength={350}
                        placeholder="Emergency, request…"
                        value={draft.reason || ""}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [supervisor.user_id]: { ...draft, reason: event.target.value },
                        }))}
                      />
                    </div>
                  </td>
                  <td>{supervisor.last_production_date
                    ? `${supervisor.last_production_date}${supervisor.last_production_shift ? ` · ${supervisor.last_production_shift}` : ""}`
                    : "No records yet"}</td>
                  <td>
                    <div className="manager-shift-actions">
                      <button
                        className="btn blue sm"
                        disabled={savingId === supervisor.user_id || unassigningId === supervisor.user_id || !supervisor.is_active || supervisorShifts.length === 0}
                        onClick={() => saveAssignment(supervisor)}
                      >
                        {savingId === supervisor.user_id ? "Saving…" : "Save shift"}
                      </button>
                      {supervisor.shift_id && (
                        <button
                          className="btn sm unassign"
                          disabled={savingId === supervisor.user_id || unassigningId === supervisor.user_id}
                          onClick={() => unassign(supervisor)}
                        >
                          {unassigningId === supervisor.user_id ? "Unassigning…" : "Unassign"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {supervisorShifts.length === 0 && (
        <p className="note-box" style={{ marginTop: 12 }}>
          No active A, B, or C shifts are available. Ask an administrator to activate a shift in Admin &gt; Master Data.
        </p>
      )}
      <p className="note-box" style={{ marginTop: 12 }}>
        Shift changes apply to future production entries. Existing records keep the shift recorded when they were submitted.
      </p>
    </Card>
  );
}