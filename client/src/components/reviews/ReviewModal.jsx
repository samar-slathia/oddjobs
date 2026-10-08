import React, { useState } from 'react';
import Modal from '../common/Modal';
import RatingStars from '../common/RatingStars';
import ErrorAlert from '../common/ErrorAlert';
import { reviewService } from '../../services/reviewService';
import { Star, Send } from 'lucide-react';

const ReviewModal = ({ isOpen, onClose, booking, onSuccess }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!booking) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) {
      setError('Please enter a review comment.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await reviewService.createReview({
        bookingId: booking._id,
        rating,
        comment,
      });

      if (data.success) {
        onSuccess(data.review);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to submit review.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Leave Service Review">
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorAlert message={error} onClose={() => setError(null)} />

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
          <p className="text-xs text-slate-500 uppercase font-bold">Reviewing Service</p>
          <p className="text-sm font-bold text-slate-800">{booking.service?.title}</p>
          <p className="text-xs text-slate-600">Provider: {booking.provider?.name}</p>
        </div>

        {/* Rating Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Your Rating (1 to 5 Stars)
          </label>
          <div className="flex items-center justify-center p-3 bg-amber-50/50 border border-amber-100 rounded-xl">
            <RatingStars rating={rating} size="lg" interactive onChange={setRating} />
          </div>
        </div>

        {/* Comment Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Your Review / Feedback *
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows="4"
            required
            placeholder="How was your experience with the service provider? Describe quality, punctuality, and professionalism..."
            className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          ></textarea>
        </div>

        {/* Action Buttons */}
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
            <Send className="w-4 h-4" />
            <span>{loading ? 'Submitting...' : 'Submit Review'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ReviewModal;
