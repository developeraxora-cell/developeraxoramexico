// Diagnóstico de conexión a Supabase Vinos
// Uso: node test-vinos.js

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// Leer .env.local manualmente
const env = {};
try {
  const content = readFileSync('.env.local', 'utf8');
  for (const line of content.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trim().startsWith('#')) {
      env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
} catch {
  console.error('❌ No se encontró .env.local');
  process.exit(1);
}

const url = env['VITE_SUPABASE_URL_VINOS'];
const key = env['VITE_SUPABASE_ANON_KEY_VINOS'];

if (!url || !key) {
  console.error('❌ Faltan VITE_SUPABASE_URL_VINOS o VITE_SUPABASE_ANON_KEY_VINOS en .env.local');
  process.exit(1);
}

console.log(`🔌 Conectando a: ${url}`);

const client = createClient(url, key);

const TABLES = ['products', 'customers', 'branches', 'categories', 'loyalty_levels_config'];

for (const table of TABLES) {
  const { data, error } = await client.from(table).select('*').limit(1);
  if (error) {
    console.error(`❌ ${table}: ${error.message}`);
  } else {
    console.log(`✅ ${table}: OK (${data.length} fila de muestra)`);
  }
}
