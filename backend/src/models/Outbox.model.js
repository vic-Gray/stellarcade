const knex = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Outbox = {
  /**
   * Create a new outbox entry
   * @param {Object} data - Outbox data
   * @param {string} data.transaction_xdr - Base64 encoded transaction XDR
   * @returns {Promise<Object>} Created outbox entry
   */
  async create(data) {
    const [outbox] = await knex('outbox')
      .insert({
        id: uuidv4(),
        transaction_xdr: data.transaction_xdr,
        status: 'pending',
        next_retry_at: new Date(), // Retry immediately
      })
      .returning('*');
    
    return outbox;
  },

  /**
   * Get pending outbox entries ready for retry
   * @param {number} limit - Maximum number of entries to fetch
   * @returns {Promise<Array>} Array of outbox entries
   */
  async getPendingForRetry(limit = 10) {
    return knex('outbox')
      .where('status', 'pending')
      .where('next_retry_at', '<=', new Date())
      .where('attempts', '<', 5) // Max 5 attempts
      .orderBy('created_at', 'asc')
      .limit(limit);
  },

  /**
   * Lock an outbox entry for processing (prevent duplicate processing)
   * @param {string} id - Outbox entry ID
   * @param {string} lockId - Unique lock identifier
   * @returns {Promise<boolean>} True if lock was acquired
   */
  async acquireLock(id, lockId) {
    const updated = await knex('outbox')
      .where('id', id)
      .where('status', 'pending')
      .whereNull('processing_lock')
      .update({
        status: 'processing',
        processing_lock: lockId,
        updated_at: new Date(),
      });
    
    return updated > 0;
  },

  /**
   * Release lock on an outbox entry
   * @param {string} id - Outbox entry ID
   * @param {string} lockId - Lock identifier
   * @returns {Promise<boolean>} True if lock was released
   */
  async releaseLock(id, lockId) {
    const updated = await knex('outbox')
      .where('id', id)
      .where('processing_lock', lockId)
      .update({
        status: 'pending',
        processing_lock: null,
        updated_at: new Date(),
      });
    
    return updated > 0;
  },

  /**
   * Mark outbox entry as completed
   * @param {string} id - Outbox entry ID
   * @param {string} lockId - Lock identifier
   * @returns {Promise<boolean>} True if marked as completed
   */
  async markCompleted(id, lockId) {
    const updated = await knex('outbox')
      .where('id', id)
      .where('processing_lock', lockId)
      .update({
        status: 'completed',
        processing_lock: null,
        updated_at: new Date(),
      });
    
    return updated > 0;
  },

  /**
   * Mark outbox entry as failed and schedule retry
   * @param {string} id - Outbox entry ID
   * @param {string} lockId - Lock identifier
   * @param {Object} errorData - Error information
   * @param {string} errorData.error_code - Error code
   * @param {string} errorData.error_message - Error message
   * @param {Object} errorData.result_codes - Result codes from Stellar
   * @param {Date} nextRetryAt - Next retry timestamp
   * @returns {Promise<boolean>} True if marked as failed
   */
  async markFailed(id, lockId, errorData, nextRetryAt) {
    const updated = await knex('outbox')
      .where('id', id)
      .where('processing_lock', lockId)
      .update({
        status: 'pending',
        processing_lock: null,
        attempts: knex.raw('attempts + 1'),
        error_message: errorData.error_message,
        error_code: errorData.error_code,
        result_codes: errorData.result_codes,
        next_retry_at: nextRetryAt,
        updated_at: new Date(),
      });
    
    return updated > 0;
  },

  /**
   * Mark outbox entry as permanently failed (max attempts reached)
   * @param {string} id - Outbox entry ID
   * @param {string} lockId - Lock identifier
   * @param {Object} errorData - Error information
   * @returns {Promise<boolean>} True if marked as failed
   */
  async markPermanentlyFailed(id, lockId, errorData) {
    const updated = await knex('outbox')
      .where('id', id)
      .where('processing_lock', lockId)
      .update({
        status: 'failed',
        processing_lock: null,
        error_message: errorData.error_message,
        error_code: errorData.error_code,
        result_codes: errorData.result_codes,
        updated_at: new Date(),
      });
    
    return updated > 0;
  },

  /**
   * Get outbox entry by ID
   * @param {string} id - Outbox entry ID
   * @returns {Promise<Object|null>} Outbox entry or null
   */
  async findById(id) {
    const [outbox] = await knex('outbox')
      .where('id', id)
      .select('*');
    
    return outbox || null;
  },

  /**
   * Get statistics about outbox entries
   * @returns {Promise<Object>} Statistics
   */
  async getStats() {
    const stats = await knex('outbox')
      .select('status')
      .count('* as count')
      .groupBy('status');
    
    return stats.reduce((acc, stat) => {
      acc[stat.status] = parseInt(stat.count);
      return acc;
    }, {});
  },
};

module.exports = Outbox;
