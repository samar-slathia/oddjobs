const CentralPricing = require('../models/CentralPricing');
const { serviceCategories } = require('../models/Service');

// @desc    Create or update central approved price (Admin only)
// @route   POST /api/v2/pricing
// @access  Private (admin)
exports.createOrUpdatePricing = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only administrators can manage central pricing' });
    }

    const {
      category,
      serviceIdentifier,
      title,
      description,
      pricingType,
      pricePaise,
      hourlyRatePaise,
      dailyRatePaise,
      workerCount,
      minDurationMinutes,
      isActive,
    } = req.body;

    if (!category || !serviceCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be one of: ' + serviceCategories.join(', '),
      });
    }

    if (!serviceIdentifier || typeof serviceIdentifier !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid serviceIdentifier is required' });
    }

    if (!['fixed', 'hourly', 'full_day', 'inspection'].includes(pricingType)) {
      return res.status(400).json({ success: false, message: 'Invalid pricingType' });
    }

    if (!Number.isInteger(pricePaise) || pricePaise < 0) {
      return res.status(400).json({ success: false, message: 'pricePaise must be a non-negative integer' });
    }

    if (hourlyRatePaise !== undefined && (!Number.isInteger(hourlyRatePaise) || hourlyRatePaise < 0)) {
      return res.status(400).json({ success: false, message: 'hourlyRatePaise must be a non-negative integer' });
    }

    if (dailyRatePaise !== undefined && (!Number.isInteger(dailyRatePaise) || dailyRatePaise < 0)) {
      return res.status(400).json({ success: false, message: 'dailyRatePaise must be a non-negative integer' });
    }

    const normalizedId = serviceIdentifier.trim().toLowerCase();

    const pricing = await CentralPricing.findOneAndUpdate(
      { category, serviceIdentifier: normalizedId },
      {
        $set: {
          category,
          serviceIdentifier: normalizedId,
          title: title || normalizedId,
          description: description || '',
          pricingType,
          currency: 'INR',
          pricePaise,
          hourlyRatePaise: hourlyRatePaise || 0,
          dailyRatePaise: dailyRatePaise || 0,
          workerCount: workerCount || 1,
          minDurationMinutes: minDurationMinutes !== undefined ? minDurationMinutes : 60,
          isActive: isActive !== undefined ? isActive : true,
          updatedBy: req.user.id,
        },
        $setOnInsert: {
          createdBy: req.user.id,
          effectiveFrom: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Central pricing configured successfully',
      pricing,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all active central pricing catalogue items
// @route   GET /api/v2/pricing
// @access  Public / Private
exports.getAllPricing = async (req, res, next) => {
  try {
    const { category, pricingType } = req.query;
    const query = { isActive: true };

    if (category) query.category = category;
    if (pricingType) query.pricingType = pricingType;

    const items = await CentralPricing.find(query).sort({ category: 1, title: 1 });
    res.status(200).json({ success: true, count: items.length, pricing: items });
  } catch (err) {
    next(err);
  }
};

// @desc    Get central pricing by category
// @route   GET /api/v2/pricing/:category
// @access  Public / Private
exports.getPricingByCategory = async (req, res, next) => {
  try {
    const items = await CentralPricing.find({
      category: req.params.category,
      isActive: true,
    }).sort({ title: 1 });

    res.status(200).json({ success: true, count: items.length, pricing: items });
  } catch (err) {
    next(err);
  }
};
