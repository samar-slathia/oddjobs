const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Notification = require('../models/Notification');

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
      booking: populatedBooking,
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
      bookings,
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
    const isCustomer = booking.customer._id.toString() === req.user.id;
    const isProvider = booking.provider._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this booking',
      });
    }

    res.status(200).json({
      success: true,
      booking,
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

    const currentStatus = booking.status;
    const allowedNextStatuses = VALID_TRANSITIONS[currentStatus] || [];

    // Validate state transition
    if (!allowedNextStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition booking status from '${currentStatus}' to '${status}'. Allowed transitions: [${allowedNextStatuses.join(', ')}]`,
      });
    }

    const isCustomer = booking.customer._id.toString() === req.user.id;
    const isProvider = booking.provider._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';

    // Authorization checks for specific transitions:
    // Customer can only cancel
    if (isCustomer && !isAdmin && status !== 'cancelled') {
      return res.status(403).json({
        success: false,
        message: 'Customers can only cancel pending or accepted bookings',
      });
    }

    // Provider can accept, reject, mark in_progress, mark completed
    if (isProvider && !isAdmin && status === 'cancelled' && currentStatus !== 'pending') {
      // Provider cannot cancel once accepted unless admin
      return res.status(403).json({
        success: false,
        message: 'Only customer or admin can cancel an active booking',
      });
    }

    if (!isCustomer && !isProvider && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this booking',
      });
    }

    // Protect dispatch/mobile bookings from bypassing customer quote approval
    if (booking.jobRequest && ['in_progress', 'completed'].includes(status)) {
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
    const notifyUser = isCustomer ? booking.provider._id : booking.customer._id;
    const actorName = req.user.name;

    await Notification.create({
      user: notifyUser,
      title: `Booking ${status.toUpperCase().replace('_', ' ')}`,
      message: `Booking for "${booking.service.title}" was updated to ${status.replace('_', ' ')} by ${actorName}`,
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
      booking: updatedBooking,
    });
  } catch (err) {
    next(err);
  }
};
