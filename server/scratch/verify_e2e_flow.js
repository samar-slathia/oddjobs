const request = require('supertest');
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/config/db');

async function verifyE2EFlow() {
  console.log('=======================================================');
  console.log('STARTING END-TO-END HTTP API USER FLOW VERIFICATION');
  console.log('=======================================================\n');

  let passed = 0;
  let failed = 0;

  function check(condition, stepName) {
    if (condition) {
      console.log(` ✅ PASS: ${stepName}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${stepName}`);
      failed++;
    }
  }

  try {
    await connectDB();

    // Step 1: Health Check Endpoint
    console.log('--- Step 1: Server Health Check ---');
    const healthRes = await request(app).get('/api/health');
    check(healthRes.status === 200 && healthRes.body.success === true, 'GET /api/health returns 200 OK');

    // Step 2: Register Customer & Service Provider
    console.log('\n--- Step 2: User Registration & Authentication ---');
    const customerEmail = `e2e_customer_${Date.now()}@oddjobs.com`;
    const providerEmail = `e2e_provider_${Date.now()}@oddjobs.com`;

    const custReg = await request(app).post('/api/auth/register').send({
      name: 'E2E Customer',
      email: customerEmail,
      password: 'Password123!',
      role: 'customer',
      phone: '+1 555-9988',
      location: 'Southside',
    });
    check(custReg.status === 201 && custReg.body.token, 'Register Customer via POST /api/auth/register');
    const customerToken = custReg.body.token;

    const provReg = await request(app).post('/api/auth/register').send({
      name: 'E2E Provider',
      email: providerEmail,
      password: 'Password123!',
      role: 'service_provider',
      phone: '+1 555-7766',
      location: 'Northside',
      bio: 'E2E Verified Appliance Technician',
    });
    check(provReg.status === 201 && provReg.body.token, 'Register Service Provider via POST /api/auth/register');
    const providerToken = provReg.body.token;

    // Step 3: Login Provider
    console.log('\n--- Step 3: Login & Token Retrieval ---');
    const loginRes = await request(app).post('/api/auth/login').send({
      email: providerEmail,
      password: 'Password123!',
    });
    check(loginRes.status === 200 && loginRes.body.user.role === 'service_provider', 'Login Service Provider via POST /api/auth/login');

    // Step 4: Create Service Listing
    console.log('\n--- Step 4: Service Creation & Search ---');
    const serviceRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'E2E Washer & Dryer Maintenance',
        description: 'Professional diagnostic & belt replacement for all major brands.',
        category: 'Appliance Repair',
        price: 110,
        priceType: 'fixed',
        location: 'Southside & Northside',
      });
    check(serviceRes.status === 201, 'Create Service Listing via POST /api/services');
    const serviceId = serviceRes.body.service._id;

    // Step 5: Search Service as Customer
    const searchRes = await request(app).get(`/api/services?search=Washer`);
    check(searchRes.status === 200 && searchRes.body.services.some(s => s._id === serviceId), 'Search Service via GET /api/services?search=Washer');

    // Step 6: Create Booking Request
    console.log('\n--- Step 5: Booking Request Creation & State Machine ---');
    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        address: '999 Pine Street, Apt 12',
        notes: 'Dryer makes squeaking noise.',
      });
    check(bookingRes.status === 201 && bookingRes.body.booking.status === 'pending', 'Submit Booking Request via POST /api/bookings (Status: pending)');
    const bookingId = bookingRes.body.booking._id;

    // Step 7: Provider Accept Booking
    const acceptRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'accepted' });
    check(acceptRes.status === 200 && acceptRes.body.booking.status === 'accepted', 'Provider Accepts Request via PATCH /api/bookings/:id/status (Status: accepted)');

    // Step 8: Provider Start Job
    const startRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'in_progress' });
    check(startRes.status === 200 && startRes.body.booking.status === 'in_progress', 'Provider Starts Job via PATCH /api/bookings/:id/status (Status: in_progress)');

    // Step 9: Provider Complete Job
    const completeRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' });
    check(completeRes.status === 200 && completeRes.body.booking.status === 'completed', 'Provider Completes Job via PATCH /api/bookings/:id/status (Status: completed)');

    // Step 10: Customer Submits Review
    console.log('\n--- Step 6: Review Submission & Rating Aggregation ---');
    const reviewRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        rating: 5,
        comment: 'Outstanding repair service! Quiet dryer now.',
      });
    check(reviewRes.status === 201, 'Customer Submits 5-Star Review via POST /api/reviews');

    // Step 11: Verify Updated Service Rating
    const updatedService = await request(app).get(`/api/services/${serviceId}`);
    check(updatedService.status === 200 && updatedService.body.service.rating === 5, 'Service Rating Updated to 5.0 in Database');

  } catch (err) {
    console.error('\n❌ ERROR IN E2E VERIFICATION:', err);
    failed++;
  } finally {
    await disconnectDB();
    console.log('\n=======================================================');
    console.log(`E2E VERIFICATION RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log('=======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
  }
}

verifyE2EFlow();
