const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function loadAudit(fetch, overrides = {}) {
  const source = fs.readFileSync('services/audit/audit.service.ts', 'utf8').replaceAll('import.meta.env', 'env');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('fetch', 'env', 'exports', compiled)(fetch, {
    VITE_SUPABASE_URL: 'https://audit.example', VITE_SUPABASE_ANON_KEY: 'test-key',
    ...overrides,
  }, exports);
  return exports.auditService;
}
const input = {
  branch_id: 'TAHONA', user_id: 'user', action_type: 'ELIMINAR', module: 'vinos',
  entity_type: 'inventario', entity_id: 'inventory', description: 'Autorizacion', justification: 'Duplicado',
};

test('Inventario no soportado muestra instruccion de desplegar audit-log', async () => {
  const audit = loadAudit(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Invalid entity_type value.' }) }));
  await assert.rejects(audit.writeRequired(input), /Actualiza audit-log en el proyecto de auditoria/);
});

test('Muestra HTTP y causa del rechazo de auditoria', async () => {
  const audit = loadAudit(async () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid JWT' }) }));
  await assert.rejects(audit.writeRequired(input), /Auditoria HTTP 401: Invalid JWT/);
});

test('Fallo de red conserva una explicacion legible', async () => {
  const audit = loadAudit(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(audit.writeRequired(input), /No se pudo conectar con auditoria/);
});

test('Registro obligatorio espera respuesta exitosa', async () => {
  const audit = loadAudit(async (_, options) => {
    assert.equal(JSON.parse(options.body).justification, 'Duplicado');
    return { ok: true };
  });
  assert.equal(await audit.writeRequired(input), true);
});

test('Override vacio o en blanco usa audit-log del proyecto principal', async () => {
  for (const override of ['', '   ']) {
    const audit = loadAudit(async (url) => {
      assert.equal(url, 'https://audit.example/functions/v1/audit-log');
      return { ok: true };
    }, { VITE_AUDIT_API_URL: override });
    assert.equal(audit.isConfigured(), true);
    assert.equal(await audit.writeRequired(input), true);
  }
});

test('Override explicito conserva la URL personalizada', async () => {
  const audit = loadAudit(async (url) => {
    assert.equal(url, 'https://custom.example/audit');
    return { ok: true };
  }, { VITE_AUDIT_API_URL: ' https://custom.example/audit ' });
  assert.equal(await audit.writeRequired(input), true);
});

test('Sin URL principal ni override informa configuracion ausente', async () => {
  const audit = loadAudit(async () => { throw Error('No debe enviar solicitudes'); }, {
    VITE_SUPABASE_URL: '', VITE_AUDIT_API_URL: '',
  });
  assert.equal(audit.isConfigured(), false);
  await assert.rejects(audit.writeRequired(input), /API de auditoria no esta configurada/);
});
