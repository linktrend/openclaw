import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { enforceTenantGate, TenantGateError } from "./security-gate.js";

describe("enforceTenantGate", () => {
  it("halts when mission tenant mismatches IDENTITY.md tenant", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "linktrend-tenant-gate-"));
    await fs.writeFile(
      path.join(workspace, "IDENTITY.md"),
      [
        "# IDENTITY.md",
        "dpr_id: INT-MNG-260311-AB12-LINKTREND",
        "tenant_id: tenant-a",
      ].join("\n"),
      "utf-8",
    );
    await expect(
      enforceTenantGate({
        workspaceDir: workspace,
        mission: { tenant_id: "tenant-b" },
        sessionKey: "agent:main",
        runId: "run-1",
      }),
    ).rejects.toBeInstanceOf(TenantGateError);
  });
});
