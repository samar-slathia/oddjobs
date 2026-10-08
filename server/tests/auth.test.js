const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

describe('Auth API Endpoints', () => {
  const sampleCustomer = {
    name: 'Test Customer',
    email: 'testcustomer@example.com',
    password: 'password123',
    role: 'customer',
  };

  const sampleProvider = {
    name: 'Test Provider',
    email: 'testprovider@example.com',
    password: 'password123',
    role: 'service_provider',
  };

  it('should register a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(sampleCustomer);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(sampleCustomer.email.toLowerCase());
    expect(res.body.user.password).toBeUndefined();
  });

  it('should prevent registering duplicate email', async () => {
    await request(app).post('/api/auth/register').send(sampleCustomer);

    const res = await request(app)
      .post('/api/auth/register')
      .send(sampleCustomer);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should login an existing user with correct credentials', async () => {
    await request(app).post('/api/auth/register').send(sampleCustomer);

    const res = await request(app).post('/api/auth/login').send({
      email: sampleCustomer.email,
      password: sampleCustomer.password,
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  it('should reject login with wrong password', async () => {
    await request(app).post('/api/auth/register').send(sampleCustomer);

    const res = await request(app).post('/api/auth/login').send({
      email: sampleCustomer.email,
      password: 'wrongpassword',
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should access protected /api/auth/me endpoint with token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(sampleCustomer);

    const token = registerRes.body.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.statusCode).toBe(200);
    expect(meRes.body.user.email).toBe(sampleCustomer.email.toLowerCase());
  });

  it('should reject access to protected endpoint without token', async () => {
    const meRes = await request(app).get('/api/auth/me');

    expect(meRes.statusCode).toBe(401);
    expect(meRes.body.success).toBe(false);
  });
});
