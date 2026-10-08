import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { bookingService } from '../../services/bookingService';
import BookingCard from '../../components/bookings/BookingCard';
import ReviewModal from '../../components/reviews/ReviewModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import { formatCurrency } from '../../utils/formatters';
import { Clock, CheckCircle2, DollarSign, Calendar, RefreshCw } from 'lucide-react';

const CustomerDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('active');

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedBookingForReview, setSelectedBookingForReview] = useState(null);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await bookingService.getBookings();
      if (data.success) {
        setBookings(data.bookings);
      }
    } catch (err) {
      setError(err.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleStatusChange = async (bookingId, newStatus) => {
    try {
      setError(null);
      const res = await bookingService.updateBookingStatus(bookingId, { status: newStatus });
      if (res.success) {
        setBookings((prev) =>
          prev.map((b) => (b._id === bookingId ? res.booking : b))
        );
      }
    } catch (err) {
      setError(err.message || 'Failed to update booking status.');
    }
  };

  const handleOpenReviewModal = (booking) => {
    setSelectedBookingForReview(booking);
    setReviewModalOpen(true);
  };

  const handleReviewSubmitted = () => {
    fetchBookings();
  };

  const filteredBookings = bookings.filter((b) => {
    if (activeTab === 'active') {
      return ['pending', 'accepted', 'in_progress'].includes(b.status);
    }
    return b.status === activeTab;
  });

  const activeCount = bookings.filter((b) =>
    ['pending', 'accepted', 'in_progress'].includes(b.status)
  ).length;

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Welcome, {user?.name || 'Customer'}
          </h1>
          <p className="text-xs text-slate-500">Manage your local service requests & bookings</p>
        </div>
        <button
          onClick={fetchBookings}
          className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors w-fit"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Requests</span>
        </button>
      </div>

      <ErrorAlert message={error} onClose={() => setError(null)} />

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase">Active Requests</p>
            <p className="text-2xl font-extrabold text-slate-900">{activeCount}</p>
          </div>
        </div>

        {/* Note: Completed Jobs and Total Spent cards have been removed per product requirements */}
      </div>

      {/* Tabs Filter */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'active', label: `Active (${activeCount})` },
          { id: 'pending', label: 'Pending' },
          { id: 'accepted', label: 'Accepted' },
          { id: 'in_progress', label: 'In Progress' },
          { id: 'cancelled', label: 'Cancelled' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bookings List */}
      {loading ? (
        <LoadingSpinner message="Fetching your service requests..." />
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-3">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Requests Found</h3>
          <p className="text-xs text-slate-500">
            You don't have any bookings under the "{activeTab}" filter.
          </p>
          <button
            onClick={() => navigate('/services')}
            className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors"
          >
            Browse Local Services
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((b) => (
            <BookingCard
              key={b._id}
              booking={b}
              userRole="customer"
              onStatusChange={handleStatusChange}
              onOpenReviewModal={handleOpenReviewModal}
            />
          ))}
        </div>
      )}

      {/* Review Modal */}
      <ReviewModal
        isOpen={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        booking={selectedBookingForReview}
        onSuccess={handleReviewSubmitted}
      />
    </div>
  );
};

export default CustomerDashboard;
