const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
process.env.JWT_SECRET = 'test_secret_for_ci';
process.env.NODE_ENV = 'test';
const app = require('../src/app');
const User = require('../src/models/User');
const Service = require('../src/models/Service');
const JobRequest = require('../src/models/JobRequest');
const Booking = require('../src/models/Booking');
const { reconcileJobRequests } = require('../src/workers/expiryWorker');

async function runTests() {
  console.log('=====================================================');
  console.log('STARTING PHASE 5A.1 DISPATCH RELIABILITY TEST SUITE');
  console.log('=====================================================\n');

  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(` ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // SETUP USERS & TOKENS
    // ----------------------------------------------------
    const customer1 = await User.create({
      name: 'Customer 1',
      email: 'c1@test.com',
      password: 'password123',
      role: 'customer',
    });
    const c1Token = (await request(app).post('/api/auth/login').send({ email: 'c1@test.com', password: 'password123' })).body.token;

    const customer2 = await User.create({
      name: 'Customer 2',
      email: 'c2@test.com',
      password: 'password123',
      role: 'customer',
    });
    const c2Token = (await request(app).post('/api/auth/login').send({ email: 'c2@test.com', password: 'password123' })).body.token;

    const provider1 = await User.create({
      name: 'Provider 1',
      email: 'p1@test.com',
      password: 'password123',
      role: 'service_provider',
      locationCoords: { type: 'Point', coordinates: [77.2090, 28.6139] },
      serviceRadiusKm: 15,
    });
    const p1Token = (await request(app).post('/api/auth/login').send({ email: 'p1@test.com', password: 'password123' })).body.token;

    const provider2 = await User.create({
      name: 'Provider 2',
      email: 'p2@test.com',
      password: 'password123',
      role: 'service_provider',
      locationCoords: { type: 'Point', coordinates: [77.2090, 28.6139] },
      serviceRadiusKm: 15,
    });
    const p2Token = (await request(app).post('/api/auth/login').send({ email: 'p2@test.com', password: 'password123' })).body.token;

    const providerIneligible = await User.create({
      name: 'Provider Ineligible',
      email: 'pineligible@test.com',
      password: 'password123',
      role: 'service_provider',
      locationCoords: { type: 'Point', coordinates: [77.2090, 28.6139] },
      serviceRadiusKm: 15,
    });
    const pIneligibleToken = (await request(app).post('/api/auth/login').send({ email: 'pineligible@test.com', password: 'password123' })).body.token;

    // Services
    await Service.create({
      title: 'AC Service P1',
      description: 'AC Repair',
      category: 'AC Service',
      price: 500,
      priceType: 'fixed',
      location: 'Delhi',
      provider: provider1._id,
      isActive: true,
    });

    await Service.create({
      title: 'AC Service P2',
      description: 'AC Repair',
      category: 'AC Service',
      price: 600,
      priceType: 'fixed',
      location: 'Delhi',
      provider: provider2._id,
      isActive: true,
    });

    // pIneligible only has Plumber, NOT AC Service
    await Service.create({
      title: 'Plumber PIneligible',
      description: 'Plumbing',
      category: 'Plumber',
      price: 400,
      priceType: 'fixed',
      location: 'Delhi',
      provider: providerIneligible._id,
      isActive: true,
    });

    // ----------------------------------------------------
    // SECTION 1: AUTHORIZATION & VALIDATION TESTS
    // ----------------------------------------------------
    console.log('\n--- 1. AUTHORIZATION & INPUT VALIDATION TESTS ---');

    // 1.1 Provider blocked from creating request
    const pCreateRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({ category: 'AC Service', requestType: 'inspection', address: 'Delhi', coordinates: [77.2090, 28.6139] });
    assert(pCreateRes.status === 403, 'Provider blocked from creating customer request (403)');

    // 1.2 Invalid category rejected
    const badCatRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ category: 'AstronautRepair', requestType: 'inspection', address: 'Delhi', coordinates: [77.2090, 28.6139] });
    assert(badCatRes.status === 400, 'Invalid service category rejected (400)');

    // 1.3 Known price blocked pending central pricing
    const knownPriceRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ category: 'AC Service', requestType: 'known_price', address: 'Delhi', coordinates: [77.2090, 28.6139] });
    assert(knownPriceRes.status === 400, 'Known-price requests blocked until central pricing exists (400)');

    // 1.4 Invalid coordinates rejected
    const badCoordsRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ category: 'AC Service', requestType: 'inspection', address: 'Delhi', coordinates: [999, 999] });
    assert(badCoordsRes.status === 400, 'Out-of-range coordinates rejected (400)');

    // 1.5 Empty address rejected
    const badAddrRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ category: 'AC Service', requestType: 'inspection', address: '   ', coordinates: [77.2090, 28.6139] });
    assert(badAddrRes.status === 400, 'Empty service address rejected (400)');

    // 1.6 Successful request creation
    const validReqRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({
        category: 'AC Service',
        requestType: 'inspection',
        problemDescription: 'AC not cooling',
        address: '100 Secret Street, Apartment 4B',
        coordinates: [77.2090, 28.6139],
        idempotencyKey: 'idem-key-1',
      });
    assert(validReqRes.status === 201 && validReqRes.body.jobRequest.status === 'searching', 'Customer can broadcast inspection request (status: searching)');
    const req1Id = validReqRes.body.jobRequest._id;

    // 1.7 Request creation idempotency
    const idemReqRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({
        category: 'AC Service',
        requestType: 'inspection',
        problemDescription: 'AC not cooling',
        address: '100 Secret Street, Apartment 4B',
        coordinates: [77.2090, 28.6139],
        idempotencyKey: 'idem-key-1',
      });
    assert(idemReqRes.status === 200 && idemReqRes.body.jobRequest._id === req1Id, 'Idempotent request creation returns existing request (200)');

    // 1.8 Sensitive address protected in provider broadcast view
    const providerViewRes = await request(app)
      .get('/api/v2/job-requests/eligible')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(providerViewRes.status === 200 && providerViewRes.body.requests.length > 0, 'Eligible provider can browse nearby matching requests');
    const matchingInBroadcast = providerViewRes.body.requests.find((r) => r._id === req1Id);
    assert(matchingInBroadcast && matchingInBroadcast.address === undefined, 'Sensitive customer address is hidden from unaccepted broadcast list');

    // 1.9 Ineligible provider blocked from accepting
    const ineligAcceptRes = await request(app)
      .post('/api/v2/job-requests/' + req1Id + '/accept')
      .set('Authorization', 'Bearer ' + pIneligibleToken);
    assert(ineligAcceptRes.status === 403, 'Provider without matching active service listing blocked from accepting (403)');

    // 1.10 Customer isolation on customer requests
    const c2ViewRes = await request(app)
      .get('/api/v2/job-requests/me')
      .set('Authorization', 'Bearer ' + c2Token);
    assert(c2ViewRes.body.requests.length === 0, 'Customer 2 cannot view Customer 1 requests (/me isolated)');

    // ----------------------------------------------------
    // SECTION 2: CONCURRENT ACCEPTANCE (RACE CONDITION)
    // ----------------------------------------------------
    console.log('\n--- 2. CONCURRENT ACCEPTANCE RACE CONDITION ---');

    const [p1Accept, p2Accept] = await Promise.all([
      request(app).post('/api/v2/job-requests/' + req1Id + '/accept').set('Authorization', 'Bearer ' + p1Token),
      request(app).post('/api/v2/job-requests/' + req1Id + '/accept').set('Authorization', 'Bearer ' + p2Token),
    ]);

    let successCount = 0;
    let conflictCount = 0;
    let winningProviderToken = null;

    if (p1Accept.status === 200) { successCount++; winningProviderToken = p1Token; }
    if (p1Accept.status === 409) conflictCount++;
    if (p2Accept.status === 200) { successCount++; winningProviderToken = p2Token; }
    if (p2Accept.status === 409) conflictCount++;

    assert(successCount === 1 && conflictCount === 1, 'Exactly one provider wins concurrent acceptance (1x 200, 1x 409)');

    // Verify DB state
    const postRaceJob = await JobRequest.findById(req1Id);
    assert(postRaceJob.status === 'accepted' && postRaceJob.acceptedBy !== null, 'JobRequest state in DB is accepted with non-null acceptedBy');
    const bookingsForJob = await Booking.find({ jobRequest: req1Id });
    assert(bookingsForJob.length === 1, 'Database contains exactly ONE Booking for the accepted JobRequest');
    assert(postRaceJob.bookingId.toString() === bookingsForJob[0]._id.toString(), 'JobRequest bookingId matches created Booking in DB');

    // ----------------------------------------------------
    // SECTION 3: IDEMPOTENT NETWORK RETRY BY WINNING PROVIDER
    // ----------------------------------------------------
    console.log('\n--- 3. NETWORK RETRY IDEMPOTENCY ---');

    const retryRes = await request(app)
      .post('/api/v2/job-requests/' + req1Id + '/accept')
      .set('Authorization', 'Bearer ' + winningProviderToken);
    assert(retryRes.status === 200, 'Same provider repeating acceptance after timeout receives 200 OK');
    assert(retryRes.body.booking._id === bookingsForJob[0]._id.toString(), 'Retry returns the SAME existing booking');

    const bookingsAfterRetry = await Booking.find({ jobRequest: req1Id });
    assert(bookingsAfterRetry.length === 1, 'Network retry created NO duplicate booking in DB (still exactly 1)');

    // ----------------------------------------------------
    // SECTION 4: RECOVERY & PROCESS INTERRUPTION
    // ----------------------------------------------------
    console.log('\n--- 4. RECOVERY & PROCESS INTERRUPTION ---');

    // 4.1 Scenario: Server restarted while Booking exists but JobRequest was left pending/claiming
    const interruptedJob1 = await JobRequest.create({
      customer: customer1._id,
      category: 'AC Service',
      requestType: 'inspection',
      address: '200 Oak Lane',
      location: { type: 'Point', coordinates: [77.2090, 28.6139] },
      status: 'claiming',
      acceptedBy: provider1._id,
      claimedAt: new Date(Date.now() - 20000), // 20s ago
      expiresAt: new Date(Date.now() + 60000),
    });

    // Corresponding booking was committed to DB
    const p1Service = await Service.findOne({ provider: provider1._id, category: 'AC Service' });
    const existingBookingDoc = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: p1Service._id,
      jobRequest: interruptedJob1._id,
      scheduledDate: new Date(),
      address: '200 Oak Lane',
      price: 99,
      status: 'accepted',
    });

    // Run reconciliation worker
    await reconcileJobRequests();

    const reconciledJob1 = await JobRequest.findById(interruptedJob1._id);
    assert(reconciledJob1.status === 'accepted', 'Interrupted request with existing Booking reconciled to accepted');
    assert(reconciledJob1.bookingId.toString() === existingBookingDoc._id.toString(), 'Reconciled request linked to existing Booking');
    assert(reconciledJob1.status !== 'searching', 'Request with existing booking is NEVER reopened to searching');

    // 4.2 Scenario: Server restarted during claiming but NO booking was created (timeout rollback)
    const interruptedJob2 = await JobRequest.create({
      customer: customer1._id,
      category: 'AC Service',
      requestType: 'inspection',
      address: '300 Pine Road',
      location: { type: 'Point', coordinates: [77.2090, 28.6139] },
      status: 'claiming',
      acceptedBy: provider1._id,
      claimedAt: new Date(Date.now() - 25000), // timed out claim
      expiresAt: new Date(Date.now() + 60000), // still unexpired
    });

    await reconcileJobRequests();
    const reconciledJob2 = await JobRequest.findById(interruptedJob2._id);
    assert(reconciledJob2.status === 'searching' && reconciledJob2.acceptedBy === null, 'Timed out claim with NO booking safely returned to searching pool');

    // 4.3 Unique constraint prevents duplicate bookings at database level
    let duplicateCaught = false;
    try {
      await Booking.create({
        customer: customer1._id,
        provider: provider2._id,
        service: p1Service._id,
        jobRequest: interruptedJob1._id, // Duplicate jobRequest!
        scheduledDate: new Date(),
        address: '200 Oak Lane',
        price: 99,
        status: 'accepted',
      });
    } catch (err) {
      duplicateCaught = err.code === 11000;
    }
    assert(duplicateCaught, 'Database unique partial index strictly blocks duplicate Booking on same JobRequest (E11000)');

    // ----------------------------------------------------
    // SECTION 5: EXPIRY RACING WITH ACCEPTANCE
    // ----------------------------------------------------
    console.log('\n--- 5. EXPIRY RACING WITH ACCEPTANCE ---');

    // Request already past expiry
    const expiringJob = await JobRequest.create({
      customer: customer1._id,
      category: 'AC Service',
      requestType: 'inspection',
      address: '400 Maple Ave',
      location: { type: 'Point', coordinates: [77.2090, 28.6139] },
      status: 'searching',
      expiresAt: new Date(Date.now() - 1000), // expired 1s ago
    });

    // Run expiry worker and acceptance simultaneously
    const [expireWorkerRun, acceptExpiredRes] = await Promise.all([
      reconcileJobRequests(),
      request(app).post('/api/v2/job-requests/' + expiringJob._id + '/accept').set('Authorization', 'Bearer ' + p1Token),
    ]);

    assert(acceptExpiredRes.status === 409, 'Acceptance on expired request rejected with 409 Conflict');
    const finalExpiredJob = await JobRequest.findById(expiringJob._id);
    assert(finalExpiredJob.status === 'expired', 'Expired request marked as expired in DB');
    const expiredBookings = await Booking.find({ jobRequest: expiringJob._id });
    assert(expiredBookings.length === 0, 'No booking created for expired request');

    // ----------------------------------------------------
    // SECTION 6: CANCELLATION RACING WITH ACCEPTANCE
    // ----------------------------------------------------
    console.log('\n--- 6. CANCELLATION RACING WITH ACCEPTANCE ---');

    const racingJob = await JobRequest.create({
      customer: customer1._id,
      category: 'AC Service',
      requestType: 'inspection',
      address: '500 Elm Street',
      location: { type: 'Point', coordinates: [77.2090, 28.6139] },
      status: 'searching',
      expiresAt: new Date(Date.now() + 60000),
    });

    // Run cancel and accept simultaneously
    const [cancelRes, acceptRaceRes] = await Promise.all([
      request(app).post('/api/v2/job-requests/' + racingJob._id + '/cancel').set('Authorization', 'Bearer ' + c1Token),
      request(app).post('/api/v2/job-requests/' + racingJob._id + '/accept').set('Authorization', 'Bearer ' + p1Token),
    ]);

    const oneSucceeded = (cancelRes.status === 200 && acceptRaceRes.status === 409) ||
                         (acceptRaceRes.status === 200 && cancelRes.status === 400);
    assert(oneSucceeded, 'Cancellation and acceptance race resolves cleanly (one 200, one error)');

    const finalRaceJob = await JobRequest.findById(racingJob._id);
    const finalRaceBookings = await Booking.find({ jobRequest: racingJob._id });
    if (cancelRes.status === 200) {
      assert(finalRaceJob.status === 'cancelled' && finalRaceBookings.length === 0, 'Cancellation won race: status cancelled, 0 bookings created');
    } else {
      assert(finalRaceJob.status === 'accepted' && finalRaceBookings.length === 1, 'Acceptance won race: status accepted, 1 booking created');
    }

    // Customer 2 cannot cancel Customer 1 request
    const unauthorizedCancelRes = await request(app)
      .post('/api/v2/job-requests/' + req1Id + '/cancel')
      .set('Authorization', 'Bearer ' + c2Token);
    assert(unauthorizedCancelRes.status === 404, 'Customer 2 cannot cancel Customer 1 request (404)');

  } catch (err) {
    console.error('\n💥 UNEXPECTED ERROR IN DISPATCH TESTS:', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();

    console.log('\n=====================================================');
    console.log(`DISPATCH RELIABILITY SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('=====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
