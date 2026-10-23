import { useEffect, useState } from "react";
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from "recharts";
import { getProductProduction, getTargets } from "../api.js";
import { achievementPercent, productProductionSummary, shiftCode, targetAppliesToShift, targetCompleted, targetProduction } from "../data/targetProduction.js";
import { Card } from "./Layout.jsx";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentShiftCode() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 14 ? "A" : hour >= 14 && hour < 22 ? "B" : "C";
}

function groupTargets(targets) {
  const grouped = new Map();
  for (const target of targets) {
    const key = [
      target.target_date,
      target.product_code,
      target.machine_code || "",
      target.shift_name || "",
    ].join("|");
    const existing = grouped.get(key);
    if (existing) {
      existing.target_quantity += Number(target.target_quantity) || 0;
      existing.produced_quantity = Math.max(
        existing.produced_quantity,
        Number(target.produced_quantity) || 0,
      );
    } else {
      grouped.set(key, {
        ...target,
        target_quantity: Number(target.target_quantity) || 0,
        produced_quantity: Number(target.produced_quantity) || 0,
      });
    }
  }
  return [...grouped.entries()].map(([key, target]) => ({ ...target, groupKey: key }));
}

function TargetCard({ target, dailyProduction, allTargets }) {
  const production = targetProduction(target, dailyProduction, allTargets);
  const recordedProduction = Number(target.produced_quantity) || 0;
  const produced = Math.max(recordedProduction, production.produced);
  const assigned = Number(target.target_quantity) || 0;
  const completed = targetCompleted(produced, assigned);
  const achievedPercent = achievementPercent(produced, assigned);
  const visualPercent = Math.min(achievedPercent, 100);
  const chartData = [{ name: "Achievement", value: visualPercent, fill: achievedPercent >= 100 ? "#239a62" : "#11826e" }];

  return (
    <Card className={completed ? "target-completed" : ""} title={`${target.shift_name || "Any shift"} - ${target.product_code} ${target.product_name}`}>
      {completed && (
        <div className="completion-celebration" role="status" aria-live="polite">
          <span className="completion-icon" aria-hidden="true">✓</span>
          <span className="completion-message">
            <strong>Target completed!</strong>
            <small>100% of the fixed target reached</small>
          </span>
          <span className="completion-confetti" aria-hidden="true">
            {Array.from({ length: 16 }, (_, index) => (
              <i
                key={index}
                style={{
                  "--confetti-x": `${(index - 7.5) * 12}px`,
                  "--confetti-delay": `${(index % 4) * 45}ms`,
                  "--confetti-color": ["#16915f", "#e9b949", "#12806a", "#e87836"][index % 4],
                }}
              />
            ))}
          </span>
        </div>
      )}
      <div className="shift-target-card">
        <div className="shift-target-chart">
            <div className="shift-target-dial">
              <ResponsiveContainer width={150} height={150}>
                <RadialBarChart
                  data={chartData}
                  startAngle={90}
                  endAngle={-270}
                  innerRadius="76%"
                  outerRadius="100%"
                  barSize={13}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={10} isAnimationActive animationDuration={850} background />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="shift-target-center">
                <b>{achievedPercent.toFixed(0)}%</b>
                <small>achieved</small>
              </div>
            </div>
            <p className="shift-target-description">
              Progress compares matching product, shift, and machine output against the Manager's fixed target.
          </p>
        </div>
        <div className="shift-target-values">
          <div><small>Assigned target</small><b>{assigned.toLocaleString()} units</b></div>
          <div><small>Produced today</small><b>{produced.toLocaleString()} units</b></div>
          <div><small>Remaining</small><b>{Math.max(0, assigned - produced).toLocaleString()} units</b></div>
          <small>{production.produced > recordedProduction ? "Synthetic production; latest cumulative snapshot." : recordedProduction > 0 ? "Based on production entries recorded in the backend." : production.hasMatchingEvents ? "Synthetic production; latest cumulative snapshot." : "No production has been recorded for this target yet."}</small>
          <small>{target.machine_name ? `Machine: ${target.machine_name}` : "All machines"} · Read-only target set by Manager</small>
          {!recordedProduction && !production.hasMatchingEvents && (
            <small className="shift-target-mismatch">
              No stream events match this target's product, machine, and shift yet.
              {production.observedIdentifiers.length > 0
                ? ` Shift events currently report: ${production.observedIdentifiers.join(", ")}.`
                : ` Waiting for Shift ${shiftCode(target.shift_name)} events.`}
              {" "}Check the stream's product, machine, and shift identifiers; the assigned target stays fixed.
            </small>
          )}
        </div>
      </div>
    </Card>
  );
}

export function ShiftTargetProgress({ dailyProduction, currentShiftOnly = false, showHeader = true }) {
  const [targets, setTargets] = useState(null);
  const [products, setProducts] = useState(null);
  const [error, setError] = useState("");
  const [shift, setShift] = useState(currentShiftCode);
  const date = today();

  useEffect(() => {
    if (!currentShiftOnly) return undefined;
    const timer = window.setInterval(() => setShift(currentShiftCode()), 30_000);
    return () => window.clearInterval(timer);
  }, [currentShiftOnly]);

  useEffect(() => {
    let active = true;
    const load = () => getTargets(date).then((result) => {
      if (!active) return;
      setTargets(result);
      setError("");
    }).catch((reason) => {
      if (!active) return;
      setError(reason?.message || "Could not load today's Manager-assigned targets.");
    });
    const loadProducts = () => getProductProduction(
      date,
      currentShiftOnly ? shift : "",
    ).then((result) => {
      if (active) setProducts(result);
    }).catch((reason) => {
      if (active) setError(reason?.message || "Could not load product production totals.");
    });

    load();
    loadProducts();
    const timer = window.setInterval(load, 10_000);
    const productTimer = window.setInterval(loadProducts, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(productTimer);
    };
  }, [date, currentShiftOnly, shift]);

  const displayedTargets = currentShiftOnly
    ? (targets || []).filter((target) => targetAppliesToShift(target, shift))
    : targets || [];

  return (
    <section className="stack">
      {showHeader && (
        <Card title="Today's Manager-Assigned Shift Targets">
          <div className="shift-target-heading">
            {currentShiftOnly && <span className="shift-active"><i />Shift {shift} · Active now</span>}
            <p className="note-box">
              {currentShiftOnly
                ? "Showing only targets assigned by the Manager to the current shift. Target values are read-only and refresh automatically."
                : "Targets are read-only here. Managers can set them in Resource Planning; this view refreshes automatically."}
            </p>
          </div>
        </Card>
      )}
      {error && <p className="note-box bad">{error}</p>}
      {targets === null ? (
        <Card><p className="note-box">Loading today's shift targets…</p></Card>
      ) : displayedTargets.length === 0 ? (
        <Card><p className="note-box">{currentShiftOnly
          ? `No target has been assigned to Shift ${shift} today. Ask a Manager to set this shift's target in Resource Planning.`
          : "No targets have been assigned for today yet. Ask a Manager to add targets in Resource Planning."}</p></Card>
      ) : (
        <div className="grid g2">
          {groupTargets(displayedTargets).map((target) => <TargetCard key={target.groupKey} target={target} dailyProduction={dailyProduction} allTargets={displayedTargets} />)}
        </div>
      )}
      <Card title={currentShiftOnly ? `All Products - Shift ${shift}` : "All Products - Target vs. Produced"}>
        {products === null ? <p className="note-box">Loading product production totals…</p> : products.length === 0 ? (
          <p className="note-box">No active products are configured.</p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Product</th><th>Target</th><th>Produced</th><th>Remaining</th><th>Achievement</th><th>Target status</th></tr></thead>
              <tbody>{products.map((product) => {
                const progress = productProductionSummary(
                  product,
                  dailyProduction,
                  currentShiftOnly ? shift : "",
                );
                const achieved = achievementPercent(progress.produced, progress.target);
                return (
                  <tr key={product.product_id}>
                    <td><b>{product.product_code}</b> {product.product_name}</td>
                    <td>{progress.hasTarget ? `${progress.target.toLocaleString()} units` : "—"}</td>
                    <td>{progress.produced.toLocaleString()} units</td>
                    <td>{progress.hasTarget ? `${Math.max(0, progress.target - progress.produced).toLocaleString()} units` : "—"}</td>
                    <td>{progress.hasTarget ? `${achieved.toFixed(1)}%` : "—"}</td>
                    <td>{progress.hasTarget
                      ? targetCompleted(progress.produced, progress.target)
                        ? <span className="completion-status">Completed</span>
                        : "In progress"
                      : "No target assigned"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <small className="block">Production combines saved entries with the latest synthetic cumulative snapshots. Targets remain Manager-controlled.</small>
      </Card>
    </section>
  );
}
