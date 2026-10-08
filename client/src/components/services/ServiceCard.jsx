import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, ArrowRight, User } from 'lucide-react';
import RatingStars from '../common/RatingStars';
import { formatCurrency } from '../../utils/formatters';

const ServiceCard = ({ service }) => {
  const provider = service.provider || {};

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group">
      <div className="p-5">
        {/* Top bar: Category & Price */}
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
            {service.category}
          </span>
          <div className="text-right">
            <span className="text-lg font-extrabold text-slate-900">
              {formatCurrency(service.price)}
            </span>
            <span className="text-xs text-slate-500 font-medium">
              /{service.priceType === 'hourly' ? 'hr' : 'job'}
            </span>
          </div>
        </div>

        {/* Title */}
        <Link to={`/services/${service._id}`}>
          <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 mb-2">
            {service.title}
          </h3>
        </Link>

        {/* Description */}
        <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
          {service.description}
        </p>

        {/* Location & Rating */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center space-x-1 text-slate-600 font-medium">
            <MapPin className="w-3.5 h-3.5 text-indigo-500" />
            <span>{service.location || 'Local Area'}</span>
          </div>
          <RatingStars rating={service.rating} numReviews={service.numReviews} size="sm" />
        </div>
      </div>

      {/* Provider Footer Bar */}
      <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">
            {provider.name?.charAt(0) || 'P'}
          </div>
          <span className="text-xs font-semibold text-slate-700 truncate max-w-[120px]">
            {provider.name || 'Service Provider'}
          </span>
        </div>

        <Link
          to={`/services/${service._id}`}
          className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          <span>View Details</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};

export default ServiceCard;
