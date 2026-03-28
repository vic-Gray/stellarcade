# Reward Distribution Contract

Soroban smart contract that manages reward campaigns for StellarCade.
Admin defines campaigns with a budget, accrues rewards to users off-chain, and users claim their rewards on-chain.

---

## Methods

### `init(admin, treasury_contract, balance_contract)`

Initialise the contract.  Must be called exactly once.

| Parameter           | Type      | Description                                        |
|---------------------|-----------|----------------------------------------------------|
| `admin`             | `Address` | Privileged account for campaign management         |
| `treasury_contract` | `Address` | Treasury address holding campaign budgets          |
| `balance_contract`  | `Address` | Token/balance contract used to settle claims       |

Panics with `AlreadyInitialized` if called more than once.

---

### `define_reward_campaign(campaign_id, rules_hash, budget)`

Define a new campaign.  Admin only.

| Parameter     | Type          | Description                                        |
|---------------|---------------|----------------------------------------------------|
| `campaign_id` | `u32`         | Unique numeric identifier for the campaign         |
| `rules_hash`  | `BytesN<32>`  | SHA-256 of the off-chain eligibility rules document|
| `budget`      | `i128`        | Maximum tokens distributable (must be > 0)         |

Panics with `CampaignAlreadyExists` if `campaign_id` is already in use.
Panics with `InvalidAmount` if `budget ≤ 0`.

---

### `accrue_reward(user, campaign_id, amount)`

Record a pending reward for a user.  Admin only.

| Parameter     | Type      | Description                                        |
|---------------|-----------|----------------------------------------------------|
| `user`        | `Address` | Recipient of the reward                            |
| `campaign_id` | `u32`     | Campaign to credit                                 |
| `amount`      | `i128`    | Tokens to accrue (must be > 0)                     |

Accrual is additive — repeated calls accumulate until the user claims.
The campaign's `remaining` balance is decremented immediately so the invariant `accrued_total ≤ budget` always holds.

Panics with `CampaignExhausted` if `amount > remaining`.
Panics with `CampaignNotActive` if the campaign is already `Exhausted` or `Closed`.

---

### `claim_reward(user, campaign_id) → i128`

Claim all accrued rewards for the caller.  The user must authenticate.

Returns the amount of tokens claimed.

Panics with `NothingToClaim` if there is no pending balance.
Panics with `AlreadyClaimed` if the user has already claimed from this campaign.

The reentrancy guard (`Claimed` flag) is set **before** any external settlement call.

---

### `campaign_state(campaign_id) → Option<CampaignData>`

Return the current snapshot of a campaign, or `None` if it does not exist.

```rust
pub struct CampaignData {
    pub rules_hash: BytesN<32>,
    pub budget:     i128,
    pub remaining:  i128,
    pub status:     CampaignStatus,  // Active | Exhausted | Closed
}
```

---

### `accrued_for(user, campaign_id) → i128`

Return the unclaimed accrued balance for a user in a campaign.

---

### `has_claimed(user, campaign_id) → bool`

Return whether a user has already executed a successful claim from a campaign.

---

### `preview_batch(campaign_id, entries) → BatchPreview`

Preview a proposed distribution batch without mutating any state.

Mirrors execution-time validation exactly — the result reflects what would happen if the batch were submitted right now.  Always returns a `BatchPreview`; only returns `Err(BatchInvalid)` when `entries` is empty.

```rust
pub struct BatchEntry {
    pub user:   Address,
    pub amount: i128,
}

pub struct BatchPreview {
    pub campaign_id:     u32,
    pub entry_count:     u32,
    pub total_amount:    i128,
    pub remaining_after: i128,  // budget remaining if batch applied
    pub would_succeed:   bool,
    pub failure_reason:  Option<Error>,  // first error that would be raised
}
```

| Scenario | `would_succeed` | `failure_reason` |
|---|---|---|
| Valid batch | `true` | `None` |
| Unknown campaign | `false` | `CampaignNotFound` |
| Campaign not active | `false` | `CampaignNotActive` |
| Batch exceeds remaining | `false` | `CampaignExhausted` |
| Any entry amount ≤ 0 | `false` | `InvalidAmount` |
| Empty entries | `Err(BatchInvalid)` | — |

---

### `distribution_status(campaign_id) → DistributionStatus`

Return a compact status snapshot for a campaign.  Never panics — returns `exists: false` for unknown campaign IDs.

```rust
pub struct DistributionStatus {
    pub campaign_id:  u32,
    pub status:       CampaignStatus,
    pub budget:       i128,
    pub remaining:    i128,
    pub distributed:  i128,  // budget − remaining
    pub exists:       bool,
}
```

Missing batch IDs return a zeroed snapshot with `exists: false`.  Callers should check `exists` before interpreting any other field.

---

## Events

| Topic symbol | When emitted            | Data payload                                             |
|--------------|-------------------------|----------------------------------------------------------|
| `Init`       | After `init` succeeds   | `(admin, treasury_contract, balance_contract)`           |
| `CmpDefine`  | Campaign defined        | `(budget,)`  — topic also includes `campaign_id`         |
| `Accrued`    | Reward accrued          | `(user, amount, new_total)` — topic includes `campaign_id` |
| `Claimed`    | Claim processed         | `(user, amount, balance_contract)` — topic includes `campaign_id` |

---

## Storage

| Key                          | Storage type | TTL policy              | Description                              |
|------------------------------|--------------|-------------------------|------------------------------------------|
| `Admin`                      | instance     | contract lifetime       | Admin address                            |
| `TreasuryContract`           | instance     | contract lifetime       | Treasury address                         |
| `BalanceContract`            | instance     | contract lifetime       | Token settlement contract                |
| `Campaign(campaign_id)`      | persistent   | 30-day rolling bump     | `CampaignData` struct                    |
| `Accrued(campaign_id, user)` | persistent   | 30-day rolling bump     | Unclaimed reward balance (i128)          |
| `Claimed(campaign_id, user)` | persistent   | 30-day rolling bump     | Reentrancy guard / duplicate-claim guard |

Persistent entries are bumped to ~30 days (`518_400` ledgers at 5 s/ledger) on every write and extended when the remaining TTL drops below `517_500` ledgers.

---

## Invariants

1. `campaign.remaining = campaign.budget − Σ accrued_for(user, campaign_id)` for all users.
2. `campaign.remaining ≥ 0` at all times.
3. A user can call `claim_reward` at most once per campaign (enforced by the `Claimed` flag set atomically before any settlement).
4. `campaign.status == Exhausted` iff `campaign.remaining == 0`.
5. Accrual on a non-`Active` campaign is rejected immediately.

---

## Integration Assumptions

- **Admin**: A trusted off-chain service (or governance contract) calls `accrue_reward` after verifying eligibility per the `rules_hash` document.
- **treasury_contract / balance_contract**: Stored for composability with the broader StellarCade platform.  In a production deployment `claim_reward` would call `balance_contract.transfer(user, accrued)` via a cross-contract invocation.
- **Access Control**: Role-based access is enforced implicitly — only the stored `admin` address may call privileged functions.  This contract can be extended to delegate to an external `access-control` contract if multi-operator support is required.
- **Dependent contracts**: `prize-pool` and `balance` contracts must be deployed and their addresses known before `init` is called.

---

## Building & Testing

```bash
# From this directory
cargo build --target wasm32-unknown-unknown --release

# Run all tests
cargo test

# Lint (must pass cleanly in CI)
cargo clippy -- -D warnings

# Format before committing
cargo fmt
```
