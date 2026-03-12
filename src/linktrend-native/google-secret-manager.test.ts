import { describe, expect, it } from "vitest";
import { beforeEach, vi } from "vitest";
import {
  resolveEnvVarViaGoogleSecretManager,
  resolveLinktrendSecretResourceName,
  resetGsmSecretCacheForTest,
} from "./google-secret-manager.js";

const mockState = vi.hoisted(() => ({
  ventureLabel: "linktrend",
  secretValue: "gsm-secret-value",
}));

vi.mock("@google-cloud/secret-manager", () => {
  class SecretManagerServiceClient {
    async getSecret() {
      return [
        {
          labels: { venture: mockState.ventureLabel },
        },
      ];
    }

    async accessSecretVersion() {
      return [
        {
          payload: {
            data: Buffer.from(mockState.secretValue, "utf8"),
          },
        },
      ];
    }
  }
  return { SecretManagerServiceClient };
});

beforeEach(() => {
  resetGsmSecretCacheForTest();
  mockState.ventureLabel = "linktrend";
  mockState.secretValue = "gsm-secret-value";
});

describe("resolveLinktrendSecretResourceName", () => {
  it("builds LINKTREND_AIOS_PROD secret names from env var keys", () => {
    expect(resolveLinktrendSecretResourceName("OPENROUTER_API_KEY")).toBe(
      "LINKTREND_AIOS_PROD_OPENROUTER_API_KEY",
    );
  });

  it("resolves missing env values from GSM when venture label matches", async () => {
    const env: NodeJS.ProcessEnv = {
      LINKTREND_GSM_PROJECT_ID: "proj-1",
    };
    const resolved = await resolveEnvVarViaGoogleSecretManager({
      envVarName: "OPENROUTER_API_KEY",
      env,
    });
    expect(resolved?.value).toBe("gsm-secret-value");
    expect(resolved?.source).toBe("gsm");
    expect(resolved?.ventureLabelVerified).toBe(true);
    expect(env.OPENROUTER_API_KEY).toBe("gsm-secret-value");
  });

  it("rejects GSM secret when venture label is not linktrend", async () => {
    mockState.ventureLabel = "other";
    const env: NodeJS.ProcessEnv = {
      LINKTREND_GSM_PROJECT_ID: "proj-1",
    };
    const resolved = await resolveEnvVarViaGoogleSecretManager({
      envVarName: "OPENROUTER_API_KEY",
      env,
    });
    expect(resolved).toBeNull();
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
  });
});
