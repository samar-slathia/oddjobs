const express = require('express');
const { body } = require('express-validator');
const {
  createReview,
  getServiceReviews,
  getProviderReviews,
} = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.get('/service/:serviceId', getServiceReviews);
router.get('/provider/:providerId', getProviderReviews);

router.post(
  '/',
  protect,
  [
    body('bookingId').isMongoId().withMessage('Valid bookingId is required'),
    body('rating')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be an integer between 1 and 5'),
    body('comment').notEmpty().withMessage('Comment is required'),
  ],
  validate,
  createReview
);

module.exports = router;
