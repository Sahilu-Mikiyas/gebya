/**
 * deploy-db.mjs
 * Runs schema + seed SQL on Supabase via the pg_meta query API (service role).
 * Usage: node scripts/deploy-db.mjs [schema|seed|all]
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROJECT_REF  = 'taizqtqqdmhhdebvcqzv';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaXpxdHFxZG1oaGRlYnZjcXp2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTU5NTQxMiwiZXhwIjoyMDk1MTcxNDEyfQ.KCZBKW-T2r4kbmYL2QfflTmDm6iqopeZUdVLBWu66NE';
const API_BASE     = `https://${PROJECT_REF}.supabase.co`;
const META_URL     = `${API_BASE}/pg_meta/v1/query`;

async function runSQL(label, sql) {
  console.log(`\n📦 Running ${label}…`);

  const res = await fetch(META_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.text();

  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${body}`);
  }

  console.log(`✅ ${label} complete.`);
  return body;
}

// Split a SQL file into individual statements to avoid timeout on large batches
function splitStatements(sql) {
  // Split on semicolons but preserve $$ dollar-quoted blocks intact
  const stmts = [];
  let current = '';
  let inDollar = false;
  let dollarTag = '';

  const lines = sql.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip pure comment lines
    if (trimmed.startsWith('--')) {
      current += line + '\n';
      continue;
    }

    // Detect start/end of dollar-quoted block
    const dollarMatch = line.match(/\$\$|\$[a-zA-Z_][a-zA-Z0-9_]*\$/g);
    if (dollarMatch) {
      for (const tag of dollarMatch) {
        if (!inDollar) { inDollar = true; dollarTag = tag; }
        else if (tag === dollarTag) { inDollar = false; dollarTag = ''; }
      }
    }

    current += line + '\n';

    if (!inDollar && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt.length > 1 && stmt !== ';') stmts.push(stmt);
      current = '';
    }
  }
  if (current.trim()) stmts.push(current.trim());
  return stmts.filter(s => s.replace(/--.*$/gm, '').trim().length > 0);
}

const mode = process.argv[2] ?? 'all';
const schemaPath = join(__dirname, '../supabase/schema.sql');
const seedPath   = join(__dirname, '../supabase/seed.sql');

async function runFile(label, path) {
  const sql   = readFileSync(path, 'utf8');
  const stmts = splitStatements(sql);
  console.log(`\n📦 ${label}: ${stmts.length} statements`);
  let i = 0;
  for (const stmt of stmts) {
    i++;
    process.stdout.write(`  [${i}/${stmts.length}] ${stmt.slice(0, 60).replace(/\n/g,' ')}…`);
    await runSQL('', stmt);
    process.stdout.write(' ✓\n');
  }
  console.log(`✅ ${label} done.`);
}

try {
  if (mode === 'schema' || mode === 'all') await runFile('schema.sql', schemaPath);
  if (mode === 'seed'   || mode === 'all') await runFile('seed.sql',   seedPath);
  console.log('\n🎉 Database ready!\n');
} catch (err) {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
}
