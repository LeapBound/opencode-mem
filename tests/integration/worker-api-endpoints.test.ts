/**
 * Worker API Endpoints Integration Tests
 *
 * Tests all REST API endpoints with real HTTP and database.
 * Uses real Server instance with in-memory database.
 *
 * Sources:
 * - Server patterns from tests/server/server.test.ts
 * - Session routes from src/services/worker/http/routes/SessionRoutes.ts
 * - Search routes from src/services/worker/http/routes/SearchRoutes.ts
 */

import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { logger } from '../../src/utils/logger.js';
import express from 'express';

// Mock middleware to avoid complex dependencies
mock.module('../../src/services/worker/http/middleware.js', () => ({
  createMiddleware: () => [express.json()],
  requireLocalhost: (_req: any, _res: any, next: any) => next(),
  summarizeRequestBody: () => 'test body',
}));

// Import after mocks
import { Server } from '../../src/services/server/Server.js';
import type { ServerOptions } from '../../src/services/server/Server.js';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';
import { SessionRoutes } from '../../src/services/worker/http/routes/SessionRoutes.js';

// Suppress logger output during tests
let loggerSpies: ReturnType<typeof spyOn>[] = [];

describe('Worker API Endpoints Integration', () => {
  let server: Server;
  let testPort: number;
  let mockOptions: ServerOptions;

  beforeEach(() => {
    loggerSpies = [
      spyOn(logger, 'info').mockImplementation(() => {}),
      spyOn(logger, 'debug').mockImplementation(() => {}),
      spyOn(logger, 'warn').mockImplementation(() => {}),
      spyOn(logger, 'error').mockImplementation(() => {}),
    ];

    mockOptions = {
      getInitializationComplete: () => true,
      getMcpReady: () => true,
      onShutdown: mock(() => Promise.resolve()),
      onRestart: mock(() => Promise.resolve()),
    };

    testPort = 40000 + Math.floor(Math.random() * 10000);
  });

  afterEach(async () => {
    loggerSpies.forEach(spy => spy.mockRestore());

    if (server && server.getHttpServer()) {
      try {
        await server.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    mock.restore();
  });

  describe('Health/Readiness/Version Endpoints', () => {
    describe('GET /api/health', () => {
      it('should return status, initialized, mcpReady, platform, pid', async () => {
        server = new Server(mockOptions);
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body).toHaveProperty('status', 'ok');
        expect(body).toHaveProperty('initialized', true);
        expect(body).toHaveProperty('mcpReady', true);
        expect(body).toHaveProperty('platform');
        expect(body).toHaveProperty('pid');
        expect(typeof body.platform).toBe('string');
        expect(typeof body.pid).toBe('number');
      });

      it('should reflect uninitialized state', async () => {
        const uninitOptions: ServerOptions = {
          getInitializationComplete: () => false,
          getMcpReady: () => false,
          onShutdown: mock(() => Promise.resolve()),
          onRestart: mock(() => Promise.resolve()),
        };

        server = new Server(uninitOptions);
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
        const body = await response.json();

        expect(body.status).toBe('ok'); // Health always returns ok
        expect(body.initialized).toBe(false);
        expect(body.mcpReady).toBe(false);
      });
    });

    describe('GET /api/readiness', () => {
      it('should return 200 with status ready when initialized', async () => {
        server = new Server(mockOptions);
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/readiness`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body.status).toBe('ready');
        expect(body.mcpReady).toBe(true);
      });

      it('should return 503 with status initializing when not ready', async () => {
        const uninitOptions: ServerOptions = {
          getInitializationComplete: () => false,
          getMcpReady: () => false,
          onShutdown: mock(() => Promise.resolve()),
          onRestart: mock(() => Promise.resolve()),
        };

        server = new Server(uninitOptions);
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/readiness`);
        expect(response.status).toBe(503);

        const body = await response.json();
        expect(body.status).toBe('initializing');
        expect(body.message).toContain('initializing');
      });
    });

    describe('GET /api/version', () => {
      it('should return version string', async () => {
        server = new Server(mockOptions);
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/version`);
        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body).toHaveProperty('version');
        expect(typeof body.version).toBe('string');
      });
    });
  });

  describe('Error Handling', () => {
    describe('404 Not Found', () => {
      it('should return 404 for unknown GET routes', async () => {
        server = new Server(mockOptions);
        server.finalizeRoutes();
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/unknown-endpoint`);
        expect(response.status).toBe(404);

        const body = await response.json();
        expect(body.error).toBe('NotFound');
      });

      it('should return 404 for unknown POST routes', async () => {
        server = new Server(mockOptions);
        server.finalizeRoutes();
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/unknown-endpoint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        });
        expect(response.status).toBe(404);
      });

      it('should return 404 for nested unknown routes', async () => {
        server = new Server(mockOptions);
        server.finalizeRoutes();
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/search/nonexistent/nested`);
        expect(response.status).toBe(404);
      });
    });

    describe('Method handling', () => {
      it('should handle OPTIONS requests', async () => {
        server = new Server(mockOptions);
        await server.listen(testPort, '127.0.0.1');

        const response = await fetch(`http://127.0.0.1:${testPort}/api/health`, {
          method: 'OPTIONS'
        });
        // OPTIONS should either return 200 or 204 (CORS preflight)
        expect([200, 204]).toContain(response.status);
      });
    });
  });

  describe('Content-Type Handling', () => {
    it('should accept application/json content type', async () => {
      server = new Server(mockOptions);
      server.finalizeRoutes();
      await server.listen(testPort, '127.0.0.1');

      const response = await fetch(`http://127.0.0.1:${testPort}/api/nonexistent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'value' })
      });

      // Should get 404 (route not found), not a content-type error
      expect(response.status).toBe(404);
    });

    it('should return JSON responses with correct content type', async () => {
      server = new Server(mockOptions);
      await server.listen(testPort, '127.0.0.1');

      const response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
      const contentType = response.headers.get('content-type');

      expect(contentType).toContain('application/json');
    });
  });

  describe('Session Summary Ingest', () => {
    it('should store a pre-generated summary via POST /api/sessions/summarize/ingest', async () => {
      const store = new SessionStore(':memory:');

      try {
        server = new Server(mockOptions);

        server.registerRoutes(new SessionRoutes(
          { deleteSession: async () => {}, getSession: () => null } as any,
          { getSessionStore: () => store } as any,
          {} as any,
          {} as any,
          {} as any,
          { broadcastSessionCompleted: () => {}, broadcastSummarizeQueued: () => {} } as any,
          {} as any,
        ));
        server.finalizeRoutes();

        await server.listen(testPort, '127.0.0.1');

        const contentSessionId = `oc-test-ingest-${Date.now()}`;
        const project = 'test-project-ingest';

        const initRes = await fetch(`http://127.0.0.1:${testPort}/api/sessions/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentSessionId,
            project,
            prompt: 'Please remember what we did in this session.'
          })
        });
        expect(initRes.status).toBe(200);
        const initBody = await initRes.json();
        expect(initBody).toHaveProperty('skipped', false);

        const ingestRes = await fetch(`http://127.0.0.1:${testPort}/api/sessions/summarize/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentSessionId,
            summary: {
              request: 'Store a structured summary',
              investigated: 'Worker ingest contract',
              learned: 'Ingest endpoint stores SummaryInput',
              completed: 'Posted summary to ingest route',
              next_steps: 'Use context injection to confirm summary is visible',
              notes: null,
            }
          })
        });
        expect(ingestRes.status).toBe(200);
        const ingestBody = await ingestRes.json();
        expect(ingestBody).toHaveProperty('status', 'stored');
        expect(typeof ingestBody.summaryId === 'number' || ingestBody.summaryId === null).toBe(true);

        const stored = store.getSummaryForSession(`ingest-${contentSessionId}`);
        expect(stored).not.toBeNull();
        expect(stored?.request).toBe('Store a structured summary');
      } finally {
        store.close();
      }
    });

    it('should skip ingest if latest prompt was entirely private', async () => {
      const store = new SessionStore(':memory:');

      try {
        server = new Server(mockOptions);

        server.registerRoutes(new SessionRoutes(
          { deleteSession: async () => {}, getSession: () => null } as any,
          { getSessionStore: () => store } as any,
          {} as any,
          {} as any,
          {} as any,
          { broadcastSessionCompleted: () => {}, broadcastSummarizeQueued: () => {} } as any,
          {} as any,
        ));
        server.finalizeRoutes();

        await server.listen(testPort, '127.0.0.1');

        const contentSessionId = `oc-test-ingest-private-${Date.now()}`;

        const initRes = await fetch(`http://127.0.0.1:${testPort}/api/sessions/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentSessionId,
            project: 'test-project-ingest-private',
            prompt: '<private>do not store</private>'
          })
        });
        expect(initRes.status).toBe(200);
        const initBody = await initRes.json();
        expect(initBody).toHaveProperty('skipped', true);
        expect(initBody).toHaveProperty('reason', 'private');

        const ingestRes = await fetch(`http://127.0.0.1:${testPort}/api/sessions/summarize/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentSessionId,
            summary: {
              request: 'should not store',
              investigated: '',
              learned: '',
              completed: '',
              next_steps: '',
              notes: null,
            }
          })
        });
        expect(ingestRes.status).toBe(200);
        const ingestBody = await ingestRes.json();
        expect(ingestBody).toHaveProperty('status', 'skipped');
        expect(ingestBody).toHaveProperty('reason', 'private');

        const stored = store.getSummaryForSession(`ingest-${contentSessionId}`);
        expect(stored).toBeNull();
      } finally {
        store.close();
      }
    });

    it('should return 400 for invalid ingest payloads', async () => {
      const store = new SessionStore(':memory:');

      try {
        server = new Server(mockOptions);

        server.registerRoutes(new SessionRoutes(
          { deleteSession: async () => {}, getSession: () => null } as any,
          { getSessionStore: () => store } as any,
          {} as any,
          {} as any,
          {} as any,
          { broadcastSessionCompleted: () => {}, broadcastSummarizeQueued: () => {} } as any,
          {} as any,
        ));
        server.finalizeRoutes();

        await server.listen(testPort, '127.0.0.1');

        const badRes = await fetch(`http://127.0.0.1:${testPort}/api/sessions/summarize/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentSessionId: 'missing-summary'
          })
        });
        expect(badRes.status).toBe(400);
      } finally {
        store.close();
      }
    });
  });

  describe('Server State Management', () => {
    it('should track initialization state dynamically', async () => {
      let initialized = false;
      const dynamicOptions: ServerOptions = {
        getInitializationComplete: () => initialized,
        getMcpReady: () => true,
        onShutdown: mock(() => Promise.resolve()),
        onRestart: mock(() => Promise.resolve()),
      };

      server = new Server(dynamicOptions);
      await server.listen(testPort, '127.0.0.1');

      // Check uninitialized
      let response = await fetch(`http://127.0.0.1:${testPort}/api/readiness`);
      expect(response.status).toBe(503);

      // Initialize
      initialized = true;

      // Check initialized
      response = await fetch(`http://127.0.0.1:${testPort}/api/readiness`);
      expect(response.status).toBe(200);
    });

    it('should track MCP ready state dynamically', async () => {
      let mcpReady = false;
      const dynamicOptions: ServerOptions = {
        getInitializationComplete: () => true,
        getMcpReady: () => mcpReady,
        onShutdown: mock(() => Promise.resolve()),
        onRestart: mock(() => Promise.resolve()),
      };

      server = new Server(dynamicOptions);
      await server.listen(testPort, '127.0.0.1');

      // Check MCP not ready
      let response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
      let body = await response.json();
      expect(body.mcpReady).toBe(false);

      // Set MCP ready
      mcpReady = true;

      // Check MCP ready
      response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
      body = await response.json();
      expect(body.mcpReady).toBe(true);
    });
  });

  describe('Server Lifecycle', () => {
    it('should start listening on specified port', async () => {
      server = new Server(mockOptions);
      await server.listen(testPort, '127.0.0.1');

      const httpServer = server.getHttpServer();
      expect(httpServer).not.toBeNull();
      expect(httpServer!.listening).toBe(true);
    });

    it('should close gracefully', async () => {
      server = new Server(mockOptions);
      await server.listen(testPort, '127.0.0.1');

      // Verify it's running
      const response = await fetch(`http://127.0.0.1:${testPort}/api/health`);
      expect(response.status).toBe(200);

      // Close
      try {
        await server.close();
      } catch (e: any) {
        if (e.code !== 'ERR_SERVER_NOT_RUNNING') throw e;
      }

      // Verify closed
      const httpServer = server.getHttpServer();
      if (httpServer) {
        expect(httpServer.listening).toBe(false);
      }
    });

    it('should handle port conflicts', async () => {
      server = new Server(mockOptions);
      const server2 = new Server(mockOptions);

      await server.listen(testPort, '127.0.0.1');

      // Second server should fail on same port
      await expect(server2.listen(testPort, '127.0.0.1')).rejects.toThrow();

      // Clean up second server if it has a reference
      const httpServer2 = server2.getHttpServer();
      if (httpServer2) {
        expect(httpServer2.listening).toBe(false);
      }
    });

    it('should allow restart on same port after close', async () => {
      server = new Server(mockOptions);
      await server.listen(testPort, '127.0.0.1');

      // Close first server
      try {
        await server.close();
      } catch (e: any) {
        if (e.code !== 'ERR_SERVER_NOT_RUNNING') throw e;
      }

      // Wait for port to be released
      await new Promise(resolve => setTimeout(resolve, 100));

      // Start second server on same port
      const server2 = new Server(mockOptions);
      await server2.listen(testPort, '127.0.0.1');

      expect(server2.getHttpServer()!.listening).toBe(true);

      // Clean up
      try {
        await server2.close();
      } catch {
        // Ignore cleanup errors
      }
    });
  });

  describe('Route Registration', () => {
    it('should register route handlers', () => {
      server = new Server(mockOptions);

      const setupRoutesMock = mock(() => {});
      const mockRouteHandler = {
        setupRoutes: setupRoutesMock,
      };

      server.registerRoutes(mockRouteHandler);

      expect(setupRoutesMock).toHaveBeenCalledTimes(1);
      expect(setupRoutesMock).toHaveBeenCalledWith(server.app);
    });

    it('should register multiple route handlers', () => {
      server = new Server(mockOptions);

      const handler1Mock = mock(() => {});
      const handler2Mock = mock(() => {});

      server.registerRoutes({ setupRoutes: handler1Mock });
      server.registerRoutes({ setupRoutes: handler2Mock });

      expect(handler1Mock).toHaveBeenCalledTimes(1);
      expect(handler2Mock).toHaveBeenCalledTimes(1);
    });
  });
});
