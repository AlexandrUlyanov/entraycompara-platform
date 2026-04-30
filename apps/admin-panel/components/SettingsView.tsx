import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWhatsAppConnectionHealth } from '../services/api';
import { useTranslation } from '../i18n';
import Spinner from './Spinner';
import { WhatsAppConnectionHealth } from '../types';

const statusTone = (ok: boolean) =>
  ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';

const HealthCheckRow: React.FC<{ label: string; ok: boolean; detail?: string | null }> = ({ label, ok, detail }) => (
  <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-white/80 px-4 py-3 shadow-sm">
    <div>
      <div className="text-sm font-semibold text-secondary">{label}</div>
      {detail ? <div className="mt-1 break-all text-xs text-secondary-light">{detail}</div> : null}
    </div>
    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${statusTone(ok)}`}>
      {ok ? 'OK' : 'Check'}
    </span>
  </div>
);

const getConnectionState = (health?: WhatsAppConnectionHealth) => {
  if (!health) return 'loading';
  if (health.ready_to_send && health.webhook_ready) return 'healthy';
  if (health.configured && !health.meta_ok) return 'meta_error';
  return 'needs_setup';
};

const SettingsView: React.FC = () => {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['whatsapp-connection-health'],
    queryFn: fetchWhatsAppConnectionHealth,
    staleTime: 30_000,
  });

  const connectionState = getConnectionState(data);
  const stateLabel = t(`settings.whatsapp.state.${connectionState}`);
  const stateClasses =
    connectionState === 'healthy'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : connectionState === 'meta_error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">{t('settings.kicker')}</p>
          <h2 className="mt-2 text-4xl font-bold tracking-tight text-secondary">{t('settings.title')}</h2>
          <p className="mt-3 max-w-3xl text-sm text-secondary-light">{t('settings.description')}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center justify-center rounded-full bg-secondary px-5 py-3 text-sm font-semibold text-white shadow-apple transition hover:-translate-y-0.5 hover:shadow-apple-hover disabled:cursor-wait disabled:opacity-60"
        >
          {isFetching ? t('settings.whatsapp.refreshing') : t('settings.whatsapp.refresh')}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-[2rem] border border-white/70 bg-white/70 p-3 shadow-apple backdrop-blur-xl">
          <button className="flex w-full items-center gap-3 rounded-[1.5rem] bg-primary-50 px-4 py-4 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 11.5 10 14l6.5-7" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.5 8.5 0 0 1-12.6 7.45L3 20.5l1.75-5.1A8.5 8.5 0 1 1 21 11.5Z" />
              </svg>
            </span>
            <span>
              <span className="block text-sm font-bold text-secondary">{t('settings.menu.whatsapp')}</span>
              <span className="mt-1 block text-xs text-secondary-light">{t('settings.menu.whatsappDesc')}</span>
            </span>
          </button>
        </aside>

        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 shadow-apple backdrop-blur-xl">
          <div className="border-b border-slate-100 bg-gradient-to-br from-primary-600 via-primary-500 to-cyan-500 p-7 text-white">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">{t('settings.whatsapp.kicker')}</p>
                <h3 className="mt-2 text-3xl font-bold tracking-tight">{t('settings.whatsapp.title')}</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">{t('settings.whatsapp.description')}</p>
              </div>
              <span className={`rounded-full border px-4 py-2 text-sm font-bold ${stateClasses}`}>
                {stateLabel}
              </span>
            </div>
          </div>

          <div className="p-7">
            {isLoading ? (
              <div className="flex min-h-64 items-center justify-center">
                <Spinner />
              </div>
            ) : isError ? (
              <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5 text-sm text-rose-700">
                {t('settings.whatsapp.loadError')}: {(error as Error).message}
              </div>
            ) : data ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-secondary-light">{t('settings.whatsapp.phone')}</div>
                    <div className="mt-2 text-2xl font-bold text-secondary">{data.phone_number || t('common.notAvailable')}</div>
                    <div className="mt-1 text-xs text-secondary-light">{data.verified_name || t('settings.whatsapp.noVerifiedName')}</div>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-secondary-light">{t('settings.whatsapp.quality')}</div>
                    <div className="mt-2 text-2xl font-bold text-secondary">{data.quality_rating || t('common.notAvailable')}</div>
                    <div className="mt-1 text-xs text-secondary-light">{data.code_verification_status || t('settings.whatsapp.noVerificationStatus')}</div>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-secondary-light">{t('settings.whatsapp.apiVersion')}</div>
                    <div className="mt-2 text-2xl font-bold text-secondary">{data.api_version}</div>
                    <div className="mt-1 text-xs text-secondary-light">{t('settings.whatsapp.checkedAt')}: {data.checked_at ? new Date(data.checked_at).toLocaleString() : t('common.notAvailable')}</div>
                  </div>
                </div>

                <div className="grid gap-3">
                  <HealthCheckRow label={t('settings.whatsapp.check.phoneNumberId')} ok={data.phone_number_id_present} />
                  <HealthCheckRow label={t('settings.whatsapp.check.accessToken')} ok={data.access_token_present} />
                  <HealthCheckRow label={t('settings.whatsapp.check.verifyToken')} ok={data.verify_token_present} />
                  <HealthCheckRow label={t('settings.whatsapp.check.metaApi')} ok={data.meta_ok} detail={data.meta_error} />
                  <HealthCheckRow label={t('settings.whatsapp.check.webhook')} ok={data.webhook_ready} detail={data.webhook_callback_url} />
                </div>

                <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-5">
                  <h4 className="text-sm font-bold text-secondary">{t('settings.whatsapp.setupTitle')}</h4>
                  <p className="mt-2 text-sm leading-6 text-secondary-light">{t('settings.whatsapp.setupDescription')}</p>
                  <div className="mt-4 grid gap-2 text-sm text-secondary">
                    <div className="rounded-2xl bg-white/80 px-4 py-3 font-mono text-xs">WHATSAPP_PHONE_NUMBER_ID</div>
                    <div className="rounded-2xl bg-white/80 px-4 py-3 font-mono text-xs">WHATSAPP_ACCESS_TOKEN</div>
                    <div className="rounded-2xl bg-white/80 px-4 py-3 font-mono text-xs">WHATSAPP_VERIFY_TOKEN</div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

export default SettingsView;
