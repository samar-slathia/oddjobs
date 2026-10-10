/**
 * Role-aware serialization for Booking objects.
 * Guarantees that internal platform financials (commission rate, commission amount,
 * promotional subsidies, internal lease tokens/timestamps) are never leaked to customers
 * or service providers. Also prevents provider earnings from being visible to customers.
 */

function serializeBookingForRole(booking, role) {
  if (!booking) return booking;

  // Convert to plain object if it is a Mongoose document
  const obj = booking.toObject ? booking.toObject() : JSON.parse(JSON.stringify(booking));

  // Admin role receives the complete document required for platform governance and audit
  if (role === 'admin') {
    return obj;
  }

  // 1. Root-level platform fields: hidden from customers and service providers
  delete obj.commissionRateSnapshot;

  // 2. Final financials sanitization
  if (obj.finalFinancials) {
    // Delete platform internal commission and subsidy accounting
    delete obj.finalFinancials.commissionRate;
    delete obj.finalFinancials.commissionPaise;
    delete obj.finalFinancials.promotionalSubsidyPaise;
    delete obj.finalFinancials.settlementClaimedAt;
    delete obj.finalFinancials.settlementClaimToken;

    if (role === 'customer') {
      // Customers must never see the provider's private earnings or internal settlement status
      delete obj.finalFinancials.netProviderEarningPaise;
      delete obj.finalFinancials.settlementStatus;
    }
  }

  return obj;
}

function serializeBookingsForRole(bookings, role) {
  if (!Array.isArray(bookings)) return bookings;
  return bookings.map((b) => serializeBookingForRole(b, role));
}

module.exports = {
  serializeBookingForRole,
  serializeBookingsForRole,
};
