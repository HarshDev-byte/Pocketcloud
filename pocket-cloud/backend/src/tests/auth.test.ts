import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { AuthService } from '../services/auth.service';
import { db } from '../db';
import authRoutes from '../routes/auth.routes';
import cookieParser from 'cookie-parser';

// Test app setup
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRoutes);

describe('Authentication Tests', () => {
  const testUser = {
    username: 'testuser',
    password: 'testpassword123'
  };

  beforeAll(async () => {
    // Create test user
    await AuthService.createUser(testUser.username, testUser.password, 'user');
  });

  afterAll(async () => {
    // Clean up test data
    const deleteStmt = db.prepare('DELETE FROM users WHERE username = ?');
    deleteStmt.run(testUser.username);
    
    const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username = ?)');
    deleteSessionsStmt.run(testUser.username);
  });

  beforeEach(async () => {
    // Clear sessions before each test
    const clearSessionsStmt = db.prepare('DELETE FROM sessions');
    clearSessionsStmt.run();
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials and set cookie', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe(testUser.username);
      
      // Check that session cookie is set
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((cookie: string) => cookie.startsWith('session='))).toBe(true);
      
      // Verify cookie is httpOnly and secure settings
      const sessionCookie = cookies.find((cookie: string) => cookie.startsWith('session='));
      expect(sessionCookie).toContain('HttpOnly');
    });

    it('should return 401 for wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should return 401 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should enforce rate limiting after 5 failed attempts', async () => {
      // Make 5 failed login attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: 'wrongpassword'
          })
          .expect(401);
      }

      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: 'wrongpassword'
        })
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Too many requests');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username
          // missing password
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Protected Route Access', () => {
    let sessionCookie: string;

    beforeEach(async () => {
      // Login to get session cookie
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      const cookies = loginResponse.headers['set-cookie'];
      sessionCookie = cookies.find((cookie: string) => cookie.startsWith('session='));
    });

    it('should access protected route with valid session', async () => {
      // Add a test protected route
      app.get('/api/test/protected', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        res.json({ message: 'Protected resource accessed', user: req.user });
      });

      const response = await request(app)
        .get('/api/test/protected')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('user');
    });

    it('should return 401 when accessing protected route without cookie', async () => {
      app.get('/api/test/protected-no-auth', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        res.json({ message: 'Protected resource' });
      });

      await request(app)
        .get('/api/test/protected-no-auth')
        .expect(401);
    });

    it('should return 401 for expired session', async () => {
      // Create an expired session manually
      const userId = AuthService.getUserByUsername(testUser.username)?.id;
      const expiredToken = AuthService.generateSessionToken();
      const expiredTokenHash = AuthService.hashToken(expiredToken);
      
      const insertStmt = db.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      const sessionId = require('crypto').randomUUID();
      const now = Date.now();
      const expiredTime = now - 1000; // 1 second ago
      
      insertStmt.run(
        sessionId,
        userId,
        expiredTokenHash,
        now,
        expiredTime,
        '127.0.0.1',
        'test-agent'
      );

      const expiredCookie = `session=${expiredToken}`;

      app.get('/api/test/expired-session', (req, res) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        res.json({ message: 'Should not reach here' });
      });

      await request(app)
        .get('/api/test/expired-session')
        .set('Cookie', expiredCookie)
        .expect(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    let sessionCookie: string;

    beforeEach(async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: testUser.password
        });

      const cookies = loginResponse.headers['set-cookie'];
      sessionCookie = cookies.find((cookie: string) => cookie.startsWith('session='));
    });

    it('should logout and clear session', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', sessionCookie)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      
      // Verify session is cleared
      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const clearedCookie = cookies.find((cookie: string) => cookie.startsWith('session='));
      expect(clearedCookie).toContain('Max-Age=0');
    });

    it('should handle logout without session gracefully', async () => {
      await request(app)
        .post('/api/auth/logout')
        .expect(200);
    });
  });

  describe('Session Management', () => {
    it('should limit concurrent sessions per user', async () => {
      const maxSessions = 10;
      const sessions = [];

      // Create maximum allowed sessions
      for (let i = 0; i < maxSessions + 2; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            username: testUser.username,
            password: testUser.password
          });

        if (response.status === 200) {
          sessions.push(response.headers['set-cookie']);
        }
      }

      // Verify session count doesn't exceed limit
      const userId = AuthService.getUserByUsername(testUser.username)?.id;
      const sessionCountStmt = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?');
      const result = sessionCountStmt.get(userId) as { count: number };
      
      expect(result.count).toBeLessThanOrEqual(maxSessions);
    });

    it('should clean up expired sessions', async () => {
      // Create an expired session
      const userId = AuthService.getUserByUsername(testUser.username)?.id;
      const token = AuthService.generateSessionToken();
      const tokenHash = AuthService.hashToken(token);
      
      const insertStmt = db.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      const sessionId = require('crypto').randomUUID();
      const now = Date.now();
      const expiredTime = now - 1000;
      
      insertStmt.run(
        sessionId,
        userId,
        tokenHash,
        now,
        expiredTime,
        '127.0.0.1',
        'test-agent'
      );

      // Trigger cleanup
      AuthService.cleanupExpiredSessions();

      // Verify expired session was removed
      const checkStmt = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE id = ?');
      const result = checkStmt.get(sessionId) as { count: number };
      expect(result.count).toBe(0);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty username', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          username: '',
          password: testUser.password
        })
        .expect(400);
    });

    it('should reject empty password', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          username: testUser.username,
          password: ''
        })
        .expect(400);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });

    it('should reject overly long username', async () => {
      const longUsername = 'a'.repeat(256);
      
      await request(app)
        .post('/api/auth/login')
        .send({
          username: longUsername,
          password: testUser.password
        })
        .expect(400);
    });
  });
});