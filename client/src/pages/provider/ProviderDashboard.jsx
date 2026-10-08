import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { bookingService } from '../../services/bookingService';
import { serviceService } from '../../services/serviceService';
import BookingCard from '../../components/bookings/BookingCard';
import ServiceFormModal from '../../components/services/ServiceFormModal';
import ServiceCard from '../../components/services/ServiceCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import { formatCurrency } from '../../utils/formatters';
import {
  Clock,
  CheckCircle2,
  DollarSign,
  PlusCircle,
  Wrench,
  RefreshCw,
  Star,
} from 'lucide-react';

const ProviderDashboard = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState(null);

  const fetchProviderData = async () => {
    try {
      setLoading(true);
      setError(null);
      const bookingData = await bookingService.getBookings();
      if (bookingData.success) {
        setBookings(bookingData.bookings);
      }

      const serviceData = await serviceService.getServices({ providerId: user._id });
      if (serviceData.success) {
        setServices(serviceData.services);
      }
    } catch (err) {
      setError(err.message || 'Failed to load provider dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?._id) {
      fetchProviderData();
    }
  }, [user]);

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
      setError(err.message || 'Failed to update request status.');
    }
  };

  const handleCreateServiceSuccess = () => {
    fetchProviderData();
  };

  const pendingRequests = bookings.filter((b) => b.status === 'pending');
  const activeJobs = bookings.filter((b) => ['accepted', 'in_progress'].includes(b.status));
  const completedJobs = bookings.filter((b) => b.status === 'completed');
  const totalEarnings = completedJobs.reduce((sum, b) => sum + (b.price || 0), 0);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            Provider Dashboard
          </h1>
          <p className="text-xs text-slate-500">
            Welcome back, {user?.name}. Manage your service requests and listings.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchProviderData}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Data</span>
          </button>
          <button
            onClick={() => {
              setServiceToEdit(null);
              setServiceModalOpen(true);
            }}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-indigo-700 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add New Service</span>
          </button>
        </div>
      </div>

      <ErrorAlert message={error} onClose={() => setError(null)} />

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-11 h-11 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-semibold uppercase">Pending Requests</p>
            <p className="text-xl font-extrabold text-slate-900">{pendingRequests.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-bold">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-semibold uppercase">Active Jobs</p>
            <p className="text-xl font-extrabold text-slate-900">{activeJobs.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-semibold uppercase">Completed Jobs</p>
            <p className="text-xl font-extrabold text-slate-900">{completedJobs.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
          <div className="w-11 h-11 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-semibold uppercase">Earned Revenue</p>
            <p className="text-xl font-extrabold text-slate-900">{formatCurrency(totalEarnings)}</p>
          </div>
        </div>
      </div>

      {/* Pending Action Requests */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            Pending Job Requests ({pendingRequests.length})
          </h2>
        </div>

        {loading ? (
          <LoadingSpinner message="Loading requests..." />
        ) : pendingRequests.length === 0 ? (
          <div className="bg-white p-6 text-center rounded-2xl border border-slate-200 text-xs text-slate-400">
            No pending requests at the moment.
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((b) => (
              <BookingCard
                key={b._id}
                booking={b}
                userRole="service_provider"
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* My Service Listings Summary */}
      <div className="space-y-4 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            My Service Listings ({services.length})
          </h2>
        </div>

        {services.length === 0 ? (
          <div className="bg-white p-8 text-center rounded-2xl border border-slate-200 space-y-3">
            <p className="text-xs text-slate-500">You haven't added any service listings yet.</p>
            <button
              onClick={() => {
                setServiceToEdit(null);
                setServiceModalOpen(true);
              }}
              className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl"
            >
              Add Your First Service
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {services.map((s) => (
              <ServiceCard key={s._id} service={s} />
            ))}
          </div>
        )}
      </div>

      {/* Service Form Modal */}
      <ServiceFormModal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        serviceToEdit={serviceToEdit}
        onSuccess={handleCreateServiceSuccess}
      />
    </div>
  );
};

export default ProviderDashboard;
