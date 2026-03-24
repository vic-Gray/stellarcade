/**
 * Centralized model index for managing database interactions.
 */
const UserModel = require('./User.model');
const GameModel = require('./Game.model');
const TransactionModel = require('./Transaction.model');

module.exports = {
  User: UserModel,
  Game: GameModel,
  Transaction: TransactionModel,
  UserModel,
  GameModel,
  TransactionModel
};
