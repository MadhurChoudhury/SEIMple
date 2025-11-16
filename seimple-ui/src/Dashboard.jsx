import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
  PieChart, Pie, Cell, Legend
} from "recharts";

/**
 * Dashboard component
 * Props:
 *  - logs: array of log objects { id, received_at, ts_utc, host, msg, ... }
 */

const COLORS = [
  "#6366F1", "#EF4444", "#F59E0B", "#10B981", "#06B6D4",
  "#8B5CF6", "#EC4899", "#F97316", "#14B8A6", "#60A5FA"
];

function bucketHours(logs, hours = 24) {
  // generate hourly buckets for the last `hours` hours from now
  const now = new Date();
  const buckets = {};
  for (let i = hours - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const key = d.toISOString().slice(0, 13) + ":00"; // "YYYY-MM-DDTHH:00"
    buckets[key] = 0;
  }
  for (const l of logs) {
    const ts = l.ts_utc || l.received_at || l.received;
    if (!ts) continue;
    const d = new Date(ts);
    if (isNaN(d)) continue;
    const key = d.toISOString().slice(0, 13) + ":00";
    if (key in buckets) buckets[key] += 1;
  }
  // convert to array
  return Object.keys(buckets).map(k => ({ ts: k, count: buckets[k] }));
}

function topHosts(logs, topN = 8) {
  const counts = {};
  for (const l of logs) {
    const h = l.host || "unknown";
    counts[h] = (counts[h] || 0) + 1;
  }
  const arr = Object.entries(counts).map(([host, cnt]) => ({ host, cnt }));
  arr.sort((a, b) => b.cnt - a.cnt);
  return arr.slice(0, topN);
}

function topMessages(logs, topN = 8) {
  const counts = {};
  for (const l of logs) {
    const m = (l.msg || "").slice(0, 120); // normalize
    counts[m] = (counts[m] || 0) + 1;
  }
  const arr = Object.entries(counts).map(([msg, cnt]) => ({ msg, cnt }));
  arr.sort((a, b) => b.cnt - a.cnt);
  return arr.slice(0, topN);
}

export default function Dashboard({ logs }) {
  const hosts = useMemo(() => topHosts(logs, 10), [logs]);
  const timeseries = useMemo(() => bucketHours(logs, 24), [logs]);
  const messages = useMemo(() => topMessages(logs, 8), [logs]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 18 }}>
      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 10 }}>Logs over last 24 hours</h3>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="ts" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} />
              <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} />
              <Tooltip labelStyle={{ color: "#000" }} />
              <Line type="monotone" dataKey="count" stroke="#60A5FA" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 18 }}>
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ margin: 0, marginBottom: 10 }}>Top hosts</h3>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hosts} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }} />
                <YAxis type="category" dataKey="host" tick={{ fontSize: 12, fill: "rgba(255,255,255,0.8)" }} />
                <Tooltip />
                <Bar dataKey="cnt" fill="#34D399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ margin: 0, marginBottom: 10 }}>Top messages</h3>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={messages}
                  dataKey="cnt"
                  nameKey="msg"
                  outerRadius={80}
                  innerRadius={30}
                  label={(entry) => `${entry.cnt}`}
                >
                  {messages.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ color: "rgba(255,255,255,0.8)" }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ margin: 0, marginBottom: 10 }}>Raw top messages (preview)</h3>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {messages.length === 0 ? <li style={{ color: "rgba(255,255,255,0.6)" }}>No messages</li> :
            messages.map((m, idx) => (
              <li key={idx} style={{ marginBottom: 8 }}>
                <strong style={{ color: "#fff" }}>{m.cnt}</strong> — <span style={{ color: "rgba(255,255,255,0.85)" }}>{m.msg}</span>
              </li>
            ))
          }
        </ul>
      </div>
    </div>
  );
}
