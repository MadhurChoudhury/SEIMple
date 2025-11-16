#!/usr/bin/env python3
"""
SEIMple - Simple HTTP query API for SQLite logs (MVP)

Usage:
  # install deps in your venv first
  pip install fastapi uvicorn python-dateutil

  # run the API (default host 127.0.0.1 port 8000)
  uvicorn seimple_api:app --reload

Endpoints:
  GET /health
    - quick health check

  GET /logs
    - query logs with optional filters:
      ?host=...        (exact match)
      &q=...           (text search in message, case-insensitive substring)
      &since=ISO8601   (inclusive, e.g., 2025-11-13T00:00:00Z)
      &until=ISO8601   (inclusive)
      &limit=N         (max records; default 100, max 1000)
"""

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import sqlite3
from dateutil import parser as dateparser
from datetime import datetime, timezone

DB_PATH = "seimple_logs_v2.db"

app = FastAPI(title="SEIMple API", version="v0.2")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
  CORSMiddleware,
  allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
  allow_methods=["*"],
  allow_headers=["*"],
)

class LogRow(BaseModel):
    id: int
    received_at: str
    pri: Optional[int] = None
    ts_text: Optional[str] = None
    ts_utc: Optional[str] = None
    host: Optional[str] = None
    msg: Optional[str] = None

def get_db_conn(path=DB_PATH):
    # Each request will create a new connection; lightweight for SQLite.
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

@app.get("/health")
def health():
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/logs", response_model=List[LogRow])
def query_logs(
    host: Optional[str] = Query(None, description="Exact host match"),
    q: Optional[str] = Query(None, description="Text search in message (substring, case-insensitive)"),
    since: Optional[str] = Query(None, description="ISO8601 UTC start time (inclusive)"),
    until: Optional[str] = Query(None, description="ISO8601 UTC end time (inclusive)"),
    limit: int = Query(100, gt=0, le=1000, description="Max number of rows returned"),
):
    """
    Build a parameterized SQL query based on provided filters.
    Uses ts_utc or received_at for time comparisons where possible.
    """

    # Validate/parse time boundaries if provided
    since_dt = None
    until_dt = None
    try:
        if since:
            since_dt = dateparser.parse(since)
            if since_dt.tzinfo is None:
                # assume UTC if user omitted timezone
                since_dt = since_dt.replace(tzinfo=timezone.utc)
        if until:
            until_dt = dateparser.parse(until)
            if until_dt.tzinfo is None:
                until_dt = until_dt.replace(tzinfo=timezone.utc)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")

    # We will compare using ts_utc when available, fallback to received_at
    # For simplicity we use SQLite's COALESCE(ts_utc, received_at)
    sql = "SELECT id, received_at, pri, ts_text, ts_utc, host, msg FROM logs"
    where_clauses = []
    params = []

    if host:
        where_clauses.append("host = ?")
        params.append(host)

    if q:
        # case-insensitive substring search
        where_clauses.append("LOWER(msg) LIKE ?")
        params.append(f"%{q.lower()}%")

    if since_dt:
        where_clauses.append("COALESCE(ts_utc, received_at) >= ?")
        params.append(since_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"))

    if until_dt:
        where_clauses.append("COALESCE(ts_utc, received_at) <= ?")
        params.append(until_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"))

    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)

    sql += " ORDER BY COALESCE(ts_utc, received_at) DESC"
    sql += " LIMIT ?"
    params.append(limit)

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        conn.close()

        results = []
        for r in rows:
            results.append(LogRow(
                id=r["id"],
                received_at=r["received_at"],
                pri=r["pri"],
                ts_text=r["ts_text"],
                ts_utc=r["ts_utc"],
                host=r["host"],
                msg=r["msg"],
            ))
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))