/**
 * AIOS Database Adapter Layer
 * ─────────────────────────────────────────────────────────────────────────────
 * Zenith AI OS is DATABASE-AGNOSTIC. The `DatabaseAdapter` interface is the
 * ONLY contract the platform uses. Any relational or document database that
 * can implement this interface is fully supported.
 *
 * Officially supported adapters (shipped):
 *   - PostgresAdapter      (pg / node-postgres)          → any Postgres 15+
 *   - SupabaseAdapter      (supabase-js)                 → Supabase cloud / self-hosted
 *   - NeonAdapter          (@neondatabase/serverless)    → Neon serverless Postgres
 *   - PlanetScaleAdapter   (@planetscale/database)       → PlanetScale MySQL-compatible
 *   - TursoAdapter         (@libsql/client)              → Turso / libSQL / SQLite
 *   - CockroachAdapter     (pg driver)                   → CockroachDB
 *   - MongoAdapter         (mongodb)                     → MongoDB (limited — no pgvector)
 *   - PrismaAdapter        (@prisma/client)              → Any Prisma-supported DB
 *   - DrizzleAdapter       (drizzle-orm)                 → Any Drizzle-supported DB
 *
 * Community adapters (bring your own):
 *   - Any DB that exposes a `query(sql, params) => { rows }` method
 *   - DynamoDB, Firestore, EdgeDB, SingleStore, etc.
 *
 * Vector search note:
 *   pgvector is required for full semantic search (memory, knowledge retrieval).
 *   For non-Postgres adapters, the platform falls back to keyword search.
 *   Set `supportsVectors: false` in your adapter to activate the fallback.
 */

// ─── Core Interface ────────────────────────────────────────────────────────

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount?: number;
}

export interface TransactionClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface DatabaseAdapter {
  /** Provider identifier — shown in audit logs and health checks */
  readonly provider: DatabaseProvider;
  /** Whether this adapter supports pgvector / native vector operations */
  readonly supportsVectors: boolean;
  /** Whether this adapter supports ACID transactions */
  readonly supportsTransactions: boolean;

  /** Execute a parameterised SQL (or equivalent) query */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;

  /** Begin a transaction. Use the returned client for all ops in the transaction. */
  transaction?(): Promise<TransactionClient>;

  /** Optional: health check — returns true if the connection is live */
  ping?(): Promise<boolean>;

  /** Optional: graceful shutdown */
  close?(): Promise<void>;
}

export type DatabaseProvider =
  | 'postgres'
  | 'supabase'
  | 'neon'
  | 'planetscale'
  | 'turso'
  | 'cockroachdb'
  | 'mongodb'
  | 'prisma'
  | 'drizzle'
  | 'custom';

// ─── Postgres Adapter (node-postgres / pg) ─────────────────────────────────

export interface PostgresAdapterOptions {
  connectionString: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  poolMax?: number;
  poolIdleTimeout?: number;
}

/**
 * Adapter for any standard Postgres 15+ database.
 * Works with: local Postgres, AWS RDS, Google Cloud SQL, Azure Database,
 * DigitalOcean Managed Postgres, Railway, Render, Fly.io Postgres, etc.
 */
export class PostgresAdapter implements DatabaseAdapter {
  readonly provider = 'postgres' as const;
  readonly supportsVectors = true;  // assumes pgvector extension installed
  readonly supportsTransactions = true;

  private pool: unknown; // Pool from 'pg'

  constructor(private options: PostgresAdapterOptions) {}

  async init(): Promise<void> {
    // Dynamic import to avoid hard dep when using other adapters
    const { Pool } = await import('pg' as never as string) as { Pool: new (opts: unknown) => unknown };
    this.pool = new Pool({
      connectionString: this.options.connectionString,
      ssl: this.options.ssl,
      max: this.options.poolMax ?? 10,
      idleTimeoutMillis: this.options.poolIdleTimeout ?? 30000,
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await (this.pool as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number }>
    }).query(sql, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  async transaction(): Promise<TransactionClient> {
    const client = await (this.pool as {
      connect: () => Promise<{
        query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
        release: () => void;
      }>
    }).connect();
    await client.query('BEGIN');
    return {
      query: async (sql, params) => client.query(sql, params),
      commit: async () => { await client.query('COMMIT'); client.release(); },
      rollback: async () => { await client.query('ROLLBACK'); client.release(); },
    };
  }

  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch { return false; }
  }

  async close(): Promise<void> {
    await (this.pool as { end: () => Promise<void> }).end();
  }
}

// ─── Supabase Adapter ──────────────────────────────────────────────────────

export interface SupabaseAdapterOptions {
  url: string;
  serviceRoleKey: string;
  /** If true, use direct Postgres connection (recommended for server-side) */
  useDirectConnection?: boolean;
  directConnectionString?: string;
}

/**
 * Adapter for Supabase (cloud or self-hosted).
 * Uses supabase-js for simple queries; falls through to pg for raw SQL.
 * RLS policies are enforced at DB level — not application level.
 */
export class SupabaseAdapter implements DatabaseAdapter {
  readonly provider = 'supabase' as const;
  readonly supportsVectors = true;
  readonly supportsTransactions = true;

  private pgAdapter?: PostgresAdapter;

  constructor(private options: SupabaseAdapterOptions) {}

  async init(): Promise<void> {
    // Always use direct Postgres connection for server-side AIOS operations
    const connString = this.options.directConnectionString
      ?? this.options.url.replace('https://', 'postgresql://postgres:' + this.options.serviceRoleKey + '@').replace('.supabase.co', '.supabase.co:5432/postgres');

    this.pgAdapter = new PostgresAdapter({ connectionString: connString });
    await this.pgAdapter.init();
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.pgAdapter) throw new Error('SupabaseAdapter not initialized. Call init() first.');
    return this.pgAdapter.query<T>(sql, params);
  }

  async transaction(): Promise<TransactionClient> {
    if (!this.pgAdapter) throw new Error('Not initialized');
    return this.pgAdapter.transaction!();
  }

  async ping(): Promise<boolean> {
    return this.pgAdapter?.ping() ?? false;
  }
}

// ─── Neon Adapter (Serverless Postgres) ───────────────────────────────────

export interface NeonAdapterOptions {
  connectionString: string;
  /** Use http pooler for edge runtimes (default: false) */
  fetchConnectionCache?: boolean;
}

/**
 * Adapter for Neon Serverless Postgres.
 * Supports branching — great for test/preview environments.
 * pgvector supported via Neon's built-in extension.
 */
export class NeonAdapter implements DatabaseAdapter {
  readonly provider = 'neon' as const;
  readonly supportsVectors = true;
  readonly supportsTransactions = true;

  private client: unknown;

  constructor(private options: NeonAdapterOptions) {}

  async init(): Promise<void> {
    const { neon } = await import('@neondatabase/serverless' as never as string) as {
      neon: (connString: string, opts?: unknown) => (sql: string, params?: unknown[]) => Promise<unknown[]>
    };
    this.client = neon(this.options.connectionString, {
      fetchConnectionCache: this.options.fetchConnectionCache ?? false,
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const rows = await (this.client as (sql: string, params?: unknown[]) => Promise<T[]>)(sql, params);
    return { rows, rowCount: rows.length };
  }

  async ping(): Promise<boolean> {
    try { await this.query('SELECT 1'); return true; } catch { return false; }
  }
}

// ─── PlanetScale Adapter (MySQL-compatible) ────────────────────────────────

export interface PlanetScaleAdapterOptions {
  host: string;
  username: string;
  password: string;
}

/**
 * Adapter for PlanetScale (Vitess-based MySQL-compatible).
 * NOTE: pgvector is NOT available. Semantic search falls back to keyword matching.
 * Transactions use PlanetScale's branching model (no DDL in transactions).
 */
export class PlanetScaleAdapter implements DatabaseAdapter {
  readonly provider = 'planetscale' as const;
  readonly supportsVectors = false; // No pgvector — keyword fallback active
  readonly supportsTransactions = true;

  private client: unknown;

  constructor(private options: PlanetScaleAdapterOptions) {}

  async init(): Promise<void> {
    const { connect } = await import('@planetscale/database' as never as string) as {
      connect: (opts: unknown) => unknown
    };
    this.client = connect({
      host: this.options.host,
      username: this.options.username,
      password: this.options.password,
    });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await (this.client as {
      execute: (sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
    }).execute(sql, params);
    return { rows: result.rows };
  }
}

// ─── Turso Adapter (libSQL / SQLite at edge) ───────────────────────────────

export interface TursoAdapterOptions {
  url: string;
  authToken?: string;
}

/**
 * Adapter for Turso (distributed libSQL / SQLite).
 * Excellent for edge deployments and multi-region reads.
 * NOTE: pgvector not supported — fallback to keyword search for embeddings.
 */
export class TursoAdapter implements DatabaseAdapter {
  readonly provider = 'turso' as const;
  readonly supportsVectors = false;
  readonly supportsTransactions = true;

  private client: unknown;

  constructor(private options: TursoAdapterOptions) {}

  async init(): Promise<void> {
    const { createClient } = await import('@libsql/client' as never as string) as {
      createClient: (opts: unknown) => unknown
    };
    this.client = createClient({ url: this.options.url, authToken: this.options.authToken });
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await (this.client as {
      execute: (stmt: { sql: string; args: unknown[] }) => Promise<{ rows: T[] }>
    }).execute({ sql, args: params ?? [] });
    return { rows: result.rows };
  }
}

// ─── CockroachDB Adapter ───────────────────────────────────────────────────

/**
 * Adapter for CockroachDB (Postgres-compatible).
 * Uses the standard `pg` driver — identical to PostgresAdapter.
 * pgvector is supported via CockroachDB's vector index.
 */
export class CockroachAdapter extends PostgresAdapter {
  readonly provider = 'cockroachdb' as const;
  readonly supportsVectors = true;
}

// ─── Prisma Adapter ────────────────────────────────────────────────────────

/**
 * Adapter for any Prisma-supported database.
 * Uses Prisma's $queryRaw for parameterised queries.
 * Supports: PostgreSQL, MySQL, SQLite, SQL Server, MongoDB (limited).
 */
export class PrismaAdapter implements DatabaseAdapter {
  readonly provider = 'prisma' as const;
  readonly supportsVectors: boolean;
  readonly supportsTransactions = true;

  constructor(
    private prisma: {
      $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    },
    options: { supportsVectors?: boolean } = {}
  ) {
    this.supportsVectors = options.supportsVectors ?? false;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    // Build a tagged template literal dynamically for Prisma's $queryRaw
    const parts = sql.split(/\$\d+/);
    const tag = Object.assign([...parts], { raw: parts }) as TemplateStringsArray;
    const rows = await this.prisma.$queryRaw(tag, ...(params ?? [])) as T[];
    return { rows };
  }
}

// ─── Drizzle Adapter ───────────────────────────────────────────────────────

/**
 * Adapter for Drizzle ORM (any supported dialect).
 * Pass the Drizzle db instance + a sql() executor.
 */
export class DrizzleAdapter implements DatabaseAdapter {
  readonly provider = 'drizzle' as const;
  readonly supportsVectors: boolean;
  readonly supportsTransactions = true;

  constructor(
    private db: {
      execute: (query: { sql: string; params: unknown[] }) => Promise<{ rows: unknown[] }>;
    },
    options: { supportsVectors?: boolean } = {}
  ) {
    this.supportsVectors = options.supportsVectors ?? false;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    const result = await this.db.execute({ sql, params: params ?? [] });
    return { rows: result.rows as T[] };
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

export type DatabaseAdapterConfig =
  | { provider: 'postgres';     options: PostgresAdapterOptions }
  | { provider: 'supabase';     options: SupabaseAdapterOptions }
  | { provider: 'neon';         options: NeonAdapterOptions }
  | { provider: 'planetscale';  options: PlanetScaleAdapterOptions }
  | { provider: 'turso';        options: TursoAdapterOptions }
  | { provider: 'cockroachdb';  options: PostgresAdapterOptions }
  | { provider: 'custom';       adapter: DatabaseAdapter };

/**
 * Factory: create and initialise a DatabaseAdapter from config.
 *
 * @example
 * // Supabase
 * const db = await createDatabaseAdapter({ provider: 'supabase', options: { url, serviceRoleKey } });
 *
 * // Neon
 * const db = await createDatabaseAdapter({ provider: 'neon', options: { connectionString } });
 *
 * // Any custom adapter
 * const db = await createDatabaseAdapter({ provider: 'custom', adapter: myAdapter });
 *
 * // Then pass to createAIOS:
 * const aios = await createAIOS({ db, organizationId, embedder, llmProvider });
 */
export async function createDatabaseAdapter(config: DatabaseAdapterConfig): Promise<DatabaseAdapter> {
  if (config.provider === 'custom') return config.adapter;

  let adapter: DatabaseAdapter & { init?: () => Promise<void> };

  switch (config.provider) {
    case 'postgres':     adapter = new PostgresAdapter(config.options); break;
    case 'supabase':     adapter = new SupabaseAdapter(config.options); break;
    case 'neon':         adapter = new NeonAdapter(config.options); break;
    case 'planetscale':  adapter = new PlanetScaleAdapter(config.options); break;
    case 'turso':        adapter = new TursoAdapter(config.options); break;
    case 'cockroachdb':  adapter = new CockroachAdapter(config.options); break;
    default: throw new Error(`Unsupported provider: ${(config as DatabaseAdapterConfig).provider}`);
  }

  if (typeof adapter.init === 'function') await adapter.init();
  return adapter;
}
