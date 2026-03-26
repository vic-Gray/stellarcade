#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger as _, MockAuth, MockAuthInvoke};
use soroban_sdk::{vec, Address, Bytes, Env, IntoVal};

/// Non-zero 32-byte id for feeds and request keys in tests.
fn id32(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn zero_id32(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0; 32])
}

/// Registers the contract, mocks auths, and initializes with two whitelisted oracle addresses.
fn setup_initialized(
    env: &Env,
) -> (
    OracleIntegrationClient<'_>,
    Address,
    Address,
    Address,
    Address,
) {
    let contract_id = env.register(OracleIntegration, ());
    let client = OracleIntegrationClient::new(env, &contract_id);
    let admin = Address::generate(env);
    let oracle = Address::generate(env);
    let user = Address::generate(env);
    let other_oracle = Address::generate(env);

    env.mock_all_auths();
    let sources = vec![env, oracle.clone(), other_oracle.clone()];
    client.init(&admin, &sources);

    (client, contract_id, admin, oracle, user)
}

// --- init ---

#[test]
fn try_init_succeeds() {
    let env = Env::default();
    let contract_id = env.register(OracleIntegration, ());
    let client = OracleIntegrationClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    env.mock_all_auths();
    let sources = vec![&env, oracle.clone()];
    assert_eq!(client.try_init(&admin, &sources), Ok(Ok(())));
}

#[test]
fn init_rejects_second_call() {
    let env = Env::default();
    let (client, _, _, _, _) = setup_initialized(&env);

    env.mock_all_auths();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let sources = vec![&env, oracle];

    assert_eq!(
        client.try_init(&admin, &sources),
        Err(Ok(Error::AlreadyInitialized))
    );
}

#[test]
fn init_rejects_empty_oracle_list() {
    let env = Env::default();
    let contract_id = env.register(OracleIntegration, ());
    let client = OracleIntegrationClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let empty = Vec::<Address>::new(&env);

    env.mock_all_auths();
    assert_eq!(
        client.try_init(&admin, &empty),
        Err(Ok(Error::InvalidInput))
    );
}

#[test]
fn init_requires_auth_for_admin_parameter() {
    let env = Env::default();
    let contract_id = env.register(OracleIntegration, ());
    let client = OracleIntegrationClient::new(&env, &contract_id);
    let signer = Address::generate(&env);
    let admin_arg = Address::generate(&env);
    let oracle = Address::generate(&env);
    let sources_for_mock = vec![&env, oracle.clone()];
    env.mock_auths(&[MockAuth {
        address: &signer,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "init",
            args: vec![
                &env,
                admin_arg.into_val(&env),
                sources_for_mock.into_val(&env),
            ],
            sub_invokes: &[],
        },
    }]);

    assert!(client.try_init(&admin_arg, &vec![&env, oracle]).is_err());
}

// --- request_data ---

#[test]
fn request_data_happy_path() {
    let env = Env::default();
    let (client, _, _, _, user) = setup_initialized(&env);
    env.mock_all_auths();

    let feed = id32(&env, 3);
    let rid = id32(&env, 4);
    assert_eq!(client.try_request_data(&user, &feed, &rid), Ok(Ok(())));

    let req = client.get_request(&rid).expect("request");
    assert!(!req.fulfilled);
    assert_eq!(req.feed_id, feed);
    assert_eq!(req.payload.len(), 0);
}

#[test]
fn request_data_before_init_is_not_authorized() {
    let env = Env::default();
    let contract_id = env.register(OracleIntegration, ());
    let client = OracleIntegrationClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    env.mock_all_auths();
    let feed = id32(&env, 5);
    let rid = id32(&env, 6);
    assert_eq!(
        client.try_request_data(&user, &feed, &rid),
        Err(Ok(Error::NotAuthorized))
    );
}

#[test]
fn request_data_rejects_zero_feed_or_request_id() {
    let env = Env::default();
    let (client, _, _, _, user) = setup_initialized(&env);
    env.mock_all_auths();

    let z = zero_id32(&env);
    let good = id32(&env, 7);

    assert_eq!(
        client.try_request_data(&user, &z, &good),
        Err(Ok(Error::InvalidInput))
    );
    assert_eq!(
        client.try_request_data(&user, &good, &z),
        Err(Ok(Error::InvalidInput))
    );
}

#[test]
fn request_data_duplicate_request_id() {
    let env = Env::default();
    let (client, _, _, _, user) = setup_initialized(&env);
    env.mock_all_auths();

    let feed = id32(&env, 8);
    let rid = id32(&env, 9);
    client.request_data(&user, &feed, &rid);
    assert_eq!(
        client.try_request_data(&user, &feed, &rid),
        Err(Ok(Error::RequestExists))
    );
}

#[test]
fn request_data_requires_matching_auth() {
    let env = Env::default();
    let (client, contract_id, _, _, user) = setup_initialized(&env);
    let other = Address::generate(&env);
    let feed = id32(&env, 10);
    let rid = id32(&env, 11);

    env.mock_auths(&[MockAuth {
        address: &other,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "request_data",
            args: vec![
                &env,
                user.into_val(&env),
                feed.into_val(&env),
                rid.into_val(&env),
            ],
            sub_invokes: &[],
        },
    }]);

    assert!(client.try_request_data(&user, &feed, &rid).is_err());
}

// --- fulfill_data ---

#[test]
fn fulfill_data_updates_request_and_latest() {
    let env = Env::default();
    let (client, _, _, oracle, user) = setup_initialized(&env);
    env.mock_all_auths();

    let feed = id32(&env, 12);
    let rid = id32(&env, 13);
    client.request_data(&user, &feed, &rid);

    let payload = Bytes::from_slice(&env, b"price=42");
    let proof = Bytes::from_slice(&env, b"proof");
    assert_eq!(
        client.try_fulfill_data(&oracle, &rid, &payload, &proof),
        Ok(Ok(()))
    );

    let req = client.get_request(&rid).unwrap();
    assert!(req.fulfilled);
    assert_eq!(req.payload, payload);
    assert_eq!(client.latest(&feed), Some(payload));
}

#[test]
fn fulfill_data_rejects_empty_payload() {
    let env = Env::default();
    let (client, _, _, oracle, user) = setup_initialized(&env);
    env.mock_all_auths();

    let feed = id32(&env, 14);
    let rid = id32(&env, 15);
    client.request_data(&user, &feed, &rid);

    let empty = Bytes::new(&env);
    let proof = Bytes::from_slice(&env, b"p");
    assert_eq!(
        client.try_fulfill_data(&oracle, &rid, &empty, &proof),
        Err(Ok(Error::InvalidInput))
    );
}

#[test]
fn fulfill_data_oracle_not_whitelisted() {
    let env = Env::default();
    let (client, _, _, _, user) = setup_initialized(&env);
    let stranger = Address::generate(&env);
    env.mock_all_auths();

    let feed = id32(&env, 16);
    let rid = id32(&env, 17);
    client.request_data(&user, &feed, &rid);

    let payload = Bytes::from_slice(&env, b"x");
    let proof = Bytes::new(&env);
    assert_eq!(
        client.try_fulfill_data(&stranger, &rid, &payload, &proof),
        Err(Ok(Error::OracleNotWhitelisted))
    );
}

#[test]
fn fulfill_data_not_authorized_when_oracle_sources_missing() {
    let env = Env::default();
    let contract_id = env.register(OracleIntegration, ());
    let client = OracleIntegrationClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);

    env.mock_all_auths();
    client.init(&admin, &vec![&env, oracle.clone()]);

    env.as_contract(&contract_id, || {
        env.storage().instance().remove(&DataKey::OracleSources);
    });

    env.mock_all_auths();
    let user = Address::generate(&env);
    let feed = id32(&env, 40);
    let rid = id32(&env, 41);
    client.request_data(&user, &feed, &rid);

    let payload = Bytes::from_slice(&env, b"x");
    let proof = Bytes::new(&env);
    assert_eq!(
        client.try_fulfill_data(&oracle, &rid, &payload, &proof),
        Err(Ok(Error::NotAuthorized))
    );
}

#[test]
fn fulfill_data_request_not_found() {
    let env = Env::default();
    let (client, _, _, oracle, _) = setup_initialized(&env);
    env.mock_all_auths();

    let missing = id32(&env, 18);
    let payload = Bytes::from_slice(&env, b"x");
    let proof = Bytes::new(&env);
    assert_eq!(
        client.try_fulfill_data(&oracle, &missing, &payload, &proof),
        Err(Ok(Error::RequestNotFound))
    );
}

#[test]
fn fulfill_data_already_fulfilled() {
    let env = Env::default();
    let (client, _, _, oracle, user) = setup_initialized(&env);
    env.mock_all_auths();

    let feed = id32(&env, 19);
    let rid = id32(&env, 20);
    client.request_data(&user, &feed, &rid);

    let payload = Bytes::from_slice(&env, b"first");
    let proof = Bytes::new(&env);
    client.fulfill_data(&oracle, &rid, &payload, &proof);

    let payload2 = Bytes::from_slice(&env, b"second");
    assert_eq!(
        client.try_fulfill_data(&oracle, &rid, &payload2, &proof),
        Err(Ok(Error::AlreadyFulfilled))
    );

    assert_eq!(client.latest(&feed), Some(payload));
}

#[test]
fn fulfill_data_requires_matching_auth() {
    let env = Env::default();
    let (client, contract_id, _, oracle, user) = setup_initialized(&env);
    env.mock_all_auths();
    let feed = id32(&env, 21);
    let rid = id32(&env, 22);
    client.request_data(&user, &feed, &rid);

    let other = Address::generate(&env);
    let payload = Bytes::from_slice(&env, b"z");
    let proof = Bytes::new(&env);

    env.mock_auths(&[MockAuth {
        address: &other,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "fulfill_data",
            args: vec![
                &env,
                oracle.into_val(&env),
                rid.into_val(&env),
                payload.into_val(&env),
                proof.into_val(&env),
            ],
            sub_invokes: &[],
        },
    }]);

    assert!(client
        .try_fulfill_data(&oracle, &rid, &payload, &proof)
        .is_err());
}

// --- read helpers ---

#[test]
fn latest_none_when_missing() {
    let env = Env::default();
    let (client, _, _, _, _) = setup_initialized(&env);
    assert!(client.latest(&id32(&env, 30)).is_none());
}

#[test]
fn get_request_none_when_missing() {
    let env = Env::default();
    let (client, _, _, _, _) = setup_initialized(&env);
    assert!(client.get_request(&id32(&env, 31)).is_none());
}

#[test]
fn last_price_freshness_reports_fresh_prices() {
    let env = Env::default();
    let (client, _, _, oracle, user) = setup_initialized(&env);
    env.mock_all_auths();

    env.ledger().set_sequence_number(50);
    let feed = id32(&env, 32);
    let rid = id32(&env, 33);
    client.request_data(&user, &feed, &rid);

    let payload = Bytes::from_slice(&env, b"price=99");
    client.fulfill_data(&oracle, &rid, &payload, &Bytes::new(&env));

    env.ledger().set_sequence_number(60);
    let freshness = client.last_price_freshness(&feed);
    assert!(freshness.has_price);
    assert_eq!(freshness.payload, payload);
    assert_eq!(freshness.updated_ledger, 50);
    assert_eq!(freshness.current_ledger, 60);
    assert_eq!(freshness.age_ledgers, 10);
    assert!(!freshness.is_stale);
}

#[test]
fn last_price_freshness_reports_stale_prices() {
    let env = Env::default();
    let (client, _, _, oracle, user) = setup_initialized(&env);
    env.mock_all_auths();

    env.ledger().set_sequence_number(7);
    let feed = id32(&env, 34);
    let rid = id32(&env, 35);
    client.request_data(&user, &feed, &rid);

    let payload = Bytes::from_slice(&env, b"price=101");
    client.fulfill_data(&oracle, &rid, &payload, &Bytes::new(&env));

    env.ledger().set_sequence_number(40);
    let freshness = client.last_price_freshness(&feed);
    assert!(freshness.has_price);
    assert_eq!(freshness.updated_ledger, 7);
    assert_eq!(freshness.age_ledgers, 33);
    assert_eq!(freshness.stale_threshold_ledgers, 20);
    assert!(freshness.is_stale);
}

#[test]
fn last_price_freshness_handles_missing_prices() {
    let env = Env::default();
    let (client, _, _, _, _) = setup_initialized(&env);
    env.ledger().set_sequence_number(88);

    let freshness = client.last_price_freshness(&id32(&env, 36));
    assert!(!freshness.has_price);
    assert_eq!(freshness.payload.len(), 0);
    assert_eq!(freshness.updated_ledger, 0);
    assert_eq!(freshness.current_ledger, 88);
    assert_eq!(freshness.age_ledgers, 0);
    assert!(freshness.is_stale);
}
