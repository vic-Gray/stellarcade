# tournament-system

## Public Methods

### `init`
Initialize the tournament system. May only be called once.

```rust
pub fn init(env: Env, admin: Address, fee_contract: Address, reward_contract: Address) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `fee_contract` | `Address` |
| `reward_contract` | `Address` |

#### Return Type

`Result<(), Error>`

### `create_tournament`
Create a new tournament. Admin only.

```rust
pub fn create_tournament(env: Env, admin: Address, id: u64, rules_hash: BytesN<32>, entry_fee: i128) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `id` | `u64` |
| `rules_hash` | `BytesN<32>` |
| `entry_fee` | `i128` |

#### Return Type

`Result<(), Error>`

### `join_tournament`
Join an active tournament. Player pays entry fee.

```rust
pub fn join_tournament(env: Env, player: Address, id: u64) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `player` | `Address` |
| `id` | `u64` |

#### Return Type

`Result<(), Error>`

### `record_result`
Record a score for a player in a tournament. Admin/Authorized only.

```rust
pub fn record_result(env: Env, admin: Address, id: u64, player: Address, score: u64) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `id` | `u64` |
| `player` | `Address` |
| `score` | `u64` |

#### Return Type

`Result<(), Error>`

### `finalize_tournament`
Finalize a tournament. Admin only. Prevents further joins or result recording.

```rust
pub fn finalize_tournament(env: Env, admin: Address, id: u64) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `id` | `u64` |

#### Return Type

`Result<(), Error>`

### `get_tournament`
```rust
pub fn get_tournament(env: Env, id: u64) -> Option<TournamentData>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `id` | `u64` |

#### Return Type

`Option<TournamentData>`

### `get_score`
```rust
pub fn get_score(env: Env, id: u64, player: Address) -> Option<u64>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `id` | `u64` |
| `player` | `Address` |

#### Return Type

`Option<u64>`

### `is_joined`
```rust
pub fn is_joined(env: Env, id: u64, player: Address) -> bool
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `id` | `u64` |
| `player` | `Address` |

#### Return Type

`bool`

### `get_bracket_summary`
```rust
pub fn get_bracket_summary(env: Env, id: u64) -> Result<BracketSummary, Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `id` | `u64` |

#### Return Type

`Result<BracketSummary, Error>`

### `get_next_matches`
```rust
pub fn get_next_matches(env: Env, id: u64) -> Result<soroban_sdk::Vec<Matchup>, Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `id` | `u64` |

#### Return Type

`Result<soroban_sdk::Vec<Matchup>, Error>`

### `advance_round`
```rust
pub fn advance_round(env: Env, admin: Address, id: u64) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `id` | `u64` |

#### Return Type

`Result<(), Error>`

