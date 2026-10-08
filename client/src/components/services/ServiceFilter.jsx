import React from 'react';
import { Search, Filter, MapPin, DollarSign, Star, RotateCcw } from 'lucide-react';
import { SERVICE_CATEGORIES, AC_SERVICE_OPTIONS } from '../../utils/formatters';

const ServiceFilter = ({ filters, onFilterChange, onReset }) => {
  const handleChange = (e) => {
    const { name, value } = e.target;
    onFilterChange({ [name]: value });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs mb-8">
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Search Bar */}
        <div className="lg:col-span-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Search Jobs
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              name="search"
              value={filters.search || ''}
              onChange={handleChange}
              placeholder="e.g. Electrical wiring, plumbing..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Category Dropdown */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Category
          </label>
          <select
            name="category"
            value={filters.category || 'All'}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          >
            {SERVICE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Location Input */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Location
          </label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              name="location"
              value={filters.location || ''}
              onChange={handleChange}
              placeholder="City or neighborhood"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Price Range */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Max Price ($)
          </label>
          <div className="relative">
            <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="number"
              name="maxPrice"
              value={filters.maxPrice || ''}
              onChange={handleChange}
              placeholder="e.g. 200"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Sort By */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Sort By
          </label>
          <select
            name="sort"
            value={filters.sort || 'newest'}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="rating_desc">Highest Rated</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* Reset filters row */}
      <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100">
        {filters.category === 'AC Service' ? (
          <div className="flex items-center space-x-2">
             <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Specific Service:</span>
             <select
               name="search"
               value={filters.search || ''}
               onChange={handleChange}
               className="text-sm border border-slate-200 bg-slate-50 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
             >
                <option value="">Any AC Service</option>
                {AC_SERVICE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
             </select>
          </div>
        ) : <div />}
        
        <button
          onClick={onReset}
          className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Filters</span>
        </button>
      </div>
    </div>
  );
};

export default ServiceFilter;
