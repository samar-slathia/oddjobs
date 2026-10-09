const mongoose = require('mongoose');

const requestStatuses = [
  'searching',
  'claiming',
  'accepted',
  'expired',
  'cancelled',
];

const jobRequestSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: String,
      required: [true, 'Please specify a service category'],
    },
    requestType: {
      type: String,
      enum: ['known_price', 'inspection'],
      required: true,
    },
    serviceIdentifier: {
      type: String,
      trim: true,
      default: '',
    },
    isFreeInspection: {
      type: Boolean,
      default: false,
    },
    problemDescription: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    address: {
      type: String,
      required: [true, 'Please provide service delivery address'],
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      }
    },
    status: {
      type: String,
      enum: requestStatuses,
      default: 'searching',
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    idempotencyKey: {
      type: String,
      trim: true,
    }
  },
  {
    timestamps: true,
  }
);

jobRequestSchema.index({ location: '2dsphere' });
jobRequestSchema.index({ customer: 1, status: 1 });
jobRequestSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('JobRequest', jobRequestSchema);
