import React from 'react';
import { Star } from 'lucide-react';

const RatingStars = ({ rating = 0, numReviews = null, size = 'sm', interactive = false, onChange = () => {} }) => {
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const stars = [1, 2, 3, 4, 5];

  return (
    <div className="flex items-center space-x-1">
      {stars.map((star) => (
        <Star
          key={star}
          onClick={() => interactive && onChange(star)}
          className={`${iconSizes[size] || iconSizes.sm} ${
            interactive ? 'cursor-pointer transition-transform hover:scale-110' : ''
          } ${
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'fill-slate-100 text-slate-300'
          }`}
        />
      ))}
      {rating > 0 && (
        <span className="text-xs font-semibold text-slate-700 ml-1">
          {Number(rating).toFixed(1)}
        </span>
      )}
      {numReviews !== null && (
        <span className="text-xs text-slate-500 ml-0.5">
          ({numReviews})
        </span>
      )}
    </div>
  );
};

export default RatingStars;
