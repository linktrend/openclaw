import fs from "node:fs/promises";
import path from "node:path";

const DPR_ID_RE = /^INT-MNG-\d{6}-[A-Z0-9]{4}-[A-Z0-9-]+$/i;

export type LinktrendIdentity = {
  dprId?: string;
  authorizedTenantId?: string;
};

export class CriticalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CriticalConfigurationError";
  }
}

function normalizeLabel(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function parseLinktrendIdentityMarkdown(content: string): LinktrendIdentity {
  const parsed: LinktrendIdentity = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim().replace(/^\s*-\s*/, "");
    const idx = line.indexOf(":");
    if (idx < 0) {
      continue;
    }
    const label = normalizeLabel(line.slice(0, idx).replace(/[*`]/g, ""));
    const value = line
      .slice(idx + 1)
      .replace(/^[*_`]+|[*_`]+$/g, "")
      .trim();
    if (!value) {
      continue;
    }
    if (label === "dpr_id" || label === "dprid") {
      parsed.dprId = value;
      continue;
    }
    if (label === "tenant_id" || label === "authorized_tenant" || label === "authorized_tenant_id") {
      parsed.authorizedTenantId = value;
    }
  }
  return parsed;
}

export function isValidDprId(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  return DPR_ID_RE.test(value.trim());
}

export async function loadLinktrendIdentityFromWorkspace(
  workspaceDir: string,
): Promise<LinktrendIdentity> {
  const identityPath = path.join(workspaceDir, "IDENTITY.md");
  let content: string;
  try {
    content = await fs.readFile(identityPath, "utf-8");
  } catch {
    throw new CriticalConfigurationError(
      `Missing required identity file: ${identityPath}. Agent cannot start without IDENTITY.md.`,
    );
  }
  if (!content.trim()) {
    throw new CriticalConfigurationError(
      `IDENTITY.md is empty at ${identityPath}. Agent cannot start.`,
    );
  }
  const parsed = parseLinktrendIdentityMarkdown(content);
  if (!parsed.authorizedTenantId) {
    throw new CriticalConfigurationError(
      `IDENTITY.md at ${identityPath} is missing authorized_tenant_id/tenant_id.`,
    );
  }
  return parsed;
}
