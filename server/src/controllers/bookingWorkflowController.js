const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const JobRequest = require('../models/JobRequest');
const Service = require('../models/Service');
const User = require('../models/User');
const Notification = require('../models/Notification');
const LedgerEntry = require('../models/LedgerEntry');
const PromotionRedemption = require('../models/PromotionRedemption');
const { calculateCommissionAndEarnings } = require('../config/commission');

/**
 * Rounds duration in minutes up to the nearest 15-minute increment.
 * (e.g. 50 mins -> 60 mins; 67 mins -> 75 mins).
 */
const roundToNearest15Minutes = (actualMinutes) => {
  if (!actualMinutes || actualMinutes <= 0) return 0;
  return Math.ceil(actualMinutes / 15) * 15;
};

// @desc    Provider marks arrival at customer location
// @route   POST /api/v2/bookings/:id/arrive
// @access  Private (service_provider)
exports.markArrival = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only service providers can mark arrival' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }

    if (booking.workflowStatus !== 'accepted') {
      return res.status(400).json({
        success: false,
        message: `Cannot mark arrival for booking in '${booking.workflowStatus}' status. Must be 'accepted'.`,
      });
    }

    booking.arrivedAt = new Date();
    booking.workflowStatus = 'arrived';
    booking.statusHistory.push({
      status: booking.status,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      note: 'Provider arrived at service location',
    });

    await booking.save();

    await Notification.create({
      user: booking.customer,
      title: 'Provider Arrived',
      message: `${req.user.name} has arrived at your location.`,
      type: 'status_change',
      link: '/customer/bookings',
    });

    res.status(200).json({
      success: true,
      message: 'Arrival marked successfully',
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider starts inspection/diagnosis
// @route   POST /api/v2/bookings/:id/start-inspection
// @access  Private (service_provider)
exports.startInspection = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only service providers can start inspection' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }

    if (booking.workflowStatus !== 'arrived') {
      return res.status(400).json({
        success: false,
        message: `Cannot start inspection in '${booking.workflowStatus}' status. Must mark arrival first.`,
      });
    }

    booking.inspectionStartedAt = new Date();
    booking.workflowStatus = 'inspecting';
    booking.statusHistory.push({
      status: booking.status,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      note: 'Inspection started',
    });

    await booking.save();

    await Notification.create({
      user: booking.customer,
      title: 'Inspection Started',
      message: `${req.user.name} has started inspecting your service request.`,
      type: 'status_change',
      link: '/customer/bookings',
    });

    res.status(200).json({
      success: true,
      message: 'Inspection started',
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider submits or updates repair quote
// @route   POST /api/v2/bookings/:id/quote
// @access  Private (service_provider)
exports.submitQuote = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only service providers can submit quotes' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }

    const allowedStatuses = ['arrived', 'inspecting', 'quote_pending', 'quote_rejected', 'quote_approved'];
    if (!allowedStatuses.includes(booking.workflowStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot submit quote in '${booking.workflowStatus}' status.`,
      });
    }

    const { description, labourAmountPaise, materials = [], otherChargesPaise = 0 } = req.body;

    if (!Number.isInteger(labourAmountPaise) || labourAmountPaise < 0) {
      return res.status(400).json({
        success: false,
        message: 'labourAmountPaise must be a non-negative integer representing paise',
      });
    }

    if (!Number.isInteger(otherChargesPaise) || otherChargesPaise < 0) {
      return res.status(400).json({
        success: false,
        message: 'otherChargesPaise must be a non-negative integer representing paise',
      });
    }

    if (!Array.isArray(materials)) {
      return res.status(400).json({ success: false, message: 'materials must be an array' });
    }

    let calculatedMaterialsTotalPaise = 0;
    const validatedMaterials = [];

    for (let i = 0; i < materials.length; i++) {
      const mat = materials[i];
      if (!mat.item || typeof mat.item !== 'string' || !mat.item.trim()) {
        return res.status(400).json({ success: false, message: `Material item at index ${i} requires a non-empty name` });
      }
      if (!Number.isInteger(mat.quantity) || mat.quantity < 1) {
        return res.status(400).json({ success: false, message: `Material item '${mat.item}' quantity must be an integer >= 1` });
      }
      if (!Number.isInteger(mat.unitPricePaise) || mat.unitPricePaise < 0) {
        return res.status(400).json({ success: false, message: `Material item '${mat.item}' unitPricePaise must be an integer >= 0` });
      }

      const totalPaise = mat.quantity * mat.unitPricePaise;
      calculatedMaterialsTotalPaise += totalPaise;

      validatedMaterials.push({
        item: mat.item.trim(),
        quantity: mat.quantity,
        unitPricePaise: mat.unitPricePaise,
        totalPaise,
      });
    }

    // Backend calculates total; never trust client math!
    const calculatedTotalAmountPaise = labourAmountPaise + calculatedMaterialsTotalPaise + otherChargesPaise;

    // Invalidate earlier active quotes: mark as 'superseded'
    if (booking.quotes && booking.quotes.length > 0) {
      booking.quotes.forEach((q) => {
        if (q.status === 'pending' || q.status === 'approved') {
          q.status = 'superseded';
        }
      });
    }

    const nextVersion = (booking.quotes ? booking.quotes.length : 0) + 1;

    const newQuote = {
      quoteVersion: nextVersion,
      description: (description || '').trim(),
      labourAmountPaise,
      materials: validatedMaterials,
      materialsTotalPaise: calculatedMaterialsTotalPaise,
      otherChargesPaise,
      totalAmountPaise: calculatedTotalAmountPaise,
      status: 'pending',
      submittedAt: new Date(),
    };

    booking.quotes.push(newQuote);
    booking.quoteApproved = false; // A new/revised quote resets approval!
    booking.activeQuoteVersion = nextVersion;
    booking.workflowStatus = 'quote_pending';

    booking.statusHistory.push({
      status: booking.status,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      note: `Submitted Quote v${nextVersion} total: ₹${(calculatedTotalAmountPaise / 100).toFixed(2)}`,
    });

    await booking.save();

    await Notification.create({
      user: booking.customer,
      title: `New Repair Quote (v${nextVersion})`,
      message: `${req.user.name} submitted a repair quote for ₹${(calculatedTotalAmountPaise / 100).toFixed(2)}. Please review and approve.`,
      type: 'quote',
      link: '/customer/bookings',
    });

    res.status(200).json({
      success: true,
      message: `Quote v${nextVersion} submitted successfully`,
      quote: newQuote,
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Customer views quotes for a booking
// @route   GET /api/v2/bookings/:id/quotes
// @access  Private (customer, provider, admin)
exports.getQuotes = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const isCustomer = booking.customer.toString() === req.user.id;
    const isProvider = booking.provider.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to view quotes for this booking' });
    }

    const activeQuote = booking.quotes?.find((q) => q.quoteVersion === booking.activeQuoteVersion);

    res.status(200).json({
      success: true,
      activeQuoteVersion: booking.activeQuoteVersion,
      quoteApproved: booking.quoteApproved,
      activeQuote: activeQuote || null,
      quotes: booking.quotes || [],
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Customer approves exact quote version and total
// @route   POST /api/v2/bookings/:id/quote/approve
// @access  Private (customer)
exports.approveQuote = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.customer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the customer who requested the service can approve quotes' });
    }

    if (booking.workflowStatus !== 'quote_pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve quote in '${booking.workflowStatus}' status. Must be 'quote_pending'.`,
      });
    }

    const { quoteVersion, totalAmountPaise } = req.body;

    if (!quoteVersion || !Number.isInteger(quoteVersion)) {
      return res.status(400).json({ success: false, message: 'Valid quoteVersion is required' });
    }

    const targetQuote = booking.quotes?.find((q) => q.quoteVersion === quoteVersion);
    if (!targetQuote) {
      return res.status(404).json({ success: false, message: `Quote version ${quoteVersion} not found` });
    }

    if (targetQuote.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Quote v${quoteVersion} is already '${targetQuote.status}' and cannot be approved.`,
      });
    }

    // Verify exact total amount binding
    if (totalAmountPaise !== undefined && totalAmountPaise !== targetQuote.totalAmountPaise) {
      return res.status(400).json({
        success: false,
        message: `Total amount mismatch: expected ₹${(targetQuote.totalAmountPaise / 100).toFixed(2)}, but client submitted ₹${(totalAmountPaise / 100).toFixed(2)}.`,
      });
    }

    targetQuote.status = 'approved';
    targetQuote.decidedAt = new Date();
    booking.quoteApproved = true;
    booking.activeQuoteVersion = targetQuote.quoteVersion;
    booking.workflowStatus = 'quote_approved';
    // Update legacy price field for backward-compatible dashboard display (in whole INR)
    booking.price = Math.round(targetQuote.totalAmountPaise / 100);

    booking.statusHistory.push({
      status: booking.status,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      note: `Customer approved Quote v${targetQuote.quoteVersion} (₹${(targetQuote.totalAmountPaise / 100).toFixed(2)})`,
    });

    await booking.save();

    await Notification.create({
      user: booking.provider,
      title: 'Quote Approved',
      message: `Customer approved Quote v${targetQuote.quoteVersion} for ₹${(targetQuote.totalAmountPaise / 100).toFixed(2)}. You may now begin work.`,
      type: 'approval',
      link: '/provider/requests',
    });

    res.status(200).json({
      success: true,
      message: `Quote v${targetQuote.quoteVersion} approved successfully`,
      approvedQuote: targetQuote,
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Customer rejects quote
// @route   POST /api/v2/bookings/:id/quote/reject
// @access  Private (customer)
exports.rejectQuote = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.customer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the customer can reject quotes' });
    }

    const { quoteVersion, reason } = req.body;

    const targetQuote = booking.quotes?.find(
      (q) => q.quoteVersion === (quoteVersion || booking.activeQuoteVersion)
    );

    if (!targetQuote) {
      return res.status(404).json({ success: false, message: 'Quote not found' });
    }

    if (targetQuote.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Quote v${targetQuote.quoteVersion} is already '${targetQuote.status}'.`,
      });
    }

    targetQuote.status = 'rejected';
    targetQuote.decidedAt = new Date();
    targetQuote.customerDecisionNote = (reason || 'Rejected by customer').trim();
    booking.quoteApproved = false;
    booking.workflowStatus = 'quote_rejected';

    booking.statusHistory.push({
      status: booking.status,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      note: `Customer rejected Quote v${targetQuote.quoteVersion}: ${targetQuote.customerDecisionNote}`,
    });

    await booking.save();

    await Notification.create({
      user: booking.provider,
      title: 'Quote Rejected',
      message: `Customer declined Quote v${targetQuote.quoteVersion}. Additional paid work is not approved.`,
      type: 'quote',
      link: '/provider/requests',
    });

    res.status(200).json({
      success: true,
      message: `Quote v${targetQuote.quoteVersion} rejected`,
      rejectedQuote: targetQuote,
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider starts work
// @route   POST /api/v2/bookings/:id/start-work
// @access  Private (service_provider)
exports.startWork = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only service providers can start work' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }

    // Critical authorization check: Provider CANNOT start paid work before quote approval!
    if (booking.pricingModel === 'inspection' && !booking.quoteApproved) {
      return res.status(400).json({
        success: false,
        message: 'Cannot start work: Customer has not approved a quote for this inspection request.',
      });
    }

    if (booking.workflowStatus === 'quote_rejected') {
      return res.status(400).json({
        success: false,
        message: 'Cannot start work: The proposed quote was rejected by the customer.',
      });
    }

    booking.labourTracking = booking.labourTracking || {};
    booking.labourTracking.workStartedAt = new Date();
    booking.workflowStatus = 'work_in_progress';
    booking.status = 'in_progress'; // Sync legacy status

    booking.statusHistory.push({
      status: 'in_progress',
      updatedAt: new Date(),
      updatedBy: req.user.id,
      note: 'Work started by provider',
    });

    await booking.save();

    await Notification.create({
      user: booking.customer,
      title: 'Work In Progress',
      message: `${req.user.name} has started work on your service request.`,
      type: 'status_change',
      link: '/customer/bookings',
    });

    res.status(200).json({
      success: true,
      message: 'Work started successfully',
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider requests duration/labour extension
// @route   POST /api/v2/bookings/:id/extension-request
// @access  Private (service_provider)
exports.requestExtension = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only service providers can request extensions' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }

    if (booking.workflowStatus !== 'work_in_progress') {
      return res.status(400).json({
        success: false,
        message: `Cannot request extension in '${booking.workflowStatus}' status. Must be 'work_in_progress'.`,
      });
    }

    const { additionalMinutes, additionalAmountPaise, reason } = req.body;

    if (!Number.isInteger(additionalMinutes) || additionalMinutes < 1) {
      return res.status(400).json({ success: false, message: 'additionalMinutes must be an integer >= 1' });
    }

    if (!Number.isInteger(additionalAmountPaise) || additionalAmountPaise < 0) {
      return res.status(400).json({ success: false, message: 'additionalAmountPaise must be an integer >= 0' });
    }

    booking.labourTracking = booking.labourTracking || {};
    booking.labourTracking.extensions = booking.labourTracking.extensions || [];

    const nextExtVersion = booking.labourTracking.extensions.length + 1;

    const extension = {
      extensionVersion: nextExtVersion,
      additionalMinutes,
      additionalAmountPaise,
      reason: (reason || '').trim(),
      status: 'pending',
      requestedAt: new Date(),
    };

    booking.labourTracking.extensions.push(extension);
    await booking.save();

    await Notification.create({
      user: booking.customer,
      title: 'Work Extension Requested',
      message: `${req.user.name} requested an extension of ${additionalMinutes} mins (+₹${(additionalAmountPaise / 100).toFixed(2)}). Please approve or decline.`,
      type: 'extension',
      link: '/customer/bookings',
    });

    res.status(200).json({
      success: true,
      message: `Extension v${nextExtVersion} requested`,
      extension,
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Customer approves or rejects extension
// @route   POST /api/v2/bookings/:id/extension-decide
// @access  Private (customer)
exports.decideExtension = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.customer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only the customer can approve or decline extensions' });
    }

    const { extensionVersion, approved } = req.body;

    const targetExt = booking.labourTracking?.extensions?.find((e) => e.extensionVersion === extensionVersion);
    if (!targetExt) {
      return res.status(404).json({ success: false, message: `Extension version ${extensionVersion} not found` });
    }

    if (targetExt.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Extension v${extensionVersion} is already '${targetExt.status}'`,
      });
    }

    targetExt.status = approved ? 'approved' : 'rejected';
    targetExt.decidedAt = new Date();

    if (approved) {
      booking.labourTracking.approvedExtensionMinutes =
        (booking.labourTracking.approvedExtensionMinutes || 0) + targetExt.additionalMinutes;
      booking.labourTracking.approvedExtensionAmountPaise =
        (booking.labourTracking.approvedExtensionAmountPaise || 0) + targetExt.additionalAmountPaise;
    }

    await booking.save();

    await Notification.create({
      user: booking.provider,
      title: approved ? 'Extension Approved' : 'Extension Declined',
      message: `Customer has ${approved ? 'approved' : 'declined'} extension v${extensionVersion}.`,
      type: 'approval',
      link: '/provider/requests',
    });

    res.status(200).json({
      success: true,
      message: `Extension ${approved ? 'approved' : 'rejected'}`,
      extension: targetExt,
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider finishes work, calculates final financials, and posts ledger entries
// @route   POST /api/v2/bookings/:id/complete
// @access  Private (service_provider, admin)
exports.stopWorkAndComplete = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const isProvider = booking.provider.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    if (!isProvider && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to complete this booking' });
    }

    const validCompleteStatuses = ['work_in_progress', 'quote_approved', 'arrived', 'inspecting'];
    if (!validCompleteStatuses.includes(booking.workflowStatus) && booking.workflowStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: `Cannot complete booking in '${booking.workflowStatus}' status.`,
      });
    }

    // Idempotency check: If already completed and ledger created, return existing result
    if (booking.finalFinancials && booking.finalFinancials.calculated) {
      return res.status(200).json({
        success: true,
        message: 'Booking already completed (idempotent)',
        booking,
      });
    }

    const now = new Date();
    booking.labourTracking = booking.labourTracking || {};
    booking.labourTracking.workStoppedAt = now;

    // Calculate duration for hourly labour if work was started
    let actualWorkedMinutes = 0;
    if (booking.labourTracking.workStartedAt) {
      actualWorkedMinutes = Math.round((now.getTime() - new Date(booking.labourTracking.workStartedAt).getTime()) / 60000);
    }
    booking.labourTracking.totalWorkedMinutes = actualWorkedMinutes;

    // Billable duration uses documented rounding up to 15 minutes
    const roundedMinutes = roundToNearest15Minutes(actualWorkedMinutes);
    booking.labourTracking.billableDurationMinutes = roundedMinutes;

    // Determine Labour and Materials components
    let labourAmountPaise = 0;
    let materialsAmountPaise = 0;
    let isFreeInspection = false;

    // Check if free inspection promotion applies
    const redemption = await PromotionRedemption.findOne({
      booking: booking._id,
      status: { $in: ['reserved', 'redeemed'] },
    });

    if (redemption) {
      isFreeInspection = true;
    }

    if (booking.pricingModel === 'inspection') {
      const approvedQuote = booking.quotes?.find(
        (q) => q.quoteVersion === booking.activeQuoteVersion && q.status === 'approved'
      );

      if (approvedQuote) {
        // Quoted repair work was approved!
        labourAmountPaise = approvedQuote.labourAmountPaise;
        materialsAmountPaise = approvedQuote.materialsTotalPaise + (approvedQuote.otherChargesPaise || 0);
      } else {
        // Diagnosis only (inspection fee)
        labourAmountPaise = isFreeInspection ? 9900 : Math.round((booking.price || 99) * 100);
      }
    } else if (booking.pricingModel === 'hourly' || booking.pricingModel === 'full_day') {
      const hourlyRatePaise = booking.labourTracking.hourlyRatePaise || 50000; // e.g. ₹500/hr
      const billableHours = Math.max(1, Math.ceil(roundedMinutes / 60));
      const workerCount = booking.labourTracking.workerCount || 1;
      const baseLabourPaise = billableHours * hourlyRatePaise * workerCount;
      const approvedExtPaise = booking.labourTracking.approvedExtensionAmountPaise || 0;
      labourAmountPaise = baseLabourPaise + approvedExtPaise;
    } else {
      // Fixed pricing
      labourAmountPaise = Math.round((booking.price || 500) * 100);
    }

    // Commission arithmetic (integer paise, materials excluded!)
    const calculation = calculateCommissionAndEarnings({
      labourAmountPaise,
      materialsAmountPaise,
      commissionRate: booking.commissionRateSnapshot,
      isFreeInspection,
      standardInspectionFeePaise: 9900,
    });

    // Save final financial snapshot on booking
    booking.finalFinancials = {
      calculated: true,
      labourPaise: calculation.labourPaise,
      materialsPaise: calculation.materialsPaise,
      extensionsPaise: booking.labourTracking.approvedExtensionAmountPaise || 0,
      totalCustomerChargePaise: calculation.customerChargePaise,
      commissionRate: calculation.commissionRate,
      commissionPaise: calculation.commissionPaise,
      netProviderEarningPaise: calculation.netProviderEarningPaise,
      isFreeInspection,
      waivedAmountPaise: calculation.waivedAmountPaise,
      promotionalSubsidyPaise: calculation.promotionalSubsidyPaise,
      settlementStatus: 'calculated',
    };

    booking.workflowStatus = 'completed';
    booking.status = 'completed'; // Sync legacy status

    booking.statusHistory.push({
      status: 'completed',
      updatedAt: now,
      updatedBy: req.user.id,
      note: `Job completed. Total customer charge: ₹${(calculation.customerChargePaise / 100).toFixed(2)}`,
    });

    await booking.save();

    // Redeem free inspection promotion atomically
    if (redemption) {
      redemption.status = 'redeemed';
      redemption.redeemedAt = now;
      await redemption.save();
    }

    // Create append-only ledger entries with unique idempotency keys
    const idempotencyBase = `${booking._id}_comp_${Date.now()}`;

    // 1. Labour Charge
    await LedgerEntry.findOneAndUpdate(
      { idempotencyKey: `${booking._id}_labour` },
      {
        $setOnInsert: {
          booking: booking._id,
          jobRequest: booking.jobRequest || null,
          provider: booking.provider,
          customer: booking.customer,
          entryType: 'labour_charge',
          amountPaise: calculation.labourPaise,
          currency: 'INR',
          idempotencyKey: `${booking._id}_labour`,
          description: `Labour charge for booking ${booking._id}`,
          settlementStatus: 'calculated',
          metadata: { labourPaise: calculation.labourPaise },
        },
      },
      { upsert: true }
    );

    // 2. Materials Charge (if materials exist)
    if (calculation.materialsPaise > 0) {
      await LedgerEntry.findOneAndUpdate(
        { idempotencyKey: `${booking._id}_materials` },
        {
          $setOnInsert: {
            booking: booking._id,
            jobRequest: booking.jobRequest || null,
            provider: booking.provider,
            customer: booking.customer,
            entryType: 'materials_charge',
            amountPaise: calculation.materialsPaise,
            currency: 'INR',
            idempotencyKey: `${booking._id}_materials`,
            description: `Materials reimbursement for booking ${booking._id}`,
            settlementStatus: 'calculated',
            metadata: { materialsPaise: calculation.materialsPaise },
          },
        },
        { upsert: true }
      );
    }

    // 3. Platform Commission
    await LedgerEntry.findOneAndUpdate(
      { idempotencyKey: `${booking._id}_commission` },
      {
        $setOnInsert: {
          booking: booking._id,
          jobRequest: booking.jobRequest || null,
          provider: booking.provider,
          customer: booking.customer,
          entryType: 'platform_commission',
          amountPaise: calculation.commissionPaise,
          currency: 'INR',
          idempotencyKey: `${booking._id}_commission`,
          description: `Platform commission (${calculation.commissionRate}%) for booking ${booking._id}`,
          settlementStatus: 'calculated',
          metadata: {
            commissionRate: calculation.commissionRate,
            commissionBasePaise: calculation.commissionBasePaise,
          },
        },
      },
      { upsert: true }
    );

    // 4. Provider Net Earning
    await LedgerEntry.findOneAndUpdate(
      { idempotencyKey: `${booking._id}_earning` },
      {
        $setOnInsert: {
          booking: booking._id,
          jobRequest: booking.jobRequest || null,
          provider: booking.provider,
          customer: booking.customer,
          entryType: 'provider_earning',
          amountPaise: calculation.netProviderEarningPaise,
          currency: 'INR',
          idempotencyKey: `${booking._id}_earning`,
          description: `Calculated net earnings for booking ${booking._id}`,
          settlementStatus: 'calculated',
          metadata: { netProviderEarningPaise: calculation.netProviderEarningPaise },
        },
      },
      { upsert: true }
    );

    // 5. Promotional Subsidy (if free inspection)
    if (isFreeInspection && calculation.promotionalSubsidyPaise > 0) {
      await LedgerEntry.findOneAndUpdate(
        { idempotencyKey: `${booking._id}_promo_subsidy` },
        {
          $setOnInsert: {
            booking: booking._id,
            jobRequest: booking.jobRequest || null,
            provider: booking.provider,
            customer: booking.customer,
            entryType: 'promotional_subsidy',
            amountPaise: calculation.promotionalSubsidyPaise,
            currency: 'INR',
            idempotencyKey: `${booking._id}_promo_subsidy`,
            description: `First free inspection platform subsidy for customer ${booking.customer}`,
            settlementStatus: 'calculated',
            metadata: { waivedAmountPaise: calculation.waivedAmountPaise },
          },
        },
        { upsert: true }
      );
    }

    await Notification.create({
      user: booking.customer,
      title: 'Booking Completed',
      message: `Your service booking is completed. Total charged: ₹${(calculation.customerChargePaise / 100).toFixed(2)}.`,
      type: 'status_change',
      link: '/customer/history',
    });

    res.status(200).json({
      success: true,
      message: 'Booking completed successfully and ledger entries posted',
      financials: {
        totalCustomerChargePaise: calculation.customerChargePaise,
        labourPaise: calculation.labourPaise,
        materialsPaise: calculation.materialsPaise,
        isFreeInspection,
      },
      booking,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider views financial earnings for a specific booking (STRICT PRIVACY ENFORCED)
// @route   GET /api/v2/provider/bookings/:id/earnings
// @access  Private (service_provider)
exports.getBookingEarnings = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only service providers can view provider earnings' });
    }

    const booking = await Booking.findById(req.params.id).populate('service', 'title category');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (booking.provider.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this booking' });
    }

    if (!booking.finalFinancials || !booking.finalFinancials.calculated) {
      return res.status(200).json({
        success: true,
        bookingId: booking._id,
        status: booking.workflowStatus,
        financialStatus: 'pending_completion',
        message: 'Earnings will be calculated upon job completion.',
      });
    }

    // STRICT PRIVACY: Omits commission percentage, commission amount, and promotional subsidies!
    res.status(200).json({
      success: true,
      bookingId: booking._id,
      serviceTitle: booking.service?.title || 'Home Service',
      serviceCategory: booking.service?.category || 'Service',
      completedAt: booking.updatedAt,
      financialSummary: {
        agreedGrossPaise: booking.finalFinancials.labourPaise + booking.finalFinancials.materialsPaise,
        labourEarningsPaise: booking.finalFinancials.labourPaise,
        materialsReimbursementPaise: booking.finalFinancials.materialsPaise,
        netPayablePaise: booking.finalFinancials.netProviderEarningPaise,
        currency: 'INR',
        settlementStatus: booking.finalFinancials.settlementStatus || 'calculated',
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Provider views aggregated earnings dashboard (STRICT PRIVACY ENFORCED)
// @route   GET /api/v2/provider/earnings
// @access  Private (service_provider)
exports.getAllProviderEarnings = async (req, res, next) => {
  try {
    if (req.user.role !== 'service_provider') {
      return res.status(403).json({ success: false, message: 'Only service providers can view provider earnings' });
    }

    const completedBookings = await Booking.find({
      provider: req.user.id,
      workflowStatus: 'completed',
      'finalFinancials.calculated': true,
    })
      .sort({ updatedAt: -1 })
      .populate('service', 'title category');

    let totalNetPayablePaise = 0;
    let totalMaterialsPaise = 0;

    const jobSummaries = completedBookings.map((b) => {
      const net = b.finalFinancials.netProviderEarningPaise || 0;
      const mat = b.finalFinancials.materialsPaise || 0;
      totalNetPayablePaise += net;
      totalMaterialsPaise += mat;

      return {
        bookingId: b._id,
        serviceTitle: b.service?.title || 'Home Service',
        category: b.service?.category || 'Service',
        completedAt: b.updatedAt,
        netPayablePaise: net,
        materialsReimbursementPaise: mat,
        settlementStatus: b.finalFinancials.settlementStatus || 'calculated',
      };
    });

    res.status(200).json({
      success: true,
      totalCompletedJobs: completedBookings.length,
      currency: 'INR',
      totalNetPayablePaise,
      totalMaterialsReimbursementPaise: totalMaterialsPaise,
      jobs: jobSummaries,
    });
  } catch (err) {
    next(err);
  }
};
