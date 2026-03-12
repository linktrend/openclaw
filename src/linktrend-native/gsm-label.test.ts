import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  warnings: [] as string[],
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    debug: vi.fn(),
    warn: (message: string) => {
      state.warnings.push(message);
    },
    info: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    raw: vi.fn(),
    child: vi.fn(),
    subsystem: "linktrend/gsm",
    isEnabled: vi.fn(),
  }),
}));

vi.mock("@google-cloud/secret-manager", () => {
  class SecretManagerServiceClient {
    async getSecret() {
      return [
        {
          labels: { venture: "other_client" },
        },
      ];
    }

    async accessSecretVersion() {
      return [
        {
          payload: {
            data: Buffer.from("should-not-be-used", "utf8"),
          },
        },
      ];
    }
  }
  return { SecretManagerServiceClient };
});

describe("GSM venture label mismatch", () => {
  it("returns null and logs Venture Label Mismatch warning", async () => {
    const { resolveEnvVarViaGoogleSecretManager, resetGsmSecretCacheForTest } = await import(
      "./google-secret-manager.js"
    );
    resetGsmSecretCacheForTest();
    state.warnings.length = 0;

    const resolved = await resolveEnvVarViaGoogleSecretManager({
      envVarName: "TEST_KEY",
      env: { LINKTREND_GSM_PROJECT_ID: "proj-x" },
    });

    expect(resolved).toBeNull();
    expect(state.warnings.some((entry) => entry.includes("Venture Label Mismatch"))).toBe(true);
  });
});
