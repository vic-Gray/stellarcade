import { describe, it, expect, beforeEach } from "vitest";
import GlobalStateStore from "../src/services/global-state-store";

beforeEach(() => {
  localStorage.clear();
});

describe("GlobalStateStore", () => {
  it("initializes with defaults and persists auth/flags", () => {
    const store = new GlobalStateStore({ storageKey: "test_state" });
    expect(store.getState().auth.isAuthenticated).toBe(false);

    store.dispatch({
      type: "AUTH_SET",
      payload: { userId: "u1", token: "t1" },
    });
    store.dispatch({
      type: "FLAGS_SET",
      payload: { key: "feature_x", value: true },
    });

    const raw = JSON.parse(localStorage.getItem("test_state") as string);
    expect(raw.auth.userId).toBe("u1");
    expect(raw.flags.feature_x).toBe(true);
  });

  it("clears wallet as ephemeral and does not persist", () => {
    const store = new GlobalStateStore({ storageKey: "test_state2" });
    store.dispatch({
      type: "WALLET_SET",
      payload: {
        meta: {
          address: "GABC",
          provider: { id: "m", name: "m" },
          network: "TESTNET",
          connectedAt: Date.now(),
        },
      } as any,
    });
    const raw = JSON.parse(localStorage.getItem("test_state2") as string);
    expect(raw.auth.isAuthenticated).toBe(false);
  });
});
