#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env, Vec,
};

#[contract]
pub struct OracleIntegration;

//
// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────
//

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    OracleSources,
    Request(BytesN<32>),
    Latest(BytesN<32>),
}

#[derive(Clone)]
#[contracttype]
pub struct OracleRequest {
    pub feed_id: BytesN<32>,
    pub fulfilled: bool,
    pub payload: Bytes,
}

#[derive(Clone)]
#[contracttype]
pub struct LatestPriceData {
    pub payload: Bytes,
    pub updated_ledger: u32,
}

#[derive(Clone)]
#[contracttype]
pub struct PriceFreshness {
    pub has_price: bool,
    pub payload: Bytes,
    pub updated_ledger: u32,
    pub current_ledger: u32,
    pub age_ledgers: u32,
    pub stale_threshold_ledgers: u32,
    pub is_stale: bool,
}

//
// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────
//

#[contractevent]
pub struct Initialized {
    pub admin: Address,
}

#[contractevent]
pub struct RequestCreated {
    pub request_id: BytesN<32>,
    pub feed_id: BytesN<32>,
}

#[contractevent]
pub struct RequestFulfilled {
    pub request_id: BytesN<32>,
    pub feed_id: BytesN<32>,
}

//
// ─────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────
//

#[contracterror]
#[derive(Copy, Clone, Eq, PartialEq, Debug)]
pub enum Error {
    AlreadyInitialized = 1,
    NotAuthorized = 2,
    RequestExists = 3,
    RequestNotFound = 4,
    AlreadyFulfilled = 5,
    InvalidInput = 6,
    OracleNotWhitelisted = 7,
    Overflow = 8,
}

//
// ─────────────────────────────────────────────
// TTL CONFIG
// ─────────────────────────────────────────────
//

const TTL_RENEW_WINDOW: u32 = 1_000;
const STALE_THRESHOLD_LEDGERS: u32 = 20;

fn renew_persistent_ttl(env: &Env, key: &DataKey) -> Result<(), Error> {
    let max_ttl = env.storage().max_ttl();

    let threshold = max_ttl
        .checked_sub(TTL_RENEW_WINDOW)
        .ok_or(Error::Overflow)?;

    env.storage()
        .persistent()
        .extend_ttl(key, threshold, max_ttl);

    Ok(())
}

fn renew_instance_ttl(env: &Env) -> Result<(), Error> {
    let max_ttl = env.storage().max_ttl();

    let threshold = max_ttl
        .checked_sub(TTL_RENEW_WINDOW)
        .ok_or(Error::Overflow)?;

    env.storage().instance().extend_ttl(threshold, max_ttl);

    Ok(())
}

//
// ─────────────────────────────────────────────
// CONTRACT IMPLEMENTATION
// ─────────────────────────────────────────────
//

#[contractimpl]
impl OracleIntegration {
    // ───────── INIT ─────────

    pub fn init(
        env: Env,
        admin: Address,
        oracle_sources_config: Vec<Address>,
    ) -> Result<(), Error> {
        admin.require_auth();

        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        if oracle_sources_config.is_empty() {
            return Err(Error::InvalidInput);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::OracleSources, &oracle_sources_config);

        renew_instance_ttl(&env)?;

        Initialized { admin }.publish(&env);

        Ok(())
    }

    // ───────── REQUEST DATA ─────────

    pub fn request_data(
        env: Env,
        caller: Address,
        feed_id: BytesN<32>,
        request_id: BytesN<32>,
    ) -> Result<(), Error> {
        caller.require_auth();

        // 🔒 Ensure contract is initialized
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotAuthorized);
        }

        renew_instance_ttl(&env)?;

        let zero = BytesN::from_array(&env, &[0; 32]);
        if feed_id == zero || request_id == zero {
            return Err(Error::InvalidInput);
        }

        let key = DataKey::Request(request_id.clone());

        if env.storage().persistent().has(&key) {
            return Err(Error::RequestExists);
        }

        let request = OracleRequest {
            feed_id: feed_id.clone(),
            fulfilled: false,
            payload: Bytes::new(&env),
        };

        env.storage().persistent().set(&key, &request);
        renew_persistent_ttl(&env, &key)?;

        RequestCreated {
            request_id,
            feed_id,
        }
        .publish(&env);

        Ok(())
    }

    // ───────── FULFILL DATA ─────────

    pub fn fulfill_data(
        env: Env,
        caller: Address,
        request_id: BytesN<32>,
        payload: Bytes,
        _proof: Bytes,
    ) -> Result<(), Error> {
        caller.require_auth();

        renew_instance_ttl(&env)?;

        if payload.is_empty() {
            return Err(Error::InvalidInput);
        }

        let sources: Vec<Address> = env
            .storage()
            .instance()
            .get(&DataKey::OracleSources)
            .ok_or(Error::NotAuthorized)?;

        if !sources.contains(&caller) {
            return Err(Error::OracleNotWhitelisted);
        }

        let req_key = DataKey::Request(request_id.clone());

        let mut request: OracleRequest = env
            .storage()
            .persistent()
            .get(&req_key)
            .ok_or(Error::RequestNotFound)?;

        if request.fulfilled {
            return Err(Error::AlreadyFulfilled);
        }

        request.fulfilled = true;
        request.payload = payload.clone();

        env.storage().persistent().set(&req_key, &request);
        renew_persistent_ttl(&env, &req_key)?;

        let latest_key = DataKey::Latest(request.feed_id.clone());
        let latest = LatestPriceData {
            payload: payload.clone(),
            updated_ledger: env.ledger().sequence(),
        };

        env.storage().persistent().set(&latest_key, &latest);
        renew_persistent_ttl(&env, &latest_key)?;

        let feed_id = request.feed_id.clone();

        RequestFulfilled {
            request_id,
            feed_id,
        }
        .publish(&env);

        Ok(())
    }

    // ───────── READ METHODS ─────────

    pub fn latest(env: Env, feed_id: BytesN<32>) -> Option<Bytes> {
        let key = DataKey::Latest(feed_id);
        let result: Option<LatestPriceData> = env.storage().persistent().get(&key);

        if result.is_some() {
            renew_persistent_ttl(&env, &key).ok();
        }

        result.map(|latest| latest.payload)
    }

    pub fn get_request(env: Env, request_id: BytesN<32>) -> Option<OracleRequest> {
        let key = DataKey::Request(request_id);
        let result = env.storage().persistent().get(&key);

        if result.is_some() {
            renew_persistent_ttl(&env, &key).ok();
        }

        result
    }

    pub fn last_price_freshness(env: Env, feed_id: BytesN<32>) -> PriceFreshness {
        let current_ledger = env.ledger().sequence();
        let key = DataKey::Latest(feed_id);
        let latest: Option<LatestPriceData> = env.storage().persistent().get(&key);

        match latest {
            Some(latest) => {
                let age_ledgers = current_ledger.saturating_sub(latest.updated_ledger);
                PriceFreshness {
                    has_price: true,
                    payload: latest.payload,
                    updated_ledger: latest.updated_ledger,
                    current_ledger,
                    age_ledgers,
                    stale_threshold_ledgers: STALE_THRESHOLD_LEDGERS,
                    is_stale: age_ledgers > STALE_THRESHOLD_LEDGERS,
                }
            }
            None => PriceFreshness {
                has_price: false,
                payload: Bytes::new(&env),
                updated_ledger: 0,
                current_ledger,
                age_ledgers: 0,
                stale_threshold_ledgers: STALE_THRESHOLD_LEDGERS,
                is_stale: true,
            },
        }
    }
}

#[cfg(test)]
mod test;
