import { MongoClient } from 'npm:mongodb@6.18.0';

type AuditActionType = 'CREAR' | 'ACTUALIZAR' | 'ELIMINAR' | 'VENTA' | 'COMPRA';
type AuditModule = 'materiales' | 'concretera' | 'transporteria' | 'vinos';
type AuditEntityType = 'producto' | 'cliente' | 'venta' | 'compra' | 'nota_credito' | 'abono_credito' | 'campania';

interface AuditLogPayload {
  log_id?: string;
  branch_id: string;
  branch_name?: string | null;
  user_id: string;
  user_name?: string | null;
  action_type: AuditActionType;
  module: AuditModule;
  entity_type: AuditEntityType;
  entity_id: string;
  description: string;
  justification?: string | null;
  previous_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  timestamp?: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const MONGODB_URI = Deno.env.get('MONGODB_URI') ?? '';
const MONGODB_DB = Deno.env.get('MONGODB_DB') ?? 'materials_audit';
const MONGODB_COLLECTION = Deno.env.get('MONGODB_COLLECTION') ?? 'audit_logs';

let mongoClient: MongoClient | null = null;
let indexesEnsured = false;

const moduleAliases: Record<string, string[]> = {
  materiales: ['materiales', 'materials'],
  materials: ['materiales', 'materials'],
  concretera: ['concretera'],
  transporteria: ['transporteria'],
  vinos: ['vinos'],
};

const actionAliases: Record<string, string[]> = {
  CREAR: ['CREAR', 'CREATE'],
  CREATE: ['CREAR', 'CREATE'],
  ACTUALIZAR: ['ACTUALIZAR', 'UPDATE'],
  UPDATE: ['ACTUALIZAR', 'UPDATE'],
  ELIMINAR: ['ELIMINAR', 'DELETE'],
  DELETE: ['ELIMINAR', 'DELETE'],
  VENTA: ['VENTA', 'SALE'],
  SALE: ['VENTA', 'SALE'],
  COMPRA: ['COMPRA', 'PURCHASE'],
  PURCHASE: ['COMPRA', 'PURCHASE'],
};

const entityAliases: Record<string, string[]> = {
  producto: ['producto', 'product'],
  product: ['producto', 'product'],
  cliente: ['cliente', 'client'],
  client: ['cliente', 'client'],
  venta: ['venta', 'sale'],
  sale: ['venta', 'sale'],
  compra: ['compra', 'purchase'],
  purchase: ['compra', 'purchase'],
};

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
};

const normalizeModule = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) return null;
  if (normalized === 'materiales' || normalized === 'materials') return 'materiales' as AuditModule;
  if (normalized === 'concretera') return 'concretera' as AuditModule;
  if (normalized === 'transporteria') return 'transporteria' as AuditModule;
  if (normalized === 'vinos') return 'vinos' as AuditModule;
  return null;
};

const normalizeActionType = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase() ?? '';
  if (!normalized) return null;
  switch (normalized) {
    case 'CREAR':
    case 'CREATE':
      return 'CREAR' as AuditActionType;
    case 'ACTUALIZAR':
    case 'UPDATE':
      return 'ACTUALIZAR' as AuditActionType;
    case 'ELIMINAR':
    case 'DELETE':
      return 'ELIMINAR' as AuditActionType;
    case 'VENTA':
    case 'SALE':
      return 'VENTA' as AuditActionType;
    case 'COMPRA':
    case 'PURCHASE':
      return 'COMPRA' as AuditActionType;
    default:
      return null;
  }
};

const normalizeEntityType = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) return null;
  switch (normalized) {
    case 'producto':
    case 'product':
      return 'producto' as AuditEntityType;
    case 'cliente':
    case 'client':
      return 'cliente' as AuditEntityType;
    case 'venta':
    case 'sale':
      return 'venta' as AuditEntityType;
    case 'compra':
    case 'purchase':
      return 'compra' as AuditEntityType;
    case 'nota_credito':
    case 'credit_note':
      return 'nota_credito' as AuditEntityType;
    case 'abono_credito':
    case 'credit_payment':
      return 'abono_credito' as AuditEntityType;
    case 'campania':
    case 'campaign':
      return 'campania' as AuditEntityType;
    default:
      return null;
  }
};

const getMongoClient = async () => {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
  }

  return mongoClient;
};

const extractObservation = (row: Record<string, unknown>) => {
  const directObservation = row.observation;
  if (typeof directObservation === 'string' && directObservation.trim()) {
    return directObservation.trim();
  }

  const justification = row.justification;
  if (typeof justification === 'string' && justification.trim()) {
    return justification.trim();
  }

  const candidateKeys = ['notes', 'note', 'observacion', 'observation', 'reason'];
  const snapshots = [row.new_data, row.previous_data];

  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    for (const key of candidateKeys) {
      const value = (snapshot as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
};

const ensureIndexes = async (collection: any) => {
  if (indexesEnsured) return;

  await collection.createIndexes([
    { key: { log_id: 1 }, name: 'audit_log_id_unique', unique: true },
    { key: { module: 1, branch_id: 1, timestamp: -1 }, name: 'audit_module_branch_timestamp' },
    { key: { module: 1, action_type: 1, timestamp: -1 }, name: 'audit_module_action_timestamp' },
    { key: { module: 1, entity_type: 1, timestamp: -1 }, name: 'audit_module_entity_timestamp' },
    { key: { branch_id: 1, timestamp: -1 }, name: 'audit_branch_timestamp' },
    { key: { user_id: 1, timestamp: -1 }, name: 'audit_user_timestamp' },
  ]);

  indexesEnsured = true;
};

const validatePayload = (payload: Partial<AuditLogPayload>) => {
  const requiredFields = [
    'branch_id',
    'user_id',
    'action_type',
    'module',
    'entity_type',
    'entity_id',
    'description',
  ] as const;

  for (const field of requiredFields) {
    const value = payload[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(`Missing required field: ${field}`);
    }
  }
};

const createLogId = () => crypto.randomUUID();

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const page = parsePositiveInt(url.searchParams.get('page'), 1);
      const pageSize = Math.min(parsePositiveInt(url.searchParams.get('page_size'), 15), 100);
      const skip = (page - 1) * pageSize;

      const filter: Record<string, unknown> = {};
      const moduleValue = url.searchParams.get('module')?.trim();
      const branchId = url.searchParams.get('branch_id')?.trim();
      const actionType = url.searchParams.get('action_type')?.trim();
      const entityType = url.searchParams.get('entity_type')?.trim();
      const userId = url.searchParams.get('user_id')?.trim();
      const search = url.searchParams.get('search')?.trim();
      const dateFrom = url.searchParams.get('date_from')?.trim();
      const dateTo = url.searchParams.get('date_to')?.trim();

      if (moduleValue) {
        const aliases = moduleAliases[moduleValue.toLowerCase()] ?? [moduleValue];
        filter.module = aliases.length === 1 ? aliases[0] : { $in: aliases };
      }
      if (branchId) filter.branch_id = branchId;
      if (actionType) {
        const aliases = actionAliases[actionType.toUpperCase()] ?? [actionType];
        filter.action_type = aliases.length === 1 ? aliases[0] : { $in: aliases };
      }
      if (entityType) {
        const aliases = entityAliases[entityType.toLowerCase()] ?? [entityType];
        filter.entity_type = aliases.length === 1 ? aliases[0] : { $in: aliases };
      }
      if (userId) filter.user_id = userId;

      if (search) {
        const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { description: { $regex: escaped, $options: 'i' } },
          { user_name: { $regex: escaped, $options: 'i' } },
          { user_id: { $regex: escaped, $options: 'i' } },
          { entity_id: { $regex: escaped, $options: 'i' } },
          { branch_name: { $regex: escaped, $options: 'i' } },
          { justification: { $regex: escaped, $options: 'i' } },
          { 'new_data.notes': { $regex: escaped, $options: 'i' } },
          { 'new_data.note': { $regex: escaped, $options: 'i' } },
          { 'new_data.observacion': { $regex: escaped, $options: 'i' } },
          { 'new_data.observation': { $regex: escaped, $options: 'i' } },
          { 'previous_data.notes': { $regex: escaped, $options: 'i' } },
          { 'previous_data.note': { $regex: escaped, $options: 'i' } },
          { 'previous_data.observacion': { $regex: escaped, $options: 'i' } },
          { 'previous_data.observation': { $regex: escaped, $options: 'i' } },
        ];
      }

      if (dateFrom || dateTo) {
        const range: Record<string, Date> = {};
        if (dateFrom) {
          range.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          const end = new Date(dateTo);
          end.setUTCHours(23, 59, 59, 999);
          range.$lte = end;
        }
        filter.timestamp = range;
      }

      const client = await getMongoClient();
      const db = client.db(MONGODB_DB);
      const collection = db.collection(MONGODB_COLLECTION);
      await ensureIndexes(collection);

      const projection = {
        _id: 0,
        log_id: 1,
        branch_id: 1,
        branch_name: 1,
        user_id: 1,
        user_name: 1,
        action_type: 1,
        module: 1,
        entity_type: 1,
        entity_id: 1,
        description: 1,
        justification: 1,
        timestamp: 1,
        observation: 1,
        'new_data.notes': 1,
        'new_data.note': 1,
        'new_data.observacion': 1,
        'new_data.observation': 1,
        'new_data.reason': 1,
        'previous_data.notes': 1,
        'previous_data.note': 1,
        'previous_data.observacion': 1,
        'previous_data.observation': 1,
        'previous_data.reason': 1,
      };

      const [total, rawRows] = await Promise.all([
        collection.countDocuments(filter),
        collection
          .find(filter)
          .project(projection)
          .sort({ timestamp: -1, _id: -1 })
          .skip(skip)
          .limit(pageSize)
          .toArray(),
      ]);

      const rows = rawRows.map((row) => ({
        ...row,
        observation: extractObservation(row),
      }));

      return jsonResponse(200, {
        ok: true,
        rows,
        total,
        page,
        page_size: pageSize,
      });
    } catch (error) {
      console.error('audit-log GET error', error);
      return jsonResponse(500, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown audit query error',
      });
    }
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const payload = (await request.json()) as Partial<AuditLogPayload>;
    validatePayload(payload);

    const normalizedModule = normalizeModule(payload.module);
    const normalizedActionType = normalizeActionType(payload.action_type);
    const normalizedEntityType = normalizeEntityType(payload.entity_type);

    if (!normalizedModule) {
      throw new Error('Invalid module value.');
    }

    if (!normalizedActionType) {
      throw new Error('Invalid action_type value.');
    }

    if (!normalizedEntityType) {
      throw new Error('Invalid entity_type value.');
    }

    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers.get('user-agent') ?? payload.user_agent ?? null;

    const document = {
      log_id: payload.log_id ?? createLogId(),
      branch_id: String(payload.branch_id),
      branch_name: payload.branch_name?.trim() || null,
      user_id: String(payload.user_id),
      user_name: payload.user_name?.trim() || null,
      action_type: normalizedActionType,
      module: normalizedModule,
      entity_type: normalizedEntityType,
      entity_id: String(payload.entity_id),
      description: String(payload.description),
      justification: payload.justification?.trim() || null,
      previous_data: payload.previous_data ?? null,
      new_data: payload.new_data ?? null,
      observation: payload.justification?.trim() || extractObservation({
        new_data: payload.new_data ?? null,
        previous_data: payload.previous_data ?? null,
        justification: payload.justification ?? null,
      }),
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      ip_address: payload.ip_address ?? clientIp,
      user_agent: userAgent,
      created_at: new Date(),
    };

    const client = await getMongoClient();
    const db = client.db(MONGODB_DB);
    const collection = db.collection(MONGODB_COLLECTION);
    await ensureIndexes(collection);

    await collection.insertOne(document);

    return jsonResponse(201, {
      ok: true,
      log_id: document.log_id,
    });
  } catch (error) {
    console.error('audit-log function error', error);
    return jsonResponse(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown audit logging error',
    });
  }
});
