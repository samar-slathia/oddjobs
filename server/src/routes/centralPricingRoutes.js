const express = require('express');
const router = express.Router();
const {
  createOrUpdatePricing,
  getAllPricing,
  getPricingByCategory,
} = require('../controllers/centralPricingController');
const { protect } = require('../middleware/auth');

router.get('/', getAllPricing);
router.get('/:category', getPricingByCategory);
router.post('/', protect, createOrUpdatePricing);

module.exports = router;
