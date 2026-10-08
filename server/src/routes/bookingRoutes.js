const express = require('express');
const { body } = require('express-validator');
const {
  createBooking,
  getBookings,
  getBookingById,
  updateBookingStatus,
} = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect); // All booking routes require authentication

router
  .route('/')
  .get(getBookings)
  .post(
    [
      body('serviceId').isMongoId().withMessage('Valid serviceId is required'),
      body('scheduledDate')
        .notEmpty()
        .withMessage('Scheduled date is required'),
      body('address').notEmpty().withMessage('Address is required'),
    ],
    validate,
    createBooking
  );

router.route('/:id').get(getBookingById);

router.patch(
  '/:id/status',
  [
    body('status')
      .isIn(['pending', 'accepted', 'in_progress', 'completed', 'rejected', 'cancelled'])
      .withMessage('Invalid booking status'),
  ],
  validate,
  updateBookingStatus
);

module.exports = router;
