const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
process.env.JWT_SECRET = 'test_secret_for_ci';
process.env.NODE_ENV = 'test';
process.env.PLATFORM_COMMISSION_PERCENTAGE = '20';

const app = require('../src/app');
const User = require('../src/models/User');
const Service = require('../src/models/Service');
const JobRequest = require('../src/models/JobRequest');
const Booking = require('../src/models/Booking');
const CentralPricing = require('../src/models/CentralPricing');
const PromotionRedemption = require('../src/models/PromotionRedemption');
const LedgerEntry = require('../src/models/LedgerEntry');
const {
  getPlatformCommissionPercentage,
  calculateCommissionAndEarnings,
} = require('../src/config/commission');

async function runPhase5BTests() {
  console.log('=====================================================');
  console.log('STARTING PHASE 5B: QUOTES, LABOUR & COMMISSION TESTS');
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
    // SETUP ACTORS
    // ----------------------------------------------------
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@oddjobs.com',
      password: 'password123',
      role: 'admin',
    });
    const adminToken = (await request(app).post('/api/auth/login').send({ email: 'admin@oddjobs.com', password: 'password123' })).body.token;

    const customer1 = await User.create({
      name: 'Customer One',
      email: 'c1@test.com',
      password: 'password123',
      role: 'customer',
    });
    const c1Token = (await request(app).post('/api/auth/login').send({ email: 'c1@test.com', password: 'password123' })).body.token;

    const customer2 = await User.create({
      name: 'Customer Two',
      email: 'c2@test.com',
      password: 'password123',
      role: 'customer',
    });
    const c2Token = (await request(app).post('/api/auth/login').send({ email: 'c2@test.com', password: 'password123' })).body.token;

    const provider1 = await User.create({
      name: 'Electrician Provider',
      email: 'p1@test.com',
      password: 'password123',
      role: 'service_provider',
      locationCoords: { type: 'Point', coordinates: [77.2090, 28.6139] },
      serviceRadiusKm: 20,
    });
    const p1Token = (await request(app).post('/api/auth/login').send({ email: 'p1@test.com', password: 'password123' })).body.token;

    const provider2 = await User.create({
      name: 'Unassigned Provider',
      email: 'p2@test.com',
      password: 'password123',
      role: 'service_provider',
      locationCoords: { type: 'Point', coordinates: [77.2090, 28.6139] },
      serviceRadiusKm: 20,
    });
    const p2Token = (await request(app).post('/api/auth/login').send({ email: 'p2@test.com', password: 'password123' })).body.token;

    // Services
    await Service.create({
      title: 'AC Maintenance & Inspection',
      description: 'AC diagnostic',
      category: 'AC Service',
      price: 99,
      priceType: 'fixed',
      location: 'Delhi',
      provider: provider1._id,
      isActive: true,
    });

    await Service.create({
      title: 'Electrical Repair & Skilled Labour',
      description: 'Hourly electrical labour',
      category: 'Electrician',
      price: 500,
      priceType: 'hourly',
      location: 'Delhi',
      provider: provider1._id,
      isActive: true,
    });

    // ----------------------------------------------------
    // SECTION 1: COMMISSION CONFIGURATION & ARITHMETIC
    // ----------------------------------------------------
    console.log('\n--- 1. COMMISSION CONFIGURATION & ARITHMETIC ---');

    assert(getPlatformCommissionPercentage() === 20, 'Default platform commission resolves to 20%');

    // Commission arithmetic test (₹1000 labour + ₹500 materials @ 20%)
    const calcSample = calculateCommissionAndEarnings({
      labourAmountPaise: 100000, // ₹1000.00
      materialsAmountPaise: 50000, // ₹500.00
      commissionRate: 20,
    });
    assert(calcSample.commissionBasePaise === 100000, 'Commission base includes labour (₹1000)');
    assert(calcSample.commissionPaise === 20000, 'Commission is exactly 20% on labour (₹200.00 / 20000 paise)');
    assert(calcSample.netProviderEarningPaise === 130000, 'Net provider earning = (₹1000 - ₹200) + ₹500 materials = ₹1300.00 (130000 paise)');
    assert(calcSample.customerChargePaise === 150000, 'Total customer charge = ₹1000 labour + ₹500 materials = ₹1500.00');

    // Free inspection promotion arithmetic test (₹99 inspection waived)
    const calcPromo = calculateCommissionAndEarnings({
      labourAmountPaise: 9900,
      materialsAmountPaise: 0,
      commissionRate: 20,
      isFreeInspection: true,
    });
    assert(calcPromo.customerChargePaise === 0, 'Free inspection customer charge is ₹0');
    assert(calcPromo.waivedAmountPaise === 9900, 'Waived amount is recorded as ₹99 (9900 paise)');
    assert(calcPromo.promotionalSubsidyPaise === 9900, 'Platform promotional subsidy is recorded as ₹99');
    assert(calcPromo.netProviderEarningPaise === 7920, 'Provider net earning preserved at ₹79.20 (9900 - 1980 commission) without penalty');

    // Startup validation rejects invalid commission
    let invalidCaught = false;
    try {
      process.env.PLATFORM_COMMISSION_PERCENTAGE = '150';
      getPlatformCommissionPercentage();
    } catch (e) {
      invalidCaught = true;
    } finally {
      process.env.PLATFORM_COMMISSION_PERCENTAGE = '20';
    }
    assert(invalidCaught, 'Startup validation rejects out-of-range commission percentage (>100)');

    // ----------------------------------------------------
    // SECTION 2: CENTRAL PRICING CATALOGUE FOUNDATION
    // ----------------------------------------------------
    console.log('\n--- 2. CENTRAL PRICING CATALOGUE FOUNDATION ---');

    // Non-admin blocked from creating pricing
    const nonAdminPriceRes = await request(app)
      .post('/api/v2/pricing')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({
        category: 'AC Service',
        serviceIdentifier: 'ac_deep_cleaning',
        title: 'AC Deep Cleaning',
        pricingType: 'fixed',
        pricePaise: 49900,
      });
    assert(nonAdminPriceRes.status === 403, 'Non-admin blocked from configuring central pricing (403)');

    // Validation rejects negative price
    const negPriceRes = await request(app)
      .post('/api/v2/pricing')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        category: 'AC Service',
        serviceIdentifier: 'ac_deep_cleaning',
        title: 'AC Deep Cleaning',
        pricingType: 'fixed',
        pricePaise: -500,
      });
    assert(negPriceRes.status === 400, 'Central pricing rejects negative pricePaise (400)');

    // Admin creates valid central pricing for AC Service
    const adminPriceRes = await request(app)
      .post('/api/v2/pricing')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        category: 'AC Service',
        serviceIdentifier: 'ac_deep_cleaning',
        title: 'AC Deep Cleaning Standard',
        pricingType: 'fixed',
        pricePaise: 49900, // ₹499.00
      });
    assert(adminPriceRes.status === 200 && adminPriceRes.body.pricing.pricePaise === 49900, 'Admin can create approved central price (₹499.00 / 49900 paise)');

    // Known-price request fails if serviceIdentifier does not exist
    const unapprovedKnownRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({
        category: 'AC Service',
        requestType: 'known_price',
        serviceIdentifier: 'non_existent_service',
        address: 'Delhi',
        coordinates: [77.2090, 28.6139],
      });
    assert(unapprovedKnownRes.status === 400, 'Known-price request for unapproved service rejected with clear error (400)');

    // Known-price request succeeds with approved serviceIdentifier
    const approvedKnownRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({
        category: 'AC Service',
        requestType: 'known_price',
        serviceIdentifier: 'ac_deep_cleaning',
        address: 'Delhi',
        coordinates: [77.2090, 28.6139],
      });
    assert(approvedKnownRes.status === 201, 'Known-price request succeeds when approved central pricing exists');

    // ----------------------------------------------------
    // SECTION 3: FIRST ELIGIBLE FREE INSPECTION PROMOTION
    // ----------------------------------------------------
    console.log('\n--- 3. FIRST ELIGIBLE FREE INSPECTION PROMOTION ---');

    // Customer 1 creates inspection request -> qualifies for free inspection
    const promoReqRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({
        category: 'AC Service',
        requestType: 'inspection',
        problemDescription: 'Strange noise from indoor unit',
        address: '123 Residency Road',
        coordinates: [77.2090, 28.6139],
      });
    assert(promoReqRes.status === 201, 'Inspection request created for Customer 1');
    assert(promoReqRes.body.jobRequest.isFreeInspection === true, 'First inspection request automatically reserved free inspection promotion');

    const promoReqId = promoReqRes.body.jobRequest._id;
    const reservedPromoDoc = await PromotionRedemption.findOne({ jobRequest: promoReqId });
    assert(reservedPromoDoc && reservedPromoDoc.status === 'reserved', 'PromotionRedemption record created in reserved status');

    // Customer 1 attempts second concurrent inspection request -> does not get duplicate reservation
    const secondReqRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({
        category: 'AC Service',
        requestType: 'inspection',
        problemDescription: 'Second unit inspection',
        address: '123 Residency Road',
        coordinates: [77.2090, 28.6139],
      });
    assert(secondReqRes.status === 201, 'Second request created');
    assert(secondReqRes.body.jobRequest.isFreeInspection === false, 'Second concurrent request denied duplicate free inspection offer');

    // Provider 1 accepts the first free-inspection request
    const acceptPromoRes = await request(app)
      .post('/api/v2/job-requests/' + promoReqId + '/accept')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(acceptPromoRes.status === 200, 'Provider accepts free-inspection request');

    const promoBookingId = acceptPromoRes.body.booking._id;
    const linkedPromoDoc = await PromotionRedemption.findOne({ jobRequest: promoReqId });
    assert(linkedPromoDoc.booking.toString() === promoBookingId, 'PromotionRedemption linked to resulting Booking');

    const promoBookingDoc = await Booking.findById(promoBookingId);
    assert(promoBookingDoc.finalFinancials.isFreeInspection === true, 'Booking inherits isFreeInspection flag');
    assert(promoBookingDoc.commissionRateSnapshot === 20, 'Booking snapshots commission rate (20%)');

    // ----------------------------------------------------
    // SECTION 4: INSPECTION & QUOTING WORKFLOW
    // ----------------------------------------------------
    console.log('\n--- 4. INSPECTION & QUOTING WORKFLOW ---');

    // 4.1 Provider marks arrival
    const unassignedArriveRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/arrive')
      .set('Authorization', 'Bearer ' + p2Token);
    assert(unassignedArriveRes.status === 403, 'Unassigned provider blocked from marking arrival (403)');

    const arriveRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/arrive')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(arriveRes.status === 200 && arriveRes.body.booking.workflowStatus === 'arrived', 'Assigned provider marks arrival (workflowStatus -> arrived)');

    // 4.2 Provider starts inspection
    const inspectRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/start-inspection')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(inspectRes.status === 200 && inspectRes.body.booking.workflowStatus === 'inspecting', 'Provider starts inspection (workflowStatus -> inspecting)');

    // 4.3 Provider submits Quote v1 (with materials and labour)
    const quote1Res = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/quote')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({
        description: 'Capacitor replacement and gas top-up',
        labourAmountPaise: 80000, // ₹800.00 labour
        materials: [
          { item: 'Run Capacitor 45uF', quantity: 1, unitPricePaise: 35000 }, // ₹350.00
          { item: 'R32 Gas Top-Up (kg)', quantity: 1, unitPricePaise: 65000 }, // ₹650.00
        ],
        otherChargesPaise: 0,
      });
    assert(quote1Res.status === 200, 'Provider submits Quote v1');
    const quote1 = quote1Res.body.quote;
    assert(quote1.quoteVersion === 1, 'Quote version is 1');
    assert(quote1.materialsTotalPaise === 100000, 'Backend correctly calculated materials total = ₹1000.00 (100000 paise)');
    assert(quote1.totalAmountPaise === 180000, 'Backend correctly calculated quote total = ₹1800.00 (180000 paise)');

    // 4.4 Provider BLOCKED from starting work before quote approval
    const prematureWorkRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/start-work')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(prematureWorkRes.status === 400, 'Provider strictly blocked from starting work before customer quote approval (400)');

    // 4.5 Legacy status update also BLOCKED from bypassing customer quote approval
    const legacyBypassRes = await request(app)
      .patch('/api/bookings/' + promoBookingId + '/status')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({ status: 'in_progress' });
    assert(legacyBypassRes.status === 400, 'Legacy PATCH endpoint strictly blocked from bypassing quote approval on dispatch bookings (400)');

    // 4.6 Provider proposes revised Quote v2 (supersedes v1)
    const quote2Res = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/quote')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({
        description: 'Capacitor replacement only (gas top-up deferred)',
        labourAmountPaise: 50000, // ₹500.00 labour
        materials: [
          { item: 'Run Capacitor 45uF', quantity: 1, unitPricePaise: 35000 }, // ₹350.00
        ],
      });
    assert(quote2Res.status === 200, 'Provider submits revised Quote v2');
    const quote2 = quote2Res.body.quote;
    assert(quote2.quoteVersion === 2, 'Revised quote is version 2');
    assert(quote2.totalAmountPaise === 85000, 'Revised quote total is ₹850.00 (85000 paise)');

    const quotesListRes = await request(app)
      .get('/api/v2/bookings/' + promoBookingId + '/quotes')
      .set('Authorization', 'Bearer ' + c1Token);
    const q1InDb = quotesListRes.body.quotes.find((q) => q.quoteVersion === 1);
    assert(q1InDb.status === 'superseded', 'Earlier Quote v1 is superseded by Quote v2');

    // 4.7 Customer rejects Quote v2
    const rejectRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/quote/reject')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ quoteVersion: 2, reason: 'Too expensive for capacitor' });
    assert(rejectRes.status === 200, 'Customer rejects Quote v2');

    const postRejectWorkRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/start-work')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(postRejectWorkRes.status === 400, 'Provider blocked from starting work after quote rejection (400)');

    // 4.8 Provider submits Quote v3 and Customer approves
    const quote3Res = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/quote')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({
        description: 'Discounted capacitor replacement',
        labourAmountPaise: 40000, // ₹400.00 labour
        materials: [
          { item: 'Standard Capacitor', quantity: 1, unitPricePaise: 30000 }, // ₹300.00
        ],
      });
    assert(quote3Res.status === 200, 'Provider submits Quote v3 (Total ₹700.00 / 70000 paise)');

    // Attempt approval with mismatched total fails
    const badTotalApproveRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/quote/approve')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ quoteVersion: 3, totalAmountPaise: 99999 });
    assert(badTotalApproveRes.status === 400, 'Approval rejected if client submits mismatched total amount (400)');

    // Customer approves exact Quote v3
    const approveRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/quote/approve')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ quoteVersion: 3, totalAmountPaise: 70000 });
    assert(approveRes.status === 200 && approveRes.body.booking.quoteApproved === true, 'Customer approves exact Quote v3 (70000 paise)');

    // 4.9 Provider now permitted to start work
    const startWorkRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/start-work')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(startWorkRes.status === 200 && startWorkRes.body.booking.workflowStatus === 'work_in_progress', 'Provider starts work following quote approval');

    // ----------------------------------------------------
    // SECTION 5: HOURLY LABOUR, EXTENSIONS & COMPLETION
    // ----------------------------------------------------
    console.log('\n--- 5. HOURLY LABOUR, EXTENSIONS & COMPLETION ---');

    // Provider requests extension
    const extReqRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/extension-request')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({
        additionalMinutes: 30,
        additionalAmountPaise: 15000, // +₹150.00
        reason: 'Rusted mounting bracket replacement',
      });
    assert(extReqRes.status === 200 && extReqRes.body.extension.extensionVersion === 1, 'Provider requests 30-min extension (+₹150.00)');

    // Customer approves extension
    const extApproveRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/extension-decide')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ extensionVersion: 1, approved: true });
    assert(extApproveRes.status === 200, 'Customer approves extension v1');

    // Provider completes job
    const completeRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(completeRes.status === 200, 'Provider completes job');

    const completedBooking = await Booking.findById(promoBookingId);
    assert(completedBooking.workflowStatus === 'completed', 'Booking workflowStatus is completed in DB');
    assert(completedBooking.status === 'completed', 'Legacy status is completed in DB');

    // ----------------------------------------------------
    // SECTION 6: FINANCIAL LEDGER & COMMISSION VERIFICATION
    // ----------------------------------------------------
    console.log('\n--- 6. FINANCIAL LEDGER & COMMISSION VERIFICATION ---');

    const ledgerEntries = await LedgerEntry.find({ booking: promoBookingId });
    assert(ledgerEntries.length >= 4, 'Append-only ledger entries written to database (>= 4 records)');

    const labourEntry = ledgerEntries.find((e) => e.entryType === 'labour_charge');
    const materialsEntry = ledgerEntries.find((e) => e.entryType === 'materials_charge');
    const commissionEntry = ledgerEntries.find((e) => e.entryType === 'platform_commission');
    const earningEntry = ledgerEntries.find((e) => e.entryType === 'provider_earning');

    assert(labourEntry && labourEntry.amountPaise === 40000, 'Labour charge ledger entry = ₹400.00 (40000 paise)');
    assert(materialsEntry && materialsEntry.amountPaise === 30000, 'Materials charge ledger entry = ₹300.00 (30000 paise)');
    assert(commissionEntry && commissionEntry.amountPaise === 8000, 'Platform commission is 20% on labour only = ₹80.00 (8000 paise; materials excluded!)');
    assert(earningEntry && earningEntry.amountPaise === 62000, 'Provider net earning = (₹400 - ₹80 commission) + ₹300 materials = ₹620.00 (62000 paise)');

    // Idempotency: Repeating completion does NOT create duplicate ledger entries
    const repeatCompleteRes = await request(app)
      .post('/api/v2/bookings/' + promoBookingId + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(repeatCompleteRes.status === 200, 'Repeating completion is idempotent (200 OK)');
    const ledgerAfterRepeat = await LedgerEntry.find({ booking: promoBookingId });
    assert(ledgerAfterRepeat.length === ledgerEntries.length, 'No duplicate ledger entries created on completion retry');

    // Free inspection promotion redeemed in database
    const redeemedPromo = await PromotionRedemption.findOne({ booking: promoBookingId });
    assert(redeemedPromo && redeemedPromo.status === 'redeemed', 'PromotionRedemption marked redeemed in DB');

    // ----------------------------------------------------
    // SECTION 7: PROVIDER FINANCIAL DATA PRIVACY
    // ----------------------------------------------------
    console.log('\n--- 7. PROVIDER FINANCIAL DATA PRIVACY ---');

    const provEarningsRes = await request(app)
      .get('/api/v2/provider/bookings/' + promoBookingId + '/earnings')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(provEarningsRes.status === 200, 'Provider can view booking earnings summary');

    const earningsBody = provEarningsRes.body;
    assert(earningsBody.financialSummary.netPayablePaise === 62000, 'Provider sees their correct net payable earnings (₹620.00 / 62000 paise)');
    assert(earningsBody.financialSummary.materialsReimbursementPaise === 30000, 'Provider sees materials reimbursement (₹300.00)');

    // Verify STRICT PRIVACY: Internal commission fields MUST NOT be exposed!
    assert(earningsBody.commissionPaise === undefined, 'Internal commissionPaise is NOT leaked to provider API');
    assert(earningsBody.commissionRate === undefined, 'Internal commissionRate percentage is NOT leaked to provider API');
    assert(earningsBody.financialSummary.commissionPaise === undefined, 'financialSummary.commissionPaise is NOT leaked');
    assert(earningsBody.financialSummary.platformCommission === undefined, 'financialSummary.platformCommission is NOT leaked');

    // Provider aggregated earnings dashboard
    const provAllEarningsRes = await request(app)
      .get('/api/v2/provider/earnings')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(provAllEarningsRes.status === 200 && provAllEarningsRes.body.totalCompletedJobs >= 1, 'Provider aggregated earnings list returned');
    assert(provAllEarningsRes.body.commissionTotal === undefined, 'Aggregated earnings list hides platform commission figures');

    // ----------------------------------------------------
    // SECTION 8: PROMOTION RELEASE ON CANCELLATION
    // ----------------------------------------------------
    console.log('\n--- 8. PROMOTION RELEASE ON CANCELLATION ---');

    // Customer 2 creates inspection request -> qualifies for free inspection
    const c2ReqRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c2Token)
      .send({
        category: 'AC Service',
        requestType: 'inspection',
        problemDescription: 'C2 unit check',
        address: '456 Hill Road',
        coordinates: [77.2090, 28.6139],
      });
    const c2ReqId = c2ReqRes.body.jobRequest._id;
    assert(c2ReqRes.body.jobRequest.isFreeInspection === true, 'Customer 2 receives free inspection reservation');

    // Customer 2 cancels request before provider accepts
    const cancelC2Res = await request(app)
      .post('/api/v2/job-requests/' + c2ReqId + '/cancel')
      .set('Authorization', 'Bearer ' + c2Token);
    assert(cancelC2Res.status === 200, 'Customer 2 cancels request');

    const c2PromoDoc = await PromotionRedemption.findOne({ jobRequest: c2ReqId });
    assert(c2PromoDoc.status === 'released', 'Promotion reservation released upon request cancellation');

    // Customer 2 can now claim free inspection on their next request!
    const c2NextReqRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c2Token)
      .send({
        category: 'AC Service',
        requestType: 'inspection',
        problemDescription: 'C2 second attempt unit check',
        address: '456 Hill Road',
        coordinates: [77.2090, 28.6139],
      });
    assert(c2NextReqRes.body.jobRequest.isFreeInspection === true, 'Customer 2 successfully reclaims free inspection after earlier cancellation');

  } catch (err) {
    console.error('\n💥 UNEXPECTED ERROR IN PHASE 5B TESTS:', err);
    failed++;
  } finally {
    await mongoose.disconnect();
    await mongoServer.stop();

    console.log('\n=====================================================');
    console.log(`PHASE 5B TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('=====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase5BTests();
