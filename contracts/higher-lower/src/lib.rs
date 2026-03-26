//! Stellarcade Higher or Lower Contract
//!
//! A simple prediction game: players wager on whether the outcome is higher
//! or lower than a fixed anchor value.
#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    symbol_short, Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const MIN_WAGER: i128 = 1;
pub const MAX_WAGER: i128 = 1_000_000_000;
pub const ANCHOR_VALUE: u32 = 50;
/// Ledgers a round may stay unresolved before it is eligible for cleanup.
/// ~24 hours at ~5 s/ledger.
pub const ROUND_EXPIRY_LEDGERS: u32 = 17_280;

// ---------------------------------------------------------------------------
// External contract clients
// ---------------------------------------------------------------------------

#[contractclient(name = "RngClient")]
pub trait RngContract {
    fn is_ready(env: Env, game_id: u64) -> bool;
    fn get_result(env: Env, game_id: u64) -> u32;
}

#[contractclient(name = "BalanceClient")]
pub trait UserBalanceContract {
    fn debit(env: Env, game: Address, user: Address, amount: i128, reason: Symbol);
    fn credit(env: Env, game: Address, user: Address, amount: i128, reason: Symbol);
    fn balance_of(env: Env, user: Address) -> i128;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    InvalidPrediction = 4,
    InvalidWager = 5,
    GameAlreadyExists = 6,
    GameNotFound = 7,
    AlreadyResolved = 8,
    RngNotReady = 9,
    InsufficientBalance = 10,
    HouseInsufficientFunds = 11,
    Overflow = 12,
    /// Cleanup called before the expiry threshold has been reached.
    NotExpired = 13,
    /// Attempt to resolve or interact with an already-expired game.
    GameExpired = 14,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Prediction {
    Higher = 0,
    Lower = 1,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GameData {
    pub player: Address,
    pub prediction: Prediction,
    pub wager: i128,
    pub resolved: bool,
    pub expired: bool,
    pub outcome: u32,
    pub win: bool,
    pub payout: i128,
    /// Ledger sequence at which the round was opened.
    pub created_at: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    RngContract,
    PrizePoolContract,
    BalanceContract,
    Game(u64),
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contractevent]
pub struct PredictionPlaced {
    #[topic]
    pub game_id: u64,
    pub player: Address,
    pub prediction: u32,
    pub wager: i128,
}

#[contractevent]
pub struct GameResolved {
    #[topic]
    pub game_id: u64,
    pub outcome: u32,
    pub win: bool,
    pub payout: i128,
}

#[contractevent]
pub struct RoundExpired {
    #[topic]
    pub game_id: u64,
    pub player: Address,
    /// Wager amount refunded to the player.
    pub refund: i128,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct HigherLower;

#[contractimpl]
impl HigherLower {
    pub fn init(
        env: Env,
        admin: Address,
        rng_contract: Address,
        prize_pool_contract: Address,
        balance_contract: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::RngContract, &rng_contract);
        env.storage()
            .instance()
            .set(&DataKey::PrizePoolContract, &prize_pool_contract);
        env.storage()
            .instance()
            .set(&DataKey::BalanceContract, &balance_contract);
        Ok(())
    }

    pub fn place_prediction(
        env: Env,
        player: Address,
        prediction: u32,
        wager: i128,
        game_id: u64,
    ) -> Result<(), Error> {
        require_initialized(&env)?;
        player.require_auth();

        let prediction = parse_prediction(prediction)?;
        require_wager_bounds(wager)?;

        let key = DataKey::Game(game_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::GameAlreadyExists);
        }

        let balance_contract = get_balance_contract(&env)?;
        let game_addr = env.current_contract_address();
        let balance_client = BalanceClient::new(&env, &balance_contract);

        let player_balance = balance_client.balance_of(&player);
        if player_balance < wager {
            return Err(Error::InsufficientBalance);
        }

        balance_client.debit(&game_addr, &player, &wager, &symbol_short!("wager"));
        balance_client.credit(&game_addr, &game_addr, &wager, &symbol_short!("escrow"));

        let game = GameData {
            player: player.clone(),
            prediction,
            wager,
            resolved: false,
            expired: false,
            outcome: 0,
            win: false,
            payout: 0,
            created_at: env.ledger().sequence(),
        };
        env.storage().persistent().set(&key, &game);

        PredictionPlaced {
            game_id,
            player,
            prediction: prediction as u32,
            wager,
        }
        .publish(&env);

        Ok(())
    }

    pub fn resolve_game(env: Env, game_id: u64) -> Result<(), Error> {
        require_initialized(&env)?;

        let key = DataKey::Game(game_id);
        let mut game: GameData = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.resolved {
            return Err(Error::AlreadyResolved);
        }

        if game.expired {
            return Err(Error::GameExpired);
        }

        let rng_contract = get_rng_contract(&env)?;
        let rng_client = RngClient::new(&env, &rng_contract);
        if !rng_client.is_ready(&game_id) {
            return Err(Error::RngNotReady);
        }
        let outcome = rng_client.get_result(&game_id);

        let win = match game.prediction {
            Prediction::Higher => outcome > ANCHOR_VALUE,
            Prediction::Lower => outcome < ANCHOR_VALUE,
        };

        let payout = if win {
            game.wager.checked_mul(2).ok_or(Error::Overflow)?
        } else {
            0
        };

        let balance_contract = get_balance_contract(&env)?;
        let game_addr = env.current_contract_address();
        let balance_client = BalanceClient::new(&env, &balance_contract);

        if payout > 0 {
            let house_balance = balance_client.balance_of(&game_addr);
            if house_balance < payout {
                return Err(Error::HouseInsufficientFunds);
            }

            balance_client.debit(&game_addr, &game_addr, &payout, &symbol_short!("payout"));
            balance_client.credit(&game_addr, &game.player, &payout, &symbol_short!("win"));
        }

        game.resolved = true;
        game.outcome = outcome;
        game.win = win;
        game.payout = payout;
        env.storage().persistent().set(&key, &game);

        GameResolved {
            game_id,
            outcome,
            win,
            payout,
        }
        .publish(&env);

        Ok(())
    }

    /// Expires a stale round that has not been resolved within `ROUND_EXPIRY_LEDGERS`.
    ///
    /// Callable by anyone. On success the wager is refunded to the player and
    /// the round is transitioned to the terminal `expired` state.
    ///
    /// # Expiry Model
    /// - Threshold: `ROUND_EXPIRY_LEDGERS = 17_280` ledgers (≈24 h at 5 s/ledger).
    /// - A `RoundExpired` event is emitted on success, recording `game_id`, `player`, and `refund` amount.
    /// - Resolved or already-expired rounds are never re-targeted.
    ///
    /// # Errors
    /// * `NotInitialized` - Registry not initialised.
    /// * `GameNotFound`   - No round stored under this ID.
    /// * `AlreadyResolved` - Round was already properly resolved.
    /// * `GameExpired`   - Round was already cleaned up via `expire_round`.
    /// * `NotExpired`    - Threshold not yet reached; round is still active.
    pub fn expire_round(env: Env, game_id: u64) -> Result<(), Error> {
        require_initialized(&env)?;

        let key = DataKey::Game(game_id);
        let mut game: GameData = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::GameNotFound)?;

        if game.resolved {
            return Err(Error::AlreadyResolved);
        }

        if game.expired {
            return Err(Error::GameExpired);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < game.created_at.saturating_add(ROUND_EXPIRY_LEDGERS) {
            return Err(Error::NotExpired);
        }

        // Refund the escrowed wager back to the player.
        let balance_contract = get_balance_contract(&env)?;
        let game_addr = env.current_contract_address();
        let balance_client = BalanceClient::new(&env, &balance_contract);
        balance_client.debit(&game_addr, &game_addr, &game.wager, &symbol_short!("expiry"));
        balance_client.credit(&game_addr, &game.player, &game.wager, &symbol_short!("refund"));

        game.expired = true;
        env.storage().persistent().set(&key, &game);

        RoundExpired {
            game_id,
            player: game.player,
            refund: game.wager,
        }
        .publish(&env);

        Ok(())
    }

    pub fn get_game(env: Env, game_id: u64) -> Option<GameData> {
        env.storage().persistent().get(&DataKey::Game(game_id))
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn require_initialized(env: &Env) -> Result<(), Error> {
    if !env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::NotInitialized);
    }
    Ok(())
}

fn require_wager_bounds(wager: i128) -> Result<(), Error> {
    if wager < MIN_WAGER || wager > MAX_WAGER {
        return Err(Error::InvalidWager);
    }
    Ok(())
}

fn parse_prediction(value: u32) -> Result<Prediction, Error> {
    match value {
        0 => Ok(Prediction::Higher),
        1 => Ok(Prediction::Lower),
        _ => Err(Error::InvalidPrediction),
    }
}

fn get_rng_contract(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::RngContract)
        .ok_or(Error::NotInitialized)
}

fn get_balance_contract(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::BalanceContract)
        .ok_or(Error::NotInitialized)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests;
