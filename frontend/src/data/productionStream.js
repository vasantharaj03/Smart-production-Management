const environment = import.meta.env || {};
const apiBase = (
  environment.VITE_API_BASE ||
  environment.VITE_API_BASE_URL ||
  ""
).replace(/\/$/, "");
const streamPath = apiBase.endsWith("/api/v1")
  ? "/stream/production"
  : "/api/v1/stream/production";

export const PRODUCTION_STREAM_URL = (
  environment.VITE_PRODUCTION_STREAM_URL ||
  (apiBase
    ? `${apiBase.replace(/^http/, "ws")}${streamPath}`
    : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${streamPath}`)
).replace(/\/$/, "");

export function normalizeProductionEvent(value) {
  if (!value || typeof value !== "object") return null;
  const { machine, product, production, kpis } = value;
  if (
    !machine || typeof machine !== "object" ||
    !product || typeof product !== "object" ||
    !production || typeof production !== "object" ||
    !kpis || typeof kpis !== "object" ||
    !machine.code || !machine.name ||
    !Number.isFinite(Date.parse(value.timestamp))
  ) return null;

  const numeric = (input) => Number.isFinite(Number(input)) ? Number(input) : 0;
  return {
    timestamp: value.timestamp,
    streamSessionId: String(value.stream_session_id || ""),
    dataSource: String(value.data_source || "external"),
    machine: {
      id: machine.id,
      code: String(machine.code),
      name: String(machine.name),
      status: String(machine.status || "UNKNOWN").toUpperCase(),
      downtimeMinutes: numeric(machine.downtime_minutes),
    },
    product: {
      id: product.id,
      code: String(product.code || ""),
      name: String(product.name || "Unknown product"),
    },
    shift: String(value.shift || "Unspecified"),
    production: {
      total: numeric(production.total_produced),
      good: numeric(production.good_quantity),
      defective: numeric(production.defective_quantity),
      defectRate: numeric(production.defect_rate),
    },
    kpis: {
      oee: numeric(kpis.oee),
      target: numeric(kpis.target_quantity),
      achievement: numeric(kpis.achievement_percent),
    },
    alerts: Array.isArray(value.alerts) ? value.alerts : [],
  };
}

export function latestMachineEvents(events) {
  const latest = new Map();
  for (const event of events) latest.set(event.machine.code, event);
  return [...latest.values()].sort((a, b) => a.machine.code.localeCompare(b.machine.code));
}

export function latestProductionSnapshots(events) {
  const latest = new Map();
  for (const event of events) {
    const key = [
      event.machine.code,
      event.product.code,
      event.shift.toUpperCase(),
    ].join("|");
    latest.set(key, event);
  }
  return [...latest.values()];
}

export function summarizeProductionEvents(events) {
  const machines = latestMachineEvents(events);
  const productionSnapshots = latestProductionSnapshots(events);
  const produced = productionSnapshots.reduce((sum, event) => sum + event.production.total, 0);
  const good = productionSnapshots.reduce((sum, event) => sum + event.production.good, 0);
  const defective = productionSnapshots.reduce((sum, event) => sum + event.production.defective, 0);
  const oee = machines.length
    ? machines.reduce((sum, event) => sum + event.kpis.oee, 0) / machines.length
    : 0;
  const lastMinute = Date.now() - 60_000;
  const eventsLastMinute = events.filter((event) => Date.parse(event.timestamp) >= lastMinute).length;
  const latest = events.reduce((current, event) =>
    !current || Date.parse(event.timestamp) > Date.parse(current.timestamp) ? event : current, null);

  return {
    machines,
    produced,
    good,
    defective,
    defectRate: produced ? (defective / produced) * 100 : 0,
    target: 0,
    achievement: 0,
    oee,
    eventsLastMinute,
    latest,
    productionSnapshots,
  };
}

export function summarizeMachineAlerts(events) {
  const eventsByMachine = new Map();
  for (const event of events) {
    const machineEvents = eventsByMachine.get(event.machine.code) || [];
    machineEvents.push(event);
    eventsByMachine.set(event.machine.code, machineEvents);
  }
  return [...eventsByMachine.values()].flatMap((machineEvents) => {
    const event = machineEvents[machineEvents.length - 1];
    return event.alerts.filter((alert) => alert != null).map((alert, index) => {
      const levelText = typeof alert === "string" ? alert : alert.level || alert.severity || alert.type || "medium";
      const level = String(levelText).toLowerCase();
      const text = String(typeof alert === "string" ? alert.replaceAll("_", " ") : alert.message || alert.text || alert.type || "Alert");
      const signature = `${levelText}:${text}`;
      let onset = event;
      for (const candidate of machineEvents.slice(0, -1).reverse()) {
        const continues = candidate.alerts.some((previous) => {
          if (previous == null) return false;
          const previousLevel = typeof previous === "string"
            ? previous
            : previous.level || previous.severity || previous.type || "medium";
          const previousText = String(typeof previous === "string"
            ? previous.replaceAll("_", " ")
            : previous.message || previous.text || previous.type || "Alert");
          return `${previousLevel}:${previousText}` === signature;
        });
        if (!continues) break;
        onset = candidate;
      }
      return {
        id: `${event.machine.code}-${index}-${levelText}-${onset.timestamp}`,
        machine: event.machine.name,
        level: level.startsWith("high") ? "high" : level.startsWith("low") ? "low" : "medium",
        text,
        time: new Date(event.timestamp).toLocaleTimeString(),
        duration: typeof alert === "object" && alert.duration
          ? alert.duration
          : `${event.machine.downtimeMinutes} min downtime`,
        action: typeof alert === "object" && alert.action ? alert.action : "Review machine status",
      };
    });
  });
}
