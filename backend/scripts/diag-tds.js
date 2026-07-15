// Quick diagnostic: what's actually stored in p2p_vendors.tdsSection right now?
// If we see "Yes"/"No"/blank dominating → P2P parser is reading the wrong column.
// If we see TDS codes (194C, 393(1)_CONTRACT, ...) → bug is elsewhere.
require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const c = new Client({
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
  await c.connect();

  console.log('\n=== P2P: top 20 distinct tdsSection values ===');
  const p2pTop = await c.query(
    `SELECT "tdsSection", COUNT(*)::int AS n
     FROM p2p_vendors
     GROUP BY "tdsSection"
     ORDER BY n DESC
     LIMIT 20`,
  );
  console.table(p2pTop.rows);

  console.log('\n=== P2P total row count ===');
  const p2pCount = await c.query(`SELECT COUNT(*)::int AS n FROM p2p_vendors`);
  console.log(p2pCount.rows[0]);

  console.log('\n=== ERP: top 10 distinct withholdTaxGroup values ===');
  const erpTop = await c.query(
    `SELECT "withholdTaxGroup", COUNT(*)::int AS n
     FROM erp_vendors
     GROUP BY "withholdTaxGroup"
     ORDER BY n DESC
     LIMIT 10`,
  );
  console.table(erpTop.rows);

  console.log('\n=== Latest recon_ledger: top 10 tdsP2p × tdsErp combinations ===');
  const latest = await c.query(
    `SELECT id FROM recon_runs WHERE status='COMPLETED' ORDER BY "startedAt" DESC LIMIT 1`,
  );
  if (latest.rows[0]) {
    const runId = latest.rows[0].id;
    console.log('runId =', runId);
    const combos = await c.query(
      `SELECT "tdsP2p", "tdsErp", "tdsMatch", COUNT(*)::int AS n
       FROM recon_ledger
       WHERE "runId" = $1
       GROUP BY "tdsP2p", "tdsErp", "tdsMatch"
       ORDER BY n DESC
       LIMIT 10`,
      [runId],
    );
    console.table(combos.rows);
  } else {
    console.log('No completed run found.');
  }

  await c.end();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
