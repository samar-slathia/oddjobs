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

module.exports = mongoose.model('Booking', bookingSchema);
