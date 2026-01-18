-- SQL PARA SINCRONIZACIÓN TOTAL - GRUPO LOPAR
-- Este script crea las tablas necesarias para mover POS, Concretera e Inventario a la nube.

-- 1. TABLA DE PRODUCTOS Y STOCK
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    base_unit_id TEXT,
    price_per_base_unit DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
    branch_id TEXT NOT NULL,
    qty DECIMAL(12,2) DEFAULT 0,
    UNIQUE(product_id, branch_id)
);

-- 2. TABLA DE CLIENTES Y CRÉDITO
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    credit_limit DECIMAL(12,2) DEFAULT 0,
    current_debt DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE VENTAS (POS)
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES customers(id),
    total DECIMAL(12,2) NOT NULL,
    payment_method TEXT NOT NULL,
    branch_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id),
    qty DECIMAL(12,2) NOT NULL,
    unit_id TEXT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL
);

-- 4. TABLA DE COMPRAS (INVENTARIO)
CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    qty DECIMAL(12,2) NOT NULL,
    cost_per_unit DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    supplier TEXT,
    branch_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA DE CONCRETERA (PEDIDOS)
CREATE TABLE IF NOT EXISTS concrete_orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES customers(id),
    formula_id TEXT NOT NULL,
    qty_m3 DECIMAL(12,2) NOT NULL,
    branch_id TEXT NOT NULL,
    scheduled_date TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'PENDIENTE',
    mixer_id TEXT,
    total_amount DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. HABILITAR REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE product_stocks;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE concrete_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;

-- 7. RLS (SEGURIDAD BÁSICA)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE concrete_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo a usuarios autenticados" ON products FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados" ON product_stocks FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados" ON customers FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados" ON sales FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados" ON sale_items FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados" ON purchases FOR ALL USING (true);
CREATE POLICY "Permitir todo a usuarios autenticados" ON concrete_orders FOR ALL USING (true);

-- 8. DATOS INICIALES (SEED) - GRUPO LOPAR
-- Esto poblará tu base de datos con los productos y clientes de prueba.

-- Limpiar antes de insertar
DELETE FROM product_stocks;
DELETE FROM products;
DELETE FROM customers;

-- Insertar Clientes
INSERT INTO customers (id, name, phone, address, credit_limit, current_debt) VALUES
('cust1', 'Juan Pérez - Constructor', '555-0101', 'Calle 50 #123 x 45 y 47, Col. Centro', 50000, 12500),
('cust2', 'María López - Acabados', '555-0202', 'Av. Itzaes #400 x 59, Col. García Ginerés', 20000, 0),
('cust3', 'Ingeniería Civil SA', '555-0303', 'Parque Industrial Umán, Lote 15', 100000, 95000);

-- Insertar Productos
INSERT INTO products (id, name, sku, base_unit_id, price_per_base_unit) VALUES
('p1', 'Cemento Tolteca Gris', 'CEM-TOL-50', 'u1', 4.5),
('p2', 'Varilla Corrugada 3/8', 'VAR-38-12', 'u4', 38.0),
('p3', 'Arena de Mina', 'ARE-GRN', 'u1', 1.5);

-- Insertar Stock por Sucursal (Matriz centro = b1, Norte = b2, Bodega = b3)
INSERT INTO product_stocks (product_id, branch_id, qty) VALUES
('p1', 'b1', 5000), ('p1', 'b2', 1200), ('p1', 'b3', 15000),
('p2', 'b1', 600),  ('p2', 'b2', 45),   ('p2', 'b3', 2000),
('p3', 'b1', 15000),('p3', 'b2', 8000), ('p3', 'b3', 40000);
