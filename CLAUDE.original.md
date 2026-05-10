# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server on port 3000
npm run build    # Vite production build → dist/
npm run preview  # serve dist/ locally
```

No test runner configured. Diagnostic scripts exist at root (`test-supabase.js`, `validate-dispatch.js`, etc.) — run with `node <script>`.

## Environment

Copy `.env.example` → `.env.local` and fill in:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```
App degrades gracefully when unconfigured (`isSupabaseConfigured` flag in `services/supabaseClient.ts`).

## Architecture

**Stack:** Vite 6 + React 19 SPA → Supabase (PostgreSQL + Auth + Realtime + Edge Functions) → Vercel. No ORM; direct `@supabase/supabase-js` client. Tailwind via CDN (not in `node_modules`).

**Entry points:**
- `index.tsx` — React root + BrowserRouter
- `App.tsx` — auth gate, global state, realtime subscriptions, tab routing
- `services/supabaseClient.ts` — Supabase client + all low-level service objects

**Business units** (`types.ts:12`): `materiales` | `concretera` | `logistica` | `global`

Each unit mirrors the same module pattern: POS, Purchases, Inventory, Customers, Reports, Audit. Concrete unit is a parallel second business with its own screens under `components/Concrete/`.

## Auth & RBAC

Custom session token system — **not** Supabase Auth sessions. Flow:
1. `authService.signIn()` returns `{ session_token }` stored in `localStorage` under `lopar_session_token`
2. `authService.getCurrentUser(token)` validates token and returns `User` with embedded permissions
3. Supabase Auth cookie (`lopar-auth-session`) is separate and used only for RLS on the DB side

Roles (`types.ts:2`): `SUPERADMIN`, `ADMIN`, `SOCIO`, `MATERIALS_USER`, `CONCRETE_USER`, `CAJERO`, `ALMACEN`

`ADMIN` and `SUPERADMIN` bypass all permission checks (`isFullAccessRole` in `services/auth/permissions.ts`). All others rely on granular string permissions shaped as `{businessUnit}.{moduleKey}.{action}` (e.g. `materiales.sales.create`). Tab → permission mapping lives in `TAB_PERMISSIONS` (`services/auth/permissions.ts:11`).

Branch access: users have `allowedBranchIds` (string codes). `isFullAccessRole` users see all active branches.

## Global State & Data Flow

All entity state lives in `App.tsx` and is passed down as props. There is no global state manager (no Redux/Zustand).

`loadGlobalData()` (`App.tsx:218`) — single function that fetches everything via `Promise.allSettled`. Called on mount and on any Supabase realtime event. Realtime subscriptions cover: `sales`, `product_stocks`, `customers`, `diesel_tanks`, `diesel_logs`, `vehicles`, `drivers`, `branches`.

Selected branch persisted to `localStorage` as `lopar_selected_branch`.

## Key Type Conventions

DB types use snake_case (`ProductDB`, `BranchDB` etc. in `supabaseClient.ts`) and are mapped to camelCase app types (`Product`, `Branch` in `types.ts`) in `loadGlobalData`.

**Branch ID quirk:** `Branch.id` is the string `code` (e.g. `"MAT-01"`), not the numeric `id`. `Branch.dbId` holds the numeric PK needed for DB operations (`branchesService.updateById`, `deleteById`).

## Services

- `services/supabaseClient.ts` — raw CRUD service objects exported: `branchesService`, `productsService`, `customersService`, `salesService`, `dieselTanksService`, `vehiclesService`, `driversService`, `dieselLogsService`, `analyticsService`, `concreteService`, `subscriptions`
- `services/auth/auth.service.ts` — sign in / sign out / getCurrentUser
- `services/auth/permissions.ts` — RBAC helpers (`userCanAccess`, `userCanAccessTab`, `firstAccessibleTab`)
- `services/auth/routes.ts` — `tabToPath` / `pathToTab` URL mapping
- `services/credit/` — credit notes, wallet, payment evidence
- `services/concretera/` — concrete-specific business logic
- `services/audit/` — audit log helpers
- `services/pdf/` — PDF generation via `pdf-lib`

## Supabase Edge Functions

Located in `supabase/functions/`:
- `audit-log/` — records audit events; URL configurable via `VITE_AUDIT_API_URL`
- `payment-evidence-upload/` — handles file uploads for payment proofs

Deploy with Supabase CLI: `supabase functions deploy <name>`

## RPC Functions Used

Critical SQL functions called via `supabase.rpc()`:
- `process_diesel_dispatch` — dispatch diesel from tank
- `process_diesel_reception` — receive diesel into tank
- `archive_diesel_log` — soft-delete diesel log with audit

These must exist in the Supabase project; schema in `crear_tablas_documentos_clientes.sql` (partial).
