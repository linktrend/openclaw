import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  isValidDprId,
  loadLinktrendIdentityFromWorkspace,
  type LinktrendIdentity,
} from "./identity.js";

const log = createSubsystemLogger("linktrend-security");

export type MissionIdentityPayload = {
  tenant_id?: string;
  tenantId?: string;
};

export class TenantGateError extends Error {
  constructor(
    message: string,
    public readonly details: {
      dprId?: string;
      authorizedTenantId?: string;
      missionTenantId?: string;
      sessionKey?: string;
      runId?: string;
    },
  ) {
    super(message);
    this.name = "TenantGateError";
  }
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveMissionTenantId(mission?: MissionIdentityPayload): string | undefined {
  return normalizeText(mission?.tenant_id) ?? normalizeText(mission?.tenantId);
}

function resolveDprId(identity: LinktrendIdentity): string {
  const dprId = normalizeText(identity.dprId);
  if (isValidDprId(dprId)) {
    return dprId;
  }
  return "INT-MNG-000000-UNKN-LINKTREND";
}

export async function enforceTenantGate(params: {
  workspaceDir: string;
  mission?: MissionIdentityPayload;
  sessionKey?: string;
  runId?: string;
}): Promise<{ dprId: string; authorizedTenantId?: string; missionTenantId?: string }> {
  const identity = await loadLinktrendIdentityFromWorkspace(params.workspaceDir);
  const dprId = resolveDprId(identity);
  const authorizedTenantId = normalizeText(identity.authorizedTenantId);
  const missionTenantId = resolveMissionTenantId(params.mission);

  if (authorizedTenantId && missionTenantId && authorizedTenantId !== missionTenantId) {
    const details = {
      event: "security_exception",
      action: "tenant_gate_halt",
      actor_dpr_id: dprId,
      authorized_tenant_id: authorizedTenantId,
      mission_tenant_id: missionTenantId,
      session_key: params.sessionKey,
      run_id: params.runId,
    };
    log.error(JSON.stringify(details));
    throw new TenantGateError("Mission tenant mismatch. Agent run halted by tenant gate.", {
      dprId,
      authorizedTenantId,
      missionTenantId,
      sessionKey: params.sessionKey,
      runId: params.runId,
    });
  }

  return { dprId, authorizedTenantId, missionTenantId };
}
