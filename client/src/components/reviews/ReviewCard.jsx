import React from 'react';
import RatingStars from '../common/RatingStars';
import { formatDate } from '../../utils/formatters';
import { User, Quote } from 'lucide-react';

const ReviewCard = ({ review }) => {
  const customer = review.customer || {};

  return (
    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/70 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">
            {customer.name?.charAt(0) || 'C'}
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800">{customer.name || 'Verified Customer'}</h4>
            <span className="text-[10px] text-slate-400">{formatDate(review.createdAt)}</span>
          </div>
        </div>
        <RatingStars rating={review.rating} size="sm" />
      </div>

      <p className="text-xs text-slate-600 leading-relaxed italic relative pl-3 border-l-2 border-indigo-300">
        "{review.comment}"
      </p>
    </div>
  );
};

export default ReviewCard;
