# Coastal Telemetry Backend (`coastal-telemetry-backend`)

Backend repository for **Coastal Telemetry Interface (CTI)** — GeoMet ingestion scripts, NestJS service + PostgreSQL (planned), scheduled ingest, and operational tooling.

The **React frontend** ships from a **separate Git repository** for Railway-style deploy splits.

## Dev log

All CTI AI-assisted session history lives in **`dev-log/`** in **this repo** — including sessions that only changed the frontend — so continuity and portfolio mining stay in one place. See [`dev-log/README.md`](./dev-log/README.md).

## GitHub remote name

This codebase was previously named `coastal-telemetry-interface`. The repository on GitHub should be renamed to **`coastal-telemetry-backend`** (Settings → General → Repository name) to match this folder and role.

After renaming on GitHub, point `origin` at the new URL:

```powershell
git remote set-url origin https://github.com/DawsonJay/coastal-telemetry-backend.git
```

GitHub often redirects the old URL after rename; updating `origin` keeps clones and docs explicit.

## Local folder name

If this directory is still named `coastal-telemetry-interface`, rename it to **`coastal-telemetry-backend`** to match the repo — **close Cursor/your IDE first** if Windows reports the folder is in use, then:

```powershell
Rename-Item -LiteralPath "$env:USERPROFILE\Documents\coastal-telemetry-interface" -NewName "coastal-telemetry-backend"
```
