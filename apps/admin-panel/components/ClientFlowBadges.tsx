import React from 'react';
import { Application } from '../types';
import { useTranslation } from '../i18n';

interface ClientFlowBadgesProps {
  application: Application;
  compact?: boolean;
}

const getClientStatusLabel = (
  t: (key: string, values?: Record<string, string | number>) => string,
  application: Application,
): string => {
  const key = application.client_visible_status ? `clientFlow.status.${application.client_visible_status}` : '';
  const translated = key ? t(key) : '';
  if (translated && translated !== key) return translated;
  return application.client_visible_label || t('clientFlow.status.unknown');
};

const ClientFlowBadges: React.FC<ClientFlowBadgesProps> = ({ application, compact = false }) => {
  const { t } = useTranslation();
  const clientStatus = getClientStatusLabel(t, application);

  const baseClass = compact
    ? 'px-2 py-1 text-[10px] rounded-lg'
    : 'px-2.5 py-1.5 text-[11px] rounded-xl';

  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? 'mt-2' : ''}`}>
      <span className={`${baseClass} font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-100`}>
        {application.public_code || t('clientFlow.noPublicCode')}
      </span>
      <span
        className={`${baseClass} font-semibold border ${
          application.whatsapp_verified
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-amber-50 text-amber-700 border-amber-100'
        }`}
      >
        {application.whatsapp_verified ? t('clientFlow.whatsapp.verified') : t('clientFlow.whatsapp.pending')}
      </span>
      <span
        className={`${baseClass} font-semibold border ${
          application.client_area_enabled
            ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
            : 'bg-slate-50 text-slate-500 border-slate-100'
        }`}
      >
        {application.client_area_enabled ? t('clientFlow.area.active') : t('clientFlow.area.inactive')}
      </span>
      {!compact && (
        <span className={`${baseClass} font-semibold bg-white text-slate-600 border border-slate-200`}>
          {clientStatus}
        </span>
      )}
    </div>
  );
};

export default ClientFlowBadges;
