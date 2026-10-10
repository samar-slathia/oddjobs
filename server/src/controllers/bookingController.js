const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Notification = require('../models/Notification');
const { serializeBookingForRole, serializeBookingsForRole } = require('../utils/bookingSerializer');
const { completeAndSettleBooking } = require('../services/settlementService');
const { calculateCommissionAndEarnings } = require('../config/commission');

// Allowed status transitions map
const VALID_TRANSITIONS = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

// @desc    Create new booking request
// @route   POST /api/bookings
// @access  Private (customer, admin)
exports.createBooking = async (req, res, next) => {
  try {
    const { serviceId, scheduledDate, address, notes } = req.body;

    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or unavailable',
      });
    }

    // Prevent provider from booking their own service
    if (service.provider.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot book your own service',
      });
    }

    const booking = await Booking.create({
      customer: req.user.id,
      provider: service.provider,
      service: service._id,
      scheduledDate,
      address,
      notes: notes || '',
      price: service.price,
      status: 'pending',
      statusHistory: [
        {
          status: 'pending',
          updatedAt: new Date(),
          updatedBy: req.user.id,
          note: 'Booking request created',
        },
      ],
    });

    // Notify provider
    await Notification.create({
      user: service.provider,
      title: 'New Service Request',
      message: `You received a new request for "${service.title}" from ${req.user.name}`,
      type: 'booking',
      link: `/provider/requests`,
    });

    const populatedBooking = await Booking.findById(booking._id)
      .populate('customer', 'name email phone location')
      .populate('provider', 'name email phone location')
      .populate('service', 'title category price priceType location');

    res.status(201).json({
      success: true,
      message: 'Booking request submitted successfully',
      booking: serializeBookingForRole(populatedBooking, req.user.role),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get user bookings (Customer views their bookings, Provider views requests, Admin views all)
// @route   GET /api/bookings
// @access  Private
exports.getBookings = async (req, res, next) => {
  try {
    const { status, role } = req.query;
    const query = {};

    if (req.user.role === 'admin') {
      if (status) query.status = status;
    } else if (req.user.role === 'service_provider') {
      // Providers view bookings assigned to them
      query.provider = req.user.id;
      if (status) query.status = status;
    } else {
      // Customers view their bookings
      query.customer = req.user.id;
      if (status) query.status = status;
    }

    const bookings = await Booking.find(query)
      .populate('customer', 'name email phone location avatar')
      .populate('provider', 'name email phone location avatar rating')
      .populate('service', 'title category price priceType location')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings: serializeBookingsForRole(bookings, req.user.role),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single booking by ID
// @route   GET /api/bookings/:id
// @access  Private
exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'name email phone location avatar')
      .populate('provider', 'name email phone location avatar rating')
      .populate('service', 'title category price priceType location description');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Access check: must be customer, provider, or admin
    const customerId = booking.customer?._id ? booking.customer._id.toString() : booking.customer?.toString();
    const providerId = booking.provider?._id ? booking.provider._id.toString() : booking.provider?.toString();
    const isCustomer = customerId === req.user.id;
    const isProvider = providerId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this booking',
      });
    }

    res.status(200).json({
      success: true,
      booking: serializeBookingForRole(booking, req.user.role),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update booking status (state transition)
// @route   PATCH /api/bookings/:id/status
// @access  Private
exports.updateBookingStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('customer', 'name email')
      .populate('provider', 'name email')
      .populate('service', 'title');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    const customerId = booking.customer?._id ? booking.customer._id.toString() : booking.customer?.toString();
    const providerId = booking.provider?._id ? booking.provider._id.toString() : booking.provider?.toString();
    const isCustomer = customerId === req.user.id;
    const isProvider = providerId === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this booking',
      });
    }

    // Idempotent retry check
    if (booking.status === 'completed' && status === 'completed') {
      return res.status(200).json({
        success: true,
        message: 'Booking is already completed',
        booking: serializeBookingForRole(booking, req.user.role),
      });
    }

    const currentStatus = booking.status;
    const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

    // Validate state transition
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition booking status from '${currentStatus}' to '${status}'. Allowed transitions: [${allowedNextStatuses.join(', ')}]`,
      });
    }

    // Authorization checks for specific transitions:
    // Customer can only cancel
    if (isCustomer && !isAdmin && status !== 'cancelled') {
      return res.status(403).json({
        success: false,
        message: 'Customers can only cancel pending or accepted bookings',
      });
    }

    // Provider cannot cancel once accepted unless admin
    if (isProvider && !isAdmin && status === 'cancelled' && currentStatus !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Only customer or admin can cancel an active booking',
      });
    }

    // Handle completed transition safely via settlement service or dispatch rejection
    if (status === 'completed') {
      // Dispatch bookings require workflow completion (quote approval, labour stop tracking, inspection subsidies)
      if (booking.jobRequest) {
        return res.status(400).json({
          success: false,
          message: 'Dispatch bookings cannot be completed via legacy status update. Please use the workflow completion endpoint: POST /api/v2/bookings/:id/complete',
        });
      }

      // Ordinary direct bookings: delegate safely to shared settlement service
      const labourAmountPaise = Math.round((booking.price || 0) * 100);
      const materialsAmountPaise = 0;
      const commissionRate = booking.commissionRateSnapshot || 20;
      const isFreeInspection = false;
      const hasApprovedQuote = false;

      const calculation = calculateCommissionAndEarnings({
        labourAmountPaise,
        materialsAmountPaise,
        commissionRate,
        isFreeInspection,
        hasApprovedQuote,
        standardInspectionFeePaise: 9900,
      });

      const now = new Date();
      if (note) {
        booking.statusHistory.push({
          status: 'completed',
          updatedAt: now,
          updatedBy: req.user.id,
          note,
        });
      }

      await completeAndSettleBooking(booking, calculation, isFreeInspection, {
        now,
        updatedBy: req.user.id,
      });

      // Notify customer
      await Notification.create({
        user: customerId,
        title: 'Booking COMPLETED',
        message: `Booking for "${booking.service?.title || 'Service'}" was marked completed by ${req.user.name}`,
        type: 'status_change',
        link: '/customer/bookings',
      });

      const updatedBooking = await Booking.findById(booking._id)
        .populate('customer', 'name email phone location avatar')
        .populate('provider', 'name email phone location avatar rating')
        .populate('service', 'title category price priceType location');

      return res.status(200).json({
        success: true,
        message: 'Booking status updated to completed',
        booking: serializeBookingForRole(updatedBooking, req.user.role),
      });
    }

    // Non-completion status transitions (e.g. accepted, in_progress, cancelled, rejected)
    if (booking.jobRequest && status === 'in_progress') {
      if (booking.pricingModel === 'inspection' && !booking.quoteApproved) {
        return res.status(400).json({
          success: false,
          message: 'Cannot progress or complete booking before customer quote approval on dispatch bookings',
        });
      }
      if (booking.workflowStatus === 'quote_rejected') {
        return res.status(400).json({
          success: false,
          message: 'Cannot progress booking: Proposed quote was rejected by the customer',
        });
      }
    }

    // Update status and append to history
    booking.status = status;
    booking.statusHistory.push({
      status,
      updatedAt: new Date(),
      updatedBy: req.user.id,
      note: note || `Status changed to ${status}`,
    });

    await booking.save();

    // Create notification for recipient
    const notifyUser = isCustomer ? providerId : customerId;
    const actorName = req.user.name;

    await Notification.create({
      user: notifyUser,
      title: `Booking ${status.toUpperCase().replace('_', ' ')}`,
      message: `Booking for "${booking.service?.title || 'Service'}" was updated to ${status.replace('_', ' ')} by ${actorName}`,
      type: 'status_change',
      link: isCustomer ? '/provider/requests' : '/customer/bookings',
    });

    const updatedBooking = await Booking.findById(booking._id)
      .populate('customer', 'name email phone location avatar')
      .populate('provider', 'name email phone location avatar rating')
      .populate('service', 'title category price priceType location');

    res.status(200).json({
      success: true,
      message: `Booking status updated to ${status}`,
      booking: serializeBookingForRole(updatedBooking, req.user.role),
    });
  } catch (err) {
    next(err);
  }
};
