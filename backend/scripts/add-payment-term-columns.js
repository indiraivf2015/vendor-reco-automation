// One-off: add the three Payment Term columns to recon_ledger when TypeORM
// synchronize hasn't caught up (e.g., entity changed while backend was running).
// Safe to re-run — uses ADD COLUMN IF NOT EXISTS.
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
  console.log('Connected to', process.env.DB_DATABASE);

  const check = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='recon_ledger' AND column_name IN ('paymentTermP2p','paymentTermErp','paymentTermMatch')",
  );
  console.log('Before:', check.rows.map((r) => r.column_name));

  await c.query('BEGIN');
  try {
    await c.query(
      'ALTER TABLE recon_ledger ADD COLUMN IF NOT EXISTS "paymentTermP2p" varchar(100) NULL',
    );
    await c.query(
      'ALTER TABLE recon_ledger ADD COLUMN IF NOT EXISTS "paymentTermErp" varchar(100) NULL',
    );
    await c.query(
      'ALTER TABLE recon_ledger ADD COLUMN IF NOT EXISTS "paymentTermMatch" boolean NOT NULL DEFAULT false',
    );
    await c.query('COMMIT');
    console.log('ALTER committed.');
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    process.exitCode = 1;
  }

  const after = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='recon_ledger' AND column_name IN ('paymentTermP2p','paymentTermErp','paymentTermMatch')",
  );
  console.log('After:', after.rows);

  await c.end();
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
