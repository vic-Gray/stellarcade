# oracle-integration

## Public Methods

### `init`
```rust
pub fn init(env: Env, admin: Address, oracle_sources_config: Vec<Address>) -> Result<(), Error>
```

### `request_data`
```rust
pub fn request_data(env: Env, caller: Address, feed_id: BytesN<32>, request_id: BytesN<32>) -> Result<(), Error>
```

### `fulfill_data`
```rust
pub fn fulfill_data(env: Env, caller: Address, request_id: BytesN<32>, payload: Bytes, _proof: Bytes) -> Result<(), Error>
```

### `latest`
```rust
pub fn latest(env: Env, feed_id: BytesN<32>) -> Option<Bytes>
```

### `get_request`
```rust
pub fn get_request(env: Env, request_id: BytesN<32>) -> Option<OracleRequest>
```

