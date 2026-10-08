export const SERVICE_CATEGORIES = [
  'All',
  'Electrician',
  'Plumber',
  'Cleaner',
  'Carpenter',
  'Painter',
  'Appliance Repair',
  'Tutor',
  'Mechanic',
  'Delivery & Helper',
  'AC Service',
  'Other',
];

export const AC_SERVICE_OPTIONS = [
  'AC General Servicing',
  'AC Cleaning',
  'AC Deep Cleaning',
  'AC Filter Cleaning',
  'AC Installation',
  'AC Uninstallation',
  'AC Gas Refilling',
  'AC Maintenance',
  'AC Inspection',
];

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'pending':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'accepted':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'in_progress':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'cancelled':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};

export const formatStatusLabel = (status) => {
  if (!status) return '';
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
