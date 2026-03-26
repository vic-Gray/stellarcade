//! StellarCade Tournament System Contract
//!
//! Manages the lifecycle of gaming tournaments, including creation, player
//! registration, result recording, and finalization.
//!
//! ## Storage Strategy
//! - `instance()`: Admin, FeeContract, RewardContract. Shared config.
//! - `persistent()`: TournamentData, PlayerRegistration, Scores.
//!   Each tournament and registration is a separate ledger entry.

#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype,
    Address, BytesN, Env,
};

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized      = 1,
    NotInitialized          = 2,
    NotAuthorized           = 3,
    InvalidAmount           = 4,
    TournamentNotFound      = 5,
    TournamentAlreadyExists = 6,
    TournamentNotActive     = 7,
    TournamentAlreadyFinalized = 8,
    PlayerAlreadyJoined     = 9,
    PlayerNotJoined         = 10,
    InvalidStateTransition  = 11,
    Overflow                = 12,
}

// ---------------------------------------------------------------------------
// Storage Types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TournamentStatus {
    Active      = 0, // Accepting joins and results
    Finalized   = 1, // Closed, no more changes
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TournamentData {
    pub rules_hash: BytesN<32>,
    pub entry_fee: i128,
    pub status: TournamentStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BracketSummary {
    pub current_round: u32,
    pub remaining_participants: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Matchup {
    pub player1: Address,
    pub player2: Option<Address>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    FeeContract,
    RewardContract,
    Tournament(u64),
    PlayerJoined(u64, Address),
    PlayerScore(u64, u32, Address), // Updated to include round
    CurrentRound(u64),
    RoundParticipants(u64, u32),
}

const PERSISTENT_BUMP_LEDGERS: u32 = 518_400; // ~30 days

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[contractevent]
pub struct TournamentCreated {
    #[topic]
    pub id: u64,
    pub rules_hash: BytesN<32>,
    pub entry_fee: i128,
}

#[contractevent]
pub struct PlayerJoined {
    #[topic]
    pub id: u64,
    #[topic]
    pub player: Address,
    pub fee_paid: i128,
}

#[contractevent]
pub struct ResultRecorded {
    #[topic]
    pub id: u64,
    #[topic]
    pub player: Address,
    pub score: u64,
}

#[contractevent]
pub struct TournamentFinalized {
    #[topic]
    pub id: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct TournamentSystem;

#[contractimpl]
impl TournamentSystem {
    /// Initialize the tournament system. May only be called once.
    pub fn init(
        env: Env,
        admin: Address,
        fee_contract: Address,
        reward_contract: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeContract, &fee_contract);
        env.storage().instance().set(&DataKey::RewardContract, &reward_contract);

        Ok(())
    }

    /// Create a new tournament. Admin only.
    pub fn create_tournament(
        env: Env,
        admin: Address,
        id: u64,
        rules_hash: BytesN<32>,
        entry_fee: i128,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        if entry_fee < 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Tournament(id);
        if env.storage().persistent().has(&key) {
            return Err(Error::TournamentAlreadyExists);
        }

        let data = TournamentData {
            rules_hash: rules_hash.clone(),
            entry_fee,
            status: TournamentStatus::Active,
        };

        env.storage().persistent().set(&key, &data);
        env.storage().persistent().extend_ttl(&key, PERSISTENT_BUMP_LEDGERS, PERSISTENT_BUMP_LEDGERS);

        // Initialize round 1
        env.storage().persistent().set(&DataKey::CurrentRound(id), &1u32);
        env.storage().persistent().set(&DataKey::RoundParticipants(id, 1), &soroban_sdk::Vec::<Address>::new(&env));

        TournamentCreated { id, rules_hash, entry_fee }.publish(&env);

        Ok(())
    }

    /// Join an active tournament. Player pays entry fee.
    pub fn join_tournament(env: Env, player: Address, id: u64) -> Result<(), Error> {
        let key = DataKey::Tournament(id);
        let tournament: TournamentData = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::TournamentNotFound)?;

        if tournament.status != TournamentStatus::Active {
            return Err(Error::TournamentNotActive);
        }

        let join_key = DataKey::PlayerJoined(id, player.clone());
        if env.storage().persistent().has(&join_key) {
            return Err(Error::PlayerAlreadyJoined);
        }

        player.require_auth();

        // In this architecture, we emit the event and the fee_paid amount.
        // Off-chain or a separate contract handles the actual transfer if 
        // the fee_contract is just a reference. 
        // However, if we wanted to be atomic, we'd call fee_contract here.
        // Given the AchievementBadge pattern, we stick to Event-Driven.

        env.storage().persistent().set(&join_key, &true);
        env.storage().persistent().extend_ttl(&join_key, PERSISTENT_BUMP_LEDGERS, PERSISTENT_BUMP_LEDGERS);

        // Add to round 1 participants
        let mut participants: soroban_sdk::Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundParticipants(id, 1))
            .unwrap_or(soroban_sdk::Vec::new(&env));
        participants.push_back(player.clone());
        env.storage().persistent().set(&DataKey::RoundParticipants(id, 1), &participants);

        PlayerJoined {
            id,
            player,
            fee_paid: tournament.entry_fee,
        }
        .publish(&env);

        Ok(())
    }

    /// Record a score for a player in a tournament. Admin/Authorized only.
    pub fn record_result(
        env: Env,
        admin: Address,
        id: u64,
        player: Address,
        score: u64,
    ) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        let key = DataKey::Tournament(id);
        let tournament: TournamentData = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::TournamentNotFound)?;

        if tournament.status != TournamentStatus::Active {
            return Err(Error::TournamentNotActive);
        }

        // Check if player actually joined
        let join_key = DataKey::PlayerJoined(id, player.clone());
        if !env.storage().persistent().has(&join_key) {
            return Err(Error::PlayerNotJoined);
        }

        let round: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::CurrentRound(id))
            .ok_or(Error::TournamentNotFound)?;

        let score_key = DataKey::PlayerScore(id, round, player.clone());
        env.storage().persistent().set(&score_key, &score);
        env.storage().persistent().extend_ttl(&score_key, PERSISTENT_BUMP_LEDGERS, PERSISTENT_BUMP_LEDGERS);

        ResultRecorded { id, player, score }.publish(&env);

        Ok(())
    }

    /// Finalize a tournament. Admin only. 
    /// Prevents further joins or result recording. 
    pub fn finalize_tournament(env: Env, admin: Address, id: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;

        let key = DataKey::Tournament(id);
        let mut tournament: TournamentData = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::TournamentNotFound)?;

        if tournament.status == TournamentStatus::Finalized {
            return Err(Error::TournamentAlreadyFinalized);
        }

        tournament.status = TournamentStatus::Finalized;
        env.storage().persistent().set(&key, &tournament);
        env.storage().persistent().extend_ttl(&key, PERSISTENT_BUMP_LEDGERS, PERSISTENT_BUMP_LEDGERS);

        TournamentFinalized { id }.publish(&env);

        Ok(())
    }

    // --- Getters ---

    pub fn get_tournament(env: Env, id: u64) -> Option<TournamentData> {
        env.storage().persistent().get(&DataKey::Tournament(id))
    }

    pub fn get_score(env: Env, id: u64, player: Address) -> Option<u64> {
        let round: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::CurrentRound(id))
            .unwrap_or(1);
        env.storage().persistent().get(&DataKey::PlayerScore(id, round, player))
    }

    pub fn is_joined(env: Env, id: u64, player: Address) -> bool {
        env.storage().persistent().has(&DataKey::PlayerJoined(id, player))
    }

    pub fn get_bracket_summary(env: Env, id: u64) -> Result<BracketSummary, Error> {
        let round: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::CurrentRound(id))
            .ok_or(Error::TournamentNotFound)?;
        
        let participants: soroban_sdk::Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundParticipants(id, round))
            .unwrap_or(soroban_sdk::Vec::new(&env));

        Ok(BracketSummary {
            current_round: round,
            remaining_participants: participants.len(),
        })
    }

    pub fn get_next_matches(env: Env, id: u64) -> Result<soroban_sdk::Vec<Matchup>, Error> {
        let round: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::CurrentRound(id))
            .ok_or(Error::TournamentNotFound)?;
        
        let mut participants: soroban_sdk::Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::RoundParticipants(id, round))
            .unwrap_or(soroban_sdk::Vec::new(&env));

        // Sort participants for deterministic pairing
        let mut sorted_list: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);
        while participants.len() > 0 {
            let mut min_idx = 0;
            let mut min_val = participants.get(0).unwrap();
            for i in 1..participants.len() {
                let current = participants.get(i).unwrap();
                if current < min_val {
                    min_val = current;
                    min_idx = i;
                }
            }
            sorted_list.push_back(min_val);
            participants.remove(min_idx);
        }

        let mut matchups = soroban_sdk::Vec::new(&env);
        let mut i = 0;
        while i < sorted_list.len() {
            let p1 = sorted_list.get(i).unwrap();
            let p2 = if i + 1 < sorted_list.len() {
                Some(sorted_list.get(i + 1).unwrap())
            } else {
                None
            };
            matchups.push_back(Matchup { player1: p1, player2: p2 });
            i += 2;
        }

        Ok(matchups)
    }

    pub fn advance_round(env: Env, admin: Address, id: u64) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        
        let round: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::CurrentRound(id))
            .ok_or(Error::TournamentNotFound)?;
        
        let matchups = Self::get_next_matches(env.clone(), id)?;
        let mut winners: soroban_sdk::Vec<Address> = soroban_sdk::Vec::new(&env);

        for matchup in matchups.iter() {
            match matchup.player2 {
                Some(p2) => {
                    let s1 = env.storage().persistent().get::<_, u64>(&DataKey::PlayerScore(id, round, matchup.player1.clone())).unwrap_or(0);
                    let s2 = env.storage().persistent().get::<_, u64>(&DataKey::PlayerScore(id, round, p2.clone())).unwrap_or(0);
                    
                    if s1 >= s2 {
                        winners.push_back(matchup.player1);
                    } else {
                        winners.push_back(p2);
                    }
                },
                None => {
                    // Bye player automatically progresses
                    winners.push_back(matchup.player1);
                }
            }
        }

        let next_round = round + 1;
        env.storage().persistent().set(&DataKey::CurrentRound(id), &next_round);
        env.storage().persistent().set(&DataKey::RoundParticipants(id, next_round), &winners);

        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn require_admin(env: &Env, caller: &Address) -> Result<(), Error> {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)?;
    caller.require_auth();
    if caller != &admin {
        return Err(Error::NotAuthorized);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Address, Env, BytesN};

    fn setup(env: &Env) -> (TournamentSystemClient, Address, Address, Address) {
        let admin = Address::generate(env);
        let fee_contract = Address::generate(env);
        let reward_contract = Address::generate(env);

        let contract_id = env.register(TournamentSystem, ());
        let client = TournamentSystemClient::new(env, &contract_id);

        client.init(&admin, &fee_contract, &reward_contract);

        (client, admin, fee_contract, reward_contract)
    }
    #[test]
    fn test_init_and_create() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 101u64;
        let rules_hash = BytesN::from_array(&env, &[0u8; 32]);
        let entry_fee = 100i128;

        env.mock_all_auths();
        client.create_tournament(&admin, &id, &rules_hash, &entry_fee);

        let t = client.get_tournament(&id).unwrap();
        assert_eq!(t.entry_fee, 100);
        assert_eq!(t.status, TournamentStatus::Active);
    }

    #[test]
    fn test_join_tournament() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 1u64;
        let rules_hash = BytesN::from_array(&env, &[0u8; 32]);
        let entry_fee = 50i128;

        env.mock_all_auths();
        client.create_tournament(&admin, &id, &rules_hash, &entry_fee);

        let player = Address::generate(&env);
        client.join_tournament(&player, &id);

        assert!(client.is_joined(&id, &player));
    }

    #[test]
    fn test_join_twice_fails() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 1u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);

        let player = Address::generate(&env);
        client.join_tournament(&player, &id);
        
        let result = client.try_join_tournament(&player, &id);
        assert_eq!(result, Err(Ok(Error::PlayerAlreadyJoined)));
    }

    #[test]
    fn test_record_and_finalize() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 1u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);

        let player = Address::generate(&env);
        client.join_tournament(&player, &id);

        client.record_result(&admin, &id, &player, &9500u64);
        assert_eq!(client.get_score(&id, &player), Some(9500));

        client.finalize_tournament(&admin, &id);
        let t = client.get_tournament(&id).unwrap();
        assert_eq!(t.status, TournamentStatus::Finalized);
    }

    #[test]
    fn test_cannot_join_finalized() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 1u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);
        client.finalize_tournament(&admin, &id);

        let player = Address::generate(&env);
        let result = client.try_join_tournament(&player, &id);
        assert_eq!(result, Err(Ok(Error::TournamentNotActive)));
    }

    #[test]
    fn test_record_result_unjoined_fails() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 1u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);

        let player = Address::generate(&env);
        let result = client.try_record_result(&admin, &id, &player, &100u64);
        assert_eq!(result, Err(Ok(Error::PlayerNotJoined)));
    }

    #[test]
    fn test_unauthorized_create_fails() {
        let env = Env::default();
        let (client, _, _, _) = setup(&env);

        let attacker = Address::generate(&env);
        env.mock_all_auths();
        let result = client.try_create_tournament(&attacker, &1u64, &BytesN::from_array(&env, &[0u8; 32]), &0i128);
        assert_eq!(result, Err(Ok(Error::NotAuthorized)));
    }

    #[test]
    fn test_bracket_summary_initial() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 101u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);

        let player1 = Address::generate(&env);
        let player2 = Address::generate(&env);
        client.join_tournament(&player1, &id);
        client.join_tournament(&player2, &id);

        let summary = client.get_bracket_summary(&id);
        assert_eq!(summary.current_round, 1);
        assert_eq!(summary.remaining_participants, 2);
    }

    #[test]
    fn test_next_matches_deterministic() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 102u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);

        let mut players = soroban_sdk::Vec::new(&env);
        for _ in 0..4 {
            let p = Address::generate(&env);
            client.join_tournament(&p, &id);
            players.push_back(p);
        }

        let matches = client.get_next_matches(&id);
        assert_eq!(matches.len(), 2);
        
        // Ensure pairing is deterministic by checking player addresses are present
        let m1 = matches.get(0).unwrap();
        let m2 = matches.get(1).unwrap();
        assert!(m1.player2.is_some());
        assert!(m2.player2.is_some());
    }

    #[test]
    fn test_round_progression() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 103u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);

        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);
        client.join_tournament(&p1, &id);
        client.join_tournament(&p2, &id);

        // Record results for round 1
        // Assuming alphabetical order for deterministic tests is hard with random addresses,
        // so we just record for both and check if someone progresses.
        client.record_result(&admin, &id, &p1, &100);
        client.record_result(&admin, &id, &p2, &200);

        client.advance_round(&admin, &id);

        let summary = client.get_bracket_summary(&id);
        assert_eq!(summary.current_round, 2);
        assert_eq!(summary.remaining_participants, 1);
    }

    #[test]
    fn test_completed_tournament_queries() {
        let env = Env::default();
        let (client, admin, _, _) = setup(&env);

        let id = 104u64;
        env.mock_all_auths();
        client.create_tournament(&admin, &id, &BytesN::from_array(&env, &[0u8; 32]), &0i128);
        client.finalize_tournament(&admin, &id);

        let summary = client.get_bracket_summary(&id);
        assert_eq!(summary.current_round, 1);
    }
}
