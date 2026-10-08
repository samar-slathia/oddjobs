import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { serviceService } from '../services/serviceService';
import { reviewService } from '../services/reviewService';
import { useAuth } from '../context/AuthContext';
import RatingStars from '../components/common/RatingStars';
import ReviewCard from '../components/reviews/ReviewCard';
import BookingModal from '../components/bookings/BookingModal';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorAlert from '../components/common/ErrorAlert';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  MapPin,
  Clock,
  User,
  Phone,
  Mail,
  ShieldCheck,
  Calendar,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';

const ServiceDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, isCustomer } = useAuth();

  const [service, setService] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState(null);

  const fetchServiceData = async () => {
    try {
      setLoading(true);
      setError(null);
      const serviceData = await serviceService.getServiceById(id);
      if (serviceData.success) {
        setService(serviceData.service);
      }

      const reviewData = await reviewService.getServiceReviews(id);
      if (reviewData.success) {
        setReviews(reviewData.reviews);
      }
    } catch (err) {
      setError(err.message || 'Failed to load service details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServiceData();
  }, [id]);

  const handleBookClick = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/services/${id}` } });
      return;
    }
    setBookingModalOpen(true);
  };

  const handleBookingSuccess = (newBooking) => {
    setBookingSuccessMsg('Booking request submitted successfully! Provider notified.');
  };

  if (loading) {
    return <LoadingSpinner size="lg" message="Loading service details..." />;
  }

  if (!service) {
    return (
      <div className="text-center py-16">
        <ErrorAlert message={error || 'Service not found'} />
      </div>
    );
  }

  const provider = service.provider || {};

  return (
    <div className="space-y-8 pb-16">
      {bookingSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center space-x-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span className="text-sm font-semibold">{bookingSuccessMsg}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Service Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="bg-indigo-50 text-indigo-700 font-bold text-xs px-3 py-1 rounded-lg border border-indigo-100">
                {service.category}
              </span>
              <div className="flex items-center space-x-1 text-slate-500 text-xs">
                <MapPin className="w-4 h-4 text-indigo-500" />
                <span>{service.location}</span>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 leading-snug">
              {service.title}
            </h1>

            <div className="flex items-center space-x-3 pt-2 border-t border-slate-100">
              <RatingStars rating={service.rating} numReviews={service.numReviews} size="md" />
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500">
                Listed {formatDate(service.createdAt)}
              </span>
            </div>
          </div>

          {/* Description Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">Service Description</h2>
            <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">
              {service.description}
            </p>
          </div>

          {/* Reviews Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <MessageSquare className="w-5 h-5 text-indigo-600" />
                <span>Customer Reviews ({reviews.length})</span>
              </h2>
              <RatingStars rating={service.rating} size="sm" />
            </div>

            {reviews.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 italic">
                No customer reviews yet for this service.
              </p>
            ) : (
              <div className="space-y-3 pt-2">
                {reviews.map((rev) => (
                  <ReviewCard key={rev._id} review={rev} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Booking & Provider Box */}
        <div className="space-y-6">
          {/* Pricing & Booking Action Box */}
          <div className="bg-white rounded-2xl border-2 border-indigo-600 p-6 space-y-5 shadow-lg relative overflow-hidden">
            <div className="bg-indigo-600 text-white text-[10px] uppercase font-bold tracking-wider py-1 px-3 absolute top-0 right-0 rounded-bl-xl">
              Verified Service
            </div>

            <div>
              <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider block">
                Estimated Price
              </span>
              <div className="flex items-baseline space-x-1 mt-1">
                <span className="text-3xl font-extrabold text-slate-900">
                  {formatCurrency(service.price)}
                </span>
                <span className="text-sm text-slate-500 font-medium">
                  /{service.priceType === 'hourly' ? 'per hour' : 'fixed fee'}
                </span>
              </div>
            </div>

            <button
              onClick={handleBookClick}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Service Request</span>
            </button>

            <p className="text-[11px] text-slate-400 text-center">
              No payment required upfront. Provider accepts request before scheduling.
            </p>
          </div>

          {/* Provider Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
            <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">
              About the Service Provider
            </h3>

            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-lg shadow-md shadow-indigo-100">
                {provider.name?.charAt(0) || 'P'}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">{provider.name}</h4>
                <div className="flex items-center space-x-1 text-xs text-slate-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Verified Provider</span>
                </div>
              </div>
            </div>

            {provider.bio && (
              <p className="text-xs text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                "{provider.bio}"
              </p>
            )}

            <div className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
              {provider.phone && (
                <div className="flex items-center space-x-2">
                  <Phone className="w-4 h-4 text-indigo-500" />
                  <span>{provider.phone}</span>
                </div>
              )}
              {provider.email && (
                <div className="flex items-center space-x-2">
                  <Mail className="w-4 h-4 text-indigo-500" />
                  <span>{provider.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      <BookingModal
        isOpen={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        service={service}
        onSuccess={handleBookingSuccess}
      />
    </div>
  );
};

export default ServiceDetailPage;
