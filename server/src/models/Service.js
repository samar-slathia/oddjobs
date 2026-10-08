const mongoose = require('mongoose');

const serviceCategories = [
  'Electrician',
  'Plumber',
  'Cleaner',
  'Carpenter',
  'Painter',
  'Appliance Repair',
  'Tutor',
  'Mechanic',
  'Delivery & Helper',
  'AC Service',
  'Other',
];

const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add a service title'],
      trim: true,
      maxlength: [120, 'Title cannot be more than 120 characters'],
    },
    description: {
      type: String,
      required: [true, 'Please add a service description'],
      maxlength: [2000, 'Description cannot be more than 2000 characters'],
    },
    category: {
      type: String,
      required: [true, 'Please specify a category'],
      enum: serviceCategories,
    },
    price: {
      type: Number,
      required: [true, 'Please add a price'],
      min: [0, 'Price must be greater than or equal to 0'],
    },
    priceType: {
      type: String,
      enum: ['fixed', 'hourly'],
      default: 'fixed',
    },
    location: {
      type: String,
      required: [true, 'Please specify service location/city'],
      trim: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    numReviews: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient search & filter queries
serviceSchema.index({ category: 1, location: 1, price: 1, rating: -1 });
serviceSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Service', serviceSchema);
module.serviceCategories = serviceCategories;
