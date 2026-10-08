const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Helper function to recalculate ratings for service and provider
const updateRatings = async (serviceId, providerId) => {
  // Service average rating
  const serviceStats = await Review.aggregate([
    { $match: { service: serviceId } },
    {
      $group: {
        _id: '$service',
        avgRating: { $avg: '$rating' },
        numReviews: { $sum: 1 },
      },
    },
  ]);

  const serviceAvg = serviceStats.length > 0 ? Number(serviceStats[0].avgRating.toFixed(1)) : 0;
  const serviceNum = serviceStats.length > 0 ? serviceStats[0].numReviews : 0;

  await Service.findByIdAndUpdate(serviceId, {
    rating: serviceAvg,
    numReviews: serviceNum,
  });

  // Provider average rating across all their services
  const providerStats = await Review.aggregate([
    { $match: { provider: providerId } },
    {
      $group: {
        _id: '$provider',
        avgRating: { $avg: '$rating' },
        numReviews: { $sum: 1 },
      },
    },
  ]);

  const providerAvg = providerStats.length > 0 ? Number(providerStats[0].avgRating.toFixed(1)) : 0;
  const providerNum = providerStats.length > 0 ? providerStats[0].numReviews : 0;

  await User.findByIdAndUpdate(providerId, {
    rating: providerAvg,
    numReviews: providerNum,
  });
};

// @desc    Create a review for completed booking
// @route   POST /api/reviews
// @access  Private (customer, admin)
exports.createReview = async (req, res, next) => {
  try {
    const { bookingId, rating, comment } = req.body;

    const booking = await Booking.findById(bookingId).populate('service');
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Must be the customer who booked the service
    if (booking.customer.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You can only review your own bookings',
      });
    }

    // Must be completed
    if (booking.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'You can only review a completed booking',
      });
    }

    // Check if review already exists for this booking
    const existingReview = await Review.findOne({ booking: bookingId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already submitted a review for this booking',
      });
    }

    const review = await Review.create({
      booking: bookingId,
      customer: req.user.id,
      provider: booking.provider,
      service: booking.service._id,
      rating: Number(rating),
      comment,
    });

    // Update aggregated ratings
    await updateRatings(booking.service._id, booking.provider);

    // Notify provider
    await Notification.create({
      user: booking.provider,
      title: 'New Review Received',
      message: `${req.user.name} left a ${rating}-star review for "${booking.service.title}"`,
      type: 'review',
      link: `/services/${booking.service._id}`,
    });

    const populatedReview = await Review.findById(review._id)
      .populate('customer', 'name avatar')
      .populate('service', 'title');

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      review: populatedReview,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get reviews for a service
// @route   GET /api/reviews/service/:serviceId
// @access  Public
exports.getServiceReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ service: req.params.serviceId })
      .populate('customer', 'name avatar')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get reviews for a provider
// @route   GET /api/reviews/provider/:providerId
// @access  Public
exports.getProviderReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ provider: req.params.providerId })
      .populate('customer', 'name avatar')
      .populate('service', 'title')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (err) {
    next(err);
  }
};
