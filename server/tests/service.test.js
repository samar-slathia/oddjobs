const request = require('supertest');
const app = require('../src/app');

describe('Service API Endpoints', () => {
  let providerToken;
  let customerToken;
  let serviceId;

  beforeEach(async () => {
    // Register provider
    const pRes = await request(app).post('/api/auth/register').send({
      name: 'Electrician Bob',
      email: 'bob@example.com',
      password: 'password123',
      role: 'service_provider',
    });
    providerToken = pRes.body.token;

    // Register customer
    const cRes = await request(app).post('/api/auth/register').send({
      name: 'Alice Customer',
      email: 'alice@example.com',
      password: 'password123',
      role: 'customer',
    });
    customerToken = cRes.body.token;
  });

  it('should allow service provider to create a new service', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'Full Plumbing Inspection & Fix',
        description: 'Detailed inspection of home pipes and fix leakages.',
        category: 'Plumber',
        price: 90,
        priceType: 'hourly',
        location: 'Downtown',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.service.title).toBe('Full Plumbing Inspection & Fix');
    serviceId = res.body.service._id;
  });

  it('should reject service creation attempt by regular customer', async () => {
    const res = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        title: 'Unauthorized Service',
        description: 'Customer trying to offer service.',
        category: 'Cleaner',
        price: 50,
        location: 'Downtown',
      });

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('should list services with search and filtering', async () => {
    // Create two services
    await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'House Cleaning Service',
        description: 'Deep house cleaning',
        category: 'Cleaner',
        price: 120,
        location: 'Northside',
      });

    await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'Ceiling Fan Installation',
        description: 'Electrical ceiling fan repair & install',
        category: 'Electrician',
        price: 75,
        location: 'Northside',
      });

    // Search query for Cleaner
    const res = await request(app).get('/api/services?category=Cleaner');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.services[0].category).toBe('Cleaner');
  });
});
