#![no_std]
#![allow(unexpected_cfgs)]

use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, Address, Env};

pub const PERSISTENT_BUMP_LEDGERS: u32 = 518_400;
const FAILED_SETTLEMENT_ALERT_THRESHOLD: u64 = 3;
const ERROR_RATE_ALERT_PERCENT: u64 = 20;
const ERROR_RATE_MIN_SAMPLE: u64 = 10;
pub const MAX_RECENT_EVENTS: u32 = 200;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    DuplicateEvent = 4,
    InvalidWindowSize = 5,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Paused,
    Metrics,
    SeenEvent(u64),
    RecentEvents,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EventKind {
    SettlementSuccess = 0,
    SettlementFailed = 1,
    ContractError = 2,
    Paused = 3,
    Resumed = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimedEvent {
    pub timestamp: u64,
    pub kind: EventKind,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq, Default)]
pub struct Metrics {
    pub total_events: u64,
    pub settlement_success: u64,
    pub settlement_failed: u64,
    pub error_events: u64,
    pub paused_events: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HealthSnapshot {
    pub paused: bool,
    pub high_error_rate: bool,
    pub failed_settlement_alert: bool,
}

#[contractevent]
pub struct EventIngested {
    #[topic]
    pub event_id: u64,
    pub kind: EventKind,
}

#[contractevent]
pub struct AlertRaised {
    #[topic]
    pub alert: u32,
}

#[contract]
pub struct ContractMonitoring;

#[contractimpl]
impl ContractMonitoring {
    pub fn init(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Metrics, &Metrics::default());
        Ok(())
    }

    pub fn ingest_event(env: Env, admin: Address, event_id: u64, kind: EventKind) -> Result<Metrics, Error> {
        require_admin(&env, &admin)?;

        let seen_key = DataKey::SeenEvent(event_id);
        if env.storage().persistent().has(&seen_key) {
            return Err(Error::DuplicateEvent);
        }

        let mut metrics: Metrics = env.storage().instance().get(&DataKey::Metrics).unwrap_or_default();
        apply_event(&mut metrics, &kind);

        env.storage().instance().set(&DataKey::Metrics, &metrics);
        env.storage().persistent().set(&seen_key, &true);
        env.storage().persistent().extend_ttl(&seen_key, PERSISTENT_BUMP_LEDGERS, PERSISTENT_BUMP_LEDGERS);

        // Record timed event for sliding window
        let now = env.ledger().timestamp();
        let mut recent_events: soroban_sdk::Vec<TimedEvent> = env.storage().instance().get(&DataKey::RecentEvents).unwrap_or_else(|| soroban_sdk::Vec::new(&env));
        recent_events.push_back(TimedEvent { timestamp: now, kind: kind.clone() });
        if recent_events.len() > MAX_RECENT_EVENTS {
            recent_events.pop_front();
        }
        env.storage().instance().set(&DataKey::RecentEvents, &recent_events);

        EventIngested { event_id, kind: kind.clone() }.publish(&env);

        let health = evaluate_health(&metrics, is_paused(&env));
        if health.failed_settlement_alert {
            AlertRaised { alert: 1 }.publish(&env);
        }
        if health.high_error_rate {
            AlertRaised { alert: 2 }.publish(&env);
        }
        if health.paused {
            AlertRaised { alert: 3 }.publish(&env);
        }

        Ok(metrics)
    }

    pub fn set_paused(env: Env, admin: Address, paused: bool) -> Result<(), Error> {
        require_admin(&env, &admin)?;
        env.storage().instance().set(&DataKey::Paused, &paused);
        Ok(())
    }

    pub fn get_metrics(env: Env) -> Metrics {
        env.storage().instance().get(&DataKey::Metrics).unwrap_or_default()
    }

    pub fn get_health(env: Env) -> HealthSnapshot {
        evaluate_health(&Self::get_metrics(env.clone()), is_paused(&env))
    }

    pub fn get_sliding_window_metrics(env: Env, window_seconds: u64) -> Result<Metrics, Error> {
        if window_seconds == 0 {
            return Err(Error::InvalidWindowSize);
        }
        let now = env.ledger().timestamp();
        let start_time = now.saturating_sub(window_seconds);
        let recent_events: soroban_sdk::Vec<TimedEvent> = env.storage().instance().get(&DataKey::RecentEvents).unwrap_or_else(|| soroban_sdk::Vec::new(&env));

        let mut window_metrics = Metrics::default();
        for event in recent_events.iter() {
            if event.timestamp >= start_time {
                apply_event(&mut window_metrics, &event.kind);
            }
        }
        Ok(window_metrics)
    }
}

fn require_admin(env: &Env, admin: &Address) -> Result<(), Error> {
    if !env.storage().instance().has(&DataKey::Admin) {
        return Err(Error::NotInitialized);
    }
    admin.require_auth();
    let owner: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    if &owner != admin {
        return Err(Error::NotAuthorized);
    }
    Ok(())
}

fn is_paused(env: &Env) -> bool {
    env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
}

fn apply_event(metrics: &mut Metrics, kind: &EventKind) {
    metrics.total_events = metrics.total_events.saturating_add(1);
    match kind {
        EventKind::SettlementSuccess => metrics.settlement_success = metrics.settlement_success.saturating_add(1),
        EventKind::SettlementFailed => metrics.settlement_failed = metrics.settlement_failed.saturating_add(1),
        EventKind::ContractError => metrics.error_events = metrics.error_events.saturating_add(1),
        EventKind::Paused => metrics.paused_events = metrics.paused_events.saturating_add(1),
        EventKind::Resumed => {}
    }
}

fn evaluate_health(metrics: &Metrics, paused: bool) -> HealthSnapshot {
    let high_error_rate = is_high_error_rate(metrics.error_events, metrics.total_events);
    let failed_settlement_alert = metrics.settlement_failed >= FAILED_SETTLEMENT_ALERT_THRESHOLD;

    HealthSnapshot {
        paused,
        high_error_rate,
        failed_settlement_alert,
    }
}

fn is_high_error_rate(error_events: u64, total_events: u64) -> bool {
    if total_events < ERROR_RATE_MIN_SAMPLE || total_events == 0 {
        return false;
    }
    (error_events.saturating_mul(100) / total_events) >= ERROR_RATE_ALERT_PERCENT
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};

    #[test]
    fn marks_error_rate_when_threshold_crossed() {
        assert!(!is_high_error_rate(1, 5));
        assert!(!is_high_error_rate(1, 10));
        assert!(is_high_error_rate(2, 10));
        assert!(is_high_error_rate(3, 10));
    }

    #[test]
    fn applies_event_counts_deterministically() {
        let mut metrics = Metrics::default();
        apply_event(&mut metrics, &EventKind::SettlementSuccess);
        apply_event(&mut metrics, &EventKind::SettlementFailed);
        apply_event(&mut metrics, &EventKind::ContractError);

        assert_eq!(metrics.total_events, 3);
        assert_eq!(metrics.settlement_success, 1);
        assert_eq!(metrics.settlement_failed, 1);
        assert_eq!(metrics.error_events, 1);
    }

    #[test]
    fn test_sliding_window_metrics() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(ContractMonitoring, ());
        let client = ContractMonitoringClient::new(&env, &contract_id);

        client.init(&admin);

        // T=100
        env.ledger().set_timestamp(100);
        client.ingest_event(&admin, &1, &EventKind::SettlementSuccess);

        // T=200
        env.ledger().set_timestamp(200);
        client.ingest_event(&admin, &2, &EventKind::ContractError);

        // T=300
        env.ledger().set_timestamp(300);
        client.ingest_event(&admin, &3, &EventKind::SettlementSuccess);

        // Window 150s (T=150 to T=300). Events at 200, 300 included.
        let m = client.get_sliding_window_metrics(&150);
        assert_eq!(m.total_events, 2);
        assert_eq!(m.settlement_success, 1);
        assert_eq!(m.error_events, 1);

        // Window 50s (T=250 to T=300). Only event at 300 included.
        let m = client.get_sliding_window_metrics(&50);
        assert_eq!(m.total_events, 1);
        assert_eq!(m.settlement_success, 1);

        // Window 1000s. All 3 included.
        let m = client.get_sliding_window_metrics(&1000);
        assert_eq!(m.total_events, 3);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #5)")]
    fn test_sliding_window_invalid_size() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let contract_id = env.register(ContractMonitoring, ());
        let client = ContractMonitoringClient::new(&env, &contract_id);

        env.mock_all_auths();
        client.init(&admin);

        client.get_sliding_window_metrics(&0);
    }

    #[test]
    fn test_sliding_window_cap() {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let contract_id = env.register(ContractMonitoring, ());
        let client = ContractMonitoringClient::new(&env, &contract_id);

        client.init(&admin);

        for i in 0..210 {
            client.ingest_event(&admin, &(i as u64), &EventKind::SettlementSuccess);
        }

        let m = client.get_sliding_window_metrics(&86400);
        // Should be capped at MAX_RECENT_EVENTS (200)
        assert_eq!(m.total_events, 200);
    }
}
