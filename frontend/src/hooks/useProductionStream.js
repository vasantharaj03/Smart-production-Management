import { useEffect, useState } from "react";
import { normalizeProductionEvent, PRODUCTION_STREAM_URL } from "../data/productionStream.js";
import { updateProductionSnapshot } from "../data/targetProduction.js";
import { getToken } from "../api/auth.js";

const MAX_EVENTS = 600;
const DAILY_TOTALS_KEY = "production-stream-daily-totals-v4";

function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function storedDailyTotals() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_TOTALS_KEY) || "null");
    return {
      date: localDateKey(Date.now()),
      sessionId: saved?.sessionId || "",
      totals: saved?.date === localDateKey(Date.now()) && saved.totals && typeof saved.totals === "object"
        ? saved.totals
        : {},
    };
  } catch (error) {
    console.warn("Could not restore today's cached production totals.", error);
    return { date: localDateKey(Date.now()), totals: {} };
  }
}

export function useProductionStream() {
  const [events, setEvents] = useState([]);
  const [dailyProduction, setDailyProduction] = useState(storedDailyTotals);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    let socket;
    let retryTimer;
    let retryDelay = 1000;
    let currentSessionId = "";
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      setStatus("connecting");
      const token = getToken();
      socket = token
        ? new WebSocket(PRODUCTION_STREAM_URL, ["bearer", token])
        : new WebSocket(PRODUCTION_STREAM_URL);

      socket.onopen = () => {
        retryDelay = 1000;
        setStatus("connected");
      };

      socket.onmessage = ({ data }) => {
        try {
          const event = normalizeProductionEvent(JSON.parse(data));
          if (!event) {
            console.warn("Ignoring production stream event with an unexpected shape.");
            return;
          }
          if (currentSessionId && event.streamSessionId && currentSessionId !== event.streamSessionId) {
            setEvents([event]);
          } else {
            setEvents((current) => [...current, event].slice(-MAX_EVENTS));
          }
          currentSessionId = event.streamSessionId || currentSessionId;
          if (localDateKey(event.timestamp) === localDateKey(Date.now())) {
            setDailyProduction((current) =>
              updateProductionSnapshot(current, event, localDateKey(Date.now())),
            );
          }
        } catch (error) {
          console.error("Could not parse production stream event.", error);
        }
      };

      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (stopped) return;
        setStatus("disconnected");
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(DAILY_TOTALS_KEY, JSON.stringify({
          date: dailyProduction.date,
          sessionId: dailyProduction.sessionId,
          totals: dailyProduction.totals,
        }));
      } catch (error) {
        console.error("Could not save today's cached production totals.", error);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dailyProduction]);

  return { events, dailyProduction: dailyProduction.totals, status };
}
