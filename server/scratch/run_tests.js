const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

async function runAllTests() {
  console.log('==============================================');
  console.log('STARTING ODDJOBS BACKEND INTEGRATION TEST SUITE');
  console.log('==============================================\n');

  let mongoServer;
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(` ❌ FAIL: ${message}`);
      failedCount++;
    } else {
      console.log(` ✅ PASS: ${message}`);
      passedCount++;
    }
  }

  try {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    console.log('Database connected (MongoMemoryServer)');

    // TEST 1: Auth - Register customer
    console.log('\n--- 1. AUTHENTICATION & RBAC TESTS ---');
    const customerPayload = {
      name: 'Test Customer',
      email: 'customer@test.com',
      password: 'password123',
      role: 'customer',
    };

    const regRes = await request(app).post('/api/auth/register').send(customerPayload);
    assert(regRes.status === 201, 'User registration returns 201 Created');
    assert(regRes.body.token !== undefined, 'User registration returns JWT token');
    assert(regRes.body.user.password === undefined, 'Password hash is excluded from response');

    const customerToken = regRes.body.token;

    // TEST 2: Auth - Prevent duplicate registration
    const dupRes = await request(app).post('/api/auth/register').send(customerPayload);
    assert(dupRes.status === 400, 'Duplicate email registration rejected with 400 Bad Request');

    // TEST 3: Auth - Login
    const loginRes = await request(app).post('/api/auth/login').send({
      email: customerPayload.email,
      password: customerPayload.password,
    });
    assert(loginRes.status === 200, 'Login with valid credentials returns 200 OK');

    // TEST 4: Auth - Protected /me endpoint
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`);
    assert(meRes.status === 200 && meRes.body.user.email === customerPayload.email, 'Protected /me endpoint succeeds with valid token');

    // TEST 5: Auth - Unauthenticated block
    const unauthRes = await request(app).get('/api/auth/me');
    assert(unauthRes.status === 401, 'Protected route rejects request without token with 401');

    // Register Provider
    const providerPayload = {
      name: 'Test Provider',
      email: 'provider@test.com',
      password: 'password123',
      role: 'service_provider',
    };
    const provRegRes = await request(app).post('/api/auth/register').send(providerPayload);
    const providerToken = provRegRes.body.token;

    // TEST 6: Service Creation by Provider
    console.log('\n--- 2. SERVICE CREATION & SEARCH TESTS ---');
    const serviceRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'Master Electrical Repair',
        description: 'Electrical wiring and circuit breaker replacement.',
        category: 'Electrician',
        price: 85,
        priceType: 'hourly',
        location: 'Downtown',
      });
    assert(serviceRes.status === 201, 'Service provider can create new service listing');
    const serviceId = serviceRes.body.service._id;

    // TEST 7: Customer block from creating service
    const custServRes = await request(app)
      .post('/api/services')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        title: 'Unauthorized Customer Service',
        description: 'Customer trying to create service.',
        category: 'Cleaner',
        price: 50,
        location: 'Downtown',
      });
    assert(custServRes.status === 403, 'Customer role blocked from creating service listing (403)');

    // TEST 8: Search & Filter Services
    const searchRes = await request(app).get('/api/services?category=Electrician');
    assert(searchRes.status === 200 && searchRes.body.count === 1, 'Search & filter API returns matching service count');

    // TEST 9: Booking Request Workflow
    console.log('\n--- 3. BOOKING WORKFLOW & STATE MACHINE TESTS ---');
    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        address: '123 Main Street, Apt 4B',
        notes: 'Main breaker tripping.',
      });
    assert(bookingRes.status === 201 && bookingRes.body.booking.status === 'pending', 'Customer can submit booking request (Initial status: pending)');
    const bookingId = bookingRes.body.booking._id;

    // TEST 10: State Machine - Provider accepts request (pending -> accepted)
    const acceptRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'accepted' });
    assert(acceptRes.status === 200 && acceptRes.body.booking.status === 'accepted', 'Provider can accept pending booking (status -> accepted)');

    // TEST 11: Invalid State Machine Transition
    const invalidTransRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'pending' });
    assert(invalidTransRes.status === 400, 'Invalid status transition rejected (400 Bad Request)');

    // TEST 12: Transition to in_progress and completed
    await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'in_progress' });

    const completeRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' });
    assert(completeRes.status === 200 && completeRes.body.booking.status === 'completed', 'Provider transitions booking to completed status');

    // TEST 13: Reviews & Rating Aggregation
    console.log('\n--- 4. REVIEWS & RATING AGGREGATION TESTS ---');
    const reviewRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        rating: 5,
        comment: 'Excellent work and fast response!',
      });
    assert(reviewRes.status === 201, 'Customer can submit review on completed booking');

    // Verify rating updated on service
    const updatedServiceRes = await request(app).get(`/api/services/${serviceId}`);
    assert(
      updatedServiceRes.body.service.rating === 5 && updatedServiceRes.body.service.numReviews === 1,
      'Service rating & review count updated automatically after review submission'
    );

    // TEST 14: Prevent duplicate review on same booking
    const dupReviewRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        rating: 4,
        comment: 'Trying duplicate review',
      });
    assert(dupReviewRes.status === 400, 'Duplicate review on same booking rejected (400)');

  } catch (err) {
    console.error('\n❌ UNEXPECTED TEST ERROR:', err);
    failedCount++;
  } finally {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }

    console.log('\n==============================================');
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('==============================================\n');

    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runAllTests();
