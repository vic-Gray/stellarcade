/**
 * Jest manual mock for @stellar/stellar-sdk.
 *
 * Provides deterministic, network-free replacements for the SDK primitives
 * used by SorobanContractClient so unit tests never hit a real RPC endpoint.
 *
 * Placed in tests/__mocks__/ and referenced via moduleNameMapper in vi.config.ts.
 *
 * Usage — in a test file:
 * ```ts
 * vi.mock("@stellar/stellar-sdk", async () => await import("../__mocks__/stellar-sdk"));
 * ```
 */

export const Networks = {
  TESTNET: "Test SDF Network ; September 2015",
  PUBLIC: "Public Global Stellar Network ; September 2015",
  FUTURENET: "Test SDF Future Network ; October 2022",
};

// ── ScVal helpers ─────────────────────────────────────────────────────────────

export const xdr = {
  ScVal: {
    scvBytes: (buf: Buffer) => ({ type: "bytes", value: buf }),
  },
};

export function nativeToScVal(value: unknown, _opts?: unknown): unknown {
  return { type: "native", value };
}

export function scValToNative(scVal: unknown): unknown {
  // In the mock, scVal is whatever we set as `retval` in the simulate result.
  // Use `"value" in obj` to distinguish explicit undefined from missing key.
  if (scVal !== null && typeof scVal === "object" && "value" in (scVal as object)) {
    return (scVal as { value: unknown }).value;
  }
  return scVal;
}

// ── Account mock ──────────────────────────────────────────────────────────────

export class Account {
  constructor(
    public readonly accountId: string,
    public readonly sequence: string,
  ) {}

  sequenceNumber(): string {
    return this.sequence;
  }

  incrementSequenceNumber(): void {
    // no-op for tests
  }
}

// ── Transaction builder mock ──────────────────────────────────────────────────

export class TransactionBuilder {
  private ops: unknown[] = [];

  constructor(
    private readonly _source: Account,
    private readonly _opts: unknown,
  ) {}

  addOperation(op: unknown): this {
    this.ops.push(op);
    return this;
  }

  setTimeout(_timeout: number): this {
    return this;
  }

  build() {
    return {
      toXDR: () => "mock-tx-xdr",
      toEnvelope: () => ({ toXDR: () => Buffer.alloc(0) }),
    };
  }

  static fromXDR(xdr: string, _passphrase: string) {
    return { xdrStr: xdr };
  }
}

// ── Contract mock ─────────────────────────────────────────────────────────────

export class Contract {
  constructor(public readonly contractId: string) {}

  call(method: string, ...args: unknown[]): unknown {
    return { type: "invokeContractArgs", contractId: this.contractId, method, args };
  }
}

// ── SorobanRpc mock namespace ─────────────────────────────────────────────────

export const SorobanRpc = {
  Server: class MockSorobanRpcServer {
    private _getAccountResult: unknown;
    private _simulateResult: unknown;
    private _sendResult: unknown;
    private _getTransactionResult: unknown;

    /** Set the mock result for getAccount. */
    __setGetAccountResult(result: unknown): void {
      this._getAccountResult = result;
    }
    /** Set the mock result for simulateTransaction. */
    __setSimulateResult(result: unknown): void {
      this._simulateResult = result;
    }
    /** Set the mock result for sendTransaction. */
    __setSendResult(result: unknown): void {
      this._sendResult = result;
    }
    /** Set the mock result for getTransaction. */
    __setGetTransactionResult(result: unknown): void {
      this._getTransactionResult = result;
    }

    async getAccount(_address: string): Promise<Account> {
      if (this._getAccountResult !== undefined) {
        if (this._getAccountResult instanceof Error) throw this._getAccountResult;
        return this._getAccountResult as Account;
      }
      return new Account(
        "GAI3JDDFAFQ4ORMVB62FHTWQQDJROZNNI22H6ZDT7DVQPZJXDZVXDDJF",
        "0",
      );
    }

    async simulateTransaction(_tx: unknown): Promise<unknown> {
      if (this._simulateResult !== undefined) {
        if (this._simulateResult instanceof Error) throw this._simulateResult;
        return this._simulateResult;
      }
      // Default: successful simulation with no return value.
      return {
        result: { retval: { type: "native", value: undefined } },
        transactionData: {},
        minResourceFee: "100",
      };
    }

    async sendTransaction(_tx: unknown): Promise<unknown> {
      if (this._sendResult !== undefined) {
        if (this._sendResult instanceof Error) throw this._sendResult;
        return this._sendResult;
      }
      return { hash: "mock-tx-hash-abc123", status: "PENDING" };
    }

    async getTransaction(_hash: string): Promise<unknown> {
      if (this._getTransactionResult !== undefined) {
        if (this._getTransactionResult instanceof Error) throw this._getTransactionResult;
        return this._getTransactionResult;
      }
      return {
        status: "SUCCESS",
        returnValue: { type: "native", value: undefined },
        ledger: 12345,
      };
    }
  },

  Api: {
    isSimulationError: (result: unknown): boolean => {
      return (
        result !== null &&
        typeof result === "object" &&
        "error" in (result as object) &&
        typeof (result as { error: unknown }).error === "string"
      );
    },

    GetTransactionStatus: {
      SUCCESS: "SUCCESS",
      FAILED: "FAILED",
      NOT_FOUND: "NOT_FOUND",
    },
  },

  assembleTransaction: (tx: unknown, _simResult: unknown) => ({
    build: () => ({
      toXDR: () => "mock-assembled-tx-xdr",
    }),
  }),
};
