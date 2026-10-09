const mongoose = require('mongoose');
const { serviceCategories } = require('./Service');

const centralPricingSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: [true, 'Please specify a service category'],
      enum: serviceCategories,
      index: true,
    },
    serviceIdentifier: {
      type: String,
      required: [true, 'Please specify a unique normalized service identifier'],
      trim: true,
      lowercase: true,
      maxlength: [100, 'Service identifier cannot exceed 100 characters'],
      match: [/^[a-z0-9_-]+$/, 'Identifier must contain only lowercase letters, numbers, hyphens or underscores'],
    },
    title: {
      type: String,
      required: [true, 'Please provide an approved customer-facing title'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    pricingType: {
      type: String,
      required: [true, 'Please specify pricing type'],
      enum: ['fixed', 'hourly', 'full_day', 'inspection'],
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR'],
    },
    pricePaise: {
      type: Number,
      required: [true, 'Please specify approved base price in integer paise'],
      min: [0, 'Price in paise cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Price in paise must be an integer',
      },
    },
    hourlyRatePaise: {
      type: Number,
      min: [0, 'Hourly rate in paise cannot be negative'],
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Hourly rate in paise must be an integer',
      },
    },
    dailyRatePaise: {
      type: Number,
      min: [0, 'Daily rate in paise cannot be negative'],
      default: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Daily rate in paise must be an integer',
      },
    },
    workerCount: {
      type: Number,
      min: [1, 'Worker count must be at least 1'],
      default: 1,
    },
    minDurationMinutes: {
      type: Number,
      min: [0, 'Minimum billable duration cannot be negative'],
      default: 60,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique serviceIdentifier per category
centralPricingSchema.index({ category: 1, serviceIdentifier: 1 }, { unique: true });
centralPricingSchema.index({ isActive: 1, category: 1 });

module.exports = mongoose.model('CentralPricing', centralPricingSchema);
