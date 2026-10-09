const express = require('express');
const router = express.Router();
const {
  createJobRequest,
  getCustomerRequests,
  getProviderRequests,
  acceptJobRequest,
  cancelJobRequest,
} = require('../controllers/jobRequestController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/', createJobRequest);
router.get('/me', getCustomerRequests);
router.get('/eligible', getProviderRequests);
router.post('/:id/accept', acceptJobRequest);
router.post('/:id/cancel', cancelJobRequest);

module.exports = router;
