const mongoose = require('mongoose');

const promotionStatuses = ['reserved', 'redeemed', 'released'];

const promotionRedemptionSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    promotionId: {
      type: String,
      required: true,
      default: 'FIRST_FREE_INSPECTION',
      trim: true,
    },
    status: {
      type: String,
      enum: promotionStatuses,
      default: 'reserved',
      required: true,
    },
    jobRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobRequest',
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    standardValuePaise: {
      type: Number,
      default: 9900, // ₹99.00 standard inspection value
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'standardValuePaise must be an integer',
      },
    },
    waivedAmountPaise: {
      type: Number,
      default: 9900, // ₹99.00 waived for customer
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'waivedAmountPaise must be an integer',
      },
    },
    subsidyAmountPaise: {
      type: Number,
      default: 9900, // ₹99.00 funded by platform promotion
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'subsidyAmountPaise must be an integer',
      },
    },
    reservedAt: {
      type: Date,
      default: Date.now,
    },
    redeemedAt: {
      type: Date,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Unique partial index preventing multiple simultaneous active (reserved) or completed (redeemed) claims
promotionRedemptionSchema.index(
  { customer: 1, promotionId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['reserved', 'redeemed'] } },
  }
);

promotionRedemptionSchema.index({ jobRequest: 1 });
promotionRedemptionSchema.index({ booking: 1 });

module.exports = mongoose.model('PromotionRedemption', promotionRedemptionSchema);
