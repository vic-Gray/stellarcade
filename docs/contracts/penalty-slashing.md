# penalty-slashing

## Public Methods

### `init`
Initialize with admin and treasury contract/address holding slashed funds.

```rust
pub fn init(env: Env, admin: Address, treasury_contract: Address)
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `treasury_contract` | `Address` |

### `define_violation`
Define or update a violation rule. Admin-only.

```rust
pub fn define_violation(env: Env, code: Symbol, penalty_rule: PenaltyRule)
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `code` | `Symbol` |
| `penalty_rule` | `PenaltyRule` |

### `apply_penalty`
Apply a penalty to an account. Admin-only. Slashes tokens from `account` and transfers them to the treasury.

```rust
pub fn apply_penalty(env: Env, account: Address, code: Symbol, context_hash: Symbol, token_address: Address) -> u64
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `account` | `Address` |
| `code` | `Symbol` |
| `context_hash` | `Symbol` |
| `token_address` | `Address` |

#### Return Type

`u64`

### `appeal_penalty`
File an appeal for a penalty. Only the penalized account may appeal.

```rust
pub fn appeal_penalty(env: Env, penalty_id: u64)
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `penalty_id` | `u64` |

### `penalty_state`
Read current state of a penalty record.

```rust
pub fn penalty_state(env: Env, penalty_id: u64) -> PenaltyRecord
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `penalty_id` | `u64` |

#### Return Type

`PenaltyRecord`

### `preview_slash`
Preview a proposed slash against the account balance without mutating state.

```rust
pub fn preview_slash(env: Env, account: Address, slash_amount: i128, token_address: Address) -> SlashPreview
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `account` | `Address` |
| `slash_amount` | `i128` |
| `token_address` | `Address` |

#### Return Type

`SlashPreview`

### `penalty_summary`
Summarize the slashing history and latest penalty state for an account.

```rust
pub fn penalty_summary(env: Env, account: Address) -> PenaltySummary
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `account` | `Address` |

#### Return Type

`PenaltySummary`

