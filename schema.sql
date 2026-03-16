-- ============================================================
-- ALMOXARIFADO MAPLE BEAR - Schema Supabase
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Tabela de turmas
CREATE TABLE turmas (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#3B82F6'
);

-- Tabela de usuários
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','manager')),
  turma_id    TEXT REFERENCES turmas(id) ON DELETE SET NULL
);

-- Tabela de insumos
CREATE TABLE insumos (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  unit        TEXT NOT NULL DEFAULT 'unidade',
  stock_qty   NUMERIC NOT NULL DEFAULT 0,
  price       NUMERIC NOT NULL DEFAULT 0
);

-- Tabela de orçamentos (um por turma por mês)
CREATE TABLE budgets (
  id          TEXT PRIMARY KEY,
  turma_id    TEXT NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,  -- formato: YYYY-MM
  amount      NUMERIC NOT NULL DEFAULT 0,
  UNIQUE(turma_id, month)
);

-- Tabela de requisições
CREATE TABLE requisitions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  turma_id     TEXT NOT NULL REFERENCES turmas(id),
  month        TEXT NOT NULL,
  items        JSONB NOT NULL DEFAULT '[]',
  total        NUMERIC NOT NULL DEFAULT 0,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  manager_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at  TIMESTAMPTZ,
  rejected_at  TIMESTAMPTZ
);

-- Tabela de notificações
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  req_id     TEXT REFERENCES requisitions(id) ON DELETE CASCADE,
  message    TEXT NOT NULL,
  read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Dados iniciais de demonstração
-- (pode apagar depois de criar seus dados reais)
-- ============================================================

DO $$
DECLARE
  t1 TEXT := 'turma-bearcare';
  t2 TEXT := 'turma-year1';
  t3 TEXT := 'turma-year2';
  u1 TEXT := 'user-gerente';
  u2 TEXT := 'user-ana';
  m  TEXT := TO_CHAR(NOW(), 'YYYY-MM');
BEGIN

INSERT INTO turmas VALUES
  (t1, 'Bear Care', '#6366F1'),
  (t2, 'Year 1',   '#10B981'),
  (t3, 'Year 2',   '#F59E0B')
ON CONFLICT DO NOTHING;

INSERT INTO users VALUES
  (u1, 'Gerente Geral',   'gerente@escola.com', 'gerente123', 'manager', NULL),
  (u2, 'Profª Ana Paula', 'ana@escola.com',      'ana123',    'user',    t1)
ON CONFLICT DO NOTHING;

INSERT INTO insumos VALUES
  ('ins-1', 'Papel A4',        'Resma 500 folhas',          'resma',   20, 25.90),
  ('ins-2', 'Caneta Azul',     'Caixa c/50 esferográfica',  'caixa',    8, 18.50),
  ('ins-3', 'Cola Bastão',     'Cola bastão 40g',            'unidade', 30,  4.90),
  ('ins-4', 'Sulfite Colorido','Pacote 100 folhas A4',       'pacote',  12, 16.00),
  ('ins-5', 'Tesoura Escolar', 'Tesoura ponta redonda',      'unidade',  5,  8.50)
ON CONFLICT DO NOTHING;

INSERT INTO budgets VALUES
  ('bgt-1', t1, m, 500),
  ('bgt-2', t2, m, 400),
  ('bgt-3', t3, m, 450)
ON CONFLICT DO NOTHING;

END $$;

-- ============================================================
-- Segurança: desabilitar RLS nas tabelas
-- (sistema usa autenticação própria com senha na tabela users)
-- ============================================================

ALTER TABLE turmas        DISABLE ROW LEVEL SECURITY;
ALTER TABLE users         DISABLE ROW LEVEL SECURITY;
ALTER TABLE insumos       DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets       DISABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions  DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
