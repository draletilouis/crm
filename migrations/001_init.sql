-- Plain SQL only (no DO blocks or plpgsql), so it runs anywhere.

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,          -- stored as 2567XXXXXXXX
  pin_hash      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('agent', 'manager')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE SEQUENCE lead_ref_seq;

CREATE TABLE leads (
  id                SERIAL PRIMARY KEY,
  ref               TEXT NOT NULL UNIQUE DEFAULT ('L-' || LPAD(nextval('lead_ref_seq')::TEXT, 3, '0')),
  business_name     TEXT NOT NULL,
  business_type     TEXT,
  owner_name        TEXT,
  phone             TEXT,                       -- stored as 2567XXXXXXXX
  area              TEXT,
  landmark          TEXT,
  tracks_stock_now  TEXT,
  interest          TEXT CHECK (interest IN ('hot', 'warm', 'cold')),
  stage             TEXT NOT NULL DEFAULT 'new'
                    CHECK (stage IN ('new', 'contacted', 'demo', 'trial', 'paying', 'lost')),
  demo_done         BOOLEAN NOT NULL DEFAULT FALSE,
  expected_ugx      INTEGER CHECK (expected_ugx IS NULL OR expected_ugx >= 0),
  lost_reason       TEXT,
  notes             TEXT,
  agent_id          INTEGER NOT NULL REFERENCES users(id),
  first_visit_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  last_contact_on   DATE,
  next_follow_up_on DATE,
  stage_changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One lead per phone number, so two agents never chase the same shop.
CREATE UNIQUE INDEX leads_phone_unique ON leads (phone) WHERE phone IS NOT NULL;
CREATE INDEX leads_agent_idx ON leads (agent_id);
CREATE INDEX leads_follow_up_idx ON leads (next_follow_up_on) WHERE stage NOT IN ('paying', 'lost');
CREATE INDEX leads_stage_idx ON leads (stage);

CREATE TABLE visits (
  id            SERIAL PRIMARY KEY,
  lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_id      INTEGER NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL CHECK (kind IN ('visit', 'call', 'whatsapp')),
  happened_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  what_happened TEXT,
  next_step     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX visits_lead_idx ON visits (lead_id, happened_on DESC);
CREATE INDEX visits_agent_idx ON visits (agent_id, happened_on DESC);

-- Login sessions (connect-pg-simple).
CREATE TABLE "session" (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX session_expire_idx ON "session" (expire);
