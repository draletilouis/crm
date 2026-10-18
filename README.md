# Lefori Sales

A small CRM for the Lefori field sales team. It replaces the *Lefori Field Leads Tracker* spreadsheet
with a phone-first web app: every shop an agent visits is a lead, every visit or call is logged, and
each morning the **Today** screen lists who to follow up.

It is separate from the Lefori shop app: its own repo, its own service, its own database. It never
reads or writes Lefori's data.

## What it does (v1)

- **Today**: late follow-ups, follow-ups due today, and hot or warm leads with no follow-up date.
- **Leads**: search by name, owner, area or phone; filter by Open, Hot, Late, Due today, Trial, Paying, Lost.
- **Add a lead** in under a minute. The phone number is checked as you type, so two agents never chase
  the same shop (`0772 123 456`, `+256 772123456` and `772123456` are the same number).
- **Log a visit, call or WhatsApp**, and move the lead on (stage, interest, next follow-up) in the same step.
- **One-tap Call and WhatsApp** from every lead. WhatsApp opens with a short pitch and the demo link.
- **Numbers**: late follow-ups, pipeline by stage, contacts per week, results per agent, why leads are lost.
- **Team** (managers): add agents, reset PINs, switch people off (they are logged out at once).
- **Import** the old `.xlsx` tracker, Leads tab and Visit log tab, with a dry run first.

Agents see only their own leads. Managers see everyone's and can give a lead to another agent.
Stages and lists are the spreadsheet's: New, Contacted, Demo done, Trial started, Paying, Lost.

## Stack

Node 20+, Express, PostgreSQL, plain JavaScript in the browser (no build step). Logins are phone number
plus a 4 to 6 digit PIN, hashed with Node's built-in scrypt. Sessions are stored in Postgres.
Dates use Kampala time, so "today" is the agents' today.

```
server.js            starts the app (runs migrations, creates the first manager)
src/app.js           Express app, security headers, routes
src/routes/          auth, users, leads (+ visits), dashboard, import
migrations/*.sql     plain SQL, run once each, in order
public/              the app: index.html, app.js, styles.css, service worker
tests/               Jest + Supertest against a throwaway schema
```

## Run it locally

1. `npm install`
2. Copy `.env.example` to `.env` and fill in Postgres details. To share an existing local database, set
   `DB_SCHEMA=lefori_crm` and the CRM keeps its tables in that schema.
3. `npm run create-manager -- "Your Name" 0772123456 1234`
4. `npm run dev` and open http://localhost:3030 (or the `PORT` you set).

`node scripts/seed-dev.js` adds sample agents and leads to a local, non-`public` schema.

## Tests

`npm test` uses the `shopmaster_test` database (`POSTGRES_TEST_DB` to change it) and the schema
`lefori_crm_test`, which it drops and rebuilds on every run. It never touches other schemas.

## Deploy on Railway (separately from Lefori)

1. In the Railway project, **New → GitHub repo →** this repo. It becomes its own service.
2. **New → Database → PostgreSQL** for the CRM's own database. In the service's variables, add
   `DATABASE_URL = ${{Postgres.DATABASE_URL}}` (use the new database, not Lefori's).
3. Add variables:
   - `NODE_ENV=production`
   - `SESSION_SECRET`: a long random string
   - `DEMO_URL`: the link agents send on WhatsApp
   - `BOOTSTRAP_MANAGER_NAME`, `BOOTSTRAP_MANAGER_PHONE`, `BOOTSTRAP_MANAGER_PIN`: the first manager,
     created on first start. Remove the PIN variable once you have logged in and changed it.
4. **Settings → Networking → Custom domain**: e.g. `sales.lefori.com`.
5. Deploys run migrations on start. Health check: `/health`.

Cost: one small service plus one small Postgres, roughly USD 5 to 10 a month.

## Next (v2 and v3)

- **Link to Lefori**: Lefori sends "signed up", "trial started" and "paying" events (with a shared
  secret); the CRM matches them to leads by phone or agent code and moves the stage itself.
  Commission stays in Lefori's admin portal; the CRM only shows it.
- Inbound trial sign-ups with no agent become leads automatically.
- GPS pin and shopfront photo on each visit; a map of leads by area.
- Offline mode: visits saved without signal and sent later.
- Morning WhatsApp or SMS nudge with each agent's follow-ups; targets and a leaderboard.
