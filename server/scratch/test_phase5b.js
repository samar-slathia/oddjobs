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
const {
  verifyBookingSettlement,
  reconcilePendingSettlements,
  completeAndSettleBooking,
} = require('../src/services/settlementService');

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

    // Verify customer charge and promotional subsidy on approved repair
    assert(completedBooking.finalFinancials.totalCustomerChargePaise === 70000, 'Customer charged full quote amount (₹400 labour + ₹300 materials = ₹700.00 / 70000 paise)');
    assert(completedBooking.finalFinancials.promotionalSubsidyPaise === 0, 'No platform promotional subsidy on approved repair quote');
    assert(completedBooking.finalFinancials.settlementStatus === 'settled', 'Final financial settlement status is marked settled');

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

    // ----------------------------------------------------
    // SECTION 9: PHASE 1 REGRESSION TESTS — SUBSIDY CAP, REPAIR BILLING, PARTIAL FAILURE RECOVERY & IDEMPOTENCY
    // ----------------------------------------------------
    console.log('\n--- 9. PHASE 1 REGRESSION TESTS ---');

    // 9.1 Unit regression: Diagnostic subsidy cap and approved quote separation
    const calcDiagCapped = calculateCommissionAndEarnings({
      labourAmountPaise: 15000, // Provider claims 150.00 for diagnosis
      materialsAmountPaise: 0,
      commissionRate: 20,
      isFreeInspection: true,
      hasApprovedQuote: false,
      standardInspectionFeePaise: 9900,
    });
    assert(calcDiagCapped.promotionalSubsidyPaise === 9900, 'Diagnostic subsidy strictly capped at standard inspection fee (9900 paise / ₹99.00)');
    assert(calcDiagCapped.waivedAmountPaise === 9900, 'Waived amount capped at ₹99.00');
    assert(calcDiagCapped.customerChargePaise === 5100, 'Customer charged remaining 5100 paise beyond capped subsidy');

    const calcApprovedRepair = calculateCommissionAndEarnings({
      labourAmountPaise: 50000, // ₹500 labour
      materialsAmountPaise: 20000, // ₹200 materials
      commissionRate: 20,
      isFreeInspection: true,
      hasApprovedQuote: true, // Customer approved repair quote!
      standardInspectionFeePaise: 9900,
    });
    assert(calcApprovedRepair.customerChargePaise === 70000, 'Customer charged full approved repair quote (₹500 labour + ₹200 materials = ₹700 / 70000 paise)');
    assert(calcApprovedRepair.waivedAmountPaise === 0, 'Approved repair labour is NOT waived');
    assert(calcApprovedRepair.promotionalSubsidyPaise === 0, 'Platform promotional subsidy is ₹0 on approved repair quote');
    assert(calcApprovedRepair.commissionPaise === 10000, 'Platform commission is 20% on labour only (₹100 / 10000 paise; materials excluded)');
    assert(calcApprovedRepair.netProviderEarningPaise === 60000, 'Provider net earning = (₹500 - ₹100) + ₹200 = ₹600 / 60000 paise');

    // 9.2 End-to-end: Customer 2 approved repair after free inspection
    const c2JobReqId = c2NextReqRes.body.jobRequest._id;
    const acceptC2Res = await request(app)
      .post('/api/v2/job-requests/' + c2JobReqId + '/accept')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(acceptC2Res.status === 200, 'Provider accepts Customer 2 free-inspection request');

    const c2BookingId = acceptC2Res.body.booking._id;
    await request(app).post('/api/v2/bookings/' + c2BookingId + '/arrive').set('Authorization', 'Bearer ' + p1Token);
    await request(app).post('/api/v2/bookings/' + c2BookingId + '/start-inspection').set('Authorization', 'Bearer ' + p1Token);

    // Provider submits Quote with ₹600 labour + ₹250 materials
    const c2QuoteRes = await request(app)
      .post('/api/v2/bookings/' + c2BookingId + '/quote')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({
        labourAmountPaise: 60000,
        materials: [{ item: 'Contactor Switch', quantity: 1, unitPricePaise: 25000 }],
      });
    assert(c2QuoteRes.status === 200, 'Provider submits repair quote for Customer 2');

    // Customer 2 approves quote
    const c2ApproveRes = await request(app)
      .post('/api/v2/bookings/' + c2BookingId + '/quote/approve')
      .set('Authorization', 'Bearer ' + c2Token)
      .send({ quoteVersion: 1, totalAmountPaise: 85000 });
    assert(c2ApproveRes.status === 200, 'Customer 2 approves repair quote (85000 paise)');

    await request(app).post('/api/v2/bookings/' + c2BookingId + '/start-work').set('Authorization', 'Bearer ' + p1Token);

    // Provider completes job
    const c2CompleteRes = await request(app)
      .post('/api/v2/bookings/' + c2BookingId + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(c2CompleteRes.status === 200, 'Provider completes Customer 2 job');

    const c2CompletedBooking = await Booking.findById(c2BookingId);
    assert(c2CompletedBooking.finalFinancials.totalCustomerChargePaise === 85000, 'Customer 2 charged full quote total (85000 paise / ₹850)');
    assert(c2CompletedBooking.finalFinancials.promotionalSubsidyPaise === 0, 'No promotional subsidy on Customer 2 approved repair');
    assert(c2CompletedBooking.finalFinancials.waivedAmountPaise === 0, 'No repair labour waived for Customer 2');
    assert(c2CompletedBooking.finalFinancials.netProviderEarningPaise === 73000, 'Provider net earning = (₹600 - ₹120 commission) + ₹250 = ₹730 / 73000 paise');

    const c2LedgerEntries = await LedgerEntry.find({ booking: c2BookingId });
    assert(c2LedgerEntries.length === 4, 'Exactly 4 ledger entries created for Customer 2 repair job (no promo subsidy entry)');
    const c2PromoLedger = c2LedgerEntries.find((e) => e.entryType === 'promotional_subsidy');
    assert(!c2PromoLedger, 'No promotional_subsidy ledger entry written for approved repair quote');

    const c2PromoDocFinal = await PromotionRedemption.findOne({ booking: c2BookingId });
    assert(c2PromoDocFinal && c2PromoDocFinal.status === 'redeemed', 'Customer 2 PromotionRedemption marked redeemed');

    // 9.3 Injected database failure & retry recovery
    // Create a new booking for failure simulation
    const failureBooking = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '789 Failure Injection Lane',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'work_in_progress',
      status: 'in_progress',
      commissionRateSnapshot: 20,
    });

    // Simulate an injected failure during ledger entries write
    const originalFindOneAndUpdate = LedgerEntry.findOneAndUpdate;
    let findOneAndUpdateCount = 0;
    LedgerEntry.findOneAndUpdate = function (...args) {
      findOneAndUpdateCount++;
      if (findOneAndUpdateCount === 2) {
        throw new Error('Injected simulated database error on second ledger write');
      }
      return originalFindOneAndUpdate.apply(this, args);
    };

    let partialFailed = false;
    try {
      await request(app)
        .post('/api/v2/bookings/' + failureBooking._id + '/complete')
        .set('Authorization', 'Bearer ' + p1Token);
    } catch (_) {
      partialFailed = true;
    } finally {
      LedgerEntry.findOneAndUpdate = originalFindOneAndUpdate; // Restore original immediately
    }

    // Inspect intermediate state after failure
    const interruptedBooking = await Booking.findById(failureBooking._id);
    assert(
      interruptedBooking.finalFinancials?.settlementStatus === 'pending_settlement',
      'Interrupted booking records settlementStatus as pending_settlement'
    );
    const interruptedLedgerCount = await LedgerEntry.countDocuments({ booking: failureBooking._id });
    assert(interruptedLedgerCount === 1, 'Only 1 ledger entry exists before failure interruption');

    // Retry completion — must recover gracefully and complete all records!
    const retryRes = await request(app)
      .post('/api/v2/bookings/' + failureBooking._id + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(retryRes.status === 200, 'Retry completion returns 200 OK after partial failure');

    const recoveredBooking = await Booking.findById(failureBooking._id);
    assert(
      recoveredBooking.finalFinancials?.settlementStatus === 'settled',
      'Recovered booking records settlementStatus as settled after retry'
    );

    const recoveredLedgerEntries = await LedgerEntry.find({ booking: failureBooking._id });
    assert(recoveredLedgerEntries.length === 3, 'All 3 required ledger entries exist after recovery');
    const labourEntriesCount = recoveredLedgerEntries.filter((e) => e.entryType === 'labour_charge').length;
    assert(labourEntriesCount === 1, 'Idempotency key strictly prevented duplicate labour_charge entry on retry');

    // Third call — idempotent
    const repeatFailureBookingRes = await request(app)
      .post('/api/v2/bookings/' + failureBooking._id + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(repeatFailureBookingRes.status === 200, 'Subsequent repeat call returns 200 OK');
    const finalCount = await LedgerEntry.countDocuments({ booking: failureBooking._id });
    assert(finalCount === 3, 'Ledger entry count remains strictly unchanged across duplicate completion calls');

    // 9.4 Diagnosis-only free inspection end-to-end
    const customer3 = await User.create({
      name: 'Customer Three',
      email: 'c3@test.com',
      password: 'password123',
      role: 'customer',
    });
    const c3Token = (await request(app).post('/api/auth/login').send({ email: 'c3@test.com', password: 'password123' })).body.token;

    const c3ReqRes = await request(app)
      .post('/api/v2/job-requests')
      .set('Authorization', 'Bearer ' + c3Token)
      .send({
        category: 'AC Service',
        requestType: 'inspection',
        problemDescription: 'C3 diagnostic check',
        address: '101 Diagnostic Lane',
        coordinates: [77.2090, 28.6139],
      });
    const c3JobReqId = c3ReqRes.body.jobRequest._id;
    assert(c3ReqRes.body.jobRequest.isFreeInspection === true, 'Customer 3 receives free inspection reservation');

    const acceptC3Res = await request(app)
      .post('/api/v2/job-requests/' + c3JobReqId + '/accept')
      .set('Authorization', 'Bearer ' + p1Token);
    const c3BookingId = acceptC3Res.body.booking._id;

    await request(app).post('/api/v2/bookings/' + c3BookingId + '/arrive').set('Authorization', 'Bearer ' + p1Token);
    await request(app).post('/api/v2/bookings/' + c3BookingId + '/start-inspection').set('Authorization', 'Bearer ' + p1Token);

    // Provider diagnoses unit without quote (diagnosis only)
    const c3CompleteRes = await request(app)
      .post('/api/v2/bookings/' + c3BookingId + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(c3CompleteRes.status === 200, 'Provider completes diagnostic-only inspection for Customer 3');

    const c3CompletedBooking = await Booking.findById(c3BookingId);
    assert(c3CompletedBooking.finalFinancials.totalCustomerChargePaise === 0, 'Customer 3 charged ₹0 for free diagnostic inspection');
    assert(c3CompletedBooking.finalFinancials.promotionalSubsidyPaise === 9900, 'Platform promotional subsidy is capped at ₹99 (9900 paise)');
    assert(c3CompletedBooking.finalFinancials.waivedAmountPaise === 9900, 'Waived amount is recorded as ₹99 (9900 paise)');
    assert(c3CompletedBooking.finalFinancials.netProviderEarningPaise === 7920, 'Provider receives ₹79.20 (9900 - 1980 commission) net earnings');

    const c3LedgerEntries = await LedgerEntry.find({ booking: c3BookingId });
    const c3SubsidyEntry = c3LedgerEntries.find((e) => e.entryType === 'promotional_subsidy');
    assert(c3SubsidyEntry && c3SubsidyEntry.amountPaise === 9900, 'Promotional subsidy ledger entry posted for diagnostic inspection (9900 paise)');

    const c3PromoDoc = await PromotionRedemption.findOne({ booking: c3BookingId });
    assert(c3PromoDoc && c3PromoDoc.status === 'redeemed', 'Customer 3 PromotionRedemption marked redeemed');

    // ----------------------------------------------------
    // SECTION 10: PHASE 1.1 SETTLEMENT VERIFICATION & AUTOMATIC RECOVERY
    // ----------------------------------------------------
    console.log('\n--- 10. PHASE 1.1 SETTLEMENT VERIFICATION & AUTOMATIC RECOVERY ---');

    // 10.1 Missing required entry reconciliation
    const bMissing = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '10 Missing Entry Way',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'completed',
      status: 'completed',
      commissionRateSnapshot: 20,
      finalFinancials: {
        calculated: true,
        labourPaise: 50000,
        materialsPaise: 0,
        totalCustomerChargePaise: 50000,
        commissionRate: 20,
        commissionPaise: 10000,
        netProviderEarningPaise: 40000,
        settlementStatus: 'pending_settlement',
      },
    });

    // Write ONLY labour and commission entries (provider_earning is missing)
    await LedgerEntry.create({
      booking: bMissing._id,
      provider: provider1._id,
      customer: customer1._id,
      entryType: 'labour_charge',
      amountPaise: 50000,
      currency: 'INR',
      idempotencyKey: `${bMissing._id}_labour`,
      description: 'Labour charge',
      settlementStatus: 'calculated',
    });
    await LedgerEntry.create({
      booking: bMissing._id,
      provider: provider1._id,
      customer: customer1._id,
      entryType: 'platform_commission',
      amountPaise: 10000,
      currency: 'INR',
      idempotencyKey: `${bMissing._id}_commission`,
      description: 'Commission',
      settlementStatus: 'calculated',
    });

    const missingCalc = {
      labourPaise: 50000,
      materialsPaise: 0,
      commissionRate: 20,
      commissionPaise: 10000,
      netProviderEarningPaise: 40000,
      customerChargePaise: 50000,
      promotionalSubsidyPaise: 0,
      waivedAmountPaise: 0,
    };

    const verifyMissingRes = await verifyBookingSettlement(bMissing, missingCalc, false);
    assert(verifyMissingRes.isValid === false, 'Settlement verification detects incomplete ledger entries');
    assert(verifyMissingRes.missingEntries.length === 1, 'Exactly one required entry missing');
    assert(
      verifyMissingRes.missingEntries[0].entryType === 'provider_earning',
      'Verification precisely identifies provider_earning as missing entry'
    );

    // Calling completeAndSettleBooking safely reconciles the missing entry
    await completeAndSettleBooking(bMissing, missingCalc, false, { now: new Date(), updatedBy: provider1._id });
    const bMissingPost = await Booking.findById(bMissing._id);
    assert(
      bMissingPost.finalFinancials.settlementStatus === 'settled',
      'Booking reconciled to settled status after missing entry written'
    );
    const bMissingEntries = await LedgerEntry.find({ booking: bMissing._id });
    assert(bMissingEntries.length === 3, 'All 3 ledger entries now present in database');
    assert(
      bMissingEntries.some((e) => e.entryType === 'provider_earning' && e.amountPaise === 40000),
      'Missing provider_earning created with exact expected amount (40000 paise)'
    );

    // 10.2 Incorrect-amount detection without overwriting
    const bWrongAmount = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '20 Corrupted Amount Blvd',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'work_in_progress',
      status: 'in_progress',
      commissionRateSnapshot: 20,
    });

    // Insert corrupted labour entry with wrong amount (1000 paise instead of 50000)
    await LedgerEntry.create({
      booking: bWrongAmount._id,
      provider: provider1._id,
      customer: customer1._id,
      entryType: 'labour_charge',
      amountPaise: 1000,
      currency: 'INR',
      idempotencyKey: `${bWrongAmount._id}_labour`,
      description: 'Corrupted labour charge',
      settlementStatus: 'calculated',
    });

    const verifyWrongRes = await verifyBookingSettlement(bWrongAmount, missingCalc, false);
    assert(verifyWrongRes.isValid === false, 'Verification detects corrupted ledger entry amount');
    assert(verifyWrongRes.inconsistentEntries.length === 1, 'Inconsistent entries detected');
    assert(
      verifyWrongRes.inconsistentEntries[0].entryType === 'labour_charge',
      'Inconsistent entry identified as labour_charge'
    );
    assert(
      verifyWrongRes.inconsistentEntries[0].expectedAmountPaise === 50000 &&
        verifyWrongRes.inconsistentEntries[0].actualAmountPaise === 1000,
      'Inconsistent entry reflects expected vs actual amount mismatch'
    );

    // Attempting completion via API must reject with 409 Conflict
    const wrongAmtRes = await request(app)
      .post('/api/v2/bookings/' + bWrongAmount._id + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(wrongAmtRes.status === 409, 'Completion endpoint returns 409 Conflict on ledger amount mismatch');

    // Verify existing entry was NOT overwritten and booking is NOT marked settled
    const preservedEntry = await LedgerEntry.findOne({ booking: bWrongAmount._id, entryType: 'labour_charge' });
    assert(
      preservedEntry.amountPaise === 1000,
      'Existing ledger entry amount strictly preserved (NOT silently overwritten)'
    );
    const bWrongDb = await Booking.findById(bWrongAmount._id);
    assert(
      bWrongDb.finalFinancials?.settlementStatus !== 'settled',
      'Booking with amount inconsistency is NOT marked settled'
    );

    // 10.3 Extraneous entry count deception
    const bDeception = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '30 Count Deception Road',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'completed',
      status: 'completed',
      commissionRateSnapshot: 20,
      finalFinancials: {
        calculated: true,
        labourPaise: 50000,
        materialsPaise: 0,
        totalCustomerChargePaise: 50000,
        commissionRate: 20,
        commissionPaise: 10000,
        netProviderEarningPaise: 40000,
        settlementStatus: 'pending_settlement',
      },
    });

    // Insert 3 entries: labour, commission, and extraneous reversal (provider_earning missing!)
    await LedgerEntry.create({
      booking: bDeception._id,
      provider: provider1._id,
      customer: customer1._id,
      entryType: 'labour_charge',
      amountPaise: 50000,
      currency: 'INR',
      idempotencyKey: `${bDeception._id}_labour`,
      description: 'Labour charge',
      settlementStatus: 'calculated',
    });
    await LedgerEntry.create({
      booking: bDeception._id,
      provider: provider1._id,
      customer: customer1._id,
      entryType: 'platform_commission',
      amountPaise: 10000,
      currency: 'INR',
      idempotencyKey: `${bDeception._id}_commission`,
      description: 'Commission',
      settlementStatus: 'calculated',
    });
    await LedgerEntry.create({
      booking: bDeception._id,
      provider: provider1._id,
      customer: customer1._id,
      entryType: 'reversal',
      amountPaise: 5000,
      currency: 'INR',
      idempotencyKey: `${bDeception._id}_extraneous_reversal`,
      description: 'Extraneous entry',
      settlementStatus: 'reversed',
    });

    const deceptionCount = await LedgerEntry.countDocuments({ booking: bDeception._id });
    assert(deceptionCount === 3, 'Old countDocuments check sees count of 3');

    const verifyDeceptionRes = await verifyBookingSettlement(bDeception, missingCalc, false);
    assert(
      verifyDeceptionRes.isValid === false,
      'New entry verification rejects settlement despite total count reaching 3'
    );
    assert(
      verifyDeceptionRes.missingEntries.some((e) => e.entryType === 'provider_earning'),
      'Verification correctly flags missing provider_earning notwithstanding extraneous entry'
    );
    // Clean up deception test fixtures
    await Booking.deleteOne({ _id: bDeception._id });
    await LedgerEntry.deleteMany({ booking: bDeception._id });

    // 10.4 Automatic recovery of stale pending settlement by worker
    const bStale = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '40 Stale Settlement St',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'completed',
      status: 'completed',
      commissionRateSnapshot: 20,
      finalFinancials: {
        calculated: true,
        labourPaise: 50000,
        materialsPaise: 0,
        totalCustomerChargePaise: 50000,
        commissionRate: 20,
        commissionPaise: 10000,
        netProviderEarningPaise: 40000,
        settlementStatus: 'pending_settlement',
      },
    });

    // Force updatedAt to 30 seconds ago in MongoDB
    const pastDate = new Date(Date.now() - 30000);
    await Booking.collection.updateOne({ _id: bStale._id }, { $set: { updatedAt: pastDate } });

    const staleRecovery = await reconcilePendingSettlements({ staleThresholdMs: 15000 });
    assert(staleRecovery.processedCount >= 1, 'Worker found stale pending settlement');
    assert(staleRecovery.settledCount >= 1, 'Worker successfully settled stale booking');
    assert(staleRecovery.failedCount === 0, 'Worker recorded 0 failures');

    const bStalePost = await Booking.findById(bStale._id);
    assert(bStalePost.finalFinancials.settlementStatus === 'settled', 'Stale booking transitioned to settled');
    assert(bStalePost.finalFinancials.settlementClaimedAt === null, 'Claim lease released on settlement');
    assert(bStalePost.finalFinancials.settlementClaimToken === null, 'Claim token cleared on settlement');

    const staleEntries = await LedgerEntry.find({ booking: bStale._id });
    assert(staleEntries.length === 3, 'Worker posted all 3 required ledger entries');

    // 10.5 Two concurrent recovery attempts for the same booking
    const bConcurrent = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '50 Concurrency Junction',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'completed',
      status: 'completed',
      commissionRateSnapshot: 20,
      finalFinancials: {
        calculated: true,
        labourPaise: 50000,
        materialsPaise: 0,
        totalCustomerChargePaise: 50000,
        commissionRate: 20,
        commissionPaise: 10000,
        netProviderEarningPaise: 40000,
        settlementStatus: 'pending_settlement',
      },
    });
    await Booking.collection.updateOne({ _id: bConcurrent._id }, { $set: { updatedAt: pastDate } });

    const leaseExpiry = new Date(Date.now() - 15000);
    const claimFilter = {
      _id: bConcurrent._id,
      workflowStatus: 'completed',
      'finalFinancials.settlementStatus': 'pending_settlement',
      $or: [
        { 'finalFinancials.settlementClaimedAt': null, updatedAt: { $lte: pastDate } },
        { 'finalFinancials.settlementClaimedAt': { $lte: leaseExpiry } },
      ],
    };
    const tokenA = new mongoose.Types.ObjectId().toString();
    const tokenB = new mongoose.Types.ObjectId().toString();

    // Simultaneously attempt claim
    const [claimA, claimB] = await Promise.all([
      Booking.findOneAndUpdate(
        claimFilter,
        { $set: { 'finalFinancials.settlementClaimedAt': new Date(), 'finalFinancials.settlementClaimToken': tokenA } },
        { returnDocument: 'after' }
      ),
      Booking.findOneAndUpdate(
        claimFilter,
        { $set: { 'finalFinancials.settlementClaimedAt': new Date(), 'finalFinancials.settlementClaimToken': tokenB } },
        { returnDocument: 'after' }
      ),
    ]);

    const winnerCount = (claimA ? 1 : 0) + (claimB ? 1 : 0);
    assert(winnerCount === 1, 'Exactly one concurrent worker acquisition succeeds via atomic CAS');

    // Clean up concurrent fixture
    await Booking.deleteOne({ _id: bConcurrent._id });

    // 10.6 Retry after simulated failure & expired lease recovery
    const bExpiredLease = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '60 Dead Worker Lease Lane',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'completed',
      status: 'completed',
      commissionRateSnapshot: 20,
      finalFinancials: {
        calculated: true,
        labourPaise: 50000,
        materialsPaise: 0,
        totalCustomerChargePaise: 50000,
        commissionRate: 20,
        commissionPaise: 10000,
        netProviderEarningPaise: 40000,
        settlementStatus: 'pending_settlement',
        settlementClaimedAt: new Date(Date.now() - 30000), // Lease expired 30s ago
        settlementClaimToken: 'dead-worker-claim-token',
      },
    });

    const expiredLeaseRecovery = await reconcilePendingSettlements({ staleThresholdMs: 5000 });
    assert(expiredLeaseRecovery.settledCount >= 1, 'Worker successfully recovers booking with expired lease');

    const bExpiredDb = await Booking.findById(bExpiredLease._id);
    assert(
      bExpiredDb.finalFinancials.settlementStatus === 'settled',
      'Booking with expired lease completed and settled'
    );
    assert(bExpiredDb.finalFinancials.settlementClaimToken === null, 'Claim token cleared');

    // 10.7 Settled and ordinary bookings are not incorrectly modified
    const bOrdinarySettled = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '70 Settled Ave',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'completed',
      status: 'completed',
      commissionRateSnapshot: 20,
      finalFinancials: {
        calculated: true,
        labourPaise: 50000,
        materialsPaise: 0,
        totalCustomerChargePaise: 50000,
        commissionRate: 20,
        commissionPaise: 10000,
        netProviderEarningPaise: 40000,
        settlementStatus: 'settled',
      },
    });

    const bInProgress = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '80 Working Blvd',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'work_in_progress',
      status: 'in_progress',
      commissionRateSnapshot: 20,
    });

    const ordinaryRun = await reconcilePendingSettlements({ staleThresholdMs: 0 });
    assert(ordinaryRun.processedCount === 0, 'Worker ignores ordinary and already settled bookings');

    const bOrdinaryCheck = await Booking.findById(bOrdinarySettled._id);
    assert(bOrdinaryCheck.finalFinancials.settlementStatus === 'settled', 'Settled booking remains settled');

    const bInProgressCheck = await Booking.findById(bInProgress._id);
    assert(bInProgressCheck.status === 'in_progress', 'In-progress booking remains in_progress');

    // ----------------------------------------------------
    // SECTION 11: PHASE 2 FINANCIAL API PRIVACY & LEGACY COMPLETION PROTECTION
    // ----------------------------------------------------
    console.log('\n--- 11. PHASE 2 FINANCIAL API PRIVACY & LEGACY COMPLETION PROTECTION ---');

    // 11.1 Customer responses do not expose internal commission or subsidy fields
    const custViewRes = await request(app)
      .get('/api/bookings/' + bOrdinarySettled._id)
      .set('Authorization', 'Bearer ' + c1Token);
    assert(custViewRes.status === 200, 'Customer retrieves their own booking (200 OK)');
    const custBooking = custViewRes.body.booking;
    assert(custBooking.commissionRateSnapshot === undefined, 'Customer cannot see root commissionRateSnapshot');
    assert(
      custBooking.finalFinancials && custBooking.finalFinancials.commissionRate === undefined,
      'Customer cannot see finalFinancials.commissionRate'
    );
    assert(
      custBooking.finalFinancials && custBooking.finalFinancials.commissionPaise === undefined,
      'Customer cannot see finalFinancials.commissionPaise'
    );
    assert(
      custBooking.finalFinancials && custBooking.finalFinancials.promotionalSubsidyPaise === undefined,
      'Customer cannot see finalFinancials.promotionalSubsidyPaise'
    );
    assert(
      custBooking.finalFinancials && custBooking.finalFinancials.netProviderEarningPaise === undefined,
      'Customer cannot see provider private earnings (finalFinancials.netProviderEarningPaise)'
    );
    assert(
      custBooking.finalFinancials && custBooking.finalFinancials.settlementStatus === undefined,
      'Customer cannot see internal settlementStatus'
    );
    assert(
      custBooking.finalFinancials && custBooking.finalFinancials.totalCustomerChargePaise === 50000,
      'Customer can see their own total charge (totalCustomerChargePaise)'
    );

    // Customer bookings list
    const custListRes = await request(app)
      .get('/api/bookings')
      .set('Authorization', 'Bearer ' + c1Token);
    assert(custListRes.status === 200, 'Customer retrieves their bookings list');
    const allCustBookingsOmitInternal = custListRes.body.bookings.every(
      (b) =>
        b.commissionRateSnapshot === undefined &&
        (!b.finalFinancials ||
          (b.finalFinancials.commissionRate === undefined &&
            b.finalFinancials.commissionPaise === undefined &&
            b.finalFinancials.promotionalSubsidyPaise === undefined &&
            b.finalFinancials.netProviderEarningPaise === undefined))
    );
    assert(allCustBookingsOmitInternal, 'All bookings in customer list omit internal platform/provider financials');

    // 11.2 Provider responses do not expose internal commission or subsidy fields, but retain provider earnings
    const provViewRes = await request(app)
      .get('/api/bookings/' + bOrdinarySettled._id)
      .set('Authorization', 'Bearer ' + p1Token);
    assert(provViewRes.status === 200, 'Provider retrieves their assigned booking (200 OK)');
    const provBooking = provViewRes.body.booking;
    assert(provBooking.commissionRateSnapshot === undefined, 'Provider cannot see root commissionRateSnapshot');
    assert(
      provBooking.finalFinancials && provBooking.finalFinancials.commissionRate === undefined,
      'Provider cannot see finalFinancials.commissionRate'
    );
    assert(
      provBooking.finalFinancials && provBooking.finalFinancials.commissionPaise === undefined,
      'Provider cannot see finalFinancials.commissionPaise'
    );
    assert(
      provBooking.finalFinancials && provBooking.finalFinancials.promotionalSubsidyPaise === undefined,
      'Provider cannot see finalFinancials.promotionalSubsidyPaise'
    );
    assert(
      provBooking.finalFinancials && provBooking.finalFinancials.netProviderEarningPaise === 40000,
      'Provider CAN see their own net earnings (finalFinancials.netProviderEarningPaise = 40000)'
    );

    // Provider bookings list
    const provListRes = await request(app)
      .get('/api/bookings')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(provListRes.status === 200, 'Provider retrieves their assigned bookings list');
    const allProvBookingsOmitInternal = provListRes.body.bookings.every(
      (b) =>
        b.commissionRateSnapshot === undefined &&
        (!b.finalFinancials ||
          (b.finalFinancials.commissionRate === undefined &&
            b.finalFinancials.commissionPaise === undefined &&
            b.finalFinancials.promotionalSubsidyPaise === undefined))
    );
    assert(allProvBookingsOmitInternal, 'All bookings in provider list omit internal commission and subsidy fields');

    // 11.3 Admin responses retain all fields required for governance & administration
    const adminViewRes = await request(app)
      .get('/api/bookings/' + bOrdinarySettled._id)
      .set('Authorization', 'Bearer ' + adminToken);
    assert(adminViewRes.status === 200, 'Admin retrieves booking (200 OK)');
    const adminBooking = adminViewRes.body.booking;
    assert(adminBooking.commissionRateSnapshot === 20, 'Admin can see commissionRateSnapshot (20)');
    assert(
      adminBooking.finalFinancials && adminBooking.finalFinancials.commissionRate === 20,
      'Admin can see finalFinancials.commissionRate'
    );
    assert(
      adminBooking.finalFinancials && adminBooking.finalFinancials.commissionPaise === 10000,
      'Admin can see finalFinancials.commissionPaise (10000)'
    );
    assert(
      adminBooking.finalFinancials && adminBooking.finalFinancials.netProviderEarningPaise === 40000,
      'Admin can see finalFinancials.netProviderEarningPaise (40000)'
    );
    assert(
      adminBooking.finalFinancials && adminBooking.finalFinancials.settlementStatus === 'settled',
      'Admin can see finalFinancials.settlementStatus (settled)'
    );

    // 11.4 Cross-user authorization check (Customer isolation)
    const crossCustRes = await request(app)
      .get('/api/bookings/' + bOrdinarySettled._id)
      .set('Authorization', 'Bearer ' + c2Token);
    assert(crossCustRes.status === 403, 'Unauthorized customer blocked from viewing another customer booking (403)');

    // 11.5 Cross-provider authorization check (Provider isolation)
    const crossProvRes = await request(app)
      .get('/api/bookings/' + bOrdinarySettled._id)
      .set('Authorization', 'Bearer ' + p2Token);
    assert(crossProvRes.status === 403, 'Unauthorized provider blocked from viewing unassigned booking (403)');

    const crossProvEarningsRes = await request(app)
      .get('/api/v2/provider/bookings/' + bOrdinarySettled._id + '/earnings')
      .set('Authorization', 'Bearer ' + p2Token);
    assert(crossProvEarningsRes.status === 403, 'Unauthorized provider blocked from viewing unassigned booking earnings (403)');

    // 11.6 Completion endpoint returns appropriately sanitized booking data
    const bFresh = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '90 Privacy Test St',
      price: 500,
      pricingModel: 'fixed',
      workflowStatus: 'work_in_progress',
      status: 'in_progress',
      commissionRateSnapshot: 20,
    });

    const completionPrivacyRes = await request(app)
      .post('/api/v2/bookings/' + bFresh._id + '/complete')
      .set('Authorization', 'Bearer ' + p1Token);
    assert(completionPrivacyRes.status === 200, 'Completion endpoint returns 200 OK');
    const compBooking = completionPrivacyRes.body.booking;
    assert(compBooking.commissionRateSnapshot === undefined, 'Completion response sanitizes root commissionRateSnapshot');
    assert(
      compBooking.finalFinancials && compBooking.finalFinancials.commissionRate === undefined,
      'Completion response sanitizes commissionRate'
    );
    assert(
      compBooking.finalFinancials && compBooking.finalFinancials.commissionPaise === undefined,
      'Completion response sanitizes commissionPaise'
    );
    assert(
      compBooking.finalFinancials && compBooking.finalFinancials.promotionalSubsidyPaise === undefined,
      'Completion response sanitizes promotionalSubsidyPaise'
    );
    assert(
      compBooking.finalFinancials && compBooking.finalFinancials.netProviderEarningPaise === 40000,
      'Completion response preserves provider earnings for the provider (40000 paise)'
    );

    // 11.7 Legacy status update cannot bypass settlement on dispatch booking
    const fakeJobReqId = new mongoose.Types.ObjectId();
    const bDispatch = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      jobRequest: fakeJobReqId,
      scheduledDate: new Date(),
      address: '95 Dispatch Bypass Test St',
      price: 500,
      pricingModel: 'inspection',
      workflowStatus: 'work_in_progress',
      status: 'in_progress',
      commissionRateSnapshot: 20,
    });

    const dispatchLegacyCompleteRes = await request(app)
      .patch('/api/bookings/' + bDispatch._id + '/status')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({ status: 'completed' });
    assert(
      dispatchLegacyCompleteRes.status === 400,
      'Legacy PATCH completion on dispatch booking rejected with 400 Bad Request'
    );
    assert(
      dispatchLegacyCompleteRes.body.message.includes('POST /api/v2/bookings/:id/complete'),
      'Legacy rejection directs client to workflow completion endpoint'
    );

    // Verify DB was NOT modified and NO ledger entries were created
    const bDispatchCheck = await Booking.findById(bDispatch._id);
    assert(bDispatchCheck.status === 'in_progress', 'Rejected dispatch booking remains in_progress status');
    assert(
      bDispatchCheck.finalFinancials?.settlementStatus !== 'settled',
      'Rejected dispatch booking is NOT marked settled'
    );
    const bDispatchLedgers = await LedgerEntry.find({ booking: bDispatch._id });
    assert(bDispatchLedgers.length === 0, 'Zero ledger entries created for rejected legacy completion');

    // 11.8 Legacy status update on ordinary direct booking triggers safe settlement delegation
    const bDirect = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '99 Direct Settlement St',
      price: 250,
      pricingModel: 'fixed',
      status: 'in_progress',
      commissionRateSnapshot: 20,
    });

    const directLegacyCompleteRes = await request(app)
      .patch('/api/bookings/' + bDirect._id + '/status')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({ status: 'completed' });
    assert(directLegacyCompleteRes.status === 200, 'Legacy PATCH completion on direct booking succeeds via settlement service (200 OK)');

    const bDirectCheck = await Booking.findById(bDirect._id);
    assert(bDirectCheck.status === 'completed', 'Direct booking transitioned to completed');
    assert(bDirectCheck.finalFinancials.settlementStatus === 'settled', 'Direct booking marked settled via shared settlement service');
    assert(bDirectCheck.finalFinancials.totalCustomerChargePaise === 25000, 'Direct booking customer charge is 25000 paise (₹250)');
    assert(bDirectCheck.finalFinancials.netProviderEarningPaise === 20000, 'Direct booking provider earning is 20000 paise (₹200)');

    const bDirectLedgers = await LedgerEntry.find({ booking: bDirect._id });
    assert(bDirectLedgers.length === 3, 'All 3 ledger entries written for direct booking completion');
    const directLabour = bDirectLedgers.find((e) => e.entryType === 'labour_charge');
    const directComm = bDirectLedgers.find((e) => e.entryType === 'platform_commission');
    const directEarn = bDirectLedgers.find((e) => e.entryType === 'provider_earning');
    assert(directLabour && directLabour.amountPaise === 25000, 'Direct labour entry is 25000 paise');
    assert(directComm && directComm.amountPaise === 5000, 'Direct commission entry is 5000 paise (20%)');
    assert(directEarn && directEarn.amountPaise === 20000, 'Direct provider earning entry is 20000 paise');

    // 11.9 Existing permitted non-completion status updates still work
    const bPending = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '101 Non Complete Flow St',
      price: 150,
      pricingModel: 'fixed',
      status: 'pending',
    });

    const acceptRes = await request(app)
      .patch('/api/bookings/' + bPending._id + '/status')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({ status: 'accepted' });
    assert(acceptRes.status === 200 && acceptRes.body.booking.status === 'accepted', 'Provider can accept pending booking');

    const inProgRes = await request(app)
      .patch('/api/bookings/' + bPending._id + '/status')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({ status: 'in_progress' });
    assert(inProgRes.status === 200 && inProgRes.body.booking.status === 'in_progress', 'Provider can move accepted to in_progress');

    // Customer can cancel pending booking
    const bCancel = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '102 Cancellation Flow St',
      price: 150,
      pricingModel: 'fixed',
      status: 'pending',
    });

    const cancelRes = await request(app)
      .patch('/api/bookings/' + bCancel._id + '/status')
      .set('Authorization', 'Bearer ' + c1Token)
      .send({ status: 'cancelled' });
    assert(cancelRes.status === 200 && cancelRes.body.booking.status === 'cancelled', 'Customer can cancel pending booking');

    // 11.10 Client-supplied financial request-body fields are strictly ignored
    const bTamper = await Booking.create({
      customer: customer1._id,
      provider: provider1._id,
      service: (await Service.findOne({ provider: provider1._id }))._id,
      scheduledDate: new Date(),
      address: '103 Tamper Test St',
      price: 100,
      pricingModel: 'fixed',
      status: 'in_progress',
      commissionRateSnapshot: 20,
    });

    const tamperRes = await request(app)
      .patch('/api/bookings/' + bTamper._id + '/status')
      .set('Authorization', 'Bearer ' + p1Token)
      .send({
        status: 'completed',
        commissionRate: 0,
        commissionPaise: 0,
        netProviderEarningPaise: 99999999,
        finalFinancials: { netProviderEarningPaise: 99999999 },
      });
    assert(tamperRes.status === 200, 'Tamper attempt completes with authoritative calculations');

    const bTamperDb = await Booking.findById(bTamper._id);
    assert(
      bTamperDb.finalFinancials.commissionRate === 20,
      'Platform commissionRate strictly preserved at authoritative 20% (NOT 0%)'
    );
    assert(
      bTamperDb.finalFinancials.commissionPaise === 2000,
      'Platform commissionPaise strictly calculated as 2000 paise (NOT 0)'
    );
    assert(
      bTamperDb.finalFinancials.netProviderEarningPaise === 8000,
      'Provider net earnings strictly calculated as 8000 paise (NOT 99999999)'
    );
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
