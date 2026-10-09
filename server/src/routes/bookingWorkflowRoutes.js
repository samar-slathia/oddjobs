const express = require('express');
const router = express.Router();
const {
  markArrival,
  startInspection,
  submitQuote,
  getQuotes,
  approveQuote,
  rejectQuote,
  startWork,
  requestExtension,
  decideExtension,
  stopWorkAndComplete,
  getBookingEarnings,
  getAllProviderEarnings,
} = require('../controllers/bookingWorkflowController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Provider Workflow Transitions
router.post('/:id/arrive', markArrival);
router.post('/:id/start-inspection', startInspection);
router.post('/:id/quote', submitQuote);
router.get('/:id/quotes', getQuotes);
router.post('/:id/quote/approve', approveQuote);
router.post('/:id/quote/reject', rejectQuote);
router.post('/:id/start-work', startWork);
router.post('/:id/extension-request', requestExtension);
router.post('/:id/extension-decide', decideExtension);
router.post('/:id/complete', stopWorkAndComplete);

// Provider Earnings (Privacy-enforced)
router.get('/:id/earnings', getBookingEarnings);

module.exports = router;
