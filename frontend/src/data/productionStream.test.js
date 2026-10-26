import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  location: { protocol: "http:", host: "localhost:5173" },
};

const { PRODUCTION_STREAM_URL, summarizeMachineAlerts, summarizeProductionEvents } = await import(
  "./productionStream.js"
);

function event(productCode, total, timestamp) {
  return {
    timestamp,
    machine: { code: "M01", name: "Machine 01", status: "RUNNING", downtimeMinutes: 0 },
    product: { code: productCode, name: productCode },
    shift: "A - Day",
    production: { total, good: total, defective: 0, defectRate: 0 },
    kpis: { oee: 90, target: 0, achievement: 0 },
    alerts: [],
  };
}

test("defaults to the authenticated same-origin backend stream", () => {
  assert.equal(
    PRODUCTION_STREAM_URL,
    "ws://localhost:5173/api/v1/stream/production",
  );
});

test("production summary includes separate product snapshots from the same machine", () => {
  const summary = summarizeProductionEvents([
    event("P70", 100, "2026-10-23T10:00:00Z"),
    event("P20", 200, "2026-10-23T10:00:02Z"),
  ]);

  assert.equal(summary.produced, 300);
  assert.equal(summary.productionSnapshots.length, 2);
  assert.equal(summary.target, 0);
});

test("stream notifications appear for a new alert but do not repeat while it persists", () => {
  const alert = { level: "high", type: "DOWNTIME", message: "Machine stopped" };
  const events = [
    { ...event("P70", 10, "2026-10-23T10:00:00Z"), alerts: [alert] },
    { ...event("P70", 10, "2026-10-23T10:00:02Z"), alerts: [alert] },
    event("P70", 10, "2026-10-23T10:00:04Z"),
    { ...event("P70", 10, "2026-10-23T10:00:06Z"), alerts: [alert] },
  ];

  const stillActive = summarizeMachineAlerts(events.slice(0, 2));
  const newOccurrence = summarizeMachineAlerts(events);

  assert.equal(stillActive.length, 1);
  assert.equal(stillActive[0].id, "M01-0-high-2026-10-23T10:00:00Z");
  assert.equal(newOccurrence.length, 1);
  assert.notEqual(newOccurrence[0].id, stillActive[0].id);
});
