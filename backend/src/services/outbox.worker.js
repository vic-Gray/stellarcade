const stellarService = require('./stellar.service');
const Outbox = require('../models/Outbox.model');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {number} Delay in milliseconds
 */
const calculateBackoff = (attempt, baseDelay = 1000, maxDelay = 300000) => {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
  return Math.min(delay + jitter, maxDelay);
};

/**
 * Determine if error is retryable
 * @param {string} errorCode - Stellar error code
 * @returns {boolean} True if error is retryable
 */
const isRetryableError = (errorCode) => {
  const retryableErrors = [
    stellarService.STELLAR_ERRORS.TIMEOUT,
    stellarService.STELLAR_ERRORS.NETWORK_ERROR,
    stellarService.STELLAR_ERRORS.RATE_LIMITED,
    stellarService.STELLAR_ERRORS.SERVER_ERROR,
  ];
  
  return retryableErrors.includes(errorCode);
};

/**
 * Process a single outbox entry
 * @param {Object} entry - Outbox entry
 * @returns {Promise<boolean>} True if processing was successful
 */
const processOutboxEntry = async (entry) => {
  const lockId = crypto.randomUUID();
  const startTime = Date.now();
  
  logger.info(`Processing outbox entry ${entry.id}`, {
    id: entry.id,
    attempts: entry.attempts,
  });

  try {
    // Acquire lock to prevent duplicate processing
    const lockAcquired = await Outbox.acquireLock(entry.id, lockId);
    if (!lockAcquired) {
      logger.debug(`Failed to acquire lock for outbox entry ${entry.id}, likely already being processed`);
      return false;
    }

    // Submit transaction to Stellar
    const result = await stellarService.submitTransaction(entry.transaction_xdr);
    
    if (result.status === 'success') {
      // Transaction succeeded - mark as completed
      await Outbox.markCompleted(entry.id, lockId);
      
      logger.info(`Successfully processed outbox entry ${entry.id}`, {
        id: entry.id,
        hash: result.hash,
        ledger: result.ledger,
        processingTime: Date.now() - startTime,
      });
      
      return true;
    } else {
      // Transaction failed - determine if retryable
      const isRetryable = isRetryableError(result.errorCode);
      const maxAttempts = 5;
      
      if (isRetryable && entry.attempts < maxAttempts) {
        // Schedule retry with exponential backoff
        const nextRetryAt = new Date(Date.now() + calculateBackoff(entry.attempts));
        
        await Outbox.markFailed(entry.id, lockId, {
          error_code: result.errorCode,
          error_message: result.errorMessage,
          result_codes: result.resultCodes,
        }, nextRetryAt);
        
        logger.warn(`Scheduled retry for outbox entry ${entry.id}`, {
          id: entry.id,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          attempts: entry.attempts + 1,
          nextRetryAt,
          processingTime: Date.now() - startTime,
        });
        
        return false;
      } else {
        // Mark as permanently failed
        await Outbox.markPermanentlyFailed(entry.id, lockId, {
          error_code: result.errorCode,
          error_message: result.errorMessage,
          result_codes: result.resultCodes,
        });
        
        logger.error(`Permanently failed outbox entry ${entry.id}`, {
          id: entry.id,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          resultCodes: result.resultCodes,
          attempts: entry.attempts + 1,
          processingTime: Date.now() - startTime,
        });
        
        return false;
      }
    }
  } catch (error) {
    // Unexpected error - release lock and schedule retry
    try {
      const nextRetryAt = new Date(Date.now() + calculateBackoff(entry.attempts));
      
      await Outbox.markFailed(entry.id, lockId, {
        error_code: 'UNEXPECTED_ERROR',
        error_message: error.message,
        result_codes: null,
      }, nextRetryAt);
      
      logger.error(`Unexpected error processing outbox entry ${entry.id}`, {
        id: entry.id,
        error: error.message,
        stack: error.stack,
        attempts: entry.attempts + 1,
        nextRetryAt,
        processingTime: Date.now() - startTime,
      });
    } catch (releaseError) {
      logger.error(`Failed to update outbox entry ${entry.id} after error`, {
        id: entry.id,
        error: releaseError.message,
      });
    }
    
    return false;
  }
};

/**
 * Process pending outbox entries
 * @param {Object} options - Processing options
 * @param {number} options.batchSize - Number of entries to process in one batch
 * @param {number} options.maxProcessingTime - Maximum processing time in milliseconds
 * @returns {Promise<Object>} Processing results
 */
const processPendingEntries = async (options = {}) => {
  const {
    batchSize = 10,
    maxProcessingTime = 30000, // 30 seconds
  } = options;
  
  const startTime = Date.now();
  const results = {
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  };
  
  logger.info('Starting outbox worker processing', {
    batchSize,
    maxProcessingTime,
  });

  try {
    // Get pending entries ready for retry
    const entries = await Outbox.getPendingForRetry(batchSize);
    
    if (entries.length === 0) {
      logger.info('No pending outbox entries to process');
      return results;
    }

    logger.info(`Found ${entries.length} pending outbox entries to process`);

    // Process entries sequentially to maintain order and avoid overwhelming Stellar
    for (const entry of entries) {
      // Check if we've exceeded max processing time
      if (Date.now() - startTime > maxProcessingTime) {
        logger.info('Reached maximum processing time, stopping');
        break;
      }

      try {
        const success = await processOutboxEntry(entry);
        results.processed++;
        
        if (success) {
          results.successful++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.errors.push({
          id: entry.id,
          error: error.message,
        });
        results.failed++;
        
        logger.error(`Failed to process outbox entry ${entry.id}`, {
          id: entry.id,
          error: error.message,
        });
      }
    }

    logger.info('Completed outbox worker processing', {
      processed: results.processed,
      successful: results.successful,
      failed: results.failed,
      processingTime: Date.now() - startTime,
    });

    return results;
  } catch (error) {
    logger.error('Outbox worker processing failed', {
      error: error.message,
      stack: error.stack,
      processingTime: Date.now() - startTime,
    });
    
    results.errors.push({
      error: error.message,
    });
    
    return results;
  }
};

/**
 * Start the outbox worker with polling
 * @param {Object} options - Worker options
 * @param {number} options.pollInterval - Polling interval in milliseconds
 * @param {number} options.batchSize - Number of entries to process per batch
 * @param {number} options.maxProcessingTime - Maximum processing time per batch
 */
const startWorker = async (options = {}) => {
  const {
    pollInterval = 5000, // 5 seconds
    batchSize = 10,
    maxProcessingTime = 30000,
  } = options;
  
  logger.info('Starting outbox worker', {
    pollInterval,
    batchSize,
    maxProcessingTime,
  });

  let running = true;
  
  while (running) {
    try {
      await processPendingEntries({
        batchSize,
        maxProcessingTime,
      });
    } catch (error) {
      logger.error('Outbox worker iteration failed', {
        error: error.message,
        stack: error.stack,
      });
    }
    
    // Wait before next iteration
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
};

module.exports = {
  processPendingEntries,
  processOutboxEntry,
  startWorker,
  calculateBackoff,
  isRetryableError,
  // Exported for testing
  _calculateBackoff: calculateBackoff,
  _isRetryableError: isRetryableError,
};
