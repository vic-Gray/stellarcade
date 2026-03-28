# reward-distribution

## Public Methods

### `init`
Initialise the contract.  Can only be called once.  * `admin`             — privileged account for campaign management. * `treasury_contract` — address of the on-chain treasury holding campaign budgets (stored for composability). * `balance_contract`  — address of the token / balance contract used to settle claims.

```rust
pub fn init(env: Env, admin: Address, treasury_contract: Address, balance_contract: Address) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `treasury_contract` | `Address` |
| `balance_contract` | `Address` |

#### Return Type

`Result<(), Error>`

### `define_reward_campaign`
Define a new reward campaign.  Admin only.  * `campaign_id` — unique numeric identifier. * `rules_hash`  — SHA-256 of the off-chain eligibility rules document. * `budget`      — maximum tokens distributable; must be > 0.

```rust
pub fn define_reward_campaign(env: Env, campaign_id: u32, rules_hash: BytesN<32>, budget: i128) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `campaign_id` | `u32` |
| `rules_hash` | `BytesN<32>` |
| `budget` | `i128` |

#### Return Type

`Result<(), Error>`

### `accrue_reward`
Record a pending reward for `user`.  Admin only.  The call is additive — repeated calls accumulate until the user claims. The campaign's `remaining` balance is decremented immediately to uphold the invariant `Σ accrued ≤ budget`.

```rust
pub fn accrue_reward(env: Env, user: Address, campaign_id: u32, amount: i128) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |
| `campaign_id` | `u32` |
| `amount` | `i128` |

#### Return Type

`Result<(), Error>`

### `claim_reward`
Claim all accrued rewards for `user` in a campaign.  * The user must authenticate. * The reentrancy guard (`Claimed` flag) is set **before** any external settlement call. * Returns the amount of tokens claimed.

```rust
pub fn claim_reward(env: Env, user: Address, campaign_id: u32) -> Result<i128, Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |
| `campaign_id` | `u32` |

#### Return Type

`Result<i128, Error>`

### `campaign_state`
Return the current state of a campaign, or `None` if it does not exist.

```rust
pub fn campaign_state(env: Env, campaign_id: u32) -> Option<CampaignData>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `campaign_id` | `u32` |

#### Return Type

`Option<CampaignData>`

### `accrued_for`
Return the unclaimed accrued balance for `user` in a campaign.

```rust
pub fn accrued_for(env: Env, user: Address, campaign_id: u32) -> i128
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |
| `campaign_id` | `u32` |

#### Return Type

`i128`

### `has_claimed`
Return whether `user` has already claimed from `campaign_id`.

```rust
pub fn has_claimed(env: Env, user: Address, campaign_id: u32) -> bool
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |
| `campaign_id` | `u32` |

#### Return Type

`bool`

### `preview_batch`
Preview a proposed distribution batch without mutating state. Mirrors execution-time validation exactly. Returns `Err(BatchInvalid)` only when `entries` is empty; otherwise always returns a `BatchPreview` with `would_succeed` and an optional `failure_reason`.

```rust
pub fn preview_batch(env: Env, campaign_id: u32, entries: Vec<BatchEntry>) -> Result<BatchPreview, Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `campaign_id` | `u32` |
| `entries` | `Vec<BatchEntry>` |

#### Return Type

`Result<BatchPreview, Error>`

#### BatchEntry

| Field | Type | Description |
|-------|------|-------------|
| `user` | `Address` | Recipient address |
| `amount` | `i128` | Amount to accrue (must be > 0) |

#### BatchPreview

| Field | Type | Description |
|-------|------|-------------|
| `campaign_id` | `u32` | Campaign targeted |
| `entry_count` | `u32` | Number of entries |
| `total_amount` | `i128` | Sum of all entry amounts |
| `remaining_after` | `i128` | Budget remaining if batch applied |
| `would_succeed` | `bool` | Whether batch would succeed |
| `failure_reason` | `Option<Error>` | First error that would be raised |

### `distribution_status`
Return a compact status snapshot for a campaign. Never panics — returns `exists: false` for unknown campaign IDs. Missing batch IDs return a zeroed snapshot; callers should check `exists` before interpreting other fields.

```rust
pub fn distribution_status(env: Env, campaign_id: u32) -> DistributionStatus
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `campaign_id` | `u32` |

#### Return Type

`DistributionStatus`

#### DistributionStatus

| Field | Type | Description |
|-------|------|-------------|
| `campaign_id` | `u32` | Campaign queried |
| `status` | `CampaignStatus` | Active / Exhausted / Closed |
| `budget` | `i128` | Total budget allocated |
| `remaining` | `i128` | Remaining distributable balance |
| `distributed` | `i128` | Tokens already accrued (budget − remaining) |
| `exists` | `bool` | False when campaign ID is unknown |
