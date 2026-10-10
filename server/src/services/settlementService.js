const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const LedgerEntry = require('../models/LedgerEntry');
const PromotionRedemption = require('../models/PromotionRedemption');
const JournalTransaction = require('../models/JournalTransaction');
const { calculateCommissionAndEarnings } = require('../config/commission');

/**
 * Derives expected ledger entries for a booking based on calculation and promotion parameters.
 */
const deriveExpectedLedgerEntries = (booking, calculation, isFreeInspection) => {
  const expected = [
    {
      entryType: 'labour_charge',
      amountPaise: calculation.labourPaise,
      idempotencyKey: `${booking._id}_labour`,
      description: `Labour charge for booking ${booking._id}`,
      metadata: { labourPaise: calculation.labourPaise },
    },
    {
      entryType: 'platform_commission',
      amountPaise: calculation.commissionPaise,
      idempotencyKey: `${booking._id}_commission`,
      description: `Platform commission (${calculation.commissionRate}%) for booking ${booking._id}`,
      metadata: {
        commissionRate: calculation.commissionRate,
        commissionBasePaise: calculation.commissionBasePaise,
      },
    },
    {
      entryType: 'provider_earning',
      amountPaise: calculation.netProviderEarningPaise,
      idempotencyKey: `${booking._id}_earning`,
      description: `Calculated net earnings for booking ${booking._id}`,
      metadata: { netProviderEarningPaise: calculation.netProviderEarningPaise },
    },
  ];

  if (calculation.materialsPaise > 0) {
    expected.push({
      entryType: 'materials_charge',
      amountPaise: calculation.materialsPaise,
      idempotencyKey: `${booking._id}_materials`,
      description: `Materials reimbursement for booking ${booking._id}`,
      metadata: { materialsPaise: calculation.materialsPaise },
    });
  }

  if (isFreeInspection && calculation.promotionalSubsidyPaise > 0) {
    expected.push({
      entryType: 'promotional_subsidy',
      amountPaise: calculation.promotionalSubsidyPaise,
      idempotencyKey: `${booking._id}_promo_subsidy`,
      description: `First free inspection platform subsidy for customer ${booking.customer}`,
      metadata: { waivedAmountPaise: calculation.waivedAmountPaise },
    });
  }

  return expected;
};

/**
 * Derives balanced double-entry journal lines for completion.
 */
const deriveExpectedJournalLines = (booking, calculation, isFreeInspection) => {
  const lines = [];

  if (calculation.customerChargePaise > 0) {
    lines.push({
      accountCode: '1020', // Customer Receivable
      direction: 'debit',
      amountPaise: calculation.customerChargePaise,
      partyId: booking.customer
    });
  }

  if (isFreeInspection && calculation.promotionalSubsidyPaise > 0) {
    lines.push({
      accountCode: '5010', // Promotional Subsidy Expense
      direction: 'debit',
      amountPaise: calculation.promotionalSubsidyPaise
    });
  }

  const providerLabourPaise = calculation.labourPaise - calculation.commissionPaise;
  if (providerLabourPaise > 0) {
    lines.push({
      accountCode: '2010', // Provider Payable (Labour)
      direction: 'credit',
      amountPaise: providerLabourPaise,
      partyId: booking.provider
    });
  }

  if (calculation.materialsPaise > 0) {
    lines.push({
      accountCode: '2020', // Provider Payable (Materials)
      direction: 'credit',
      amountPaise: calculation.materialsPaise,
      partyId: booking.provider
    });
  }

  if (calculation.commissionPaise > 0) {
    lines.push({
      accountCode: '4010', // Platform Commission Revenue
      direction: 'credit',
      amountPaise: calculation.commissionPaise
    });
  }

  return lines.filter(line => line.amountPaise > 0);
};

/**
 * Verifies that each required ledger entry exists for the booking with the exact expected amount,
 * and that any required promotion redemption is properly redeemed.
 */
const verifyBookingSettlement = async (booking, calculation, isFreeInspection) => {
  const expectedEntries = deriveExpectedLedgerEntries(booking, calculation, isFreeInspection);
  const existingEntries = await LedgerEntry.find({ booking: booking._id });

  const missingEntries = [];
  const inconsistentEntries = [];

  for (const exp of expectedEntries) {
    const match = existingEntries.find((e) => e.entryType === exp.entryType);
    if (!match) {
      missingEntries.push(exp);
    } else if (match.amountPaise !== exp.amountPaise) {
      inconsistentEntries.push({
        entryType: exp.entryType,
        expectedAmountPaise: exp.amountPaise,
        actualAmountPaise: match.amountPaise,
        idempotencyKey: match.idempotencyKey,
      });
    }
  }

  let promotionValid = true;
  let promotionError = null;

  if (isFreeInspection) {
    const redemption = await PromotionRedemption.findOne({
      $or: [{ booking: booking._id }, { jobRequest: booking.jobRequest }],
    });
    if (!redemption) {
      promotionValid = false;
      promotionError = 'Missing required PromotionRedemption record for free inspection';
    } else if (redemption.status !== 'redeemed') {
      promotionValid = false;
      promotionError = `PromotionRedemption status is '${redemption.status}', expected 'redeemed'`;
    }
  }

  const expectedJournalLines = deriveExpectedJournalLines(booking, calculation, isFreeInspection);
  const existingJournal = await JournalTransaction.findOne({ idempotencyKey: `${booking._id}_completion` });

  let journalValid = true;
  let journalError = null;
  const missingJournal = !existingJournal;

  if (existingJournal) {
    const totalDebits = expectedJournalLines.filter(l => l.direction === 'debit').reduce((sum, l) => sum + l.amountPaise, 0);
    const totalCredits = expectedJournalLines.filter(l => l.direction === 'credit').reduce((sum, l) => sum + l.amountPaise, 0);

    if (existingJournal.totalDebitsPaise !== totalDebits || existingJournal.totalCreditsPaise !== totalCredits) {
      journalValid = false;
      journalError = `Journal totals mismatch. Expected debits ${totalDebits}, credits ${totalCredits}.`;
    } else {
      for (const exp of expectedJournalLines) {
        const match = existingJournal.lines.find(l => l.accountCode === exp.accountCode && l.direction === exp.direction);
        if (!match || match.amountPaise !== exp.amountPaise) {
          journalValid = false;
          journalError = 'Journal lines mismatch with expected calculations';
          break;
        }
      }
    }
  }

  const isValid = missingEntries.length === 0 && inconsistentEntries.length === 0 && promotionValid && !missingJournal && journalValid;

  return {
    isValid,
    expectedEntries,
    existingEntries,
    missingEntries,
    inconsistentEntries,
    promotionValid,
    promotionError,
    missingJournal,
    journalValid,
    journalError,
  };
};

/**
 * Writes expected ledger entries and updates promotion redemption atomically (or safely with idempotency keys).
 */
const executeSettlementWrites = async (booking, calculation, isFreeInspection, session = null) => {
  const expectedEntries = deriveExpectedLedgerEntries(booking, calculation, isFreeInspection);
  const opts = session ? { session, upsert: true } : { upsert: true };

  for (const entry of expectedEntries) {
    await LedgerEntry.findOneAndUpdate(
      { idempotencyKey: entry.idempotencyKey },
      {
        $setOnInsert: {
          booking: booking._id,
          jobRequest: booking.jobRequest || null,
          provider: booking.provider,
          customer: booking.customer,
          entryType: entry.entryType,
          amountPaise: entry.amountPaise,
          currency: 'INR',
          idempotencyKey: entry.idempotencyKey,
          description: entry.description,
          settlementStatus: 'calculated',
          metadata: entry.metadata,
        },
      },
      opts
    );
  }

  const redemption = await PromotionRedemption.findOne({
    $or: [{ booking: booking._id }, { jobRequest: booking.jobRequest }],
    status: { $in: ['reserved', 'redeemed'] },
  });

  if (redemption) {
    redemption.status = 'redeemed';
    redemption.redeemedAt = redemption.redeemedAt || new Date();
    if (!redemption.booking) {
      redemption.booking = booking._id;
    }
    await redemption.save(session ? { session } : {});
  }

  const expectedJournalLines = deriveExpectedJournalLines(booking, calculation, isFreeInspection);
  const totalDebits = expectedJournalLines.filter(l => l.direction === 'debit').reduce((sum, l) => sum + l.amountPaise, 0);
  const totalCredits = expectedJournalLines.filter(l => l.direction === 'credit').reduce((sum, l) => sum + l.amountPaise, 0);

  if (totalDebits !== totalCredits) {
    throw new Error('Derived journal is unbalanced');
  }

  const idempotencyKey = `${booking._id}_completion`;
  const existingJournal = await JournalTransaction.findOne({ idempotencyKey }, null, session ? { session } : {});

  if (!existingJournal) {
    try {
      const journalData = {
        idempotencyKey,
        bookingId: booking._id,
        transactionType: 'completion',
        currency: 'INR',
        lines: expectedJournalLines,
        totalDebitsPaise: totalDebits,
        totalCreditsPaise: totalCredits,
        status: 'posted'
      };
      
      const newJournal = new JournalTransaction(journalData);
      await newJournal.save(session ? { session } : {});
    } catch (err) {
      if (err.code !== 11000) { // Ignore duplicate key if it was created concurrently
        throw err;
      }
    }
  }
};

/**
 * Completes and settles a booking safely using transactional or durable phased settlement.
 */
const completeAndSettleBooking = async (
  booking,
  calculation,
  isFreeInspection,
  { now = new Date(), updatedBy = null } = {}
) => {
  // 1. Check for financial inconsistency before mutating state
  const initialVerification = await verifyBookingSettlement(booking, calculation, isFreeInspection);

  if (initialVerification.inconsistentEntries.length > 0 || !initialVerification.journalValid) {
    let errorMsg = 'Financial settlement inconsistency detected: ';
    if (initialVerification.inconsistentEntries.length > 0) {
      errorMsg += initialVerification.inconsistentEntries
        .map((e) => `${e.entryType} expected ${e.expectedAmountPaise} paise but found ${e.actualAmountPaise} paise`)
        .join(', ');
    }
    if (!initialVerification.journalValid) {
      errorMsg += ` Journal Error: ${initialVerification.journalError}`;
    }

    const err = new Error(errorMsg);
    err.statusCode = 409;
    err.code = 'FINANCIAL_SETTLEMENT_INCONSISTENCY';
    throw err;
  }

  // 2. Transaction capability check
  const topology = mongoose.connection.client?.topology?.description;
  const canAttemptTransaction = Boolean(
    topology &&
      (topology.type === 'ReplicaSetWithPrimary' || topology.type === 'Sharded' || Boolean(topology.setName))
  );

  if (canAttemptTransaction) {
    let session = null;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      booking.finalFinancials = {
        calculated: true,
        labourPaise: calculation.labourPaise,
        materialsPaise: calculation.materialsPaise,
        extensionsPaise: booking.labourTracking?.approvedExtensionAmountPaise || 0,
        totalCustomerChargePaise: calculation.customerChargePaise,
        commissionRate: calculation.commissionRate,
        commissionPaise: calculation.commissionPaise,
        netProviderEarningPaise: calculation.netProviderEarningPaise,
        isFreeInspection,
        waivedAmountPaise: calculation.waivedAmountPaise,
        promotionalSubsidyPaise: calculation.promotionalSubsidyPaise,
        settlementStatus: 'settled',
        settlementClaimedAt: null,
        settlementClaimToken: null,
      };

      if (booking.workflowStatus !== 'completed') {
        booking.workflowStatus = 'completed';
        booking.status = 'completed';
        booking.statusHistory.push({
          status: 'completed',
          updatedAt: now,
          updatedBy,
          note: `Job completed. Total customer charge: ₹${(calculation.customerChargePaise / 100).toFixed(2)}`,
        });
      }

      await booking.save({ session });
      await executeSettlementWrites(booking, calculation, isFreeInspection, session);

      // Verify entries within session before commit
      const postVerification = await verifyBookingSettlement(booking, calculation, isFreeInspection);
      if (!postVerification.isValid) {
        throw new Error('Post-write settlement verification failed within transaction');
      }

      await session.commitTransaction();
      await session.endSession();
    } catch (txErr) {
      if (session) {
        try {
          await session.abortTransaction();
          await session.endSession();
        } catch (_) {}
      }
      throw txErr;
    }
  } else {
    // Non-transactional durable recovery
    // Phase 1: Record calculated state with settlementStatus: 'pending_settlement'
    booking.finalFinancials = {
      calculated: true,
      labourPaise: calculation.labourPaise,
      materialsPaise: calculation.materialsPaise,
      extensionsPaise: booking.labourTracking?.approvedExtensionAmountPaise || 0,
      totalCustomerChargePaise: calculation.customerChargePaise,
      commissionRate: calculation.commissionRate,
      commissionPaise: calculation.commissionPaise,
      netProviderEarningPaise: calculation.netProviderEarningPaise,
      isFreeInspection,
      waivedAmountPaise: calculation.waivedAmountPaise,
      promotionalSubsidyPaise: calculation.promotionalSubsidyPaise,
      settlementStatus: 'pending_settlement',
      settlementClaimedAt: booking.finalFinancials?.settlementClaimedAt || null,
      settlementClaimToken: booking.finalFinancials?.settlementClaimToken || null,
    };

    if (booking.workflowStatus !== 'completed') {
      booking.workflowStatus = 'completed';
      booking.status = 'completed';
      booking.statusHistory.push({
        status: 'completed',
        updatedAt: now,
        updatedBy,
        note: `Job completed. Total customer charge: ₹${(calculation.customerChargePaise / 100).toFixed(2)}`,
      });
    }

    await booking.save();

    // Phase 2: Write expected ledger entries & update promotion
    await executeSettlementWrites(booking, calculation, isFreeInspection, null);

    // Phase 3: Strict post-write verification before declaring settled
    const postVerification = await verifyBookingSettlement(booking, calculation, isFreeInspection);
    if (!postVerification.isValid) {
      if (postVerification.inconsistentEntries.length > 0) {
        const err = new Error('Settlement verification failed: Ledger entry amount mismatch');
        err.statusCode = 409;
        throw err;
      }
      if (!postVerification.promotionValid) {
        const err = new Error(`Settlement verification failed: ${postVerification.promotionError}`);
        err.statusCode = 500;
        throw err;
      }
      if (postVerification.missingJournal || !postVerification.journalValid) {
        const err = new Error(`Settlement verification failed: Journal missing or invalid. Error: ${postVerification.journalError || 'Missing'}`);
        err.statusCode = 500;
        throw err;
      }
      const err = new Error(
        `Settlement verification failed: Required entries missing: ${postVerification.missingEntries
          .map((e) => e.entryType)
          .join(', ')}`
      );
      err.statusCode = 500;
      throw err;
    }

    // Phase 4: Mark settled and release claim lease
    booking.finalFinancials.settlementStatus = 'settled';
    booking.finalFinancials.settlementClaimedAt = null;
    booking.finalFinancials.settlementClaimToken = null;
    await booking.save();
  }

  return booking;
};

/**
 * Reconciles abandoned or stalled pending settlements in the background.
 * Uses atomic CAS leases to guarantee mutually exclusive worker runs.
 */
const reconcilePendingSettlements = async ({ staleThresholdMs = 15000, maxBatch = 10 } = {}) => {
  const staleThreshold = new Date(Date.now() - staleThresholdMs);
  const leaseExpiry = new Date(Date.now() - 15000); // 15-second claim lease

  const candidates = await Booking.find({
    workflowStatus: 'completed',
    'finalFinancials.settlementStatus': 'pending_settlement',
    $or: [
      {
        'finalFinancials.settlementClaimedAt': null,
        updatedAt: { $lte: staleThreshold },
      },
      {
        'finalFinancials.settlementClaimedAt': { $lte: leaseExpiry },
      },
    ],
  }).limit(maxBatch);

  let processedCount = 0;
  let settledCount = 0;
  let failedCount = 0;

  for (const candidate of candidates) {
    const claimToken = new mongoose.Types.ObjectId().toString();

    // Atomic claim lease via CAS
    const claimedBooking = await Booking.findOneAndUpdate(
      {
        _id: candidate._id,
        workflowStatus: 'completed',
        'finalFinancials.settlementStatus': 'pending_settlement',
        $or: [
          {
            'finalFinancials.settlementClaimedAt': null,
            updatedAt: { $lte: staleThreshold },
          },
          {
            'finalFinancials.settlementClaimedAt': { $lte: leaseExpiry },
          },
        ],
      },
      {
        $set: {
          'finalFinancials.settlementClaimedAt': new Date(),
          'finalFinancials.settlementClaimToken': claimToken,
        },
      },
      { returnDocument: 'after' }
    );

    if (!claimedBooking) {
      continue;
    }

    processedCount++;

    try {
      // Reconstruct expected financial inputs from authoritative persisted database state
      let labourAmountPaise = 0;
      let materialsAmountPaise = 0;
      let hasApprovedQuote = false;
      let isFreeInspection = Boolean(claimedBooking.finalFinancials?.isFreeInspection);

      const redemption = await PromotionRedemption.findOne({
        $or: [{ booking: claimedBooking._id }, { jobRequest: claimedBooking.jobRequest }],
        status: { $in: ['reserved', 'redeemed'] },
      });

      if (claimedBooking.finalFinancials?.calculated) {
        if (Boolean(claimedBooking.finalFinancials.isFreeInspection) !== Boolean(redemption)) {
          const promoErr = new Error(
            `Promotion eligibility mismatch: booking has isFreeInspection=${claimedBooking.finalFinancials.isFreeInspection} but redemption status does not match`
          );
          promoErr.statusCode = 409;
          throw promoErr;
        }
      } else if (redemption) {
        isFreeInspection = true;
      }

      if (claimedBooking.pricingModel === 'inspection') {
        const approvedQuote = claimedBooking.quotes?.find(
          (q) => q.quoteVersion === claimedBooking.activeQuoteVersion && q.status === 'approved'
        );
        if (approvedQuote) {
          hasApprovedQuote = true;
          labourAmountPaise = approvedQuote.labourAmountPaise;
          materialsAmountPaise = approvedQuote.materialsTotalPaise + (approvedQuote.otherChargesPaise || 0);
        } else {
          labourAmountPaise = isFreeInspection ? 9900 : Math.round((claimedBooking.price || 99) * 100);
        }
      } else if (claimedBooking.pricingModel === 'hourly' || claimedBooking.pricingModel === 'full_day') {
        const hourlyRatePaise = claimedBooking.labourTracking?.hourlyRatePaise || 50000;
        const billableHours = Math.max(
          1,
          Math.ceil((claimedBooking.labourTracking?.billableDurationMinutes || 60) / 60)
        );
        const workerCount = claimedBooking.labourTracking?.workerCount || 1;
        const baseLabourPaise = billableHours * hourlyRatePaise * workerCount;
        const approvedExtPaise = claimedBooking.labourTracking?.approvedExtensionAmountPaise || 0;
        labourAmountPaise = baseLabourPaise + approvedExtPaise;
      } else {
        labourAmountPaise = Math.round((claimedBooking.price || 500) * 100);
      }

      const calculation = calculateCommissionAndEarnings({
        labourAmountPaise,
        materialsAmountPaise,
        commissionRate: claimedBooking.commissionRateSnapshot,
        isFreeInspection,
        hasApprovedQuote,
        standardInspectionFeePaise: 9900,
      });

      // Guard requirement 7: Do not automatically change customer charge or provider earnings
      if (
        claimedBooking.finalFinancials?.calculated &&
        (claimedBooking.finalFinancials.totalCustomerChargePaise !== calculation.customerChargePaise ||
          claimedBooking.finalFinancials.netProviderEarningPaise !== calculation.netProviderEarningPaise)
      ) {
        const mismatchErr = new Error(
          `Financial invariant violation: persisted customer charge or provider earning (${claimedBooking.finalFinancials.totalCustomerChargePaise}/${claimedBooking.finalFinancials.netProviderEarningPaise}) does not match authoritative calculation (${calculation.customerChargePaise}/${calculation.netProviderEarningPaise})`
        );
        mismatchErr.statusCode = 409;
        throw mismatchErr;
      }

      await completeAndSettleBooking(claimedBooking, calculation, isFreeInspection, {
        now: new Date(),
        updatedBy: claimedBooking.provider,
      });

      settledCount++;
    } catch (err) {
      failedCount++;
      console.error(`[Settlement Worker] Recoverable settlement failure on booking ${claimedBooking._id}:`, err.message);
      // Release claim lease on failure
      await Booking.updateOne(
        { _id: claimedBooking._id, 'finalFinancials.settlementClaimToken': claimToken },
        { $set: { 'finalFinancials.settlementClaimedAt': null, 'finalFinancials.settlementClaimToken': null } }
      );
    }
  }

  return { processedCount, settledCount, failedCount };
};

module.exports = {
  deriveExpectedLedgerEntries,
  verifyBookingSettlement,
  executeSettlementWrites,
  completeAndSettleBooking,
  reconcilePendingSettlements,
};
