const Service = require('../models/Service');
const User = require('../models/User');

// @desc    Get all services with filtering, search, sorting & pagination
// @route   GET /api/services
// @access  Public
exports.getServices = async (req, res, next) => {
  try {
    const {
      search,
      category,
      location,
      minPrice,
      maxPrice,
      minRating,
      sort,
      page = 1,
      limit = 9,
      providerId,
    } = req.query;

    const query = { isActive: true };

    // Search term in title or description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    // Category filter
    if (category && category !== 'All') {
      query.category = category;
    }

    // Location filter
    if (location) {
      query.location = { $regex: location, $options: 'i' };
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Rating filter
    if (minRating) {
      query.rating = { $gte: Number(minRating) };
    }

    // Specific provider filter
    if (providerId) {
      query.provider = providerId;
    }

    // Sorting
    let sortOption = { createdAt: -1 }; // default newest first
    if (sort === 'price_asc') sortOption = { price: 1 };
    else if (sort === 'price_desc') sortOption = { price: -1 };
    else if (sort === 'rating_desc') sortOption = { rating: -1 };
    else if (sort === 'oldest') sortOption = { createdAt: 1 };

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 9;
    const startIndex = (pageNum - 1) * limitNum;

    const total = await Service.countDocuments(query);
    const services = await Service.find(query)
      .populate('provider', 'name email phone location rating numReviews avatar bio')
      .sort(sortOption)
      .skip(startIndex)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      count: services.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      services,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single service by ID
// @route   GET /api/services/:id
// @access  Public
exports.getServiceById = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id).populate(
      'provider',
      'name email phone location rating numReviews avatar bio createdAt'
    );

    if (!service || !service.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    res.status(200).json({
      success: true,
      service,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new service
// @route   POST /api/services
// @access  Private (service_provider, admin)
exports.createService = async (req, res, next) => {
  try {
    const { title, description, category, price, priceType, location } = req.body;

    const service = await Service.create({
      title,
      description,
      category,
      price,
      priceType: priceType || 'fixed',
      location: location || req.user.location || 'Local Area',
      provider: req.user.id,
    });

    const populatedService = await Service.findById(service._id).populate(
      'provider',
      'name email phone location rating numReviews'
    );

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service: populatedService,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update service
// @route   PUT /api/services/:id
// @access  Private (service_provider owner, admin)
exports.updateService = async (req, res, next) => {
  try {
    let service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    // Ownership check: must be owner or admin
    if (
      service.provider.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this service',
      });
    }

    const fieldsToUpdate = {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      price: req.body.price,
      priceType: req.body.priceType,
      location: req.body.location,
      isActive: req.body.isActive !== undefined ? req.body.isActive : service.isActive,
    };

    service = await Service.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
      returnDocument: 'after',
      runValidators: true,
    }).populate('provider', 'name email phone location rating numReviews');

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      service,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete service
// @route   DELETE /api/services/:id
// @access  Private (service_provider owner, admin)
exports.deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    // Ownership check
    if (
      service.provider.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this service',
      });
    }

    // Soft delete by setting isActive to false
    service.isActive = false;
    await service.save();

    res.status(200).json({
      success: true,
      message: 'Service removed successfully',
    });
  } catch (err) {
    next(err);
  }
};
