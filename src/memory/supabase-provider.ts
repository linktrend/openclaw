import postgres from "postgres";
import type { ResolvedSupabaseMemoryConfig } from "./backend-config.js";
import type {
  MemoryEmbeddingProbeResult,
  MemoryProviderStatus,
  MemorySearchManager,
  MemorySearchResult,
} from "./types.js";

type SqlClient = ReturnType<typeof postgres>;

type SearchRow = {
  path?: string;
  source?: string;
  start_line?: number;
  end_line?: number;
  score?: number;
  snippet?: string;
  text?: string;
  lesson?: string;
};

function assertQualifiedRpcName(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(trimmed)) {
    throw new Error(`Invalid RPC name: ${value}`);
  }
  const parts = trimmed.split(".");
  return parts.map((part) => `"${part}"`).join(".");
}

export class SupabaseMemoryProvider implements MemorySearchManager {
  private readonly sql: SqlClient;
  private readonly searchRpcSqlName: string;
  private readonly scratchRpcSqlName: string;

  constructor(private readonly config: ResolvedSupabaseMemoryConfig) {
    this.sql = postgres(config.connectionString, {
      max: 5,
      prepare: true,
    });
    this.searchRpcSqlName = assertQualifiedRpcName(config.searchRpc);
    this.scratchRpcSqlName = assertQualifiedRpcName(config.scratchRpc);
  }

  async search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<MemorySearchResult[]> {
    const cleaned = query.trim();
    if (!cleaned) {
      return [];
    }
    const maxResults = Math.max(1, Math.floor(opts?.maxResults ?? 6));
    const minScore = typeof opts?.minScore === "number" ? opts.minScore : 0;
    const tenantId = this.config.tenantId?.trim() || undefined;
    const rows = await this.withTenantSession(async (tx) => {
      const searchRows = await this.callSearchRpc(tx, {
        query: cleaned,
        maxResults,
        minScore,
        tenantId,
      });
      await this.callScratchRpc(tx, {
        payload: JSON.stringify({
          event: "memory_search",
          query: cleaned,
          maxResults,
          sessionKey: opts?.sessionKey,
          tenantId,
          ts: Date.now(),
        }),
        tenantId,
      });
      return searchRows;
    });
    return rows.map((row, index) => {
      const snippet = String(row.snippet ?? row.text ?? row.lesson ?? "").trim();
      return {
        path: String(row.path ?? `supabase:${index + 1}`),
        startLine: row.start_line && row.start_line > 0 ? row.start_line : 1,
        endLine: row.end_line && row.end_line > 0 ? row.end_line : row.start_line ?? 1,
        score: typeof row.score === "number" ? row.score : 0,
        snippet,
        source: row.source === "sessions" ? "sessions" : "memory",
      };
    });
  }

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    throw new Error(`memory_get is not supported by supabase backend for path "${params.relPath}"`);
  }

  status(): MemoryProviderStatus {
    return {
      backend: "supabase",
      provider: "supabase",
      custom: {
        searchRpc: this.config.searchRpc,
        scratchRpc: this.config.scratchRpc,
      },
    };
  }

  async probeEmbeddingAvailability(): Promise<MemoryEmbeddingProbeResult> {
    return { ok: true };
  }

  async probeVectorAvailability(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 2 });
  }

  private async withTenantSession<T>(run: (tx: SqlClient) => Promise<T>): Promise<T> {
    return await this.sql.begin(async (tx) => {
      const tenantId = this.config.tenantId?.trim();
      if (tenantId) {
        await tx`set local app.current_tenant = ${tenantId}`;
      }
      return await run(tx as SqlClient);
    });
  }

  private async callSearchRpc(
    tx: SqlClient,
    params: {
      query: string;
      maxResults: number;
      minScore: number;
      tenantId?: string;
    },
  ): Promise<SearchRow[]> {
    if (params.tenantId) {
      try {
        return await tx.unsafe<SearchRow[]>(
          `select * from ${this.searchRpcSqlName}(p_query => $1, p_max_results => $2, p_min_score => $3, p_tenant_context => $4)`,
          [params.query, params.maxResults, params.minScore, params.tenantId],
        );
      } catch {
        // Fall back to positional signature for legacy deployments.
      }
    }
    return await tx.unsafe<SearchRow[]>(
      `select * from ${this.searchRpcSqlName}($1, $2, $3)`,
      [params.query, params.maxResults, params.minScore],
    );
  }

  private async callScratchRpc(
    tx: SqlClient,
    params: { payload: string; tenantId?: string },
  ): Promise<void> {
    if (params.tenantId) {
      try {
        await tx.unsafe(`select ${this.scratchRpcSqlName}(p_entry => $1, p_tenant_context => $2)`, [
          params.payload,
          params.tenantId,
        ]);
        return;
      } catch {
        // Fall back to positional signature for legacy deployments.
      }
    }
    await tx.unsafe(`select ${this.scratchRpcSqlName}($1)`, [params.payload]);
  }
}
