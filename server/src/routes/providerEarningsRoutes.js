const express = require('express');
const router = express.Router();
const {
  getBookingEarnings,
  getAllProviderEarnings,
} = require('../controllers/bookingWorkflowController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/earnings', getAllProviderEarnings);
router.get('/bookings/:id/earnings', getBookingEarnings);

module.exports = router;
