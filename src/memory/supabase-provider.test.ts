import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ kind: "set" | "unsafe"; text: string; values?: unknown[] }>,
}));

vi.mock("postgres", () => {
  const createTagged = () => {
    const fn = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      state.calls.push({ kind: "set", text: strings.join("?"), values });
      return [];
    }) as unknown as ((strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>);
    return Object.assign(fn, {
      unsafe: vi.fn(async (text: string, values?: unknown[]) => {
        state.calls.push({ kind: "unsafe", text, values });
        if (text.includes("search_lessons")) {
          return [
            {
              path: "MEMORY.md",
              start_line: 3,
              end_line: 4,
              score: 0.9,
              snippet: "hello",
              source: "memory",
            },
          ];
        }
        return [];
      }),
    });
  };

  const factory = vi.fn(() => {
    const tx = createTagged();
    return {
      begin: async (run: (tx: typeof tx) => Promise<unknown>) => await run(tx),
      end: async () => {},
    };
  });
  return { default: factory };
});

describe("SupabaseMemoryProvider", () => {
  beforeEach(() => {
    state.calls.length = 0;
  });

  it("sets app.current_tenant before RPC queries", async () => {
    const { SupabaseMemoryProvider } = await import("./supabase-provider.js");
    const provider = new SupabaseMemoryProvider({
      connectionString: "postgres://localhost/test",
      tenantId: "tenant-uuid",
      searchRpc: "shared_memory.search_lessons",
      scratchRpc: "scratch_memory.log_entry",
    });
    const result = await provider.search("where is decision", { maxResults: 2 });
    expect(result[0]?.path).toBe("MEMORY.md");
    expect(state.calls[0]?.kind).toBe("set");
    expect(state.calls[0]?.text.toLowerCase()).toContain("set local app.current_tenant");
    const searchCall = state.calls.find((entry) => entry.text.includes("search_lessons"));
    const scratchCall = state.calls.find((entry) => entry.text.includes("log_entry"));
    expect(searchCall?.text).toContain("p_tenant_context");
    expect(scratchCall?.text).toContain("p_tenant_context");
    expect(state.calls.indexOf(searchCall as (typeof state.calls)[number])).toBeGreaterThan(0);
    expect(state.calls.indexOf(scratchCall as (typeof state.calls)[number])).toBeGreaterThan(
      state.calls.indexOf(searchCall as (typeof state.calls)[number]),
    );
  });
});
