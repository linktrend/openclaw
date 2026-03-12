import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CriticalConfigurationError,
  isValidDprId,
  loadLinktrendIdentityFromWorkspace,
  parseLinktrendIdentityMarkdown,
} from "./identity.js";

describe("parseLinktrendIdentityMarkdown", () => {
  it("extracts dpr_id and tenant_id fields", () => {
    const parsed = parseLinktrendIdentityMarkdown(`
# IDENTITY.md
- dpr_id: INT-MNG-260311-AB12-LINKTREND
- tenant_id: 4f7b0ae5-7f22-40bf-9f56-7ad8a4f7b3e9
`);
    expect(parsed.dprId).toBe("INT-MNG-260311-AB12-LINKTREND");
    expect(parsed.authorizedTenantId).toBe("4f7b0ae5-7f22-40bf-9f56-7ad8a4f7b3e9");
  });
});

describe("isValidDprId", () => {
  it("validates DPR V3 id format", () => {
    expect(isValidDprId("INT-MNG-260311-AB12-LINKTREND")).toBe(true);
    expect(isValidDprId("bad-id")).toBe(false);
  });
});

describe("loadLinktrendIdentityFromWorkspace", () => {
  it("hard-fails when authorized tenant is missing", async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "linktrend-identity-"));
    await fs.writeFile(
      path.join(workspace, "IDENTITY.md"),
      "dpr_id: INT-MNG-260311-AB12-LINKTREND\n",
      "utf8",
    );
    await expect(loadLinktrendIdentityFromWorkspace(workspace)).rejects.toBeInstanceOf(
      CriticalConfigurationError,
    );
  });
});
