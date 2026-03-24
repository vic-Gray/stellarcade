/**
 * Base model for Game results.
 */
const db = require('../config/database');
const logger = require('../utils/logger');

const GameModel = {
  /**
   * Creates a game row and returns the inserted record.
   *
   * @param {Object} gameData
   * @returns {Promise<Object|null>}
   */
  async create(gameData) {
    try {
      const rows = await db('games').insert(gameData).returning('*');
      return rows[0] || null;
    } catch (error) {
      logger.error('Error in GameModel.create:', error);
      throw error;
    }
  },

  /**
   * Finds a single game by id.
   *
   * @param {number|string} gameId
   * @returns {Promise<Object|null>}
   */
  async findById(gameId) {
    try {
      const game = await db('games').where({ id: gameId }).first();
      return game || null;
    } catch (error) {
      logger.error('Error in GameModel.findById:', error);
      throw error;
    }
  },

  /**
   * Lists games for a given user with pagination metadata.
   *
   * @param {Object} params
   * @param {number|string} params.userId
   * @param {number} [params.page=1]
   * @param {number} [params.limit=10]
   * @returns {Promise<{items: Array, total: number, page: number, pageSize: number}>}
   */
  async listByUser({ userId, page = 1, limit = 10 }) {
    try {
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.max(Number(limit) || 10, 1);
      const offset = (safePage - 1) * safeLimit;

      const query = db('games').where({ user_id: userId });
      const countQuery = query.clone().count('* as total').first();

      const itemsQuery = query
        .clone()
        .orderBy('created_at', 'desc')
        .limit(safeLimit)
        .offset(offset);

      const [items, countRow] = await Promise.all([itemsQuery, countQuery]);
      const total = Number(countRow?.total || 0);

      return { items, total, page: safePage, pageSize: safeLimit };
    } catch (error) {
      logger.error('Error in GameModel.listByUser:', error);
      throw error;
    }
  },

  /**
   * Finds recent games with pagination, filtering, and sorting.
   *
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number
   * @param {number} params.limit - Items per page
   * @param {string} [params.gameType] - Filter by game type
   * @param {string} [params.status] - Filter by game result (mapped from status)
   * @param {string} [params.sortBy] - Column to sort by
   * @param {string} [params.sortDir] - Sort direction (asc/desc)
   * @returns {Promise<{items: Array, total: number, page: number, pageSize: number}>}
   */
  async findRecent({ page = 1, limit = 10, gameType, status, sortBy, sortDir }) {
    try {
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.max(Number(limit) || 10, 1);
      const offset = (safePage - 1) * safeLimit;

      const allowedSortColumns = ['created_at', 'bet_amount', 'result', 'game_type'];
      const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const safeSortDir = String(sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';

      const query = db('games')
        .select('games.*', 'users.wallet_address as user_wallet')
        .join('users', 'games.user_id', 'users.id');

      if (gameType) {
        query.where('game_type', gameType);
      }

      if (status) {
        query.where('result', status);
      }

      const countQuery = query.clone().clearSelect().clearOrder().count('* as total').first();

      query.orderBy(safeSortBy, safeSortDir).limit(safeLimit).offset(offset);

      const [items, countRow] = await Promise.all([query, countQuery]);
      const total = Number(countRow?.total || 0);

      return { items, total, page: safePage, pageSize: safeLimit };
    } catch (error) {
      logger.error('Error in GameModel.findRecent:', error);
      throw error;
    }
  },

  /**
   * Updates a game row and returns updated record.
   *
   * @param {number|string} gameId
   * @param {Object} patch
   * @returns {Promise<Object|null>}
   */
  async update(gameId, patch) {
    try {
      const rows = await db('games').where({ id: gameId }).update(patch).returning('*');
      return rows[0] || null;
    } catch (error) {
      logger.error('Error in GameModel.update:', error);
      throw error;
    }
  }
};

module.exports = GameModel;
