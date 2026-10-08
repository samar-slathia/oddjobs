const request = require('supertest');
const app = require('../src/app');

describe('Booking API & State Machine Workflow', () => {
  let providerToken;
  let customerToken;
  let serviceId;
  let bookingId;

  beforeEach(async () => {
    // Register provider
    const pRes = await request(app).post('/api/auth/register').send({
      name: 'Electrician Sam',
      email: 'sam@example.com',
      password: 'password123',
      role: 'service_provider',
    });
    providerToken = pRes.body.token;

    // Register customer
    const cRes = await request(app).post('/api/auth/register').send({
      name: 'Betty Customer',
      email: 'betty@example.com',
      password: 'password123',
      role: 'customer',
    });
    customerToken = cRes.body.token;

    // Create service
    const sRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'AC Maintenance & Repair',
        description: 'Complete HVAC unit tune up and gas refilling',
        category: 'Appliance Repair',
        price: 110,
        location: 'Downtown',
      });
    serviceId = sRes.body.service._id;
  });

  it('should allow customer to create a booking request', async () => {
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        address: '123 Main Street',
        notes: 'AC makes loud noise when turned on',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.status).toBe('pending');
    bookingId = res.body.booking._id;
  });

  it('should allow provider to accept booking and transition status to in_progress and completed', async () => {
    // 1. Create booking
    const bRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        address: '123 Main Street',
      });
    const bId = bRes.body.booking._id;

    // 2. Provider accepts booking: pending -> accepted
    const acceptRes = await request(app)
      .patch(`/api/bookings/${bId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'accepted' });

    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.body.booking.status).toBe('accepted');

    // 3. Provider marks in_progress: accepted -> in_progress
    const progressRes = await request(app)
      .patch(`/api/bookings/${bId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'in_progress' });

    expect(progressRes.statusCode).toBe(200);
    expect(progressRes.body.booking.status).toBe('in_progress');

    // 4. Provider marks completed: in_progress -> completed
    const completeRes = await request(app)
      .patch(`/api/bookings/${bId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' });

    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.body.booking.status).toBe('completed');
  });

  it('should reject invalid state transitions (e.g. pending directly to completed)', async () => {
    const bRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        address: '123 Main Street',
      });
    const bId = bRes.body.booking._id;

    // Try to mark completed directly from pending
    const invalidRes = await request(app)
      .patch(`/api/bookings/${bId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' });

    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body.success).toBe(false);
  });
});
