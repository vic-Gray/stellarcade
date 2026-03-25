const request = require('supertest');
const express = require('express');

// Mock database
jest.mock('../../src/config/database', () => {
  const mock = jest.fn();
  mock.raw = jest.fn().mockResolvedValue({});
  return mock;
});

// Mock redis
jest.mock('../../src/config/redis', () => {
  const mockClient = {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(),
    setEx: jest.fn().mockResolvedValue('OK'),
    connect: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
    isOpen: true,
  };
  return { client: mockClient, connectPromise: Promise.resolve() };
});

// Mock stellar
jest.mock('../../src/config/stellar', () => ({
  server: {
    root: jest.fn().mockResolvedValue({}),
  },
  network: 'testnet',
  passphrase: 'Test SDF Network ; September 2015',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  getContractClient: jest.fn(),
}));

// Mock logger to suppress output during tests
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const db = require('../../src/config/database');
const { client: redisClient } = require('../../src/config/redis');
const { server: horizonServer } = require('../../src/config/stellar');
const { getDeepHealth } = require('../../src/controllers/health.controller');

// Create a standalone app for testing
const app = express();
app.use(express.json());
app.get('/api/health/deep', getDeepHealth);

describe('GET /api/health/deep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.raw.mockResolvedValue({});
    redisClient.ping.mockResolvedValue('PONG');
    horizonServer.root.mockResolvedValue({});
  });

  describe('all-up scenario', () => {
    test('returns healthy status when all dependencies are up', async () => {
      const res = await request(app).get('/api/health/deep');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.dependencies.db.status).toBe('healthy');
      expect(res.body.dependencies.redis.status).toBe('healthy');
      expect(res.body.dependencies.stellar.status).toBe('healthy');
    });
  });

  describe('partial-down scenario', () => {
    test('returns degraded status when database is down', async () => {
      db.raw.mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/api/health/deep');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.dependencies.db.status).toBe('unhealthy');
      expect(res.body.dependencies.db.error).toBe('Connection refused');
      expect(res.body.dependencies.redis.status).toBe('healthy');
      expect(res.body.dependencies.stellar.status).toBe('healthy');
    });

    test('returns degraded status when redis is down', async () => {
      redisClient.ping.mockRejectedValue(new Error('Redis unavailable'));

      const res = await request(app).get('/api/health/deep');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.dependencies.db.status).toBe('healthy');
      expect(res.body.dependencies.redis.status).toBe('unhealthy');
      expect(res.body.dependencies.redis.error).toBe('Redis unavailable');
    });

    test('returns degraded status when stellar is down', async () => {
      horizonServer.root.mockRejectedValue(new Error('Horizon unreachable'));

      const res = await request(app).get('/api/health/deep');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('degraded');
      expect(res.body.dependencies.stellar.status).toBe('unhealthy');
      expect(res.body.dependencies.stellar.error).toBe('Horizon unreachable');
    });

    test('returns unhealthy status when all dependencies are down', async () => {
      db.raw.mockRejectedValue(new Error('DB down'));
      redisClient.ping.mockRejectedValue(new Error('Redis down'));
      horizonServer.root.mockRejectedValue(new Error('Stellar down'));

      const res = await request(app).get('/api/health/deep');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('unhealthy');
      expect(res.body.dependencies.db.status).toBe('unhealthy');
      expect(res.body.dependencies.redis.status).toBe('unhealthy');
      expect(res.body.dependencies.stellar.status).toBe('unhealthy');
    });
  });

  describe('timeout handling', () => {
    test('marks a dependency as unhealthy when it exceeds timeout', async () => {
      db.raw.mockImplementation(() => new Promise((resolve) => {
        setTimeout(resolve, 10000);
      }));

      // Use the health service directly with a short timeout
      const healthService = require('../../src/services/health.service');
      const result = await healthService.deepHealthCheck({ timeoutMs: 50 });

      expect(result.status).not.toBe('healthy');
      expect(result.dependencies.db.status).toBe('unhealthy');
      expect(result.dependencies.db.error).toMatch(/timed out/);
    });
  });

  describe('response shape consistency', () => {
    test('always includes status, timestamp, and dependencies object', async () => {
      const res = await request(app).get('/api/health/deep');

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('dependencies');
      expect(typeof res.body.status).toBe('string');
      expect(typeof res.body.timestamp).toBe('string');
      expect(typeof res.body.dependencies).toBe('object');
    });

    test('each dependency has status and latency_ms fields', async () => {
      const res = await request(app).get('/api/health/deep');

      for (const dep of ['db', 'redis', 'stellar']) {
        expect(res.body.dependencies[dep]).toHaveProperty('status');
        expect(res.body.dependencies[dep]).toHaveProperty('latency_ms');
        expect(typeof res.body.dependencies[dep].status).toBe('string');
        expect(typeof res.body.dependencies[dep].latency_ms).toBe('number');
      }
    });

    test('unhealthy dependencies include error field', async () => {
      db.raw.mockRejectedValue(new Error('Connection lost'));

      const res = await request(app).get('/api/health/deep');

      expect(res.body.dependencies.db).toHaveProperty('error');
      expect(typeof res.body.dependencies.db.error).toBe('string');
      // Healthy dependencies should not have error field
      expect(res.body.dependencies.redis.error).toBeUndefined();
    });

    test('status is one of healthy, degraded, or unhealthy', async () => {
      const res = await request(app).get('/api/health/deep');

      expect(['healthy', 'degraded', 'unhealthy']).toContain(res.body.status);
    });

    test('timestamp is a valid ISO 8601 string', async () => {
      const res = await request(app).get('/api/health/deep');

      const parsed = new Date(res.body.timestamp);
      expect(parsed.toISOString()).toBe(res.body.timestamp);
    });
  });
});
