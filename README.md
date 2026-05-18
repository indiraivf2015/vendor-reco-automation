# Vendor Master Reconciliation — Indira IVF

**P2P ↔ Oracle ERP** automated vendor master reconciliation engine.

Compares vendor records across the P2P procurement system and Oracle ERP,
producing a field-by-field reconciliation ledger (matching the existing manual
Excel `Master_Vendor_Reconcilation.xlsb` format) with category-level KPI
summaries and actionable exception management.

## Categories Compared (9 fields)

| # | Category     | P2P Field        | ERP Field          | Severity |
|---|-------------|------------------|--------------------|----------|
| 1 | Vendor Name | vendorName       | vendorName         | MEDIUM   |
| 2 | PAN         | panNumber        | panNumber          | HIGH     |
| 3 | GST         | gstNumber        | gstNumber          | HIGH     |
| 4 | MSME        | msmeNumber       | msmeNumber         | MEDIUM   |
| 5 | IFSC        | ifscCode         | ifscCode           | HIGH     |
| 6 | Bank Account| bankAccount      | bankAccount        | CRITICAL |
| 7 | Bank Name   | bankName         | bankName           | MEDIUM   |
| 8 | TDS         | tdsSection       | withholdTaxGroup   | LOW      |

Plus presence checks: MISSING_IN_ERP (CRITICAL) and MISSING_IN_P2P (HIGH).

## Stack

- **Backend:** NestJS 10 + TypeORM + SQLite (POC) / MSSQL/Oracle (prod)
- **Frontend:** React 18 + Vite 5 + TailwindCSS 3.4 + Recharts
- **Report:** ExcelJS with 3-sheet output (Dashboard / Vendor Master / Exceptions)
- **Alerts:** SMTP (Office 365) with HTML email template
- **Scheduler:** Cron-based daily reconciliation (default 6 AM IST)

## Quick Start

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run start:dev          # → http://localhost:3001/api
                           # → http://localhost:3001/api/docs (Swagger)

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                # → http://localhost:5173
```

On first boot, the seed service populates 20 P2P + 21 ERP vendors with
engineered discrepancies (IFSC mismatch, PAN mismatch, bank name differences,
vendors missing in one system, etc.) so the dashboard shows real exceptions
immediately.

## Uploading Real Data

1. Navigate to **Upload Data** in the sidebar
2. Drop your `VendorMasterReport_P2P_Data.xlsx` → auto-detected as P2P
3. Drop your `Vendor_Master_ERP_Row_Data.xlsx` → auto-detected as ERP
4. Check "Run reconciliation after upload" to chain a recon run
5. View results on the Dashboard

The parser handles P2P's multi-row-per-vendor format (one row per statutory
entry: PAN, GST, MSME) by collapsing them into a single record per vendor code.

## API Endpoints

| Method | Path                              | Description                        |
|--------|-----------------------------------|------------------------------------|
| GET    | /api/reconciliation/dashboard     | Dashboard KPIs + category summary  |
| POST   | /api/reconciliation/run           | Trigger manual recon run           |
| GET    | /api/reconciliation/runs          | List all runs                      |
| GET    | /api/reconciliation/runs/:id/ledger | Per-vendor recon ledger          |
| POST   | /api/uploads/vendors              | Upload P2P/ERP Excel file          |
| GET    | /api/exceptions                   | List exceptions (filterable)       |
| PATCH  | /api/exceptions/:id/status        | Resolve/ignore exception           |
| GET    | /api/reports/latest.xlsx          | Download latest Excel report       |
| GET    | /api/vendors/stats                | P2P + ERP vendor counts            |
| GET    | /api/audit                        | Audit trail                        |

## Production Deployment (AWS EC2)

```bash
# Backend
cd backend
npm run build
pm2 start dist/main.js --name vendor-recon-api

# Frontend
cd frontend
npm run build
# Serve dist/ via Nginx or S3+CloudFront
```

Nginx config mirrors the existing Ticketing Tool pattern:
```nginx
server {
    listen 80;
    server_name vendorrecon.indiraivf.in;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
    }

    location / {
        root /var/www/vendor-recon/frontend/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

## Environment Variables

See `backend/.env.example` for all options. Key ones:

| Variable      | Description                     | Default                |
|---------------|---------------------------------|------------------------|
| DB_TYPE       | Database type                   | sqlite                 |
| DB_DATABASE   | Database path/name              | ./vendor_recon.sqlite  |
| RECON_CRON    | Daily recon schedule            | 0 6 * * *             |
| SMTP_HOST     | Email server                    | smtp.office365.com     |
| ALERT_TO      | Exception alert recipients      | (comma-separated)      |

---

**Indira IVF GenAI Department** • P2P ↔ Oracle ERP Vendor Master Reconciliation Automation
