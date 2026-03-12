import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("linktrend/gsm");
const cache = new Map<string, Promise<SecretObject | null>>();

export type SecretObject = {
  value: string;
  source: "env" | "gsm";
  ventureLabelVerified: boolean;
};

function normalizeEnvVar(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

export function resolveLinktrendSecretResourceName(envVarName: string): string {
  const resource = normalizeEnvVar(envVarName);
  return `LINKTREND_AIOS_PROD_${resource}`;
}

function resolveProjectId(env: NodeJS.ProcessEnv): string | undefined {
  return (
    env.LINKTREND_GSM_PROJECT_ID?.trim() ||
    env.GOOGLE_CLOUD_PROJECT?.trim() ||
    env.GCLOUD_PROJECT?.trim()
  );
}

export async function resolveEnvVarViaGoogleSecretManager(params: {
  envVarName: string;
  env?: NodeJS.ProcessEnv;
}): Promise<SecretObject | null> {
  const env = params.env ?? process.env;
  const envVarName = normalizeEnvVar(params.envVarName);
  const existing = env[envVarName]?.trim();
  if (existing) {
    log.debug(`secret resolved from env: ${envVarName}`);
    return { value: existing, source: "env", ventureLabelVerified: false };
  }

  const projectId = resolveProjectId(env);
  if (!projectId) {
    return null;
  }

  const secretId = resolveLinktrendSecretResourceName(envVarName);
  const cacheKey = `${projectId}:${secretId}`;
  const pending =
    cache.get(cacheKey) ??
    (async () => {
      try {
        const client = new SecretManagerServiceClient();
        const [secret] = await client.getSecret({
          name: `projects/${projectId}/secrets/${secretId}`,
        });
        const venture = secret.labels?.venture?.trim().toLowerCase();
        if (venture !== "linktrend") {
          log.warn(`Venture Label Mismatch for secret ${secretId}: venture=${venture ?? "missing"}`);
          return null;
        }
        const [version] = await client.accessSecretVersion({
          name: `projects/${projectId}/secrets/${secretId}/versions/latest`,
        });
        const payload = version.payload?.data?.toString("utf8")?.trim();
        if (!payload) {
          return null;
        }
        env[envVarName] = payload;
        log.debug(`secret resolved from gsm: ${secretId}`);
        return { value: payload, source: "gsm", ventureLabelVerified: true } satisfies SecretObject;
      } catch {
        return null;
      }
    })();
  cache.set(cacheKey, pending);
  return await pending;
}

export function resetGsmSecretCacheForTest(): void {
  cache.clear();
}
