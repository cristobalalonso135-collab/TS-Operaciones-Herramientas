-- =============================================
-- BUDGET APP - Schema Supabase
-- =============================================

-- Tabla de festivos (para poder editarlos desde la app)
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'zaragoza',
  year INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)::int) STORED,
  UNIQUE(date, city)
);

-- Insertar festivos Zaragoza 2026
INSERT INTO holidays (date, name, city) VALUES
  ('2026-01-01', 'Año Nuevo', 'zaragoza'),
  ('2026-01-06', 'Epifanía del Señor', 'zaragoza'),
  ('2026-01-29', 'San Valero', 'zaragoza'),
  ('2026-03-05', 'Cincomarzada', 'zaragoza'),
  ('2026-04-02', 'Jueves Santo', 'zaragoza'),
  ('2026-04-03', 'Viernes Santo', 'zaragoza'),
  ('2026-04-23', 'San Jorge / Día de Aragón', 'zaragoza'),
  ('2026-05-01', 'Día del Trabajo', 'zaragoza'),
  ('2026-08-15', 'Asunción de la Virgen', 'zaragoza'),
  ('2026-10-12', 'Fiesta Nacional', 'zaragoza'),
  ('2026-11-02', 'Todos los Santos', 'zaragoza'),
  ('2026-12-07', 'Constitución', 'zaragoza'),
  ('2026-12-08', 'Inmaculada Concepción', 'zaragoza'),
  ('2026-12-25', 'Navidad', 'zaragoza')
ON CONFLICT (date, city) DO NOTHING;

-- Uploads de budget (cada vez que subes un Excel)
CREATE TABLE IF NOT EXISTS budget_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  step TEXT NOT NULL DEFAULT 'step0',
  working_days INT NOT NULL,
  total_mensual NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- Líneas de budget procesadas
CREATE TABLE IF NOT EXISTS budget_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID NOT NULL REFERENCES budget_uploads(id) ON DELETE CASCADE,
  indice INT,
  id_vertical INT,
  nombre TEXT NOT NULL,
  zona_equipaciones TEXT,
  cod_mercado TEXT,
  importe_mensual NUMERIC(15,4) NOT NULL,
  importe_diario NUMERIC(15,4),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Importes diarios por línea
CREATE TABLE IF NOT EXISTS budget_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  line_id UUID NOT NULL REFERENCES budget_lines(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  importe NUMERIC(15,4) NOT NULL DEFAULT 0,
  is_working BOOLEAN NOT NULL DEFAULT true,
  step TEXT NOT NULL DEFAULT 'step0'
);

-- Índices para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_budget_lines_upload ON budget_lines(upload_id);
CREATE INDEX IF NOT EXISTS idx_budget_daily_line ON budget_daily(line_id);
CREATE INDEX IF NOT EXISTS idx_budget_daily_fecha ON budget_daily(fecha);
CREATE INDEX IF NOT EXISTS idx_holidays_year ON holidays(year);

-- Vista resumen por upload
CREATE OR REPLACE VIEW budget_summary AS
SELECT
  u.id AS upload_id,
  u.file_name,
  u.year,
  u.month,
  u.step,
  u.working_days,
  u.created_at,
  COUNT(DISTINCT bl.id) AS num_lines,
  SUM(bl.importe_mensual) AS total_mensual,
  SUM(bl.importe_diario) AS total_diario_avg
FROM budget_uploads u
LEFT JOIN budget_lines bl ON bl.upload_id = u.id
GROUP BY u.id;
