/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('outbox', function(table) {
    // Use text for UUID in SQLite compatibility
    table.text('id').primary();
    table.text('transaction_xdr').notNullable();
    table.text('error_message').nullable();
    table.text('error_code').nullable();
    table.text('result_codes').nullable(); // JSON stored as text in SQLite
    table.integer('attempts').notNullable().defaultTo(0);
    table.datetime('next_retry_at').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
    table.text('status').notNullable().defaultTo('pending'); // pending, processing, completed, failed
    
    // Indexes for efficient querying
    table.index(['status', 'next_retry_at']);
    table.index(['created_at']);
    table.index(['attempts']);
    
    // Add unique constraint to prevent duplicate processing
    table.text('processing_lock').nullable().unique();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('outbox');
};
