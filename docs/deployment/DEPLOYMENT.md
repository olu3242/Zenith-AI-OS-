# ZENITH AI OS — Deployment Guide

## Quick Start (Local)

```bash
git clone https://github.com/your-org/zenith-aios
cd zenith-aios
cp .env.example .env
# Edit .env with your API keys
docker-compose up -d
```

App available at: `http://localhost:3000`
n8n available at:  `http://localhost:5678`

---

## Prerequisites

| Requirement | Minimum | Recommended |
|------------|---------|-------------|
| Node.js | 18.x | 20.x LTS |
| pnpm | 8.x | 9.x |
| Postgres | 15 + pgvector | 16 + pgvector |
| Redis | 7.x | 7.2.x |

---

## Supabase Setup (Recommended)

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New Project → note `Project URL` and `anon key`.

### 2. Enable pgvector

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run this in the Supabase SQL editor before running migrations.

### 3. Run migrations

```bash
# Using Supabase CLI
supabase db push

# Or manually
psql $DATABASE_URL < supabase/migrations/001_tenancy_identity.sql
psql $DATABASE_URL < supabase/migrations/002_context_memory.sql
psql $DATABASE_URL < supabase/migrations/003_agents_tools.sql
psql $DATABASE_URL < supabase/migrations/004_workflows_knowledge.sql
psql $DATABASE_URL < supabase/migrations/005_policy_security_observability.sql
psql $DATABASE_URL < supabase/migrations/006_audit_certification.sql
```

### 4. Seed baseline data

```bash
psql $DATABASE_URL < supabase/seed/001_baseline_seed.sql
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://...

# AI Providers (at least one required)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Encryption (generate with: openssl rand -hex 32)
AIOS_ENCRYPTION_KEY=your-32-byte-hex-key

# Optional
REDIS_URL=redis://localhost:6379
N8N_WEBHOOK_SECRET=your-n8n-secret
AIOS_AUDIT_LOG_LEVEL=info
```

---

## Vercel Deployment

### 1. Import to Vercel

```bash
vercel import
# Select: Next.js project
# Root: apps/web
```

### 2. Set environment variables

In Vercel Dashboard → Settings → Environment Variables, add all vars from `.env.example`.

### 3. Deploy

```bash
vercel --prod
```

### 4. Verify

```bash
curl https://your-app.vercel.app/api/health
# Expected: {"status":"ok","version":"1.0.0"}
```

---

## Self-Hosted Deployment (VPS)

### 1. Server requirements

- Ubuntu 22.04+
- 4 CPU / 8GB RAM minimum
- 50GB SSD

### 2. Install dependencies

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
npm install -g pnpm@9

# Docker + Compose
curl -fsSL https://get.docker.com | sh
```

### 3. Clone and configure

```bash
git clone https://github.com/your-org/zenith-aios /opt/zenith-aios
cd /opt/zenith-aios
cp .env.example .env
# Edit .env
```

### 4. Start with Docker Compose

```bash
docker-compose up -d
# With optional tools (Adminer, Redis Commander):
docker-compose --profile tools up -d
```

### 5. Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /n8n/ {
        proxy_pass http://localhost:5678/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

### 6. SSL with Certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## Database Backups

```bash
# Automated daily backup script
pg_dump $DATABASE_URL | gzip > /backups/zenith-aios-$(date +%Y%m%d).sql.gz

# Add to cron
0 2 * * * /opt/zenith-aios/scripts/db/backup.sh
```

---

## Health Checks

| Endpoint | Expected Response |
|----------|------------------|
| `GET /api/health` | `{"status":"ok"}` |
| `GET /api/health/db` | `{"status":"ok","latencyMs":N}` |
| `GET /api/health/redis` | `{"status":"ok"}` |

---

## Upgrading

```bash
git pull origin main
pnpm install
pnpm run db:migrate    # runs new migrations
pnpm run build
pm2 restart zenith-aios  # or: docker-compose restart web
```

---

## Troubleshooting

**pgvector not installed:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
-- Then re-run migrations
```

**RLS blocking all queries:**
```sql
-- Ensure auth_organization_id() function exists after migration 001
SELECT auth_organization_id();
```

**Memory service embedding failures:**
Check `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is set. The embedder falls back to text search if embedding fails.

**n8n can't connect to DB:**
Ensure `DB_POSTGRESDB_SCHEMA=n8n` is set and the `n8n` schema exists: `CREATE SCHEMA IF NOT EXISTS n8n;`
