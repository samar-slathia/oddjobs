import React from 'react';
import Badge from '../common/Badge';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { Calendar, MapPin, User, Check, X, Play, CheckCircle2, MessageSquare, Phone } from 'lucide-react';

const BookingCard = ({
  booking,
  userRole,
  onStatusChange,
  onOpenReviewModal,
}) => {
  const service = booking.service || {};
  const customer = booking.customer || {};
  const provider = booking.provider || {};

  const isCustomer = userRole === 'customer';
  const isProvider = userRole === 'service_provider';
  const isAdmin = userRole === 'admin';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs transition-all hover:border-slate-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 mb-4 gap-2">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
              {service.category || 'Service'}
            </span>
            <span className="text-xs text-slate-400">ID: #{booking._id?.slice(-6)}</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 mt-1">
            {service.title || 'Service Booking'}
          </h3>
        </div>
        <div className="flex items-center space-x-3">
          <Badge status={booking.status} />
          <span className="text-lg font-extrabold text-slate-900">
            {formatCurrency(booking.price)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mb-4">
        {/* Date and Address */}
        <div className="space-y-2">
          <div className="flex items-center space-x-2 text-slate-600">
            <Calendar className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span>
              <strong>Scheduled:</strong> {formatDateTime(booking.scheduledDate)}
            </span>
          </div>
          <div className="flex items-center space-x-2 text-slate-600">
            <MapPin className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span>
              <strong>Location:</strong> {booking.address}
            </span>
          </div>
        </div>

        {/* Counterparty details */}
        <div className="space-y-2">
          {isCustomer ? (
            <div className="flex items-center space-x-2 text-slate-600">
              <User className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <span>
                <strong>Provider:</strong> {provider.name || 'Assigned Provider'}{' '}
                {provider.phone && `(${provider.phone})`}
              </span>
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-slate-600">
              <User className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <span>
                <strong>Customer:</strong> {customer.name || 'Client'}{' '}
                {customer.phone && `(${customer.phone})`}
              </span>
            </div>
          )}
          {booking.notes && (
            <div className="flex items-start space-x-2 text-slate-600">
              <MessageSquare className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
              <span className="italic">"{booking.notes}"</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          Created {formatDateTime(booking.createdAt)}
        </span>

        <div className="flex items-center space-x-2">
          {/* Provider Actions */}
          {(isProvider || isAdmin) && booking.status === 'pending' && (
            <>
              <button
                onClick={() => onStatusChange(booking._id, 'accepted')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Accept</span>
              </button>
              <button
                onClick={() => onStatusChange(booking._id, 'rejected')}
                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reject</span>
              </button>
            </>
          )}

          {(isProvider || isAdmin) && booking.status === 'accepted' && (
            <button
              onClick={() => onStatusChange(booking._id, 'in_progress')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start Job</span>
            </button>
          )}

          {(isProvider || isAdmin) && booking.status === 'in_progress' && (
            <button
              onClick={() => onStatusChange(booking._id, 'completed')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark Completed</span>
            </button>
          )}

          {/* Customer Cancel action for pending/accepted */}
          {(isCustomer || isAdmin) &&
            ['pending', 'accepted'].includes(booking.status) && (
              <button
                onClick={() => onStatusChange(booking._id, 'cancelled')}
                className="px-3 py-1.5 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Cancel Booking
              </button>
            )}

          {/* Customer Review Action for completed booking */}
          {isCustomer && booking.status === 'completed' && (
            <button
              onClick={() => onOpenReviewModal(booking)}
              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors flex items-center space-x-1"
            >
              <MessageSquare className="w-3.5 h-3.5 text-amber-600" />
              <span>Leave Review</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookingCard;
