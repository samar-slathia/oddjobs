import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import ErrorAlert from '../common/ErrorAlert';
import { serviceService } from '../../services/serviceService';
import { SERVICE_CATEGORIES, AC_SERVICE_OPTIONS } from '../../utils/formatters';
import { PlusCircle, Edit3 } from 'lucide-react';

const ServiceFormModal = ({ isOpen, onClose, serviceToEdit, onSuccess }) => {
  const isEditing = !!serviceToEdit;
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Electrician',
    price: '',
    priceType: 'fixed',
    location: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (serviceToEdit) {
      setFormData({
        title: serviceToEdit.title || '',
        description: serviceToEdit.description || '',
        category: serviceToEdit.category || 'Electrician',
        price: serviceToEdit.price || '',
        priceType: serviceToEdit.priceType || 'fixed',
        location: serviceToEdit.location || '',
      });
    } else {
      setFormData({
        title: '',
        description: '',
        category: 'Electrician',
        price: '',
        priceType: 'fixed',
        location: '',
      });
    }
  }, [serviceToEdit, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'category' && value === 'AC Service' && prev.category !== 'AC Service') {
        next.title = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.description || !formData.price || !formData.location) {
      setError('Please fill in all required fields.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let res;
      if (isEditing) {
        res = await serviceService.updateService(serviceToEdit._id, formData);
      } else {
        res = await serviceService.createService(formData);
      }

      if (res.success) {
        onSuccess(res.service);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to save service listing.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Service Listing' : 'Create New Service Listing'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <ErrorAlert message={error} onClose={() => setError(null)} />

        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Service Title *
          </label>
          {formData.category === 'AC Service' ? (
            <select
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="" disabled>Select AC Service Type...</option>
              {AC_SERVICE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="e.g. Master Electrical Wiring & Outlet Repair"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>

        {/* Category & Price Type */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Category *
            </label>
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SERVICE_CATEGORIES.filter((c) => c !== 'All').map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Pricing Model *
            </label>
            <select
              name="priceType"
              value={formData.priceType}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="fixed">Fixed Price</option>
              <option value="hourly">Hourly Rate</option>
            </select>
          </div>
        </div>

        {/* Price & Location */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Price ($) *
            </label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              required
              min="0"
              step="0.01"
              placeholder="e.g. 75"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Location / Coverage *
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              required
              placeholder="e.g. Northside & Downtown"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Service Description *
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            required
            rows="4"
            placeholder="Describe what is included in this service, qualifications, and scope of work..."
            className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          ></textarea>
        </div>

        {/* Submit */}
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
            {isEditing ? <Edit3 className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
            <span>{loading ? 'Saving...' : isEditing ? 'Update Listing' : 'Publish Service'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ServiceFormModal;
