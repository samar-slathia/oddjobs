import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { serviceService } from '../services/serviceService';
import ServiceCard from '../components/services/ServiceCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { SERVICE_CATEGORIES } from '../utils/formatters';
import {
  Search,
  Wrench,
  ShieldCheck,
  Star,
  Clock,
  ArrowRight,
  Zap,
  Sparkles,
  Users,
} from 'lucide-react';

const HomePage = () => {
  const [featuredServices, setFeaturedServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTopServices = async () => {
      try {
        setLoading(true);
        const data = await serviceService.getServices({ limit: 6, sort: 'rating_desc' });
        if (data.success) {
          setFeaturedServices(data.services);
        }
      } catch (err) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchTopServices();
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/services?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/services');
    }
  };

  return (
    <div className="space-y-16 pb-16">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-3xl p-8 sm:p-14 overflow-hidden shadow-xl mt-4">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center space-x-2 bg-indigo-500/30 border border-indigo-400/30 px-3 py-1.5 rounded-full text-xs font-semibold text-indigo-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Local Services Marketplace</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Find Trusted Local Experts for Any <span className="text-indigo-400">Odd Job</span>.
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            From emergency electrical repairs and leaky pipes to home cleaning and custom furniture assembly — connect with verified local service professionals near you.
          </p>

          {/* Search bar widget */}
          <form
            onSubmit={handleSearchSubmit}
            className="bg-white p-2 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2 border border-white/20"
          >
            <div className="flex items-center flex-1 w-full px-3 text-slate-800">
              <Search className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="What job do you need done today? (e.g. Electrician, Cleaner...)"
                className="w-full text-sm font-medium py-3 text-slate-900 placeholder-slate-400 focus:outline-none bg-transparent"
              />
            </div>
            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2"
            >
              <span>Search Services</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Popular Search tags */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 pt-2">
            <span className="font-semibold text-slate-400">Popular:</span>
            {['AC Service', 'Electrician', 'Plumber', 'Cleaner', 'Carpenter', 'Painter'].map((cat) => (
              <Link
                key={cat}
                to={`/services?category=${cat}`}
                className="bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors border border-white/10"
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Categories Grid */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Popular Categories</h2>
            <p className="text-xs text-slate-500">Explore skilled providers by category</p>
          </div>
          <Link
            to="/services"
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {SERVICE_CATEGORIES.filter((c) => c !== 'All').map((category) => (
            <Link
              key={category}
              to={`/services?category=${category}`}
              className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all text-center group"
            >
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                <Wrench className="w-6 h-6" />
              </div>
              <h3 className="text-xs font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                {category}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      {/* Top Rated Services */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Top Rated Services</h2>
            <p className="text-xs text-slate-500">Highest rated local job listings near you</p>
          </div>
          <Link
            to="/services?sort=rating_desc"
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
          >
            <span>Explore All Services</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <LoadingSpinner message="Fetching top services..." />
        ) : featuredServices.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500 text-sm">No services listed yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredServices.map((service) => (
              <ServiceCard key={service._id} service={service} />
            ))}
          </div>
        )}
      </section>

      {/* How it Works */}
      <section className="bg-slate-100/70 rounded-3xl p-8 sm:p-12 border border-slate-200">
        <div className="text-center max-w-xl mx-auto mb-10 space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">How OddJobs Works</h2>
          <p className="text-xs text-slate-500">Simple, transparent, and secure 3-step process</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-extrabold text-lg mx-auto shadow-md shadow-indigo-200">
              1
            </div>
            <h3 className="text-sm font-bold text-slate-900">Browse & Select Service</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Filter local jobs by category, rating, location, and price. Compare provider credentials and ratings.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-extrabold text-lg mx-auto shadow-md shadow-indigo-200">
              2
            </div>
            <h3 className="text-sm font-bold text-slate-900">Submit Booking Request</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pick your preferred date, provide location address, and send request directly to the service provider.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-extrabold text-lg mx-auto shadow-md shadow-indigo-200">
              3
            </div>
            <h3 className="text-sm font-bold text-slate-900">Job Completion & Review</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Track status updates in real-time. Leave a rating and review once the service is completed.
            </p>
          </div>
        </div>
      </section>

      {/* Provider CTA Banner */}
      <section className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white rounded-3xl p-8 sm:p-12 flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg">
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold">Are You a Skilled Service Provider?</h2>
          <p className="text-xs sm:text-sm text-indigo-100 max-w-xl">
            Join OddJobs to list your services, reach local customers, manage bookings, and grow your local business today.
          </p>
        </div>
        <Link
          to="/register?role=service_provider"
          className="px-6 py-3.5 bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-sm rounded-xl shadow-md transition-colors whitespace-nowrap"
        >
          Become a Provider
        </Link>
      </section>
    </div>
  );
};

export default HomePage;
