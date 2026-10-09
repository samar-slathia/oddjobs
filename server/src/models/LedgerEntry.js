const mongoose = require('mongoose');

const ledgerEntryTypes = [
  'labour_charge',
  'materials_charge',
  'platform_commission',
  'provider_earning',
  'promotional_subsidy',
  'reversal',
];

const ledgerSettlementStatuses = [
  'calculated',
  'pending_settlement',
  'settled',
  'reversed',
];

const ledgerEntrySchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    jobRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobRequest',
      default: null,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    entryType: {
      type: String,
      enum: ledgerEntryTypes,
      required: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'amountPaise must be an integer',
      },
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR'],
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    settlementStatus: {
      type: String,
      enum: ledgerSettlementStatuses,
      default: 'calculated',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

ledgerEntrySchema.index({ booking: 1, entryType: 1 });
ledgerEntrySchema.index({ provider: 1, createdAt: -1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
