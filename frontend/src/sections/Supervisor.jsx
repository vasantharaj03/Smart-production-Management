import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "../components/Layout.jsx";
import { latestMachineEvents } from "../data/productionStream.js";
import { Empty } from "./Common.jsx";

export function MachinesSection({ streamEvents }) {
  const list = latestMachineEvents(streamEvents);
  return (
    <Card title="Machine Status - Synthetic Stream">
      {list.length === 0 ? <Empty>Waiting for synthetic machine events from the backend.</Empty> : (
        <table className="table">
          <thead><tr><th>Code</th><th>Machine</th><th>Status</th><th>Downtime (min)</th><th>Latest OEE</th><th>Last event</th></tr></thead>
          <tbody>{list.map((m) => (
            <tr key={m.machine.code}><td>{m.machine.code}</td><td>{m.machine.name}</td><td>{m.machine.status}</td>
              <td>{m.machine.downtimeMinutes}</td><td>{m.kpis.oee.toFixed(1)}%</td><td>{new Date(m.timestamp).toLocaleTimeString()}</td></tr>
          ))}</tbody>
        </table>
      )}
    </Card>
  );
}

export function QualitySection({ streamEvents }) {
  const byMachine = latestMachineEvents(streamEvents);
  const chart = byMachine.map((event) => ({ name: event.machine.code, rate: event.production.defectRate }));
  return (
    <div className="grid g2">
      <Card title="Synthetic Defect Rate by Machine">
        {chart.length === 0 ? <Empty /> : (
          <div className="chart"><ResponsiveContainer>
            <BarChart data={chart}><CartesianGrid vertical={false} stroke="#e5e9f0" /><XAxis dataKey="name" /><YAxis unit="%" /><Tooltip />
              <Bar dataKey="rate" name="Defect rate (%)" radius={[8, 8, 0, 0]}>{chart.map((c) => <Cell key={c.name} fill={c.rate > 5 ? "#d63031" : c.rate > 3 ? "#e9b949" : "#3ddc97"} />)}</Bar>
            </BarChart></ResponsiveContainer></div>
        )}
      </Card>
      <Card title="Recent Synthetic Production Events">
        {streamEvents.length === 0 ? <Empty>Waiting for synthetic production events from the backend.</Empty> : (
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Time</th><th>Product</th><th>Machine</th><th>Produced</th><th>Good</th><th>Defects</th><th>Rate</th></tr></thead>
            <tbody>{[...streamEvents].reverse().slice(0, 15).map((event, i) => <tr key={`${event.machine.code}-${event.timestamp}-${i}`}><td>{new Date(event.timestamp).toLocaleTimeString()}</td><td>{event.product.name}</td><td>{event.machine.name}</td><td>{event.production.total.toLocaleString()}</td><td>{event.production.good.toLocaleString()}</td><td>{event.production.defective.toLocaleString()}</td><td className={event.production.defectRate > 5 ? "bad" : ""}>{event.production.defectRate.toFixed(1)}%</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}