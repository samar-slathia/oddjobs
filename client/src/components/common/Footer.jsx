import React from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Shield, Heart } from 'lucide-react';

const Footer = () => {
  return (
    <footer className="bg-slate-900 text-slate-400 pt-12 pb-8 border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Info */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <div className="bg-indigo-600 p-2 rounded-xl text-white">
                <Wrench className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold text-white tracking-tight">
                Odd<span className="text-indigo-400">Jobs</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Your trusted local services marketplace connecting homeowners and local service pros for any job, big or small.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Explore
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link to="/services" className="hover:text-indigo-400 transition-colors">
                  Browse All Services
                </Link>
              </li>
              <li>
                <Link to="/services?category=AC Service" className="hover:text-indigo-400 transition-colors">
                  AC Services
                </Link>
              </li>
              <li>
                <Link to="/services?category=Electrician" className="hover:text-indigo-400 transition-colors">
                  Electricians
                </Link>
              </li>
              <li>
                <Link to="/services?category=Plumber" className="hover:text-indigo-400 transition-colors">
                  Plumbers
                </Link>
              </li>
              <li>
                <Link to="/services?category=Cleaner" className="hover:text-indigo-400 transition-colors">
                  Home Cleaning
                </Link>
              </li>
            </ul>
          </div>

          {/* Roles */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              For Everyone
            </h4>
            <ul className="space-y-2.5 text-xs">
              <li>
                <Link to="/register?role=customer" className="hover:text-indigo-400 transition-colors">
                  Hire a Service Provider
                </Link>
              </li>
              <li>
                <Link to="/register?role=service_provider" className="hover:text-indigo-400 transition-colors">
                  Become a Service Provider
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-indigo-400 transition-colors">
                  Account Sign In
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust & Safety */}
          <div>
            <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
              Trust & Safety
            </h4>
            <div className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <Shield className="w-5 h-5 text-indigo-400 flex-shrink-0" />
              <span>Verified local service professionals with transparent ratings and reviews.</span>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500">
          <p>© {new Date().getFullYear()} OddJobs Marketplace. All rights reserved.</p>
          <p className="flex items-center space-x-1 mt-2 md:mt-0">
            <span>Built with care for local communities</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
