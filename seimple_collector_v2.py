#!/usr/bin/env python3
"""
SEIMple - Improved UDP syslog collector (v2)
Features:
 - timezone-aware UTC timestamps (no utcnow() deprecation warning)
 - parse RFC3164-style timestamps (e.g., "Nov 13 12:34:56") by inferring year & handling rollover
 - store both raw timestamp text and normalized ts_utc (ISO8601 Z)
 - optional JSON body parsing (stores raw msg; parsed JSON fields are ignored for DB columns in this MVP)
"""

import socketserver
import sqlite3
import threading
from datetime import datetime, timezone
import re
import os
import argparse
import json

DB_PATH = "seimple_logs_v2.db"

# Lenient RFC3164-ish regex to extract PRI, timestamp text, host, and message
SYSLOG_RE = re.compile(
    r'^(?:<(?P<pri>\d+)>)?'                      # optional <PRI>
    r'(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+'  # e.g., "Nov 13 12:34:56"
    r'(?P<host>[\w\.\-]+)?\s*'                   # optional host
    r'(?P<msg>.*)$',
    re.DOTALL
)

def init_db(db_path=DB_PATH):
    conn = sqlite3.connect(db_path, check_same_thread=False)
    cur = conn.cursor()
    cur.execute("""
    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        received_at TEXT NOT NULL,   -- when collector received the message (UTC, ISO)
        pri INTEGER,
        ts_text TEXT,               -- original timestamp text from syslog (if present)
        ts_utc TEXT,                -- normalized timestamp (UTC ISO) when parsing succeeds
        host TEXT,
        msg TEXT
    )
    """)
    conn.commit()
    return conn

def parse_rfc3164_timestamp(ts_text):
    """
    Parse timestamps like "Nov 13 12:34:56" into a timezone-aware UTC datetime.
    Since the year isn't present, infer the year by using the current year and
    correcting for future dates (assume logs are not more than ~6 months in the future).
    Returns an ISO8601 UTC string with 'Z' or None if parsing fails.
    """
    try:
        # parse month/day/time with current year
        now = datetime.now(timezone.utc)
        candidate = datetime.strptime(f"{ts_text} {now.year}", "%b %d %H:%M:%S %Y")
        # make timezone-aware (assume timestamp is local machine's localtime)
        # For simplicity assume logs originate in the collector's local timezone -> convert to UTC
        # Here we assume localtime is the system local timezone; to be precise we'd need tzinfo library.
        candidate = candidate.replace(tzinfo=timezone.utc)  # treat as UTC to keep MVP simple
        # Handle year rollover: if candidate is more than ~180 days in the future, subtract 1 year
        delta = candidate - now
        if delta.days > 180:
            candidate = candidate.replace(year=candidate.year - 1)
        return candidate.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return None

class SyslogUDPHandler(socketserver.BaseRequestHandler):
    db_lock = threading.Lock()
    db_conn = None

    def handle(self):
        data = self.request[0].strip()
        text = data.decode(errors='replace')
        src_ip, src_port = self.client_address
        received_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        # Defaults
        pri = None
        ts_text = None
        ts_utc = None
        host = None
        msg = text

        # Try to match the lenient syslog regex
        m = SYSLOG_RE.match(text)
        if m:
            pri = int(m.group('pri')) if m.group('pri') else None
            ts_text = m.group('timestamp')
            host = m.group('host') or src_ip
            msg = m.group('msg') or ""
            # try to normalize timestamp text
            ts_utc = parse_rfc3164_timestamp(ts_text)
        else:
            # If not matching, fall back to using src_ip as host
            host = src_ip

        # Try to detect JSON payloads (optional)
        # We DO NOT change DB schema; this is for future enrichment.
        parsed_json = None
        stripped = msg.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                parsed_json = json.loads(stripped)
            except Exception:
                parsed_json = None

        # Insert into DB (thread-safe)
        with self.db_lock:
            cur = self.db_conn.cursor()
            cur.execute(
                "INSERT INTO logs (received_at, pri, ts_text, ts_utc, host, msg) VALUES (?, ?, ?, ?, ?, ?)",
                (received_at, pri, ts_text, ts_utc, host, msg)
            )
            self.db_conn.commit()

        # Console output (short)
        display_ts = ts_utc or ts_text or received_at
        print(f"[{display_ts}] {host}:{src_port} -> {msg[:200]}")

def run_server(listen_addr="0.0.0.0", port=5514, db_path=DB_PATH):
    # On Windows, checking os.geteuid() isn't available; guard that call
    try:
        if port < 1024 and os.name != 'nt' and os.geteuid() != 0:
            raise PermissionError("Ports <1024 require root privileges on Unix. Use a higher port for testing (e.g., 5514).")
    except AttributeError:
        # os.geteuid may not exist on Windows - ignore
        pass

    conn = init_db(db_path)
    SyslogUDPHandler.db_conn = conn

    server = socketserver.ThreadingUDPServer((listen_addr, port), SyslogUDPHandler)
    print(f"SEIMple collector (v2) listening on {listen_addr}:{port} (db: {db_path})")
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        print("Shutting down collector...")
    finally:
        server.shutdown()
        conn.close()

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="SEIMple minimal UDP syslog collector (v2)")
    p.add_argument("--host", default="0.0.0.0", help="Listen address")
    p.add_argument("--port", type=int, default=5514, help="UDP port to listen on (default 5514 for non-root)")
    p.add_argument("--db", default=DB_PATH, help="SQLite DB path")
    args = p.parse_args()
    run_server(args.host, args.port, args.db)
