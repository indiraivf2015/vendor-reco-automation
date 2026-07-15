// Verify payment-term fields populate correctly on a fresh reconciliation run.
//
// What it does:
//   1. Triggers POST /api/reconciliation/run (or reuses --runId if passed)
//   2. Polls recon_runs.status until COMPLETED or FAILED (timeout 10 min)
//   3. Counts recon_ledger rows for that run by payment-term population
//   4. Prints 5 sample rows where both sides have a payment term
//   5. Cross-checks against p2p_vendors / erp_vendors source data
//
// Usage:
//   node scripts/verify-payment-term.js                          # trigger + verify
//   node scripts/verify-payment-term.js --runId=<uuid>           # verify existing run
//   node scripts/verify-payment-term.js --skipTrigger --latest   # verify most recent run
//
// Requires .env in backend/ (same vars used by NestJS).
require('dotenv').config();
const { Client } = require('pg');
const http = require('http');

const API_HOST = process.env.VERIFY_API_HOST || '127.0.0.1';
const API_PORT = parseInt(process.env.PORT || '3001', 10);
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path: `/api${path}`,
        method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch (e) {
              reject(new Error(`Non-JSON response (${res.statusCode}): ${data.slice(0, 200)}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode} on ${method} ${path}: ${data.slice(0, 300)}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function pgClient() {
  return new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'vendor_recon',
    ssl:
      (process.env.DB_SSL || 'true').toLowerCase() !== 'false'
        ? { rejectUnauthorized: false }
        : false,
  });
}

async function pollRun(runId) {
  const start = Date.now();
  let lastStatus = '';
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const run = await httpRequest('GET', `/reconciliation/runs/${runId}`);
    if (run.status !== lastStatus) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`  [${elapsed}s] status=${run.status}`);
      lastStatus = run.status;
    }
    if (run.status === 'COMPLETED') return run;
    if (run.status === 'FAILED') {
      throw new Error(`Run FAILED: ${run.errorMessage || '(no message)'}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Run did not complete within ${POLL_TIMEOUT_MS / 1000}s`);
}

(async () => {
  let runId = args.runId;

  if (!runId && args.latest && args.skipTrigger) {
    console.log('Step 1: Looking up latest run via API...');
    const latest = await httpRequest('GET', '/reconciliation/runs/latest');
    if (!latest || !latest.id) throw new Error('No latest run found');
    runId = latest.id;
    console.log(`  latest run: ${runId} (status=${latest.status})`);
  } else if (!runId) {
    console.log('Step 1: Triggering fresh reconciliation via POST /api/reconciliation/run...');
    const triggered = await httpRequest('POST', '/reconciliation/run', {
      triggeredBy: 'verify-payment-term-script',
    });
    runId = triggered.id || triggered.runId || triggered;
    if (typeof runId !== 'string') {
      console.log('  trigger response:', triggered);
      throw new Error('Could not extract runId from trigger response');
    }
    console.log(`  runId: ${runId}`);
    console.log('Step 2: Polling for completion (every 3s, timeout 10min)...');
    await pollRun(runId);
    console.log('  run COMPLETED.');
  } else {
    console.log(`Step 1: Using provided runId: ${runId}`);
  }

  console.log('\nStep 3: Querying recon_ledger for payment-term population...');
  const db = pgClient();
  await db.connect();

  try {
    const counts = await db.query(
      `
      SELECT
        COUNT(*)::int                                                                    AS total_rows,
        COUNT(*) FILTER (WHERE "paymentTermP2p" IS NOT NULL AND "paymentTermP2p" <> '')::int AS p2p_populated,
        COUNT(*) FILTER (WHERE "paymentTermErp" IS NOT NULL AND "paymentTermErp" <> '')::int AS erp_populated,
        COUNT(*) FILTER (WHERE ("paymentTermP2p" IS NOT NULL AND "paymentTermP2p" <> '')
                          AND ("paymentTermErp" IS NOT NULL AND "paymentTermErp" <> ''))::int AS both_populated,
        COUNT(*) FILTER (WHERE "paymentTermMatch" = true)::int                           AS match_true,
        COUNT(*) FILTER (WHERE "paymentTermMatch" = false)::int                          AS match_false
      FROM recon_ledger
      WHERE "runId" = $1
      `,
      [runId],
    );
    const c = counts.rows[0];
    console.log('\n  Ledger counts for this run:');
    console.log(`    total rows:                       ${c.total_rows}`);
    console.log(`    paymentTermP2p populated:         ${c.p2p_populated}`);
    console.log(`    paymentTermErp populated:         ${c.erp_populated}`);
    console.log(`    both sides populated:             ${c.both_populated}`);
    console.log(`    paymentTermMatch = true:          ${c.match_true}`);
    console.log(`    paymentTermMatch = false:         ${c.match_false}`);

    if (c.p2p_populated === 0 && c.erp_populated === 0) {
      console.log('\n  ❌ PROBLEM: payment-term columns are empty on this run.');
      console.log('     Check that p2p_vendors."payTerm" and erp_vendors."paymentTerm" actually have data.');
    } else {
      console.log('\n  ✅ Payment-term columns are being populated.');
    }

    console.log('\nStep 4: Sample rows (both sides populated)...');
    const samples = await db.query(
      `
      SELECT "vendorCode", "city", "vendorNameP2p", "paymentTermP2p", "paymentTermErp", "paymentTermMatch"
      FROM recon_ledger
      WHERE "runId" = $1
        AND "paymentTermP2p" IS NOT NULL AND "paymentTermP2p" <> ''
        AND "paymentTermErp" IS NOT NULL AND "paymentTermErp" <> ''
      ORDER BY "vendorCode"
      LIMIT 5
      `,
      [runId],
    );
    if (samples.rows.length === 0) {
      console.log('  (no rows where both sides have payment terms)');
    } else {
      console.table(samples.rows);
    }

    console.log('\nStep 5: Cross-check against source vendors tables...');
    const p2pSrc = await db.query(
      `SELECT COUNT(*)::int AS n FROM p2p_vendors WHERE "payTerm" IS NOT NULL AND "payTerm" <> ''`,
    );
    const erpSrc = await db.query(
      `SELECT COUNT(*)::int AS n FROM erp_vendors WHERE "paymentTerm" IS NOT NULL AND "paymentTerm" <> ''`,
    );
    console.log(`    p2p_vendors with non-empty payTerm:      ${p2pSrc.rows[0].n}`);
    console.log(`    erp_vendors with non-empty paymentTerm:  ${erpSrc.rows[0].n}`);

    console.log('\nDone.');
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
