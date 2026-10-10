const JobRequest = require('../models/JobRequest');
const Booking = require('../models/Booking');
const PromotionRedemption = require('../models/PromotionRedemption');
const { reconcilePendingSettlements } = require('../services/settlementService');

const reconcileJobRequests = async () => {
  const now = new Date();
  // 1. Expire unaccepted requests that have passed their expiration timestamp
  const expireResult = await JobRequest.updateMany(
    {
      status: 'searching',
      expiresAt: { $lte: now },
    },
    {
      $set: { status: 'expired' },
    }
  );

  // Release any reserved promotions on expired requests
  const expiredPromoRequests = await JobRequest.find({ status: 'expired', isFreeInspection: true });
  for (const exp of expiredPromoRequests) {
    await PromotionRedemption.updateOne(
      { jobRequest: exp._id, status: 'reserved' },
      { $set: { status: 'released', releasedAt: now } }
    );
  }

  // 2. Reconcile interrupted or orphaned requests (status: 'claiming' or 'accepted' with missing bookingId)
  const pendingRequests = await JobRequest.find({
    $or: [
      { status: 'claiming' },
      { status: 'accepted', bookingId: null },
    ],
  });

  for (const job of pendingRequests) {
    const existingBooking = await Booking.findOne({ jobRequest: job._id });
    if (existingBooking) {
      // Booking already exists in DB! NEVER reopen to searching!
      job.status = 'accepted';
      job.acceptedBy = existingBooking.provider;
      job.bookingId = existingBooking._id;
      job.claimedAt = null;
      await job.save();
    } else {
      // No booking exists. If claim has timed out (> 15 seconds) or process crashed:
      const claimAge = job.claimedAt ? now.getTime() - new Date(job.claimedAt).getTime() : 999999;
      if (job.status === 'claiming' && claimAge > 15000) {
        if (job.expiresAt > now) {
          job.status = 'searching';
          job.acceptedBy = null;
          job.claimedAt = null;
          await job.save();
        } else {
          job.status = 'expired';
          job.claimedAt = null;
          await job.save();
        }
      }
    }
  }

  return { expiredCount: expireResult.modifiedCount, reconciledCount: pendingRequests.length };
};

const startExpiryWorker = () => {
  // Run every 60 seconds
  const timer = setInterval(async () => {
    try {
      await reconcileJobRequests();
    } catch (err) {
      console.error('[Expiry Worker] Error reconciling requests:', err.message);
    }
    try {
      await reconcilePendingSettlements();
    } catch (err) {
      console.error('[Expiry Worker] Error reconciling pending settlements:', err.message);
    }
  }, 60 * 1000);

  // Allow Node process to exit gracefully if this timer is active
  if (timer.unref) {
    timer.unref();
  }

  return timer;
};

module.exports = startExpiryWorker;
module.exports.reconcileJobRequests = reconcileJobRequests;
module.exports.reconcilePendingSettlements = reconcilePendingSettlements;
module.exports.startExpiryWorker = startExpiryWorker;

