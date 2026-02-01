# SEIMple – Lightweight SIEM

**SEIMple** is a small, educational SIEM-like platform that ingests logs via Syslog (UDP), stores them in SQLite, and provides a web dashboard for viewing and analytics.

Built from scratch with:
- **Python + FastAPI** – backend API and log collector
- **SQLite** – simple persistent storage
- **React + Vite** – modern web UI with charts and filters

---

## Features

 Collects syslog messages via UDP (`seimple_collector_v2.py`)  
 Stores normalized logs in SQLite (`seimple_logs_v2.db`)  
 REST API with FastAPI (`seimple_api.py`) for `/logs` and `/health`  
 Web dashboard (`seimple-ui/`) to:
- search and filter logs  
- auto-refresh and export CSV  
- visualize data (top hosts, log volume, messages)  

---

## Project structure
SEIMple/  
├─ seimple_collector_v2.py # UDP syslog collector  
├─ seimple_api.py # FastAPI backend  
├─ requirements.txt # Python dependencies  
└─ seimple-ui/ # React + Vite frontend

## Setup and run locally

## 1.Backend
```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn seimple_api:app --reload
```
## 2.Collector
python seimple_collector_v2.py --port 5514

## 3. Frontend
cd seimple-ui  
npm install  
npm run dev  

---

WHEN SETUP IS COMPLETE:
Visit  http://localhost:5173 in your browser.

---

##**Send a test log**  
$udp = New-Object System.Net.Sockets.UdpClient  
$msg = "<34>Nov 16 12:00:00 testhost SEIMple test message"  
$bytes = [System.Text.Encoding]::UTF8.GetBytes($msg)  
$udp.Send($bytes, $bytes.Length, "127.0.0.1", 5514) | Out-Null  
$udp.Close()

You’ll immediately see this appear in your dashboard!


## **Technologies**

Layer	Stack  
Collector	Python + socketserver  
Storage	SQLite  
API	FastAPI + Uvicorn  
Frontend	React + Vite + Recharts  
Requirements are Python ≥ 3.10 and Node.js ≥ 18


### Screenshot example
![Example dashboard](Screenshot 2025-11-15 234207.png)
