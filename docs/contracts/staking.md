# staking

## Public Methods

### `init`
Initialise the staking contract.

```rust
pub fn init(env: Env, admin: Address, staking_token: Address, reward_token: Address) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `staking_token` | `Address` |
| `reward_token` | `Address` |

#### Return Type

`Result<(), Error>`

### `set_reward_rate`
Set the reward rate (admin only).

```rust
pub fn set_reward_rate(env: Env, admin: Address, rate: i128) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `rate` | `i128` |

#### Return Type

`Result<(), Error>`

### `stake`
Stake tokens to earn rewards.

```rust
pub fn stake(env: Env, user: Address, amount: i128) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |
| `amount` | `i128` |

#### Return Type

`Result<(), Error>`

### `unstake`
Withdraw staked tokens and claim rewards.

```rust
pub fn unstake(env: Env, user: Address, amount: i128) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |
| `amount` | `i128` |

#### Return Type

`Result<(), Error>`

### `claim_rewards`
Claim accrued rewards.

```rust
pub fn claim_rewards(env: Env, user: Address) -> Result<i128, Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |

#### Return Type

`Result<i128, Error>`

### `position_of`
View user position.

```rust
pub fn position_of(env: Env, user: Address) -> UserPosition
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |

#### Return Type

`UserPosition`

### `preview_rewards`
Preview pending rewards and current claimability without mutating state.

```rust
pub fn preview_rewards(env: Env, user: Address) -> Result<RewardPreview, Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |

#### Return Type

`Result<RewardPreview, Error>`

### `next_claim`
Return deterministic next-claim eligibility metadata for a staker.

```rust
pub fn next_claim(env: Env, user: Address) -> Result<ClaimEligibility, Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `user` | `Address` |

#### Return Type

`Result<ClaimEligibility, Error>`

