import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;

// ---------------------------------------------------------------------------
// Mocks: Arcjet, logger and the services layer (no DB / network in tests).
// Routes, validation, auth middleware, cookies and controllers run for real.
// ---------------------------------------------------------------------------
const allow = () => ({ isDenied: () => false });

const deny = type => ({
  isDenied: () => true,
  reason: {
    isBot: () => type === 'bot',
    isShield: () => type === 'shield',
    isRateLimit: () => type === 'rateLimit',
    isEmail: () => type === 'email',
  },
});

const arcjet = {
  general: { protect: jest.fn() },
  signup: { protect: jest.fn() },
  signIn: { protect: jest.fn() },
};

const authServices = {
  createUser: jest.fn(),
  authenticateUser: jest.fn(),
};

const usersServices = {
  getAllUsers: jest.fn(),
  getUserById: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
};

jest.unstable_mockModule('#config/arcjet.js', () => ({
  generalAj: arcjet.general,
  signupAj: arcjet.signup,
  signInAj: arcjet.signIn,
  default: arcjet.general,
}));

jest.unstable_mockModule('#config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule('#services/auth.services.js', () => authServices);
jest.unstable_mockModule('#services/users.services.js', () => usersServices);

const { default: app } = await import('#src/app.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sampleUser = {
  id: 1,
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'user',
};

const makeToken = (payload = sampleUser, options = {}) =>
  jwt.sign(
    { id: payload.id, email: payload.email, role: payload.role },
    JWT_SECRET,
    { expiresIn: '1h', ...options }
  );

const bearer = token => ({ Authorization: `Bearer ${token}` });

const getSetCookie = res => res.headers['set-cookie'] ?? [];

beforeEach(() => {
  jest.resetAllMocks();
  arcjet.general.protect.mockResolvedValue(allow());
  arcjet.signup.protect.mockResolvedValue(allow());
  arcjet.signIn.protect.mockResolvedValue(allow());
});

// ---------------------------------------------------------------------------
// Health / misc
// ---------------------------------------------------------------------------
describe('Health routes', () => {
  it('GET / returns server info', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Hello from the server!');
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /api returns the running message', async () => {
    const res = await request(app).get('/api');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Acquisitions API is running!' });
  });

  it('returns 404 for an unknown route', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Global Arcjet protection
// ---------------------------------------------------------------------------
describe('Global Arcjet protection', () => {
  it.each([
    ['bot', 403, 'Automated requests are not allowed'],
    ['shield', 403, 'Request blocked by security policy'],
    ['rateLimit', 429, 'Too many requests, please slow down'],
  ])('maps a %s denial to %i', async (type, status, message) => {
    arcjet.general.protect.mockResolvedValue(deny(type));

    const res = await request(app).get('/api');

    expect(res.status).toBe(status);
    expect(res.body.message).toBe(message);
  });

  it('returns a generic 403 for an unclassified denial', async () => {
    arcjet.general.protect.mockResolvedValue(deny('other'));

    const res = await request(app).get('/api');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('fails open when Arcjet throws', async () => {
    arcjet.general.protect.mockRejectedValue(new Error('arcjet down'));

    const res = await request(app).get('/api');

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/sign-up
// ---------------------------------------------------------------------------
describe('POST /api/auth/sign-up', () => {
  const validBody = {
    name: 'Jane Doe',
    email: 'Jane@Example.com',
    password: 'secret123',
  };

  it('creates a user, sets a token cookie and hides the password', async () => {
    authServices.createUser.mockResolvedValue(sampleUser);

    const res = await request(app).post('/api/auth/sign-up').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('User registered');
    expect(res.body.user).toEqual(sampleUser);
    expect(res.body.user.password).toBeUndefined();

    const cookie = getSetCookie(res).find(c => c.startsWith('token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);

    const token = cookie.split(';')[0].replace('token=', '');
    expect(jwt.verify(token, JWT_SECRET)).toMatchObject({
      id: 1,
      email: sampleUser.email,
      role: 'user',
    });
  });

  it('normalises email and defaults role to "user"', async () => {
    authServices.createUser.mockResolvedValue(sampleUser);

    await request(app).post('/api/auth/sign-up').send(validBody);

    expect(authServices.createUser).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'secret123',
      role: 'user',
    });
  });

  it.each([
    ['missing name', { email: 'a@b.com', password: 'secret123' }],
    ['short name', { name: 'J', email: 'a@b.com', password: 'secret123' }],
    ['invalid email', { name: 'Jane', email: 'nope', password: 'secret123' }],
    ['short password', { name: 'Jane', email: 'a@b.com', password: '123' }],
    [
      'invalid role',
      { name: 'Jane', email: 'a@b.com', password: 'secret123', role: 'root' },
    ],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await request(app).post('/api/auth/sign-up').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(authServices.createUser).not.toHaveBeenCalled();
  });

  it('returns 409 when the email already exists', async () => {
    authServices.createUser.mockRejectedValue(
      new Error('User with this email already exists')
    );

    const res = await request(app).post('/api/auth/sign-up').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Email already exist' });
  });

  it('returns 500 on an unexpected error', async () => {
    authServices.createUser.mockRejectedValue(new Error('db exploded'));

    const res = await request(app).post('/api/auth/sign-up').send(validBody);

    expect(res.status).toBe(500);
  });

  it('returns 400 when Arcjet rejects the email address', async () => {
    arcjet.signup.protect.mockResolvedValue(deny('email'));

    const res = await request(app).post('/api/auth/sign-up').send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid or disposable email address');
    expect(authServices.createUser).not.toHaveBeenCalled();
  });

  it('returns 429 when the sign-up rate limit is hit', async () => {
    arcjet.signup.protect.mockResolvedValue(deny('rateLimit'));

    const res = await request(app).post('/api/auth/sign-up').send(validBody);

    expect(res.status).toBe(429);
  });

  it('passes the email to Arcjet for validation', async () => {
    authServices.createUser.mockResolvedValue(sampleUser);

    await request(app).post('/api/auth/sign-up').send(validBody);

    expect(arcjet.signup.protect).toHaveBeenCalledWith(expect.anything(), {
      email: 'jane@example.com',
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/sign-in
// ---------------------------------------------------------------------------
describe('POST /api/auth/sign-in', () => {
  const credentials = { email: 'jane@example.com', password: 'secret123' };

  it('signs in, sets a token cookie and returns the user', async () => {
    authServices.authenticateUser.mockResolvedValue(sampleUser);

    const res = await request(app).post('/api/auth/sign-in').send(credentials);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User signed in');
    expect(res.body.user).toEqual(sampleUser);
    expect(getSetCookie(res).some(c => c.startsWith('token='))).toBe(true);
    expect(authServices.authenticateUser).toHaveBeenCalledWith(credentials);
  });

  it.each([
    ['missing password', { email: 'jane@example.com' }],
    ['empty password', { email: 'jane@example.com', password: '' }],
    ['invalid email', { email: 'nope', password: 'x' }],
    ['empty body', {}],
  ])('returns 400 for %s', async (_label, body) => {
    const res = await request(app).post('/api/auth/sign-in').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(authServices.authenticateUser).not.toHaveBeenCalled();
  });

  it.each(['User not found', 'Invalid password'])(
    'returns the same 401 for "%s" (no user enumeration)',
    async message => {
      authServices.authenticateUser.mockRejectedValue(new Error(message));

      const res = await request(app)
        .post('/api/auth/sign-in')
        .send(credentials);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid email or password' });
      expect(getSetCookie(res)).toHaveLength(0);
    }
  );

  it('returns 500 on an unexpected error', async () => {
    authServices.authenticateUser.mockRejectedValue(new Error('db exploded'));

    const res = await request(app).post('/api/auth/sign-in').send(credentials);

    expect(res.status).toBe(500);
  });

  it('returns 429 when the sign-in rate limit is hit', async () => {
    arcjet.signIn.protect.mockResolvedValue(deny('rateLimit'));

    const res = await request(app).post('/api/auth/sign-in').send(credentials);

    expect(res.status).toBe(429);
    expect(authServices.authenticateUser).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/sign-out
// ---------------------------------------------------------------------------
describe('POST /api/auth/sign-out', () => {
  it('clears the token cookie', async () => {
    const res = await request(app).post('/api/auth/sign-out');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'User signed out' });

    const cookie = getSetCookie(res).find(c => c.startsWith('token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/token=;/);
    expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970/i);
  });
});

// ---------------------------------------------------------------------------
// /api/users - authentication
// ---------------------------------------------------------------------------
describe('/api/users authentication', () => {
  const protectedRoutes = [
    ['get', '/api/users'],
    ['get', '/api/users/1'],
    ['put', '/api/users/1'],
    ['delete', '/api/users/1'],
  ];

  it.each(protectedRoutes)('%s %s rejects a missing token', async (m, path) => {
    const res = await request(app)[m](path);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
  });

  it('rejects a malformed token', async () => {
    const res = await request(app)
      .get('/api/users')
      .set(bearer('not.a.valid.token'));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ id: 1 }, 'some-other-secret');

    const res = await request(app).get('/api/users').set(bearer(forged));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  it('rejects an expired token', async () => {
    const expired = makeToken(sampleUser, { expiresIn: -10 });

    const res = await request(app).get('/api/users').set(bearer(expired));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  it('accepts a valid Bearer token', async () => {
    usersServices.getAllUsers.mockResolvedValue([]);

    const res = await request(app).get('/api/users').set(bearer(makeToken()));

    expect(res.status).toBe(200);
  });

  it('accepts a valid token cookie', async () => {
    usersServices.getAllUsers.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/users')
      .set('Cookie', [`token=${makeToken()}`]);

    expect(res.status).toBe(200);
  });

  it('authenticates before validating the body', async () => {
    const res = await request(app).put('/api/users/1').send({ role: 'root' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// /api/users - handlers
// ---------------------------------------------------------------------------
describe('/api/users', () => {
  let auth;

  beforeEach(() => {
    auth = bearer(makeToken());
  });

  describe('GET /api/users', () => {
    it('returns all users with a count', async () => {
      const list = [sampleUser, { ...sampleUser, id: 2, email: 'b@c.com' }];
      usersServices.getAllUsers.mockResolvedValue(list);

      const res = await request(app).get('/api/users').set(auth);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: 'Users retrieved',
        count: 2,
        users: list,
      });
    });

    it('returns an empty list', async () => {
      usersServices.getAllUsers.mockResolvedValue([]);

      const res = await request(app).get('/api/users').set(auth);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
      expect(res.body.users).toEqual([]);
    });

    it('returns 500 when the service fails', async () => {
      usersServices.getAllUsers.mockRejectedValue(new Error('db exploded'));

      const res = await request(app).get('/api/users').set(auth);

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/users/:id', () => {
    it('returns the user', async () => {
      usersServices.getUserById.mockResolvedValue(sampleUser);

      const res = await request(app).get('/api/users/1').set(auth);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'User retrieved', user: sampleUser });
      expect(usersServices.getUserById).toHaveBeenCalledWith(1);
    });

    it.each(['abc', '0', '-5', '1.5'])('returns 400 for id "%s"', async id => {
      const res = await request(app).get(`/api/users/${id}`).set(auth);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid user id' });
      expect(usersServices.getUserById).not.toHaveBeenCalled();
    });

    it('returns 404 when the user does not exist', async () => {
      usersServices.getUserById.mockRejectedValue(new Error('User not found'));

      const res = await request(app).get('/api/users/99').set(auth);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'User not found' });
    });

    it('returns 500 on an unexpected error', async () => {
      usersServices.getUserById.mockRejectedValue(new Error('db exploded'));

      const res = await request(app).get('/api/users/1').set(auth);

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('updates the user', async () => {
      const updated = { ...sampleUser, name: 'New Name' };
      usersServices.updateUser.mockResolvedValue(updated);

      const res = await request(app)
        .put('/api/users/1')
        .set(auth)
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'User updated', user: updated });
      expect(usersServices.updateUser).toHaveBeenCalledWith(1, {
        name: 'New Name',
      });
    });

    it('accepts all fields and normalises the email', async () => {
      usersServices.updateUser.mockResolvedValue(sampleUser);

      await request(app).put('/api/users/1').set(auth).send({
        name: ' Jane ',
        email: 'JANE@Example.com',
        password: 'newsecret',
        role: 'admin',
      });

      expect(usersServices.updateUser).toHaveBeenCalledWith(1, {
        name: 'Jane',
        email: 'jane@example.com',
        password: 'newsecret',
        role: 'admin',
      });
    });

    it.each([
      ['an empty body', {}],
      ['an invalid role', { role: 'root' }],
      ['an invalid email', { email: 'nope' }],
      ['a short password', { password: '123' }],
      ['a short name', { name: 'J' }],
    ])('returns 400 for %s', async (_label, body) => {
      const res = await request(app).put('/api/users/1').set(auth).send(body);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(usersServices.updateUser).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid id', async () => {
      const res = await request(app)
        .put('/api/users/abc')
        .set(auth)
        .send({ name: 'Jane' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid user id' });
    });

    it('returns 404 when the user does not exist', async () => {
      usersServices.updateUser.mockRejectedValue(new Error('User not found'));

      const res = await request(app)
        .put('/api/users/99')
        .set(auth)
        .send({ name: 'Jane' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'User not found' });
    });

    it('returns 409 when the email is taken', async () => {
      usersServices.updateUser.mockRejectedValue(
        new Error('User with this email already exists')
      );

      const res = await request(app)
        .put('/api/users/1')
        .set(auth)
        .send({ email: 'taken@example.com' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Email already exist' });
    });

    it('returns 500 on an unexpected error', async () => {
      usersServices.updateUser.mockRejectedValue(new Error('db exploded'));

      const res = await request(app)
        .put('/api/users/1')
        .set(auth)
        .send({ name: 'Jane' });

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('deletes the user', async () => {
      usersServices.deleteUser.mockResolvedValue({ id: 1, email: 'a@b.com' });

      const res = await request(app).delete('/api/users/1').set(auth);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'User deleted' });
      expect(usersServices.deleteUser).toHaveBeenCalledWith(1);
    });

    it('returns 400 for an invalid id', async () => {
      const res = await request(app).delete('/api/users/abc').set(auth);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid user id' });
      expect(usersServices.deleteUser).not.toHaveBeenCalled();
    });

    it('returns 404 when the user does not exist', async () => {
      usersServices.deleteUser.mockRejectedValue(new Error('User not found'));

      const res = await request(app).delete('/api/users/99').set(auth);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'User not found' });
    });

    it('returns 500 on an unexpected error', async () => {
      usersServices.deleteUser.mockRejectedValue(new Error('db exploded'));

      const res = await request(app).delete('/api/users/1').set(auth);

      expect(res.status).toBe(500);
    });
  });
});
