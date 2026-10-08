const express = require('express');
const { body } = require('express-validator');
const {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
} = require('../controllers/serviceController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router
  .route('/')
  .get(getServices)
  .post(
    protect,
    authorize('service_provider', 'admin'),
    [
      body('title').notEmpty().withMessage('Service title is required'),
      body('description').notEmpty().withMessage('Description is required'),
      body('category').notEmpty().withMessage('Category is required'),
      body('price')
        .isNumeric()
        .withMessage('Price must be a number')
        .custom((val) => val >= 0)
        .withMessage('Price cannot be negative'),
      body('location').notEmpty().withMessage('Location is required'),
    ],
    validate,
    createService
  );

router
  .route('/:id')
  .get(getServiceById)
  .put(protect, authorize('service_provider', 'admin'), updateService)
  .delete(protect, authorize('service_provider', 'admin'), deleteService);

module.exports = router;
