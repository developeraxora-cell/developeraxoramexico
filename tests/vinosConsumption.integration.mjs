// npm install --prefix /tmp/tahona-consumption-tests @electric-sql/pglite
// node tests/vinosConsumption.integration.mjs
import { PGlite } from '/tmp/tahona-consumption-tests/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE branches(id bigint PRIMARY KEY);
CREATE TABLE customers(id uuid PRIMARY KEY,branch_id bigint,name text,is_active boolean DEFAULT true,credit_limit numeric DEFAULT 1000);
CREATE TABLE products(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true,deleted_at timestamptz);
CREATE TABLE product_uoms(id uuid PRIMARY KEY,product_id uuid,factor_to_base numeric);
CREATE TABLE product_stocks(product_id uuid,branch_id bigint,qty numeric,PRIMARY KEY(branch_id,product_id));
CREATE TABLE sales(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),branch_id bigint,customer_id uuid,payment_method text,price_type text,
subtotal numeric,discount_amount numeric,total numeric,wallet_used numeric,credit_used numeric,cash_received numeric,notes text,created_by uuid,created_at timestamptz DEFAULT now(),deleted_at timestamptz);
CREATE TABLE sale_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sale_id uuid,product_id uuid,product_uom_id uuid,qty numeric,factor_used numeric,qty_base numeric,price_type text,unit_price numeric,line_total numeric);
CREATE TABLE credit_payments(id uuid DEFAULT gen_random_uuid(),customer_id uuid,sale_id uuid,amount numeric,deleted_at timestamptz);
CREATE TABLE cash_register_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),branch_id bigint,cashier_user_id text,opened_at timestamptz DEFAULT now(),closed_at timestamptz);
INSERT INTO branches VALUES(1),(2);
INSERT INTO customers(id,branch_id,name) VALUES('00000000-0000-0000-0000-000000000001',1,'Cliente');
INSERT INTO products(id,name) VALUES('00000000-0000-0000-0000-000000000002','Producto');
INSERT INTO product_uoms VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002',1);
INSERT INTO product_stocks VALUES('00000000-0000-0000-0000-000000000002',1,100);
INSERT INTO cash_register_sessions(branch_id,cashier_user_id) VALUES(1,'00000000-0000-0000-0000-000000000004');
`);
await db.exec(readFileSync('vinos_consumo.sql','utf8'));
const customer='00000000-0000-0000-0000-000000000001',product='00000000-0000-0000-0000-000000000002',actor='00000000-0000-0000-0000-000000000004';
const today=(await db.query("select (now() at time zone 'America/Mexico_City')::date::text d")).rows[0].d;
async function create(id,qty=10,price=10,extra={}) {
  return db.query('select create_vinos_consumption($1::jsonb) id',[JSON.stringify({id,branch_id:1,customer_id:customer,actor_id:actor,due_date:today,price_type:'MENUDEO',items:[{product_id:product,qty,unit_price:price}],...extra})]);
}
async function settle(id,returned=4,payment='EFECTIVO') {
  const items=await db.query('select id from vinos_consumption_items where consumption_id=$1',[id]);
  return db.query('select settle_vinos_consumption($1,$2,$3,$4::jsonb) id',[id,actor,payment,JSON.stringify(items.rows.map(i=>({id:i.id,qty:returned})))]);
}
const stock=async()=>Number((await db.query('select qty from product_stocks')).rows[0].qty);
const id='10000000-0000-0000-0000-000000000001';
await create(id); assert.equal(await stock(),90);
await create(id); assert.equal(await stock(),90,'Salida idempotente');
await assert.rejects(()=>create(id,12)); assert.equal(await stock(),90,'Reintento con datos distintos rechazado');
assert.equal(Number((await db.query('select * from vinos_consumption_outstanding(1)')).rows[0].qty),10);
await assert.rejects(()=>settle(id,11)); assert.equal(await stock(),90,'Devolucion invalida sin cambios');
const result=await settle(id); assert.equal(await stock(),94);
const sale=(await db.query('select * from sales where id=$1',[result.rows[0].id])).rows[0];
assert.equal(Number(sale.total),60); assert.equal(sale.created_by,actor);
assert.equal(Number((await db.query('select qty from sale_items')).rows[0].qty),6);
await settle(id); assert.equal(await stock(),94,'Liquidacion idempotente');
assert.equal((await db.query('select * from vinos_consumption_outstanding(1)')).rows.length,0);
await assert.rejects(()=>db.query('update sales set deleted_at=now() where id=$1',[sale.id]));
const full='10000000-0000-0000-0000-000000000002';
await create(full); await settle(full,10); assert.equal(await stock(),94);
assert.equal((await db.query('select count(*)::int n from sales')).rows[0].n,1,'Devolucion total sin venta ficticia');
await assert.rejects(()=>create(crypto.randomUUID(),200)); assert.equal(await stock(),94);
await assert.rejects(()=>create(crypto.randomUUID(),1.5));
await assert.rejects(()=>create(crypto.randomUUID(),1,10,{branch_id:2}));
const creditId=crypto.randomUUID(); await create(creditId,10,200);
await assert.rejects(()=>settle(creditId,0,'CREDITO')); assert.equal(await stock(),84);
await settle(creditId,6,'CREDITO');
const credit=(await db.query('select vinos_consumption_credit($1) c',[customer])).rows[0].c;
assert.equal(credit.debt,800); assert.equal(credit.available,200);
assert.equal((await db.query("select (credit_due_date-(created_at at time zone 'America/Mexico_City')::date)::int days from sales where payment_method='CREDITO'")).rows[0].days,30);
await db.query("update sales set credit_due_date=(now() at time zone 'America/Mexico_City')::date-1 where payment_method='CREDITO'");
await assert.rejects(()=>create(crypto.randomUUID()));
// Un abono general cubre el credito mas antiguo; una compra vigente no debe bloquearlo.
await db.query("insert into sales(customer_id,payment_method,credit_used,credit_due_date) values($1,'CREDITO',50,$2::date+30)",[customer,today]);
await db.query('insert into credit_payments(customer_id,amount) values($1,800)',[customer]);
const allocated=(await db.query('select vinos_consumption_credit($1) c',[customer])).rows[0].c;
assert.equal(allocated.debt,50); assert.equal(allocated.overdue,false);
await db.query('delete from credit_payments where sale_id is null');
await db.query("insert into credit_payments(customer_id,sale_id,amount) select customer_id,id,credit_used from sales where payment_method='CREDITO'");
const overdue=crypto.randomUUID(); await create(overdue);
await db.query('update vinos_consumptions set due_date=$1::date-1 where id=$2',[today,overdue]);
await assert.rejects(()=>create(crypto.randomUUID()));
await settle(overdue,10);
await db.exec('update cash_register_sessions set closed_at=now()');
const closed=crypto.randomUUID(); await create(closed);
await assert.rejects(()=>settle(closed,0)); await settle(closed,10);
const free=crypto.randomUUID(); await create(free,1,0);
await assert.rejects(()=>settle(free,0)); await settle(free,1);
await db.exec('SET ROLE anon');
await assert.rejects(()=>db.exec("update vinos_consumptions set status='SETTLED'"));
await db.exec('RESET ROLE');
console.log('OK: salida, liquidacion, devolucion total, credito, vencimientos, caja, permisos, rollback e idempotencia.');
await db.close();
