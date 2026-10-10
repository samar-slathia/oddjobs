const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const JournalTransaction = require('../src/models/JournalTransaction');
const Booking = require('../src/models/Booking');
const { calculateCommissionAndEarnings } = require('../src/config/commission');
const { completeAndSettleBooking, executeSettlementWrites } = require('../src/services/settlementService');

async function runJournalTests() {
  console.log('=====================================================');
  console.log('STARTING PHASE 3.1: ISOLATED JOURNAL TESTS');
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
    const bookingId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const providerId = new mongoose.Types.ObjectId();

    console.log('\n--- 1. JOURNAL MODEL VALIDATION ---');
    
    // Check account mapping
    const validAccounts = JournalTransaction.schema.path('lines').schema.path('accountCode').enumValues;
    assert(validAccounts.includes('1010'), '1010 maps to Payment Clearing / Gateway in schema');
    assert(validAccounts.includes('1020'), '1020 maps to Customer Receivable in schema');

    // Unbalanced journal
    let errUnbalanced = null;
    try {
      const j = new JournalTransaction({
        idempotencyKey: 'test_unbalanced',
        bookingId,
        transactionType: 'completion',
        totalDebitsPaise: 1000,
        totalCreditsPaise: 900,
        lines: [
          { accountCode: '1020', direction: 'debit', amountPaise: 1000 },
          { accountCode: '2010', direction: 'credit', amountPaise: 900 }
        ]
      });
      await j.save();
    } catch (e) {
      errUnbalanced = e;
    }
    assert(errUnbalanced && errUnbalanced.message.includes('Total debits must equal total credits'), 'Reject an unbalanced journal');

    // Invalid account codes
    let errAccount = null;
    try {
      const j = new JournalTransaction({
        idempotencyKey: 'test_account',
        bookingId,
        transactionType: 'completion',
        totalDebitsPaise: 1000,
        totalCreditsPaise: 1000,
        lines: [
          { accountCode: '9999', direction: 'debit', amountPaise: 1000 },
          { accountCode: '2010', direction: 'credit', amountPaise: 1000 }
        ]
      });
      await j.save();
    } catch (e) {
      errAccount = e;
    }
    assert(errAccount && errAccount.message.includes('is not a valid enum value for path `accountCode`'), 'Reject invalid account codes');

    // Invalid monetary amounts (negative)
    let errAmount = null;
    try {
      const j = new JournalTransaction({
        idempotencyKey: 'test_amount',
        bookingId,
        transactionType: 'completion',
        totalDebitsPaise: -1000,
        totalCreditsPaise: -1000,
        lines: [
          { accountCode: '1020', direction: 'debit', amountPaise: -1000 },
          { accountCode: '2010', direction: 'credit', amountPaise: -1000 }
        ]
      });
      await j.save();
    } catch (e) {
      errAmount = e;
    }
    assert(errAmount && errAmount.message.includes('Amount must be greater than zero'), 'Reject invalid monetary amounts');

    console.log('\n--- 2. DOUBLE-ENTRY SCENARIOS ---');

    // Scenario 1: Regular service
    const calc1 = calculateCommissionAndEarnings({
      labourAmountPaise: 100000,
      materialsAmountPaise: 50000,
      commissionRate: 20
    });
    
    assert(calc1.commissionBasePaise === 100000, 'Confirm materials are excluded from the commission base');
    
    const baseBooking = {
      price: 100,
      address: 'Test Address',
      scheduledDate: new Date(),
      service: new mongoose.Types.ObjectId()
    };
    
    const b1 = new Booking({
      ...baseBooking,
      _id: new mongoose.Types.ObjectId(),
      customer: customerId,
      provider: providerId,
      status: 'completed',
      workflowStatus: 'completed'
    });
    await b1.save();
    await completeAndSettleBooking(b1, calc1, false);

    const j1 = await JournalTransaction.findOne({ bookingId: b1._id });
    assert(j1 !== null, 'Journal transaction created for regular service');
    assert(j1.totalDebitsPaise === 150000 && j1.totalCreditsPaise === 150000, 'Scenario 1 balances exactly in paise');
    assert(j1.lines.find(l => l.accountCode === '1020').amountPaise === 150000, 'Debit customer receivable ₹1500 (1020)');
    assert(j1.lines.find(l => l.accountCode === '2010').amountPaise === 80000, 'Credit provider labour payable ₹800');
    assert(j1.lines.find(l => l.accountCode === '2020').amountPaise === 50000, 'Credit provider materials payable ₹500');
    assert(j1.lines.find(l => l.accountCode === '4010').amountPaise === 20000, 'Credit platform commission revenue ₹200');

    // Scenario 2: Free diagnostic inspection
    const calc2 = calculateCommissionAndEarnings({
      labourAmountPaise: 9900,
      materialsAmountPaise: 0,
      commissionRate: 20,
      isFreeInspection: true,
      standardInspectionFeePaise: 9900
    });
    
    assert(calc2.promotionalSubsidyPaise === 9900, 'Confirm the free diagnostic subsidy is capped at ₹99');
    
    const b2 = new Booking({
      ...baseBooking,
      _id: new mongoose.Types.ObjectId(),
      customer: customerId,
      provider: providerId,
      status: 'completed',
      workflowStatus: 'completed'
    });
    await b2.save();

    const PromotionRedemption = require('../src/models/PromotionRedemption');
    const pRedeem = new PromotionRedemption({
      booking: b2._id,
      customer: customerId,
      jobRequest: new mongoose.Types.ObjectId(),
      promotionId: new mongoose.Types.ObjectId(),
      status: 'reserved'
    });
    await pRedeem.save();

    await completeAndSettleBooking(b2, calc2, true);

    const j2 = await JournalTransaction.findOne({ bookingId: b2._id });
    assert(j2 !== null, 'Journal transaction created for free inspection');
    assert(j2.totalDebitsPaise === 9900 && j2.totalCreditsPaise === 9900, 'Scenario 2 balances exactly in paise');
    assert(j2.lines.find(l => l.accountCode === '5010').amountPaise === 9900, 'Debit promotional subsidy expense ₹99');
    assert(j2.lines.find(l => l.accountCode === '2010').amountPaise === 7920, 'Credit provider labour payable ₹79.20');
    assert(j2.lines.find(l => l.accountCode === '4010').amountPaise === 1980, 'Credit platform commission revenue ₹19.80');
    assert(!j2.lines.find(l => l.accountCode === '1020'), 'Customer charge is 0, so no receivable line');

    // Scenario 3: Free inspection followed by approved paid repair
    const calc3 = calculateCommissionAndEarnings({
      labourAmountPaise: 60000,
      materialsAmountPaise: 25000,
      commissionRate: 20,
      isFreeInspection: false, // Subsidy doesn't apply to approved repair
      hasApprovedQuote: true
    });
    
    assert(calc3.promotionalSubsidyPaise === 0, 'Confirm approved repair labour receives no promotional subsidy');

    const b3 = new Booking({
      ...baseBooking,
      _id: new mongoose.Types.ObjectId(),
      customer: customerId,
      provider: providerId,
      status: 'completed',
      workflowStatus: 'completed'
    });
    await b3.save();
    await completeAndSettleBooking(b3, calc3, false);

    const j3 = await JournalTransaction.findOne({ bookingId: b3._id });
    assert(j3 !== null, 'Journal transaction created for approved repair');
    assert(j3.totalDebitsPaise === 85000 && j3.totalCreditsPaise === 85000, 'Scenario 3 balances exactly in paise');
    assert(j3.lines.find(l => l.accountCode === '1020').amountPaise === 85000, 'Debit customer receivable ₹850 (1020)');
    assert(j3.lines.find(l => l.accountCode === '2010').amountPaise === 48000, 'Credit provider labour payable ₹480');
    assert(j3.lines.find(l => l.accountCode === '2020').amountPaise === 25000, 'Credit provider materials payable ₹250');
    assert(j3.lines.find(l => l.accountCode === '4010').amountPaise === 12000, 'Credit platform commission revenue ₹120');
    
    console.log('\n--- 3. CONCURRENCY AND IDEMPOTENCY ---');
    
    await completeAndSettleBooking(b3, calc3, false);
    const j3Count = await JournalTransaction.countDocuments({ bookingId: b3._id });
    assert(j3Count === 1, 'Confirm a repeated settlement creates only one journal transaction');

    let duplicateJournalCaught = false;
    try {
      await JournalTransaction.create(j3.toObject());
    } catch(e) {
      duplicateJournalCaught = e.code === 11000;
    }
    assert(duplicateJournalCaught, 'Confirm concurrent completion or worker retries cannot create duplicate journals');

    console.log('\n--- 4. INCORRECT EXISTING JOURNAL AMOUNT ---');
    // We will test if an existing journal with different amounts causes verification to fail.
    const b4 = new Booking({ 
      ...baseBooking,
      _id: new mongoose.Types.ObjectId(), 
      customer: customerId,
      provider: providerId,
      status: 'completed', 
      workflowStatus: 'completed' 
    });
    await b4.save();
    
    const j4 = new JournalTransaction({
      idempotencyKey: `${b4._id}_completion`,
      bookingId: b4._id,
      transactionType: 'completion',
      totalDebitsPaise: 100,
      totalCreditsPaise: 100,
      lines: [
        { accountCode: '1020', direction: 'debit', amountPaise: 100 },
        { accountCode: '2010', direction: 'credit', amountPaise: 100 }
      ]
    });
    await j4.save();

    let errMismatch = null;
    try {
      await completeAndSettleBooking(b4, calc1, false);
    } catch(e) {
      errMismatch = e;
    }
    assert(errMismatch && errMismatch.message.includes('Journal totals mismatch'), 'Confirm incorrect existing journal amounts are detected rather than silently overwritten');

  } catch (err) {
    console.error('Unhandled error in tests:', err);
    failed++;
  }

  console.log('\n=====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================\n');

  await mongoose.disconnect();
  await mongoServer.stop();
  
  if (failed > 0) process.exit(1);
}

runJournalTests();
