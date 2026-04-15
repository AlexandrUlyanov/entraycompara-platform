
import React from 'react';
import { Status } from '../types';
import { STATUS_COLORS } from '../constants';
import { useTranslation } from '../i18n';

interface StatusBadgeProps {
  status: Status;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const { t } = useTranslation();
  const colorClass = STATUS_COLORS[status] || 'bg-gray-100 text-gray-800';
  
  return (
    <span
      className={`px-2.5 py-1 text-xs font-medium rounded-full inline-block ${colorClass}`}
    >
      {t(`status.${status.replace(' ', '')}`)}
    </span>
  );
};

export default StatusBadge;
