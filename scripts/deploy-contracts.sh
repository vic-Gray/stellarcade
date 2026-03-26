#!/bin/bash

# deploy-contracts.sh
# Builds and deploys Stellarcade contracts to the specified network.

set -e

NETWORK="testnet"
SOURCE="default"

usage() {
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  --network <name>  Network to deploy to (default: testnet)"
  echo "  --source <name>   Identity to use for deployment (default: default)"
  echo "  --build           Build contracts before deploying"
  echo "  --dry-run         Validate deployment environment without executing"
  exit 1
}

DRY_RUN=false

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --network) NETWORK="$2"; shift ;;
    --source) SOURCE="$2"; shift ;;
    --build) BUILD=true ;;
    --dry-run) DRY_RUN=true ;;
    *) usage ;;
  esac
  shift
done

if [ "$DRY_RUN" = true ]; then
  echo "--- DEPLOYMENT DRY-RUN VALIDATION ---"
  VALIDATION_ERROR=0

  # 1. Check soroban CLI
  if ! command -v soroban &> /dev/null; then
    echo "[!] Error: soroban-cli is not installed."
    VALIDATION_ERROR=1
  else
    echo "[✓] soroban-cli is installed."
  fi

  # 2. Check Identity
  if ! soroban config identity ls | grep -q "^$SOURCE$"; then
    echo "[!] Error: Identity '$SOURCE' not found in soroban config."
    VALIDATION_ERROR=1
  else
    echo "[✓] Identity '$SOURCE' is configured."
  fi

  # 3. Check Network connection
  if ! soroban network ls | grep -q "^$NETWORK$"; then
     echo "[!] Warning: Network '$NETWORK' not found in soroban config. Will attempt to use standard network if available."
  else
     echo "[✓] Network '$NETWORK' is configured."
  fi

  # 4. Check Artifacts (simplified)
  echo "Checking WASM artifacts..."
  for contract in "prize-pool" "random-generator" "coin-flip"; do
    wasm="target/wasm32-unknown-unknown/release/${contract//-/_}.wasm"
    if [ ! -f "$wasm" ]; then
      echo "  [!] Missing: $wasm (Run with --build?)"
      VALIDATION_ERROR=1
    else
      echo "  [✓] Found: $wasm"
    fi
  done

  if [ $VALIDATION_ERROR -eq 1 ]; then
    echo "-------------------------------------"
    echo "Dry-run validation FAILED."
    exit 1
  else
    echo "-------------------------------------"
    echo "Dry-run validation SUCCESSFUL. Environment is ready for deployment."
    exit 0
  fi
fi

if [ "$BUILD" = true ]; then
  echo "Building contracts..."
  cargo build --target wasm32-unknown-unknown --release
fi

echo "Deploying to $NETWORK using $SOURCE..."

# Function to deploy and save ID
deploy_contract() {
  local name=$1
  local wasm="target/wasm32-unknown-unknown/release/${name//-/_}.wasm"
  
  echo "Deploying $name..."
  # If we were actually deploying, we'd do it here. 
  # But the script is a skeleton.
  echo "$name deployment placeholder (SKELETON)"
}

deploy_contract "prize-pool"
deploy_contract "random-generator"
deploy_contract "coin-flip"

echo "Deployment cycle finished."
