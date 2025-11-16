import React, { useEffect, useState, useRef } from "react";
import Dashboard from "./Dashboard";

/* keep API_BASE as before */
const API_BASE = "http://127.0.0.1:8000";

function isoNowMinusHours(hours = 24) {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString().slice(0, 19);
}

function downloadCsv(filename, rows) {
  if (!rows || rows.length === 0) return;
  const header = Object.keys(rows[0]);
  const csv = [
    header.join(","),
    ...rows.map(r => header.map(h => JSON.stringify(r[h] ?? "")).join(","))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toInputLocal(iso) {
  try {
    const d = new Date(iso);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - tzOffset);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}
function fromInputLocal(val) {
  try {
    if (!val) return "";
    const d = new Date(val);
    return d.toISOString();
  } catch {
    return "";
  }
}

export default function App() {
  const [logs, setLogs] = useState([]);
  const [host, setHost] = useState("");
  const [q, setQ] = useState("");
  const [since, setSince] = useState(isoNowMinusHours(24));
  const [until, setUntil] = useState("");
  const [limit, setLimit] = useState(200);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [view, setView] = useState("logs"); // "logs" | "dashboard"
  const intervalRef = useRef(null);
  const [error, setError] = useState(null);

  async function fetchLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (host) params.set("host", host);
      if (q) params.set("q", q);
      if (since) params.set("since", new Date(since).toISOString());
      if (until) params.set("until", new Date(until).toISOString());
      params.set("limit", Math.min(1000, Math.max(1, Number(limit || 100))));

      const res = await fetch(`${API_BASE}/logs?${params.toString()}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh]);

  useEffect(() => {
    const t = setTimeout(fetchLogs, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, q, since, until, limit]);

  return (
    <div className="app">
      <div className="container card">
        <header className="header">
          <h1 className="title">SEIMple — {view === "logs" ? "Logs" : "Analytics"}</h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="subtitle">API: {API_BASE}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setView("logs")}>Logs</button>
              <button className="btn btn-primary" onClick={() => setView("dashboard")}>Dashboard</button>
            </div>
          </div>
        </header>

        {view === "logs" ? (
          <>
            {/* original logs UI */}
            <section className="controls">
              <div className="controls-row">
                <input className="input" placeholder="host (exact)" value={host} onChange={e => setHost(e.target.value)} />
                <input className="input" placeholder="text search (q)" value={q} onChange={e => setQ(e.target.value)} />
                <input className="input" placeholder="limit" type="number" min="1" max="1000" value={limit} onChange={e => setLimit(e.target.value)} style={{ width: 100 }} />
                <button className="btn btn-primary" onClick={fetchLogs} disabled={loading}>Refresh</button>
                <button className="btn btn-ghost" onClick={() => downloadCsv("seimple_logs.csv", logs)}>Export CSV</button>
                <label style={{ marginLeft: "8px", display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto
                </label>
              </div>

              <div className="controls-row" style={{ marginTop: 8 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <small className="small">since</small>
                  <input className="input" type="datetime-local" value={since ? toInputLocal(since) : ""} onChange={e => setSince(fromInputLocal(e.target.value))} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 8 }}>
                  <small className="small">until</small>
                  <input className="input" type="datetime-local" value={until ? toInputLocal(until) : ""} onChange={e => setUntil(fromInputLocal(e.target.value))} />
                </label>
                <div style={{ marginLeft: "auto" }} className="small">{loading ? "Loading..." : `${logs.length} rows`}{error ? ` — error: ${error}` : ""}</div>
              </div>
            </section>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ts</th>
                    <th>host</th>
                    <th>msg</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "even" : ""}>
                      <td>{r.id}</td>
                      <td>{r.ts_utc || r.received_at}</td>
                      <td>{r.host}</td>
                      <td style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.msg}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer style={{ marginTop: 12 }} className="small">Tip: use the /logs API. Adjust API_BASE in src/App.jsx if needed.</footer>
          </>
        ) : (
          // Dashboard view: pass logs down
          <Dashboard logs={logs} />
        )}
      </div>
    </div>
  );
}
