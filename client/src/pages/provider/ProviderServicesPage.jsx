import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { serviceService } from '../../services/serviceService';
import ServiceCard from '../../components/services/ServiceCard';
import ServiceFormModal from '../../components/services/ServiceFormModal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorAlert from '../../components/common/ErrorAlert';
import { PlusCircle, Edit3, Trash2, Wrench } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';

const ProviderServicesPage = () => {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [serviceToEdit, setServiceToEdit] = useState(null);

  const fetchServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await serviceService.getServices({ providerId: user._id });
      if (data.success) {
        setServices(data.services);
      }
    } catch (err) {
      setError(err.message || 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?._id) {
      fetchServices();
    }
  }, [user]);

  const handleEdit = (service) => {
    setServiceToEdit(service);
    setModalOpen(true);
  };

  const handleDelete = async (serviceId) => {
    if (!window.confirm('Are you sure you want to remove this service listing?')) return;
    try {
      setError(null);
      const res = await serviceService.deleteService(serviceId);
      if (res.success) {
        setServices((prev) => prev.filter((s) => s._id !== serviceId));
      }
    } catch (err) {
      setError(err.message || 'Failed to delete service.');
    }
  };

  const handleSaveSuccess = () => {
    fetchServices();
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">My Service Listings</h1>
          <p className="text-xs text-slate-500">Create, update, or remove your local offerings</p>
        </div>
        <button
          onClick={() => {
            setServiceToEdit(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-indigo-700 transition-colors w-fit"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Add New Service</span>
        </button>
      </div>

      <ErrorAlert message={error} onClose={() => setError(null)} />

      {loading ? (
        <LoadingSpinner message="Fetching your service listings..." />
      ) : services.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 space-y-3">
          <Wrench className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Services Created Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Offer your expertise to local homeowners by publishing your first service listing.
          </p>
          <button
            onClick={() => {
              setServiceToEdit(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl"
          >
            Create Service Listing
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s) => (
            <div key={s._id} className="relative group">
              <ServiceCard service={s} />

              {/* Action Overlay */}
              <div className="mt-2 flex items-center justify-end space-x-2">
                <button
                  onClick={() => handleEdit(s)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-lg text-xs font-bold flex items-center space-x-1 border border-slate-200 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => handleDelete(s._id)}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold flex items-center space-x-1 border border-rose-200 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      <ServiceFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        serviceToEdit={serviceToEdit}
        onSuccess={handleSaveSuccess}
      />
    </div>
  );
};

export default ProviderServicesPage;
