const request = require('supertest');
const app = require('../src/app');

describe('Review API & Rating Aggregation', () => {
  let providerToken;
  let customerToken;
  let serviceId;

  beforeEach(async () => {
    // Provider
    const pRes = await request(app).post('/api/auth/register').send({
      name: 'Charlie Carpenter',
      email: 'charlie@example.com',
      password: 'password123',
      role: 'service_provider',
    });
    providerToken = pRes.body.token;

    // Customer
    const cRes = await request(app).post('/api/auth/register').send({
      name: 'David Customer',
      email: 'david@example.com',
      password: 'password123',
      role: 'customer',
    });
    customerToken = cRes.body.token;

    // Service
    const sRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'Custom Shelf Installation',
        description: 'Hardwood shelves custom crafted and fitted.',
        category: 'Carpenter',
        price: 150,
        location: 'Downtown',
      });
    serviceId = sRes.body.service._id;
  });

  it('should reject reviewing a booking that is not completed', async () => {
    const bRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date().toISOString(),
        address: '456 Oak Avenue',
      });
    const bookingId = bRes.body.booking._id;

    // Try leaving review while pending
    const revRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        rating: 5,
        comment: 'Great job!',
      });

    expect(revRes.statusCode).toBe(400);
    expect(revRes.body.success).toBe(false);
  });

  it('should allow review on completed booking and update service average rating', async () => {
    // Create booking
    const bRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date().toISOString(),
        address: '456 Oak Avenue',
      });
    const bookingId = bRes.body.booking._id;

    // Progress status to completed
    await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'accepted' });

    await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'in_progress' });

    await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' });

    // Submit review
    const revRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        rating: 5,
        comment: 'Outstanding woodwork quality and prompt service!',
      });

    expect(revRes.statusCode).toBe(201);
    expect(revRes.body.success).toBe(true);

    // Verify service average rating is updated to 5.0
    const serviceRes = await request(app).get(`/api/services/${serviceId}`);
    expect(serviceRes.body.service.rating).toBe(5);
    expect(serviceRes.body.service.numReviews).toBe(1);
  });
});
