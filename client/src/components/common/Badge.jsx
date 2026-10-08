import React from 'react';
import { getStatusBadgeColor, formatStatusLabel } from '../../utils/formatters';

const Badge = ({ status, text }) => {
  const colorClasses = status
    ? getStatusBadgeColor(status)
    : 'bg-indigo-50 text-indigo-700 border-indigo-200';

  const label = text || (status ? formatStatusLabel(status) : '');

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses}`}
    >
      {label}
    </span>
  );
};

export default Badge;
