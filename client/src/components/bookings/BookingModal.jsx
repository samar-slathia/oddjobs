import React, { useState } from 'react';
import Modal from '../common/Modal';
import ErrorAlert from '../common/ErrorAlert';
import { bookingService } from '../../services/bookingService';
import { formatCurrency } from '../../utils/formatters';
import { Calendar, MapPin, FileText, CheckCircle2 } from 'lucide-react';

const BookingModal = ({ isOpen, onClose, service, onSuccess }) => {
  const [scheduledDate, setScheduledDate] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!service) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!scheduledDate || !address) {
      setError('Please provide a scheduled date and delivery address.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await bookingService.createBooking({
        serviceId: service._id,
        scheduledDate,
        address,
        notes,
      });

      if (data.success) {
        onSuccess(data.booking);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to submit booking request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Book Service: ${service.title}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorAlert message={error} onClose={() => setError(null)} />

        {/* Service Summary Card */}
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-indigo-600 block uppercase">
              {service.category}
            </span>
            <span className="text-sm font-bold text-slate-800">
              Provider: {service.provider?.name || 'Service Provider'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-lg font-extrabold text-indigo-600">
              {formatCurrency(service.price)}
            </span>
            <span className="text-xs text-slate-500 font-medium block">
              /{service.priceType === 'hourly' ? 'hour' : 'fixed price'}
            </span>
          </div>
        </div>

        {/* Date & Time Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Scheduled Date & Time *
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
              min={new Date().toISOString().slice(0, 16)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Address Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Service Location Address *
          </label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              placeholder="e.g. 123 Main St, Apt 4B, City"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Notes Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Additional Instructions / Problem Notes
          </label>
          <div className="relative">
            <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows="3"
              placeholder="Describe what needs to be done..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            ></textarea>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{loading ? 'Submitting...' : 'Confirm Request'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default BookingModal;
