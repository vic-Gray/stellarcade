use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Ledger},
    token::StellarAssetClient,
    Address, Env,
};

// -----------------------------
// Mock Balance contract
// -----------------------------

#[contract]
pub struct MockBalance;

#[contracttype]
pub enum BalanceKey {
    Balance(Address),
}

#[contractimpl]
impl MockBalance {
    pub fn init(_env: Env, _admin: Address, _token: Address) {}
    pub fn authorize_game(_env: Env, _admin: Address, _game: Address) {}

    pub fn deposit(env: Env, user: Address, amount: i128) {
        let key = BalanceKey::Balance(user.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(balance + amount));
    }

    pub fn withdraw(env: Env, user: Address, amount: i128) {
        let key = BalanceKey::Balance(user.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(balance - amount));
    }

    pub fn debit(env: Env, _game: Address, user: Address, amount: i128, _reason: Symbol) {
        Self::withdraw(env, user, amount);
    }

    pub fn credit(env: Env, _game: Address, user: Address, amount: i128, _reason: Symbol) {
        Self::deposit(env, user, amount);
    }

    pub fn balance_of(env: Env, user: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&BalanceKey::Balance(user))
            .unwrap_or(0)
    }
}

// -----------------------------
// Mock RNG contract
// -----------------------------

#[contract]
pub struct MockRng;

#[contracttype]
pub enum RngKey {
    Result(u64),
    Ready(u64),
}

#[contractimpl]
impl MockRng {
    pub fn set_result(env: Env, game_id: u64, result: u32) {
        env.storage().persistent().set(&RngKey::Result(game_id), &result);
        env.storage().persistent().set(&RngKey::Ready(game_id), &true);
    }

    pub fn is_ready(env: Env, game_id: u64) -> bool {
        env.storage()
            .persistent()
            .get(&RngKey::Ready(game_id))
            .unwrap_or(false)
    }

    pub fn get_result(env: Env, game_id: u64) -> u32 {
        env.storage()
            .persistent()
            .get(&RngKey::Result(game_id))
            .unwrap_or(0)
    }
}

fn create_token<'a>(env: &'a Env, token_admin: &Address) -> (Address, StellarAssetClient<'a>) {
    let contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let client = StellarAssetClient::new(env, &contract.address());
    (contract.address(), client)
}

fn setup(
    env: &Env,
) -> (
    HigherLowerClient<'_>,
    Address, // admin
    Address, // player
    Address, // house
    MockBalanceClient<'_>,
    MockRngClient<'_>,
) {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let player = Address::generate(env);
    let token_admin = Address::generate(env);

    let (token_addr, token_sac) = create_token(env, &token_admin);

    let balance_id = env.register(MockBalance, ());
    let balance_client = MockBalanceClient::new(env, &balance_id);
    balance_client.init(&admin, &token_addr);

    let rng_id = env.register(MockRng, ());
    let rng_client = MockRngClient::new(env, &rng_id);

    let higher_lower_id = env.register(HigherLower, ());
    let higher_lower_client = HigherLowerClient::new(env, &higher_lower_id);

    let house = higher_lower_id.clone();

    higher_lower_client.init(&admin, &rng_id, &Address::generate(env), &balance_id);

    balance_client.authorize_game(&admin, &higher_lower_id);

    token_sac.mint(&player, &1_000);
    token_sac.mint(&house, &5_000);

    balance_client.deposit(&player, &1_000);
    balance_client.deposit(&house, &5_000);

    (
        higher_lower_client,
        admin,
        player,
        house,
        balance_client,
        rng_client,
    )
}

#[test]
fn test_place_prediction_happy_path() {
    let env = Env::default();
    let (client, _admin, player, house, balance, _rng) = setup(&env);

    client.place_prediction(&player, &0, &100, &1);

    let game = client.get_game(&1).unwrap();
    assert_eq!(game.player, player);
    assert_eq!(game.prediction, Prediction::Higher);
    assert_eq!(game.wager, 100);
    assert!(!game.resolved);

    assert_eq!(balance.balance_of(&player), 900);
    assert_eq!(balance.balance_of(&house), 5_100);
}

#[test]
fn test_win_resolution_path() {
    let env = Env::default();
    let (client, _admin, player, house, balance, rng) = setup(&env);

    client.place_prediction(&player, &0, &100, &2);

    rng.set_result(&2, &80);
    client.resolve_game(&2);

    let game = client.get_game(&2).unwrap();
    assert!(game.resolved);
    assert!(game.win);
    assert_eq!(game.payout, 200);

    assert_eq!(balance.balance_of(&player), 1_100);
    assert_eq!(balance.balance_of(&house), 4_900);
}

#[test]
fn test_loss_resolution_path() {
    let env = Env::default();
    let (client, _admin, player, house, balance, rng) = setup(&env);

    client.place_prediction(&player, &0, &100, &3);

    rng.set_result(&3, &20);
    client.resolve_game(&3);

    let game = client.get_game(&3).unwrap();
    assert!(game.resolved);
    assert!(!game.win);
    assert_eq!(game.payout, 0);

    assert_eq!(balance.balance_of(&player), 900);
    assert_eq!(balance.balance_of(&house), 5_100);
}

#[test]
fn test_invalid_prediction_rejected() {
    let env = Env::default();
    let (client, _admin, player, _house, _balance, _rng) = setup(&env);

    let result = client.try_place_prediction(&player, &2, &100, &4);
    assert!(result.is_err());
}

#[test]
fn test_insufficient_balance_rejected() {
    let env = Env::default();
    let (client, _admin, player, _house, balance, _rng) = setup(&env);

    balance.withdraw(&player, &1_000);

    let result = client.try_place_prediction(&player, &0, &100, &5);
    assert!(result.is_err());
}

#[test]
fn test_duplicate_and_double_resolution_blocked() {
    let env = Env::default();
    let (client, _admin, player, _house, _balance, rng) = setup(&env);

    client.place_prediction(&player, &1, &100, &6);
    let dup = client.try_place_prediction(&player, &1, &100, &6);
    assert!(dup.is_err());

    rng.set_result(&6, &20);
    client.resolve_game(&6);
    let again = client.try_resolve_game(&6);
    assert!(again.is_err());
}

#[test]
fn test_resolve_before_rng_ready_rejected() {
    let env = Env::default();
    let (client, _admin, player, _house, _balance, _rng) = setup(&env);

    client.place_prediction(&player, &1, &100, &7);
    let result = client.try_resolve_game(&7);
    assert!(result.is_err());
}

// ── Stale Round Cleanup Tests ──────────────────────────────────────────

#[test]
fn test_cleanup_rejected_before_expiry() {
    let env = Env::default();
    let (client, _admin, player, _house, _balance, _rng) = setup(&env);

    // Round placed at ledger 0 (default).  Threshold is ROUND_EXPIRY_LEDGERS = 17_280.
    client.place_prediction(&player, &0, &100, &10);

    // Advance to just below the threshold.
    env.ledger().with_mut(|l| l.sequence_number = ROUND_EXPIRY_LEDGERS - 1);

    let result = client.try_expire_round(&10);
    assert!(result.is_err());
}

#[test]
fn test_stale_round_cleanup_success() {
    let env = Env::default();
    let (client, _admin, player, house, balance, _rng) = setup(&env);

    client.place_prediction(&player, &0, &100, &11);

    // Player's wager is escrowed: player 900, house 5100.
    assert_eq!(balance.balance_of(&player), 900);
    assert_eq!(balance.balance_of(&house), 5_100);

    // Advance past expiry threshold.
    env.ledger().with_mut(|l| l.sequence_number = ROUND_EXPIRY_LEDGERS + 1);

    client.expire_round(&11);

    let game = client.get_game(&11).unwrap();
    assert!(game.expired);
    assert!(!game.resolved);

    // Wager refunded: player back to 1000, house back to 5000.
    assert_eq!(balance.balance_of(&player), 1_000);
    assert_eq!(balance.balance_of(&house), 5_000);
}

#[test]
fn test_repeat_cleanup_rejected() {
    let env = Env::default();
    let (client, _admin, player, _house, _balance, _rng) = setup(&env);

    client.place_prediction(&player, &0, &100, &12);

    env.ledger().with_mut(|l| l.sequence_number = ROUND_EXPIRY_LEDGERS + 1);

    client.expire_round(&12);

    // Second call should fail because game is already expired.
    let result = client.try_expire_round(&12);
    assert!(result.is_err());
}
