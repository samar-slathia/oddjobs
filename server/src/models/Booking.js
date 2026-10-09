const mongoose = require('mongoose');

const bookingStatuses = [
  'pending',
  'accepted',
  'in_progress',
  'completed',
  'rejected',
  'cancelled',
];

const bookingSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    service: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    jobRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobRequest',
    },
    status: {
      type: String,
      enum: bookingStatuses,
      default: 'pending',
    },
    scheduledDate: {
      type: Date,
      required: [true, 'Please specify a date for the service'],
    },
    address: {
      type: String,
      required: [true, 'Please provide service delivery address'],
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    workflowStatus: {
      type: String,
      enum: [
        'pending',
        'accepted',
        'arrived',
        'inspecting',
        'quote_pending',
        'quote_approved',
        'quote_rejected',
        'work_in_progress',
        'work_completed',
        'completed',
        'cancelled',
      ],
      default: 'accepted',
    },
    pricingModel: {
      type: String,
      enum: ['fixed', 'hourly', 'full_day', 'inspection'],
      default: 'inspection',
    },
    commissionRateSnapshot: {
      type: Number,
      default: 20,
    },
    arrivedAt: {
      type: Date,
      default: null,
    },
    inspectionStartedAt: {
      type: Date,
      default: null,
    },
    quoteApproved: {
      type: Boolean,
      default: false,
    },
    activeQuoteVersion: {
      type: Number,
      default: 0,
    },
    quotes: [
      {
        quoteVersion: { type: Number, required: true },
        description: { type: String, trim: true, default: '' },
        labourAmountPaise: { type: Number, required: true, min: 0 },
        materials: [
          {
            item: { type: String, required: true, trim: true },
            quantity: { type: Number, required: true, min: 1 },
            unitPricePaise: { type: Number, required: true, min: 0 },
            totalPaise: { type: Number, required: true, min: 0 },
          },
        ],
        materialsTotalPaise: { type: Number, default: 0, min: 0 },
        otherChargesPaise: { type: Number, default: 0, min: 0 },
        totalAmountPaise: { type: Number, required: true, min: 0 },
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected', 'superseded'],
          default: 'pending',
        },
        submittedAt: { type: Date, default: Date.now },
        decidedAt: { type: Date, default: null },
        customerDecisionNote: { type: String, trim: true, default: '' },
      },
    ],
    labourTracking: {
      pricingType: { type: String, enum: ['hourly', 'full_day'], default: 'hourly' },
      hourlyRatePaise: { type: Number, default: 0 },
      dailyRatePaise: { type: Number, default: 0 },
      workerCount: { type: Number, default: 1 },
      agreedDurationMinutes: { type: Number, default: 60 },
      workStartedAt: { type: Date, default: null },
      workStoppedAt: { type: Date, default: null },
      totalWorkedMinutes: { type: Number, default: 0 },
      billableDurationMinutes: { type: Number, default: 0 },
      extensions: [
        {
          extensionVersion: { type: Number, required: true },
          additionalMinutes: { type: Number, required: true, min: 1 },
          additionalAmountPaise: { type: Number, required: true, min: 0 },
          reason: { type: String, trim: true, default: '' },
          status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
          requestedAt: { type: Date, default: Date.now },
          decidedAt: { type: Date, default: null },
        },
      ],
      approvedExtensionMinutes: { type: Number, default: 0 },
      approvedExtensionAmountPaise: { type: Number, default: 0 },
    },
    finalFinancials: {
      calculated: { type: Boolean, default: false },
      labourPaise: { type: Number, default: 0 },
      materialsPaise: { type: Number, default: 0 },
      extensionsPaise: { type: Number, default: 0 },
      totalCustomerChargePaise: { type: Number, default: 0 },
      commissionRate: { type: Number, default: 20 },
      commissionPaise: { type: Number, default: 0 },
      netProviderEarningPaise: { type: Number, default: 0 },
      isFreeInspection: { type: Boolean, default: false },
      waivedAmountPaise: { type: Number, default: 0 },
      promotionalSubsidyPaise: { type: Number, default: 0 },
      settlementStatus: {
        type: String,
        enum: ['calculated', 'pending_settlement', 'settled'],
        default: 'calculated',
      },
    },
    statusHistory: [
      {
        status: { type: String, enum: bookingStatuses, required: true },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ provider: 1, status: 1 });
bookingSchema.index(
  { jobRequest: 1 },
  { unique: true, partialFilterExpression: { jobRequest: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Booking', bookingSchema);
