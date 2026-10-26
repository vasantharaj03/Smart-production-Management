import { useEffect, useMemo, useState } from "react";
import { poll } from "../utils/poll.js";
import {
  getManagerTargetReports,
  getTargetReportManagers,
  getTargets,
  reviewManagerTargetReport,
  sendTargetProgressReport,
} from "../api.js";
import { targetProduction } from "../data/targetProduction.js";
import { Card } from "./Layout.jsx";

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function SupervisorTargetProgressReport({ dailyProduction, toast }) {
  const [targets, setTargets] = useState([]);
  const [managers, setManagers] = useState([]);
  const [targetId, setTargetId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => Promise.all([getTargets(today()), getTargetReportManagers()]).then(([targetList, managerList]) => {
      if (!active) return;
      setTargets(targetList || []);
      setManagers(managerList || []);
    });
    load();
    const stopPolling = poll(load, 30_000);
    return () => {
      active = false;
      stopPolling();
    };
  }, []);

  const selectedTarget = targets.find((target) => String(target.target_id) === targetId);
  const currentOutput = useMemo(() => {
    if (!selectedTarget) return 0;
    const live = targetProduction(selectedTarget, dailyProduction, targets).produced;
    return Math.max(Number(selectedTarget.produced_quantity) || 0, live);
  }, [selectedTarget, dailyProduction, targets]);
  const incompleteTargets = targets.filter((target) => (
    currentOutputForTarget(target, dailyProduction, targets) < Number(target.target_quantity)
  ));

  async function submit(event) {
    event.preventDefault();
    if (!selectedTarget) return toast.fail(new Error("Select an incomplete target."));
    if (!managerId) return toast.fail(new Error("No active Manager is available to receive this report."));
    if (currentOutput >= Number(selectedTarget.target_quantity)) {
      return toast.fail(new Error("This target is already complete."));
    }
    setSending(true);
    try {
      await sendTargetProgressReport({
        target_id: selectedTarget.target_id,
        manager_id: Number(managerId),
        actual_quantity: currentOutput,
        reason: reason.trim(),
      });
      toast.ok("Target progress report sent to the Manager.");
      setReason("");
    } catch (error) {
      toast.fail(error);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Report an At-Risk Target to a Manager">
      {targets.length === 0
        ? <p className="note-box">No targets are assigned today to report.</p>
        : managers.length === 0
          ? <p className="note-box">No active Manager account is available to receive a report.</p>
          : incompleteTargets.length === 0
            ? <p className="note-box">All assigned targets are complete. There are no at-risk targets to report.</p>
          : (
            <form className="target-report-form" onSubmit={submit}>
              <p className="note-box">If a shift target may not be completed, send the Manager the current output and the reason. The Manager will receive it in their dashboard.</p>
              <div className="form2">
                <label className="field">Incomplete target
                  <select required value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                    <option value="">Select a target</option>
                    {incompleteTargets.map((target) => (
                      <option key={target.target_id} value={target.target_id}>
                        {target.product_code} {target.product_name} · {target.shift_name || "Any shift"} · {currentOutputForTarget(target, dailyProduction, targets).toLocaleString()} / {Number(target.target_quantity).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">Send to Manager
                  <select required value={managerId} onChange={(event) => setManagerId(event.target.value)}>
                    <option value="">Select a Manager</option>
                    {managers.map((manager) => (
                      <option key={manager.user_id} value={manager.user_id}>{manager.full_name}</option>
                    ))}
                  </select>
                </label>
                <label className="field target-report-reason">What happened, and why might the target be missed?
                  <textarea required minLength={10} maxLength={2000} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the issue, its cause, and any action taken." />
                </label>
              </div>
              {selectedTarget && (
                <small className="block target-report-output">
                  Current production: {currentOutput.toLocaleString()} / {Number(selectedTarget.target_quantity).toLocaleString()} units
                </small>
              )}
              <button className="btn green" type="submit" disabled={sending || !targetId || !managerId}>
                {sending ? "Sending report…" : "Send report to Manager"}<span className="arrow">↗</span>
              </button>
            </form>
          )}
    </Card>
  );
}

function currentOutputForTarget(target, dailyProduction, targets) {
  return Math.max(
    Number(target.produced_quantity) || 0,
    targetProduction(target, dailyProduction, targets).produced,
  );
}

export function ManagerTargetProgressReports({ toast }) {
  const [reports, setReports] = useState([]);
  const [reviewing, setReviewing] = useState(null);

  useEffect(() => {
    let active = true;
    const load = () => getManagerTargetReports().then((result) => {
      if (active) setReports(result || []);
    });
    load();
    const stopPolling = poll(load, 30_000);
    return () => {
      active = false;
      stopPolling();
    };
  }, []);

  async function markReviewed(reportId) {
    setReviewing(reportId);
    try {
      await reviewManagerTargetReport(reportId);
      setReports((current) => current.map((report) => (
        report.report_id === reportId
          ? { ...report, reviewed_at: new Date().toISOString() }
          : report
      )));
      toast.ok("Report marked as reviewed.");
    } catch (error) {
      toast.fail(error);
    } finally {
      setReviewing(null);
    }
  }

  return (
    <Card title="Supervisor Target Progress Reports">
      {reports.length === 0
        ? <p className="note-box">No target progress reports have been received.</p>
        : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Received</th><th>Supervisor</th><th>Product / shift</th><th>Progress</th><th>Reason</th><th>Status</th></tr></thead>
              <tbody>{reports.map((report) => (
                <tr key={report.report_id}>
                  <td>{new Date(report.created_at).toLocaleString()}</td>
                  <td>{report.supervisor_name}</td>
                  <td>{report.product_code} {report.product_name}<small className="block">{report.shift_name || "Any shift"} · {new Date(report.target_date).toLocaleDateString()}</small></td>
                  <td>{Number(report.actual_quantity).toLocaleString()} / {Number(report.target_quantity).toLocaleString()}</td>
                  <td className="target-report-message">{report.reason}</td>
                  <td>{report.reviewed_at
                    ? <span className="completion-status">Reviewed</span>
                    : <button className="btn blue sm" disabled={reviewing === report.report_id} onClick={() => markReviewed(report.report_id)}>
                      {reviewing === report.report_id ? "Saving…" : "Mark reviewed"}
                    </button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
    </Card>
  );
}
