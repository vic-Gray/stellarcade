/**
 * Logic for submitting and monitoring transactions on the Stellar network.
 */
const StellarSdk = require('@stellar/stellar-sdk');
const logger = require('../utils/logger');
const { server, passphrase } = require('../config/stellar');
const Outbox = require('../models/Outbox.model');

/**
 * Error codes returned in the service result for structured error handling by callers.
 */
const STELLAR_ERRORS = {
  INVALID_XDR: 'INVALID_XDR',
  TX_FAILED: 'TX_FAILED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
};

/**
 * Parse a Horizon error response into a structured object.
 * Horizon wraps submission failures inside response.data.extras.result_codes.
 *
 * @param {import('@stellar/stellar-sdk').NetworkError} err
 * @returns {{ code: string, message: string, resultCodes: object|null, httpStatus: number|null }}
 */
const parseHorizonError = (err) => {
  const response = err.response || {};
  const httpStatus = response.status || null;
  const data = response.data || {};
  const resultCodes = data.extras?.result_codes || null;

  // 408 / ECONNABORTED / ERR_CANCELED → timeout
  if (
    httpStatus === 408 ||
    err.code === 'ECONNABORTED' ||
    err.code === 'ERR_CANCELED' ||
    /timeout/i.test(err.message || '')
  ) {
    return { code: STELLAR_ERRORS.TIMEOUT, message: 'Request timed out', resultCodes, httpStatus };
  }

  // 429 → rate limited
  if (httpStatus === 429) {
    return {
      code: STELLAR_ERRORS.RATE_LIMITED,
      message: 'Horizon rate limit exceeded',
      resultCodes,
      httpStatus,
    };
  }

  // 400 with result_codes → transaction was submitted but failed on-chain
  if (httpStatus === 400 && resultCodes) {
    return {
      code: STELLAR_ERRORS.TX_FAILED,
      message: data.title || 'Transaction failed',
      resultCodes,
      httpStatus,
    };
  }

  // 5xx → Horizon server error
  if (httpStatus >= 500) {
    return {
      code: STELLAR_ERRORS.SERVER_ERROR,
      message: data.title || `Horizon server error (${httpStatus})`,
      resultCodes,
      httpStatus,
    };
  }

  // fallback
  return {
    code: STELLAR_ERRORS.NETWORK_ERROR,
    message: err.message || 'Unknown network error',
    resultCodes,
    httpStatus,
  };
};

/**
 * Submit a base64-encoded Stellar transaction XDR to the configured Horizon endpoint.
 *
 * @param {string} transactionXDR - Base64-encoded TransactionEnvelope XDR string.
 * @returns {Promise<{
 *   status: 'success'|'error',
 *   hash: string|null,
 *   ledger: number|null,
 *   successful: boolean,
 *   envelopeXDR: string|null,
 *   resultXDR: string|null,
 *   errorCode: string|null,
 *   errorMessage: string|null,
 *   resultCodes: object|null,
 * }>}
 */
const submitTransaction = async (transactionXDR) => {
  // --- 1. Deserialise and validate XDR ---
  let transaction;
  try {
    transaction = StellarSdk.TransactionBuilder.fromXDR(transactionXDR, passphrase);
  } catch (parseErr) {
    logger.warn('Invalid transaction XDR supplied:', parseErr.message);
    return {
      status: 'error',
      hash: null,
      ledger: null,
      successful: false,
      envelopeXDR: null,
      resultXDR: null,
      errorCode: STELLAR_ERRORS.INVALID_XDR,
      errorMessage: `Invalid XDR: ${parseErr.message}`,
      resultCodes: null,
    };
  }

  // --- 2. Submit to Horizon ---
  logger.info('Submitting transaction to Stellar network...');
  try {
    const response = await server.submitTransaction(transaction);

    logger.info(`Transaction submitted successfully. hash=${response.hash} ledger=${response.ledger}`);

    return {
      status: 'success',
      hash: response.hash,
      ledger: response.ledger,
      successful: response.successful,
      envelopeXDR: response.envelope_xdr,
      resultXDR: response.result_xdr,
      errorCode: null,
      errorMessage: null,
      resultCodes: null,
    };
  } catch (err) {
    const parsed = parseHorizonError(err);

    logger.error(
      `Transaction submission failed. code=${parsed.code} httpStatus=${parsed.httpStatus} message=${parsed.message}`,
      { resultCodes: parsed.resultCodes }
    );

    return {
      status: 'error',
      hash: null,
      ledger: null,
      successful: false,
      envelopeXDR: null,
      resultXDR: null,
      errorCode: parsed.code,
      errorMessage: parsed.message,
      resultCodes: parsed.resultCodes,
    };
  }
};

/**
 * Add a transaction to the outbox for deferred processing.
 * This provides idempotent retry semantics and observability.
 *
 * @param {string} transactionXDR - Base64-encoded TransactionEnvelope XDR string.
 * @returns {Promise<{
 *   status: 'queued'|'error',
 *   outboxId: string|null,
 *   errorCode: string|null,
 *   errorMessage: string|null,
 * }>}
 */
const submitTransactionAsync = async (transactionXDR) => {
  // Validate XDR before adding to outbox
  let _transaction;
  try {
    _transaction = StellarSdk.TransactionBuilder.fromXDR(transactionXDR, passphrase);
  } catch (parseErr) {
    logger.warn('Invalid transaction XDR supplied for async submission:', parseErr.message);
    return {
      status: 'error',
      outboxId: null,
      errorCode: STELLAR_ERRORS.INVALID_XDR,
      errorMessage: `Invalid XDR: ${parseErr.message}`,
    };
  }

  try {
    const outbox = await Outbox.create({
      transaction_xdr: transactionXDR,
    });

    logger.info(`Transaction queued for deferred processing. outboxId=${outbox.id}`);

    return {
      status: 'queued',
      outboxId: outbox.id,
      errorCode: null,
      errorMessage: null,
    };
  } catch (err) {
    logger.error('Failed to queue transaction for deferred processing:', err);
    return {
      status: 'error',
      outboxId: null,
      errorCode: 'OUTBOX_ERROR',
      errorMessage: `Failed to queue transaction: ${err.message}`,
    };
  }
};

module.exports = {
  submitTransaction,
  submitTransactionAsync,
  STELLAR_ERRORS,
  // exported for testing only
  _parseHorizonError: parseHorizonError,
};
