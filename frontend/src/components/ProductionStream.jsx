import { Card } from "./Layout.jsx";
import { summarizeProductionEvents } from "../data/productionStream.js";

const statusClass = {
  connected: "good",
  connecting: "warn",
  disconnected: "bad",
};

export function ProductionStreamPanel({ events, status, title = "Synthetic Production Stream" }) {
  const summary = summarizeProductionEvents(events);
  const recent = [...events].reverse().slice(0, 12);
  const source = summary.latest?.dataSource === "synthetic" ? "Synthetic stream" : "Production stream";

  return (
    <Card title={title} right={<b className={statusClass[status] || "warn"}>{source} {status}</b>}>
      <div className="stream-summary">
        <div><small>Events / last minute</small><b>{summary.eventsLastMinute}</b></div>
        <div><small>Machines reporting</small><b>{summary.machines.length}</b></div>
        <div><small>Latest machine output</small><b>{summary.produced.toLocaleString()}</b></div>
        <div><small>Average machine OEE</small><b>{summary.oee.toFixed(1)}%</b></div>
      </div>
      {recent.length === 0 ? (
        <p className="note-box">Waiting for production events from the backend.</p>
      ) : (
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Machine</th><th>Status</th><th>Product</th><th>Shift</th><th>Produced</th><th>Good</th><th>Defects</th><th>Defect %</th><th>OEE</th></tr>
            </thead>
            <tbody>
              {recent.map((event, index) => (
                <tr key={`${event.machine.code}-${event.timestamp}-${index}`}>
                  <td>{new Date(event.timestamp).toLocaleTimeString()}</td>
                  <td>{event.machine.name} ({event.machine.code})</td>
                  <td>{event.machine.status}</td>
                  <td>{event.product.code} {event.product.name}</td>
                  <td>{event.shift}</td>
                  <td>{event.production.total.toLocaleString()}</td>
                  <td>{event.production.good.toLocaleString()}</td>
                  <td>{event.production.defective.toLocaleString()}</td>
                  <td>{event.production.defectRate.toFixed(1)}%</td>
                  <td>{event.kpis.oee.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function StreamMetric({ title, value, detail }) {
  return (
    <Card title={title}>
      <div className="big">{value}</div>
      {detail && <small>{detail}</small>}
    </Card>
  );
}
