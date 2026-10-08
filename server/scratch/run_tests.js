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

    // SECTION 1: AUTHENTICATION & RBAC
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
    const customerId = regRes.body.user._id;

    // Prevent duplicate registration
    const dupRes = await request(app).post('/api/auth/register').send(customerPayload);
    assert(dupRes.status === 400, 'Duplicate email registration rejected with 400 Bad Request');

    // Login
    const loginRes = await request(app).post('/api/auth/login').send({
      email: customerPayload.email,
      password: customerPayload.password,
    });
    assert(loginRes.status === 200, 'Login with valid credentials returns 200 OK');

    // Logout
    const logoutRes = await request(app).post('/api/auth/logout');
    assert(logoutRes.status === 200, 'Logout endpoint returns 200 OK');

    // Protected /me endpoint
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken}`);
    assert(meRes.status === 200 && meRes.body.user.email === customerPayload.email, 'Protected /me endpoint succeeds with valid token');

    // Unauthenticated block
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

    // Register Admin
    const adminUser = await User.create({
      name: 'Admin User',
      email: 'admin@test.com',
      password: 'password123',
      role: 'admin',
    });
    const adminLoginRes = await request(app).post('/api/auth/login').send({
      email: 'admin@test.com',
      password: 'password123',
    });
    const adminToken = adminLoginRes.body.token;
    assert(adminLoginRes.body.user.role === 'admin', 'Admin login succeeds with admin role');

    // SECTION 2: SERVICES MANAGEMENT & SEARCH
    console.log('\n--- 2. SERVICE CREATION, EDIT & SEARCH TESTS ---');
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

    // Customer block from creating service
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

    // Edit service by owner provider
    const editRes = await request(app)
      .put(`/api/services/${serviceId}`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        title: 'Master Electrical Repair & Wiring',
        price: 95,
      });
    assert(editRes.status === 200 && editRes.body.service.price === 95, 'Provider can update their own service listing');

    // Search & Filter Services
    const searchRes = await request(app).get('/api/services?category=Electrician');
    assert(searchRes.status === 200 && searchRes.body.count === 1, 'Search & filter API returns matching service count');

    // SECTION 3: BOOKING WORKFLOW & STATE MACHINE
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

    // Test booking restriction: provider cannot book own service
    const selfBookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        address: '123 Main Street',
      });
    assert(selfBookRes.status === 400, 'Provider blocked from booking their own service (400)');

    // State Machine - Provider accepts request (pending -> accepted)
    const acceptRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'accepted' });
    assert(acceptRes.status === 200 && acceptRes.body.booking.status === 'accepted', 'Provider can accept pending booking (status -> accepted)');

    // Invalid State Machine Transition
    const invalidTransRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'pending' });
    assert(invalidTransRes.status === 400, 'Invalid status transition rejected (400 Bad Request)');

    // Transition to in_progress and completed
    await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'in_progress' });

    const completeRes = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ status: 'completed' });
    assert(completeRes.status === 200 && completeRes.body.booking.status === 'completed', 'Provider transitions booking to completed status');

    // SECTION 4: REVIEWS & RESTRICTIONS
    console.log('\n--- 4. REVIEWS & RATING AGGREGATION TESTS ---');
    
    // Create pending booking for review restriction test
    const pendingBookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        serviceId,
        scheduledDate: new Date(Date.now() + 86400000).toISOString(),
        address: '456 Oak St',
      });
    const pendingBookingId = pendingBookingRes.body.booking._id;

    // Review on pending booking attempt
    const pendingReviewRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId: pendingBookingId,
        rating: 5,
        comment: 'Premature review attempt',
      });
    assert(pendingReviewRes.status === 400, 'Review submission on non-completed booking rejected (400)');

    // Submit review on completed booking
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

    // Prevent duplicate review on same booking
    const dupReviewRes = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        bookingId,
        rating: 4,
        comment: 'Trying duplicate review',
      });
    assert(dupReviewRes.status === 400, 'Duplicate review on same booking rejected (400)');

    // SECTION 5: ADMIN GOVERNANCE & NOTIFICATIONS
    console.log('\n--- 5. ADMIN GOVERNANCE & NOTIFICATIONS TESTS ---');

    // Admin Stats
    const adminStatsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    assert(adminStatsRes.status === 200 && adminStatsRes.body.stats.totalUsers >= 3, 'Admin stats endpoint returns platform analytics');

    // Non-admin block from admin stats
    const nonAdminStatsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${customerToken}`);
    assert(nonAdminStatsRes.status === 403, 'Non-admin blocked from accessing admin endpoints (403)');

    // Admin Toggle User Status
    const toggleStatusRes = await request(app)
      .patch(`/api/admin/users/${customerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    assert(toggleStatusRes.status === 200 && toggleStatusRes.body.user.isActive === false, 'Admin can toggle user active status');

    // Verify deactivated user cannot log in
    const deactivatedLoginRes = await request(app).post('/api/auth/login').send({
      email: customerPayload.email,
      password: customerPayload.password,
    });
    assert(deactivatedLoginRes.status === 403, 'Deactivated user blocked from logging in (403)');

    // Re-activate user
    await request(app)
      .patch(`/api/admin/users/${customerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true });

    // Notifications
    const notifRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${providerToken}`);
    assert(notifRes.status === 200 && notifRes.body.notifications.length > 0, 'User receives system notifications for booking requests');

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
