# Deployment Guide

This document covers the deployment process for Stellarcade smart contracts and the backend API.

## ⛓ Smart Contracts

### Testnet Deployment

1. Build all contracts:
   ```bash
   ./scripts/deploy-contracts.sh --build
   ```
2. Validate the deployment environment (Dry-Run):
   ```bash
   ./scripts/deploy-contracts.sh --dry-run --network testnet --source <YOUR_IDENTITY>
   ```
3. Deploy to Futurenet/Testnet:
   ```bash
   ./scripts/deploy-contracts.sh --network testnet --source <YOUR_IDENTITY>
   ```
3. Save the returned Contract IDs to your `.env` file in the backend.

### Mainnet Deployment

- [ ] Prepare audited WASM binaries.
- [ ] Ensure the admin identity is a secure multi-sig account.
- [ ] Deploy using the same Soroban CLI commands with `--network mainnet`.

---

## 🚀 Backend API

### Docker Deployment

1. Build the production image:
   ```bash
   docker build -t stellarcade-backend ./backend
   ```
2. Deploy using your preferred orchestration tool (Kubernetes, AWS ECS, etc.).

### Environment Setup

Ensure the following variables are set in your production environment:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `STELLAR_NETWORK=public`
- `HORIZON_URL=https://horizon.stellar.org`

## 🔄 CI/CD Pipeline

We use GitHub Actions for our CI/CD pipeline.

- **Lint & Test**: Triggered on every Pull Request.
- **Build & Deploy**: Triggered on every merge to `main` (includes a dry-run validation step).

## 🛡 Dry-Run Validation

Before any mutating deployment step occurs, you can run a dry-run to validate required inputs, secrets, and network identifiers.

### Using the Shell Script
Run the deployment script with the `--dry-run` flag:
```bash
./scripts/deploy-contracts.sh --dry-run --network testnet
```

### Using the Backend Service
The `DeploymentService` provides a programmatic way to check deployment readiness:
```javascript
const DeploymentService = require('./src/services/deployment.service');
const report = await DeploymentService.performDryRun();
console.log(report);
```

## 📈 Monitoring

- Use **Winston** for structured logging.
- Integrate with **Sentry** for error tracking.
- Monitor Stellar network status via the [Stellar Status Dashboard](https://status.stellar.org/).

## 🔙 Rollback Procedures

- **Backend**: Redeploy the previous Docker image tag.
- **Contracts**: Update the contract reference in the backend to the previous stable Contract ID (Note: On-chain contracts are typically immutable or require a migration).
