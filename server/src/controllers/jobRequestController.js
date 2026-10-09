const mongoose = require('mongoose');
const JobRequest = require('../models/JobRequest');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');

const CentralPricing = require('../models/CentralPricing');
const PromotionRedemption = require('../models/PromotionRedemption');
const { getPlatformCommissionPercentage } = require('../config/commission');

const serviceCategories = Service.serviceCategories || (Service.schema && Service.schema.path('category') && Service.schema.path('category').enumValues) || [
  'Electrician', 'Plumber', 'Cleaner', 'Carpenter', 'Painter',
  'Appliance Repair', 'Tutor', 'Mechanic', 'Delivery & Helper', 'AC Service', 'Other'
];

// @desc    Create new category-based job request
// @route   POST /api/v2/job-requests
// @access  Private (customer)
exports.createJobRequest = async (req, res, next) => {
  try {
    const { category, requestType, serviceIdentifier, problemDescription, address, coordinates, idempotencyKey } = req.body;

    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can create requests' });
    }

    if (!category || !serviceCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service category. Must be one of: ' + serviceCategories.join(', '),
      });
    }

    if (!requestType || !['known_price', 'inspection'].includes(requestType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request type. Must be either "known_price" or "inspection"',
      });
    }

    let approvedPricing = null;
    if (requestType === 'known_price') {
      if (!serviceIdentifier || typeof serviceIdentifier !== 'string' || !serviceIdentifier.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Known-price requests require a valid serviceIdentifier. Central pricing is unavailable for unspecified services.',
        });
      }

      const normalizedIdentifier = serviceIdentifier.trim().toLowerCase();
      approvedPricing = await CentralPricing.findOne({
        category,
        serviceIdentifier: normalizedIdentifier,
        isActive: true,
      });

      if (!approvedPricing) {
        return res.status(400).json({
          success: false,
          message: `No approved central pricing exists for ${category} / ${serviceIdentifier}. Known-price requests remain unavailable until an authoritative price source exists.`,
        });
      }
    }

    let isEligibleForFreeInspection = false;
    if (requestType === 'inspection') {
      const existingPromo = await PromotionRedemption.findOne({
        customer: req.user.id,
        promotionId: 'FIRST_FREE_INSPECTION',
        status: { $in: ['reserved', 'redeemed'] },
      });
      if (!existingPromo) {
        isEligibleForFreeInspection = true;
      }
    }

    if (!address || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Service delivery address is required',
      });
    }

    if (
      !coordinates ||
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      typeof coordinates[0] !== 'number' ||
      typeof coordinates[1] !== 'number' ||
      coordinates[0] < -180 ||
      coordinates[0] > 180 ||
      coordinates[1] < -90 ||
      coordinates[1] > 90
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid coordinates [longitude, latitude] are required',
      });
    }

    // Idempotency check
    if (idempotencyKey) {
      const existing = await JobRequest.findOne({ idempotencyKey, customer: req.user.id });
      if (existing) {
        return res.status(200).json({ success: true, message: 'Request already received', jobRequest: existing });
      }
    }

    // Expiry in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const jobRequest = await JobRequest.create({
      customer: req.user.id,
      category,
      requestType,
      serviceIdentifier: serviceIdentifier ? serviceIdentifier.trim().toLowerCase() : '',
      isFreeInspection: isEligibleForFreeInspection,
      problemDescription: problemDescription || '',
      address: address.trim(),
      location: {
        type: 'Point',
        coordinates,
      },
      expiresAt,
      idempotencyKey,
    });

    if (isEligibleForFreeInspection) {
      try {
        await PromotionRedemption.create({
          customer: req.user.id,
          promotionId: 'FIRST_FREE_INSPECTION',
          status: 'reserved',
          jobRequest: jobRequest._id,
        });
      } catch (err) {
        // If race occurred on reservation unique index
        jobRequest.isFreeInspection = false;
        await jobRequest.save();
      }
    }

    res.status(201).json({
      success: true,
      message: 'Job request broadcasted successfully',
      jobRequest,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get customer's own job requests
// @route   GET /api/v2/job-requests/me
// @access  Private (customer)
exports.getCustomerRequests = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const requests = await JobRequest.find({ customer: req.user.id })
      .populate('acceptedBy', 'name phone avatar rating')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: requests.length, requests });
  } catch (err) {
    next(err);
  }
};

// @desc    Get eligible requests for a provider
// @route   GET /api/v2/job-requests/eligible
// @access  Private (service_provider)
exports.getProviderRequests = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const user = await User.findById(req.user.id);
    if (!user.locationCoords || !user.locationCoords.coordinates || user.locationCoords.coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: 'Provider coordinates not configured. Cannot find nearby jobs.' });
    }

    // Find services offered by provider to know eligible categories
    const providerServices = await Service.find({ provider: req.user.id, isActive: true });
    const eligibleCategories = providerServices.map((s) => s.category);

    if (eligibleCategories.length === 0) {
      return res.status(200).json({ success: true, count: 0, requests: [] });
    }

    // Find active requests nearby matching categories
    const radiusInMeters = (user.serviceRadiusKm || 10) * 1000;

    // Do not disclose exact street address before acceptance
    const requests = await JobRequest.find({
      status: 'searching',
      expiresAt: { $gt: new Date() },
      category: { $in: eligibleCategories },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: user.locationCoords.coordinates,
          },
          $maxDistance: radiusInMeters,
        },
      },
    })
      .select('-address')
      .populate('customer', 'name avatar rating');

    res.status(200).json({ success: true, count: requests.length, requests });
  } catch (err) {
    next(err);
  }
};

// @desc    Accept a job request atomically
// @route   POST /api/v2/job-requests/:id/accept
// @access  Private (service_provider)
exports.acceptJobRequest = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only providers can accept requests' });
    }

    const jobRequest = await JobRequest.findById(req.params.id);
    if (!jobRequest) {
      return res.status(404).json({ success: false, message: 'Job request not found' });
    }

    // Check terminal or existing states
    if (jobRequest.status === 'expired') {
      return res.status(409).json({ success: false, message: 'Job request has expired' });
    }

    if (jobRequest.status === 'cancelled') {
      return res.status(409).json({ success: false, message: 'Job request was cancelled by the customer' });
    }

    // Idempotency: Has this provider already accepted this request?
    if (jobRequest.status === 'accepted' && jobRequest.acceptedBy && jobRequest.acceptedBy.toString() === req.user.id) {
      const existingBooking = await Booking.findOne({ jobRequest: jobRequest._id });
      if (existingBooking) {
        if (!jobRequest.bookingId) {
          jobRequest.bookingId = existingBooking._id;
          await jobRequest.save();
        }
        return res.status(200).json({
          success: true,
          message: 'Job already accepted (idempotent retry)',
          jobRequest,
          booking: existingBooking,
        });
      }
    }

    // If accepted by someone else or currently claiming by someone else
    if (jobRequest.status === 'accepted' && jobRequest.acceptedBy?.toString() !== req.user.id) {
      return res.status(409).json({
        success: false,
        message: 'Job request is no longer available or has been accepted by another provider',
      });
    }

    if (
      jobRequest.status === 'claiming' &&
      jobRequest.acceptedBy?.toString() !== req.user.id &&
      jobRequest.claimedAt &&
      Date.now() - new Date(jobRequest.claimedAt).getTime() < 15000
    ) {
      return res.status(409).json({
        success: false,
        message: 'Job request is currently being claimed by another provider',
      });
    }

    // Verify provider eligibility BEFORE attempting to claim
    const service = await Service.findOne({ provider: req.user.id, category: jobRequest.category, isActive: true });
    if (!service) {
      return res.status(403).json({
        success: false,
        message: 'You do not have an active service listing in this category',
      });
    }

    // Check whether the configured MongoDB environment supports transactions
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
        const lockedRequest = await JobRequest.findOneAndUpdate(
          {
            _id: jobRequest._id,
            status: 'searching',
            expiresAt: { $gt: new Date() },
          },
          {
            $set: {
              status: 'accepted',
              acceptedBy: req.user.id,
              claimedAt: null,
            },
          },
          { returnDocument: 'after', session }
        );

        if (!lockedRequest) {
          await session.abortTransaction();
          await session.endSession();

          // Check if this provider already won it in a race
          const cur = await JobRequest.findById(jobRequest._id);
          if (cur && cur.status === 'accepted' && cur.acceptedBy?.toString() === req.user.id) {
            const existingBooking = await Booking.findOne({ jobRequest: cur._id });
            if (existingBooking) {
              return res.status(200).json({
                success: true,
                message: 'Job already accepted (idempotent retry)',
                jobRequest: cur,
                booking: existingBooking,
              });
            }
          }

          return res.status(409).json({
            success: false,
            message: 'Job request is no longer available, has expired, or was claimed by another provider',
          });
        }

        const price = lockedRequest.requestType === 'inspection' ? 99 : service.price;
        const commissionRateSnapshot = getPlatformCommissionPercentage();
        const isFreeInspection = Boolean(lockedRequest.isFreeInspection);
        const pricingModel = lockedRequest.requestType === 'known_price' ? 'fixed' : 'inspection';

        const [booking] = await Booking.create(
          [
            {
              customer: lockedRequest.customer,
              provider: req.user.id,
              service: service._id,
              jobRequest: lockedRequest._id,
              scheduledDate: new Date(),
              address: lockedRequest.address,
              notes: lockedRequest.problemDescription,
              price: price,
              status: 'accepted',
              workflowStatus: 'accepted',
              pricingModel,
              commissionRateSnapshot,
              finalFinancials: {
                isFreeInspection,
                commissionRate: commissionRateSnapshot,
                settlementStatus: 'calculated',
              },
              statusHistory: [
                {
                  status: 'accepted',
                  updatedAt: new Date(),
                  updatedBy: req.user.id,
                  note: 'Job accepted via broadcast',
                },
              ],
            },
          ],
          { session }
        );

        if (isFreeInspection) {
          await PromotionRedemption.updateOne(
            { jobRequest: lockedRequest._id, status: 'reserved' },
            { $set: { booking: booking._id } },
            { session }
          );
        }

        lockedRequest.bookingId = booking._id;
        await lockedRequest.save({ session });

        await session.commitTransaction();
        await session.endSession();

        return res.status(200).json({
          success: true,
          message: 'Job accepted successfully',
          jobRequest: lockedRequest,
          booking,
        });
      } catch (err) {
        if (session) {
          try {
            await session.abortTransaction();
            await session.endSession();
          } catch (_) {}
        }
        throw err;
      }
    } else {
      // Recoverable intermediate state workflow for non-transactional deployments
      const claimedRequest = await JobRequest.findOneAndUpdate(
        {
          _id: jobRequest._id,
          status: 'searching',
          expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            status: 'claiming',
            acceptedBy: req.user.id,
            claimedAt: new Date(),
          },
        },
        { returnDocument: 'after' }
      );

      if (!claimedRequest) {
        const cur = await JobRequest.findById(jobRequest._id);
        if (cur && cur.status === 'accepted' && cur.acceptedBy?.toString() === req.user.id) {
          const existingBooking = await Booking.findOne({ jobRequest: cur._id });
          if (existingBooking) {
            return res.status(200).json({
              success: true,
              message: 'Job already accepted (idempotent retry)',
              jobRequest: cur,
              booking: existingBooking,
            });
          }
        }
        return res.status(409).json({
          success: false,
          message: 'Job request is no longer available, has expired, or was claimed by another provider',
        });
      }

      try {
        const price = claimedRequest.requestType === 'inspection' ? 99 : service.price;
        const commissionRateSnapshot = getPlatformCommissionPercentage();
        const isFreeInspection = Boolean(claimedRequest.isFreeInspection);
        const pricingModel = claimedRequest.requestType === 'known_price' ? 'fixed' : 'inspection';

        const booking = await Booking.create({
          customer: claimedRequest.customer,
          provider: req.user.id,
          service: service._id,
          jobRequest: claimedRequest._id,
          scheduledDate: new Date(),
          address: claimedRequest.address,
          notes: claimedRequest.problemDescription,
          price: price,
          status: 'accepted',
          workflowStatus: 'accepted',
          pricingModel,
          commissionRateSnapshot,
          finalFinancials: {
            isFreeInspection,
            commissionRate: commissionRateSnapshot,
            settlementStatus: 'calculated',
          },
          statusHistory: [
            {
              status: 'accepted',
              updatedAt: new Date(),
              updatedBy: req.user.id,
              note: 'Job accepted via broadcast',
            },
          ],
        });

        if (isFreeInspection) {
          await PromotionRedemption.updateOne(
            { jobRequest: claimedRequest._id, status: 'reserved' },
            { $set: { booking: booking._id } }
          );
        }

        claimedRequest.status = 'accepted';
        claimedRequest.bookingId = booking._id;
        claimedRequest.claimedAt = null;
        await claimedRequest.save();

        return res.status(200).json({
          success: true,
          message: 'Job accepted successfully',
          jobRequest: claimedRequest,
          booking,
        });
      } catch (err) {
        // Safe reconciliation check: Was a booking created despite error?
        const existingBooking = await Booking.findOne({ jobRequest: claimedRequest._id });
        if (existingBooking) {
          claimedRequest.status = 'accepted';
          claimedRequest.bookingId = existingBooking._id;
          claimedRequest.claimedAt = null;
          await claimedRequest.save();
          return res.status(200).json({
            success: true,
            message: 'Job accepted successfully (reconciled)',
            jobRequest: claimedRequest,
            booking: existingBooking,
          });
        }

        // NO booking exists. Only then release back to searching
        await JobRequest.updateOne(
          { _id: claimedRequest._id, status: 'claiming' },
          { $set: { status: 'searching', acceptedBy: null, claimedAt: null } }
        );
        throw err;
      }
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Cancel a job request
// @route   POST /api/v2/job-requests/:id/cancel
// @access  Private (customer)
exports.cancelJobRequest = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can cancel requests' });
    }

    const jobRequest = await JobRequest.findOne({ _id: req.params.id, customer: req.user.id });
    if (!jobRequest) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    // Atomic cancellation to prevent race with acceptance
    const cancelledRequest = await JobRequest.findOneAndUpdate(
      { _id: req.params.id, customer: req.user.id, status: 'searching' },
      { $set: { status: 'cancelled' } },
      { returnDocument: 'after' }
    );

    if (!cancelledRequest) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel request in ' + jobRequest.status + ' state',
      });
    }

    if (cancelledRequest.isFreeInspection) {
      await PromotionRedemption.updateOne(
        { jobRequest: cancelledRequest._id, status: 'reserved' },
        { $set: { status: 'released', releasedAt: new Date() } }
      );
    }

    res.status(200).json({ success: true, message: 'Request cancelled successfully', jobRequest: cancelledRequest });
  } catch (err) {
    next(err);
  }
};
