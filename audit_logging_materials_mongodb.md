# Audit Logging Module - Materials

## Scope

- Enabled only for `materials`
- Runs in parallel to Supabase
- Stores audit events in MongoDB
- Does not block operational flows if audit logging fails

## MongoDB Collection

Collection name:

```text
audit_logs
```

## MongoDB Schema Definition

Suggested document shape:

```json
{
  "log_id": "2fef8d72-5cb1-4d31-b74a-f75dc9c85a5d",
  "branch_id": "2",
  "branch_name": "DEGOLLADO LOPAR",
  "user_id": "usr_123",
  "user_name": "Administrador Principal",
  "action_type": "UPDATE",
  "module": "materials",
  "entity_type": "product",
  "entity_id": "1861",
  "description": "Producto actualizado: ABRAZADERAS 3/4",
  "justification": "Corrección de precios y presentación",
  "previous_data": {
    "name": "ABRAZADERAS 3/4",
    "retail_price": 57
  },
  "new_data": {
    "name": "ABRAZADERAS 3/4",
    "retail_price": 60
  },
  "timestamp": "2026-03-11T15:42:18.000Z",
  "ip_address": "190.0.0.1",
  "user_agent": "Mozilla/5.0 ..."
}
```

## Field Definitions

| Field | Type | Required | Notes |
|---|---|---:|---|
| `log_id` | string | yes | Unique audit identifier |
| `branch_id` | string | yes | Branch / sucursal identifier |
| `branch_name` | string/null | no | Human-readable branch name |
| `user_id` | string | yes | User who executed the action |
| `user_name` | string/null | no | Display name |
| `action_type` | string | yes | `CREATE`, `UPDATE`, `DELETE`, `SALE`, `PURCHASE` |
| `module` | string | yes | For now only `materials` |
| `entity_type` | string | yes | `product`, `client`, `sale`, `purchase` |
| `entity_id` | string | yes | Affected record identifier |
| `description` | string | yes | Human-readable audit description |
| `justification` | string/null | no | Required for sensitive actions |
| `previous_data` | object/null | no | Snapshot before change |
| `new_data` | object/null | no | Snapshot after change |
| `timestamp` | date/string | yes | Server-side ISO datetime |
| `ip_address` | string/null | no | Prefer backend-captured IP |
| `user_agent` | string/null | no | Browser agent |

## Logging Service Architecture

Current system constraint:

- The application is a React + Vite frontend with direct Supabase access.
- MongoDB credentials must not live in the browser.

Therefore the correct architecture is:

```text
React Client
  -> Supabase operation succeeds
  -> fire-and-forget POST /audit/logs
  -> Audit API persists document in MongoDB
```

### Implemented client-side pieces

- `services/audit/audit.service.ts`
  - builds audit documents
  - sends logs non-blockingly
  - never breaks the main workflow if logging fails
  - is module-ready for future `concretera`

### Expected backend endpoint

Suggested endpoint:

```http
POST /audit/logs
Content-Type: application/json
```

Request body:

```json
{
  "log_id": "uuid",
  "branch_id": "2",
  "branch_name": "DEGOLLADO LOPAR",
  "user_id": "usr_123",
  "user_name": "Administrador",
  "action_type": "CREATE",
  "module": "materials",
  "entity_type": "product",
  "entity_id": "1861",
  "description": "Producto creado: ABRAZADERA 5/8",
  "justification": null,
  "previous_data": null,
  "new_data": {
    "name": "ABRAZADERA 5/8"
  },
  "timestamp": "2026-03-11T15:42:18.000Z",
  "ip_address": null,
  "user_agent": "Mozilla/5.0"
}
```

Response:

```json
{
  "ok": true
}
```

## Example MongoDB Insert Code

Example backend handler using the official MongoDB driver:

```ts
import { MongoClient } from 'mongodb';

const client = new MongoClient(process.env.MONGODB_URI!);

export async function insertAuditLog(payload: any) {
  await client.connect();

  const db = client.db(process.env.MONGODB_DB || 'materials_audit');
  const collection = db.collection('audit_logs');

  const document = {
    ...payload,
    timestamp: new Date(payload.timestamp || new Date().toISOString()),
    created_at: new Date(),
  };

  await collection.insertOne(document);

  return { ok: true, id: document.log_id };
}
```

Example Express-style route:

```ts
import express from 'express';
import { insertAuditLog } from './auditRepository';

const app = express();
app.use(express.json());

app.post('/audit/logs', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      user_agent: req.headers['user-agent'] || null,
    };

    await insertAuditLog(payload);
    res.status(201).json({ ok: true });
  } catch (error) {
    console.error('Failed to insert audit log', error);
    res.status(500).json({ ok: false });
  }
});
```

## Recommended Indexes

Run these in MongoDB:

```js
db.audit_logs.createIndex({ log_id: 1 }, { unique: true });
db.audit_logs.createIndex({ module: 1, timestamp: -1 });
db.audit_logs.createIndex({ module: 1, branch_id: 1, timestamp: -1 });
db.audit_logs.createIndex({ user_id: 1, timestamp: -1 });
db.audit_logs.createIndex({ entity_type: 1, entity_id: 1, timestamp: -1 });
db.audit_logs.createIndex({ action_type: 1, timestamp: -1 });
db.audit_logs.createIndex({ timestamp: -1 });
```

Optional index for investigations by justification-sensitive actions:

```js
db.audit_logs.createIndex({ action_type: 1, justification: 1, timestamp: -1 });
```

## Best Practices

1. Never write directly to MongoDB from the browser.
2. Capture the real IP address at the backend, not from frontend payloads.
3. Keep audit writes asynchronous and non-blocking.
4. Store `previous_data` only for modified/deleted entities.
5. Store `new_data` only for created/updated entities.
6. Require `justification` for destructive or critical updates.
7. Avoid logging page views, navigation, searches, and reads.
8. Keep the audit schema append-only; never update audit records.
9. Add retention/archival policy if the collection grows quickly.
10. Separate operational auth from audit datastore permissions.

## Current Materials Integration

The frontend now emits audit events for the Materials module in these flows:

- Product create
- Product update
- Product delete
- Manual stock update
- Client create
- Register sale
- Register purchase
- Clear purchase history

Pending future hooks if those features are added to UI:

- Client update
- Client delete
- Sale update
- Purchase update
- Sale delete
- Purchase delete (single-record workflow)

## Required Environment Variable

Frontend:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Recommended local file:

```text
.env.local
```

Optional override:

```env
VITE_AUDIT_API_URL=https://your-custom-audit-endpoint.example.com/audit/logs
```

If `VITE_AUDIT_API_URL` is not defined, the frontend now falls back automatically to:

```text
<VITE_SUPABASE_URL>/functions/v1/audit-log
```

## Supabase Edge Function Deployment

Function path in this repo:

```text
supabase/functions/audit-log/index.ts
```

Set MongoDB secrets in Supabase:

```bash
supabase secrets set MONGODB_URI="mongodb+srv://..."
supabase secrets set MONGODB_DB="materials_audit"
supabase secrets set MONGODB_COLLECTION="audit_logs"
```

Deploy the function:

```bash
supabase functions deploy audit-log --no-verify-jwt
```

If you use the fallback endpoint, you do not need an extra audit URL in the frontend.
