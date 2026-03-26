# higher-lower

## Public Methods

### `init`
```rust
pub fn init(env: Env, admin: Address, rng_contract: Address, prize_pool_contract: Address, balance_contract: Address) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `admin` | `Address` |
| `rng_contract` | `Address` |
| `prize_pool_contract` | `Address` |
| `balance_contract` | `Address` |

#### Return Type

`Result<(), Error>`

### `place_prediction`
```rust
pub fn place_prediction(env: Env, player: Address, prediction: u32, wager: i128, game_id: u64) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `player` | `Address` |
| `prediction` | `u32` |
| `wager` | `i128` |
| `game_id` | `u64` |

#### Return Type

`Result<(), Error>`

### `resolve_game`
```rust
pub fn resolve_game(env: Env, game_id: u64) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `game_id` | `u64` |

#### Return Type

`Result<(), Error>`

### `expire_round`
Expires a stale round that has not been resolved within `ROUND_EXPIRY_LEDGERS`.  Callable by anyone. On success the wager is refunded to the player and the round is transitioned to the terminal `expired` state.  # Expiry Model - Threshold: `ROUND_EXPIRY_LEDGERS = 17_280` ledgers (≈24 h at 5 s/ledger). - A `RoundExpired` event is emitted on success, recording `game_id`, `player`, and `refund` amount. - Resolved or already-expired rounds are never re-targeted.  # Errors * `NotInitialized` - Registry not initialised. * `GameNotFound`   - No round stored under this ID. * `AlreadyResolved` - Round was already properly resolved. * `GameExpired`   - Round was already cleaned up via `expire_round`. * `NotExpired`    - Threshold not yet reached; round is still active.

```rust
pub fn expire_round(env: Env, game_id: u64) -> Result<(), Error>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `game_id` | `u64` |

#### Return Type

`Result<(), Error>`

### `get_game`
```rust
pub fn get_game(env: Env, game_id: u64) -> Option<GameData>
```

#### Parameters

| Name | Type |
|------|------|
| `env` | `Env` |
| `game_id` | `u64` |

#### Return Type

`Option<GameData>`

