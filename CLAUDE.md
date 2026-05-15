# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # dev server on port 3000
npm run build    # Vite production build → dist/
npm run preview  # serve dist/ locally
```

No test runner. Diagnostic scripts at root (`test-supabase.js`, `validate-dispatch.js`, etc.) — run with `node <script>`.

## Environment

Copy `.env.example` → `.env.local`, fill in:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
VITE_AUDIT_API_URL=          # optional; defaults to <VITE_SUPABASE_URL>/functions/v1/audit-log
```
App degrades gracefully when unconfigured (`isSupabaseConfigured` flag in `services/supabaseClient.ts`).

`vite.config.ts` also exposes `GEMINI_API_KEY` as `process.env.API_KEY` / `process.env.GEMINI_API_KEY` (not required for core app).

Path alias: `@` resolves to project root (`vite.config.ts` + `tsconfig.json`).

## Architecture

**Stack:** Vite 6 + React 19 SPA → Supabase (PostgreSQL + Auth + Realtime + Edge Functions) + MongoDB (audit) + Cloudinary (file storage) → Vercel. No ORM; direct `@supabase/supabase-js` client. Tailwind via CDN (not in `node_modules`).

**Entry points:**
- `index.tsx` — React root + BrowserRouter
- `App.tsx` — auth gate, global state, realtime subscriptions, tab routing
- `services/supabaseClient.ts` — Supabase client + all low-level service objects

**Business units** (`types.ts:13`): `materiales` | `concretera` | `logistica` | `transporteria` | `global`

Each unit mirrors same module pattern: POS, Purchases, Inventory, Customers, Reports, Audit. Parallel unit screens live under their own `components/` subdirectory:
- `components/Concrete/` — concretera unit
- `components/Transport/` — transporteria unit (same structure as Concrete)

## Auth & RBAC

Custom session token system — **not** Supabase Auth sessions. Flow:
1. `authService.signIn()` calls `supabase.rpc('app_login_user', { p_identifier, p_password })` — password hash is `md5(user_id::text || ':' || password)`
2. Returns `{ session_token }` stored in `localStorage` under `lopar_session_token`
3. `authService.getCurrentUser(token)` calls `app_validate_session(token)` RPC, returns `User` with embedded permissions
4. Supabase Auth cookie (`lopar-auth-session`) separate — used only for RLS on DB side

Login is a 2-step flow with a custom CAPTCHA widget (step 1: identifier, step 2: password + captcha). Anti-brute-force: 5 failed attempts → 5-minute lockout, persisted in `localStorage`.

Roles (`types.ts:2`): `SUPERADMIN`, `ADMIN`, `SOCIO`, `MATERIALS_USER`, `CONCRETE_USER`, `TRANSPORT_USER`, `CAJERO`, `ALMACEN`

`ADMIN` and `SUPERADMIN` bypass all permission checks (`isFullAccessRole` in `services/auth/permissions.ts`). Others rely on granular string permissions shaped as `{businessUnit}.{moduleKey}.{action}` (e.g. `materiales.sales.create`). Tab → permission mapping in `TAB_PERMISSIONS` (`services/auth/permissions.ts:11`).

**Real visibility rule:** `role_key` is a label, not a hard lock. Actual module access comes from `app_user_business_unit_access` and `app_user_branch_access` DB tables.

Branch access: users have `allowedBranchIds` (string codes) and `allowedBranchDbIds` (numeric PKs). `isFullAccessRole` users see all active branches.

## Global State & Data Flow

All entity state lives in `App.tsx`, passed down as props. No global state manager (no Redux/Zustand).

`loadGlobalData()` (`App.tsx:218`) — single function fetching everything via `Promise.allSettled`. Called on mount and on any Supabase realtime event. Realtime subscriptions cover: `sales`, `product_stocks`, `customers`, `diesel_tanks`, `diesel_logs`, `vehicles`, `drivers`, `branches`.

Selected branch persisted to `localStorage` as `lopar_selected_branch`.

## Key Type Conventions

DB types use snake_case (`ProductDB`, `BranchDB` etc. in `supabaseClient.ts`), mapped to camelCase app types (`Product`, `Branch` in `types.ts`) in `loadGlobalData`.

**Branch ID quirk:** `Branch.id` is string `code` (e.g. `"MAT-01"`), not numeric `id`. `Branch.dbId` holds numeric PK needed for DB operations (`branchesService.updateById`, `deleteById`).

`constants.tsx` exports seed/fallback data: `UNITS`, `INITIAL_PRODUCTS`, `INITIAL_CUSTOMERS`, `INITIAL_CONVERSIONS` — used when Supabase is unconfigured.

## Developer Traps

**`business_unit` must always be passed explicitly.** PostgreSQL defaults to `'materiales'` for missing values. `services/inventory/purchases.service.ts` `createSale` must receive `business_unit` prop or sales appear in the wrong business unit. This caused a real prod bug where all `transporteria` sales had `business_unit = 'materiales'`.

**Remount keys in `App.tsx` prevent stale state.** Screens reused across business units (POS, Purchases, Customers, Inventory, CreditAlerts, Reports) get unique `key` props like `pos-materiales` / `pos-transporteria`. Without them React reuses the component instance → stale data visible when switching tabs.

**`product_stocks` is updated by PostgreSQL triggers.** Never update it manually without understanding the trigger logic. It is modified automatically on sale and purchase operations.

**`line_total` field overrides `qty * unit_price`.** For historical records, always check `line_total` first and fall back to `qty * unit_price`. Some legacy records have special pricing that doesn't match the formula.

**`isDegolladoBranch` controls TRANSPORTES visibility.** In `Layout.tsx`, the TRANSPORTES nav group only renders when `activeBranchName.includes('DEGOLLADO')`. Don't add transport nav items elsewhere.

**`TRANSPORT_USER` nav merge.** For `Role.TRANSPORT_USER`, logística (Diesel) nav items are merged inside the TRANSPORTES group — the Logística group is hidden. Logic lives in `Layout.tsx`.

**Pre-existing TypeScript errors.** `ConcretePOSScreen.tsx`, `POSScreen.tsx`, `ReportsScreen.tsx`, and `services/inventory/catalog.service.ts` have unresolved TS errors that predate this session. Don't treat them as regressions.

**No RLS on Supabase tables.** A user with direct PostgREST access can query data from other branches. All access control is enforced only in the frontend.

**audit-log Edge Function supports `transporteria` module.** `AuditModule` type was updated to include `'transporteria'` and deployed 2026-05-11. If deploying a fresh copy, make sure `supabase/functions/audit-log/index.ts` is deployed with `supabase functions deploy audit-log`.

## Services

- `services/supabaseClient.ts` — raw CRUD service objects: `branchesService`, `productsService`, `customersService`, `salesService`, `dieselTanksService`, `vehiclesService`, `driversService`, `dieselLogsService`, `analyticsService`, `concreteService`, `subscriptions`
- `services/auth/auth.service.ts` — sign in / sign out / getCurrentUser
- `services/auth/permissions.ts` — RBAC helpers (`userCanAccess`, `userCanAccessTab`, `firstAccessibleTab`, `userCanAccessBranch`)
- `services/auth/routes.ts` — `tabToPath` / `pathToTab` URL mapping (`TAB_PATHS` record)
- `services/credit/credit.service.ts` — credit customers, credit notes, payment evidence; types: `CreditCustomer`, `CreditPolicy`, `CustomerDocument`
- `services/wallet.service.ts` — prepaid wallet for materiales customers; types: `CustomerWallet`, `CustomerWalletMovement`
- `services/concretera/` — concrete-unit credit, purchases, wallet, catalog
- `services/inventory/catalog.service.ts` — `Uom`, `Category`, `Brand`, `Supplier` CRUD
- `services/inventory/purchases.service.ts` — purchases and sales for materiales/transporteria units; `CreateSaleInput` includes `business_unit`
- `services/shared/customerSelection.service.ts` — shared customer search across units
- `services/conversionEngine.ts` — unit conversion: direct → inverse → global fallback (ton↔kg)
- `services/uomEquivalence.ts` — DB-backed UoM equivalences
- `services/currency.ts` — currency formatting helpers (MXN)
- `services/audit/` — audit log helpers (write + read); audit events go to MongoDB via Edge Function
- `services/pdf/` — PDF generation via `pdf-lib`: `customerStatementPdf`, `promissoryNotePdf`, `walletHistoryPdf`, `branchFooter`
- `services/paymentEvidenceUpload.service.ts` — file upload to Cloudinary via Edge Function

## Supabase Edge Functions

Located in `supabase/functions/`:
- `audit-log/` — records audit events to **MongoDB**; URL configurable via `VITE_AUDIT_API_URL`; supports modules: `materiales`, `concretera`, `transporteria`
- `payment-evidence-upload/` — handles file uploads for payment proofs and customer documents to **Cloudinary**

Deploy: `supabase functions deploy <name>`

## RPC Functions Used

Auth RPCs (all via `supabase.rpc()`):
- `app_login_user(p_identifier, p_password)` — returns full `AuthPayloadRow` with session token and permissions
- `app_validate_session(p_token)` — validates token on app load
- `app_logout_user(p_token)` — invalidates session
- `app_set_user_password(p_user_id, p_password)` — sets password hash
- `app_build_employee_payload(user_id)` — builds permissions payload

Operational RPCs:
- `process_diesel_dispatch` — dispatch diesel from tank
- `process_diesel_reception` — receive diesel into tank
- `archive_diesel_log` — soft-delete diesel log with audit
- `adjust_product_stock` — manual stock adjustment with reason and audit trail

All must exist in Supabase project; schema in `crear_tablas_documentos_clientes.sql` (partial).

## Concrete-specific

`ConcreteFleet.tsx` — truck mixer states: `DISPONIBLE`, `CARGANDO`, `EN_RUTA`, `REGRESANDO`, `MANTENIMIENTO`

`ConcreteOps.tsx` — production orders. Concrete sales have extra metadata:
```typescript
type ConcreteSaleMeta = {
  edad: '28' | '14' | '7' | '3' | null   // curing days
  rev: '12' | '14' | '16' | '18' | null  // resistance kg/cm²
  descarga: 'Directo' | 'Bomba' | null
}
```

## Key DB Tables

- `app_user_profiles` — employees (not `auth.users`)
- `app_user_sessions` — custom session tokens
- `app_user_branch_access` + `app_user_business_unit_access` — actual access control (not role_key)
- `inventory_transactions` — sales records (note: code calls this "sales" but DB table is `inventory_transactions`)
- `product_stocks` — updated by triggers; do not modify directly
- `credit_notes` + `credit_payments` — credit system
- `customer_wallets` + `customer_wallet_movements` — prepaid wallet system
- `diesel_tanks` + `diesel_logs` — fuel management

Full DB schema documentation: `speech/resumen-proyecto.md` §4.
