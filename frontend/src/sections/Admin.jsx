import { useState } from "react";
import { Card } from "../components/Layout.jsx";
import { downloadCSV } from "../components/Extras.jsx";
import { addMachine, addProduct, addShift, checkDb, createUser, getAudit, getMachines, getProducts, getShifts, getUsers, patchMachine, patchProduct, patchShift, patchUser } from "../api.js";
import { Busy, Empty, useLoad } from "./Common.jsx";

const STATUS = ["RUNNING", "IDLE", "DOWN", "MAINTENANCE"];
const ROLES = ["ADMIN", "MANAGER", "SUPERVISOR"];

/* run an API call, show the result, refresh the list */
const act = (toast, reload) => async (fn, msg) => {
  try { await fn(); toast.ok(msg); reload(); return true; } catch (e) { toast.fail(e); return false; }
};

export function UserManagement({ toast, me }) {
  const [users, reload] = useLoad(getUsers);
  const run = act(toast, reload);
  const [newUser, setNewUser] = useState({
    full_name: "",
    email: "",
    password: "",
    role: "SUPERVISOR",
  });
  return (
    <div className="stack">
      <Card title="Create New Account">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const created = await run(
              () => createUser(newUser),
              `${newUser.full_name.trim()} created as ${newUser.role}.`,
            );
            if (created) {
              setNewUser({ full_name: "", email: "", password: "", role: "SUPERVISOR" });
            }
          }}
        >
          <div className="form2">
            <label className="field">Full name
              <input
                value={newUser.full_name}
                maxLength={120}
                autoComplete="name"
                required
                onChange={(event) => setNewUser({ ...newUser, full_name: event.target.value })}
              />
            </label>
            <label className="field">Work email
              <input
                type="email"
                value={newUser.email}
                autoComplete="email"
                required
                onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
              />
            </label>
            <label className="field">Temporary password (8–72 characters)
              <input
                type="password"
                value={newUser.password}
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                required
                onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
              />
            </label>
            <label className="field">Role
              <select
                value={newUser.role}
                onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}
              >
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
          </div>
          <button className="btn green full" type="submit">Create account<span className="arrow">↗</span></button>
        </form>
      </Card>
      <Card title="User Management">
        {!users ? <Busy /> : (
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
            <tbody>{users.map((u) => {
              const self = u.user_id === me.user_id;
              return (
                <tr key={u.user_id}>
                  <td>{u.full_name}{self && <small className="block">(you)</small>}</td><td>{u.email}</td>
                  <td><select value={u.role} disabled={self} onChange={(e) => run(() => patchUser(u.user_id, { role: e.target.value }), `${u.full_name} is now ${e.target.value}.`)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
                  <td><button className={`btn sm ${u.is_active ? "blue" : "ghost"}`} disabled={self}
                    onClick={() => run(() => patchUser(u.user_id, { is_active: !u.is_active }), `${u.full_name} ${u.is_active ? "deactivated" : "activated"}.`)}>{u.is_active ? "Active" : "Disabled"}</button></td>
                  <td>{String(u.created_at).slice(0, 10)}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <p className="note-box" style={{ marginTop: 12 }}>Create accounts here and assign one of the three roles. You can change roles or disable accounts in the list; you cannot change your own role.</p>
      </Card>
    </div>
  );
}

export function MasterData({ toast }) {
  const [products, reloadP] = useLoad(getProducts);
  const [machines, reloadM] = useLoad(getMachines);
  const runP = act(toast, reloadP), runM = act(toast, reloadM);
  const [p, setP] = useState({ product_code: "", product_name: "" });
  const [m, setM] = useState({ machine_code: "", machine_name: "", location: "", status: "IDLE" });
  return (
    <div className="grid g2">
      <Card title="Products">
        <div className="form2">
          <label className="field">Code<input value={p.product_code} placeholder="P030" onChange={(e) => setP({ ...p, product_code: e.target.value })} /></label>
          <label className="field">Name<input value={p.product_name} placeholder="Face Wash Sachet" onChange={(e) => setP({ ...p, product_name: e.target.value })} /></label>
        </div>
        <button className="btn green full" onClick={async () => (await runP(() => addProduct(p), "Product added.")) && setP({ product_code: "", product_name: "" })}>Add product<span className="arrow">↗</span></button>
        {!products ? <Busy /> : products.length === 0 ? <Empty>No products yet.</Empty> : (
          <table className="table"><thead><tr><th>Code</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>{products.map((x) => (
              <tr key={x.product_id}><td>{x.product_code}</td><td>{x.product_name}</td>
                <td><button className={`btn sm ${x.is_active ? "blue" : "ghost"}`} onClick={() => runP(() => patchProduct(x.product_id, { is_active: !x.is_active }), `${x.product_code} ${x.is_active ? "archived" : "activated"}.`)}>{x.is_active ? "Active" : "Archived"}</button></td></tr>
            ))}</tbody></table>
        )}
      </Card>
      <Card title="Machines">
        <div className="form2">
          <label className="field">Code<input value={m.machine_code} placeholder="PACK-03" onChange={(e) => setM({ ...m, machine_code: e.target.value })} /></label>
          <label className="field">Name<input value={m.machine_name} placeholder="Pack 03 Packaging Machine" onChange={(e) => setM({ ...m, machine_name: e.target.value })} /></label>
          <label className="field">Line / location<input value={m.location} placeholder="Line 1" onChange={(e) => setM({ ...m, location: e.target.value })} /></label>
          <label className="field">Status<select value={m.status} onChange={(e) => setM({ ...m, status: e.target.value })}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <button className="btn green full" onClick={async () => (await runM(() => addMachine({ ...m, location: m.location || null }), "Machine added.")) && setM({ ...m, machine_code: "", machine_name: "", location: "" })}>Add machine<span className="arrow">↗</span></button>
        {!machines ? <Busy /> : machines.length === 0 ? <Empty>No machines yet.</Empty> : (
          <table className="table"><thead><tr><th>Code</th><th>Name</th><th>Line</th><th>Status</th></tr></thead>
            <tbody>{machines.map((x) => (
              <tr key={x.machine_id}><td>{x.machine_code}</td><td>{x.machine_name}</td><td>{x.location || "-"}</td>
                <td><select value={x.status} onChange={(e) => runM(() => patchMachine(x.machine_id, { status: e.target.value }), `${x.machine_code} set to ${e.target.value}.`)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></td></tr>
            ))}</tbody></table>
        )}
      </Card>
    </div>
  );
}

export function SystemConfig({ toast }) {
  const [shifts, reload] = useLoad(getShifts);
  const run = act(toast, reload);
  const [s, setS] = useState({ shift_name: "", start_time: "06:00", end_time: "14:00" });
  const [db, setDb] = useState(null);
  const test = async () => { const r = await checkDb(); setDb(r ? "Database connected." : "Database check failed."); };
  return (
    <div className="grid g2">
      <Card title="Shifts">
        <div className="form3">
          <label className="field">Name<input value={s.shift_name} placeholder="D - Weekend" onChange={(e) => setS({ ...s, shift_name: e.target.value })} /></label>
          <label className="field">Start<input type="time" value={s.start_time} onChange={(e) => setS({ ...s, start_time: e.target.value })} /></label>
          <label className="field">End<input type="time" value={s.end_time} onChange={(e) => setS({ ...s, end_time: e.target.value })} /></label>
        </div>
        <button className="btn green full" onClick={async () => (await run(() => addShift(s), "Shift added.")) && setS({ ...s, shift_name: "" })}>Add shift<span className="arrow">↗</span></button>
        {!shifts ? <Busy /> : (
          <table className="table"><thead><tr><th>Shift</th><th>Time</th><th>Status</th></tr></thead>
            <tbody>{shifts.map((x) => (
              <tr key={x.shift_id}><td>{x.shift_name}</td><td>{x.start_time} - {x.end_time}</td>
                <td><button className={`btn sm ${x.is_active ? "blue" : "ghost"}`} onClick={() => run(() => patchShift(x.shift_id, { is_active: !x.is_active }), `${x.shift_name} ${x.is_active ? "disabled" : "enabled"}.`)}>{x.is_active ? "Active" : "Disabled"}</button></td></tr>
            ))}</tbody></table>
        )}
      </Card>
      <Card title="Database & Services">
        <button className="btn blue" onClick={test}>Test database connection<span className="arrow">↗</span></button>
        {db && <p className="note-box" style={{ marginTop: 12 }}>{db}</p>}
        <p className="note-box" style={{ marginTop: 12 }}>KPI formulas, backup/restore and email templates are not built yet.</p>
      </Card>
    </div>
  );
}

export function AuditLogs() {
  const [logs] = useLoad(getAudit);
  const [q, setQ] = useState("");
  if (!logs) return <Busy />;
  const shown = logs.filter((a) => Object.values(a).join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <Card title="Audit Logs" right={<div className="tools"><input className="search" placeholder="Search logs…" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn blue sm" onClick={() => downloadCSV("audit-logs.csv", shown)}>Export CSV</button></div>}>
      <div className="scroll-x"><table className="table">
        <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
        <tbody>{shown.length === 0 && <tr><td colSpan="5">No logs match.</td></tr>}{shown.map((a, i) => <tr key={i}><td>{a.time}</td><td>{a.user}</td><td>{a.action}</td><td>{a.target}</td><td>{a.details}</td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}