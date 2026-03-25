# Reward Vesting Contract

Deterministic linear vesting of game rewards with cliff support. Built on Stellar / Soroban.

## Overview

The admin creates vesting schedules on behalf of users by locking tokens into the contract. A user can claim whatever portion has vested so far at any time after the cliff elapses. The admin can revoke a schedule, returning unvested tokens.

## Public Interface

| Method | Caller | Description |
|---|---|---|
| `init(admin, token_address)` | Admin | Initialise the contract once. |
| `create_vesting_schedule(user, amount, start, cliff, duration) -> u64` | Admin | Lock `amount` tokens and create a vesting schedule. Returns the schedule ID. |
| `claim_vested(user) -> i128` | User | Transfer all currently vested tokens to the user. |
| `revoke_schedule(schedule_id) -> i128` | Admin | Cancel a schedule, returning unvested tokens to the admin. |
| `vesting_state(user) -> Vec<VestingSchedule>` | Anyone | Return all vesting schedules for a user. |
| `get_vesting_summary(user) -> VestingSummary` | Anyone | Return a compact summary of vesting progress for a user. |

## Vesting Formula

```
vested = amount * min(elapsed, duration) / duration   (after cliff)
vested = 0                                             (before cliff)
```

Where `elapsed = now - start_timestamp`.

## VestingSchedule Fields

| Field | Type | Description |
|---|---|---|
| `schedule_id` | `u64` | Unique ID. |
| `user` | `Address` | Beneficiary. |
| `amount` | `i128` | Total tokens locked. |
| `start_timestamp` | `u64` | UNIX seconds when vesting begins. |
| `cliff_seconds` | `u64` | Seconds after start before any claim is possible. |
| `duration_seconds` | `u64` | Total vesting window. |
| `claimed` | `i128` | Cumulative amount claimed. |
| `revoked` | `bool` | Whether the schedule was revoked. |

## VestingSummary Fields

| Field | Type | Description |
|---|---|---|
| `total_allocation` | `i128` | Sum of all active (non-revoked) schedule amounts. |
| `claimed_amount` | `i128` | Total tokens already claimed by the user. |
| `claimable_amount` | `i128` | Tokens currently vested and available to claim. |
| `remaining_amount` | `i128` | Tokens still locked (total_allocation - claimed_amount). |
| `current_timestamp` | `u64` | Current ledger timestamp used for calculations. |
| `is_fully_vested` | `bool` | True if all schedules are completed and no active vesting remains. |
| `has_active_schedules` | `bool` | True if user has any schedules still vesting. |

## Storage Schema

| Key | Type | Description |
|---|---|---|
| `Admin` | `Address` | Privileged administrator. |
| `Token` | `Address` | Reward token address. |
| `NextScheduleId` | `u64` | Monotonic schedule counter. |
| `ScheduleMap` | `Map<u64, VestingSchedule>` | All schedules by ID. |
| `UserSchedules(address)` | `Vec<u64>` | Schedule IDs per user (persistent). |

## Events

| Topic | Data | Description |
|---|---|---|
| `init` | `(admin, token)` | Contract initialised. |
| `scheduled` | `(user, schedule_id, amount)` | New schedule created. |
| `claimed` | `(user, amount)` | Tokens claimed. |
| `revoked` | `(schedule_id, user, unvested)` | Schedule cancelled. |

## Error Codes

| Code | Meaning |
|---|---|
| `NotInitialized` | Contract not yet initialised. |
| `AlreadyInitialized` | Duplicate `init`. |
| `Unauthorized` | Caller lacks privileges. |
| `InvalidAmount` | Amount <= 0. |
| `InvalidDuration` | Duration is zero. |
| `ScheduleNotFound` | Schedule ID does not exist. |
| `ScheduleRevoked` | Schedule already revoked. |
| `NothingToClaim` | No vested tokens available. |
| `ArithmeticError` | Integer overflow. |

## VestingSummary Calculation

The `get_vesting_summary` method provides a compact view of vesting progress:

### Summary Value Derivation

- **total_allocation**: Sum of `amount` fields from all non-revoked schedules
- **claimed_amount**: Sum of `claimed` fields from all non-revoked schedules  
- **claimable_amount**: Sum of `(vested_amount - claimed)` for all schedules where vested > claimed
- **remaining_amount**: `total_allocation - claimed_amount`
- **current_timestamp**: Ledger timestamp at time of query
- **is_fully_vested**: `!has_active_schedules && total_allocation > 0`
- **has_active_schedules**: True if any schedule has `vested_amount < amount`

### Behavior Guarantees

- **Empty State**: Users with no schedules receive a summary with all zero values
- **Deterministic**: Same input always produces same output (no randomness)
- **Read-Only**: Method does not modify contract state
- **Side-Effect Free**: Safe to call frequently for UI updates

### Response Examples

```rust
// User with no vesting schedules
VestingSummary {
    total_allocation: 0,
    claimed_amount: 0,
    claimable_amount: 0,
    remaining_amount: 0,
    current_timestamp: 1640995200,
    is_fully_vested: false,
    has_active_schedules: false,
}

// User mid-vesting
VestingSummary {
    total_allocation: 10000,
    claimed_amount: 2500,
    claimable_amount: 2500,
    remaining_amount: 7500,
    current_timestamp: 1640995200,
    is_fully_vested: false,
    has_active_schedules: true,
}
```

## Invariants

- `claimed` is always <= `vested_amount(now)`.
- A revoked schedule can never be claimed after revocation.
- Unvested tokens are always returned to admin on revocation.

## Integration Assumptions

- The admin must hold sufficient token balance and approve the transfer before calling `create_vesting_schedule`.
- Depends on a SEP-41 / Stellar Asset Contract compatible token.
- Downstream reward-distribution contracts should call `create_vesting_schedule` after computing award amounts.

## Dependencies

- `soroban-sdk` 25.x
- Reward distribution contract (upstream token minting)

## Running Tests

```bash
cd contracts/reward-vesting
cargo test
```

Closes #156
