import React, { useEffect, useMemo, useState } from 'react';
import Header from './Header.tsx';
import Footer from './Footer.tsx';
import {
  CheckCircleIconSolid,
  DocumentIcon,
  SpinnerIcon,
  SparklesIcon,
  TrustBadgeIcon,
  WhatsAppIcon,
  XCircleIcon,
} from './Icons.tsx';

const API_BASE_URL = 'https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api';

type ClientAreaPayload = {
  application?: {
    public_code?: string;
    status?: string;
    client_visible_status?: string;
    client_visible_label?: string;
    created_at?: string;
    submission_date?: string;
    whatsapp_verified?: boolean;
  };
  client?: {
    name?: string;
    phone?: string;
    email?: string;
    service_type?: string;
  };
  files?: Array<{
    id?: string;
    file_name?: string;
    file_url?: string;
    status?: string;
  }>;
  extracted_data?: Record<string, any>;
  simulations?: Array<Record<string, any>>;
  proposal?: {
    status?: string;
    pdf_url?: string;
    sent_at?: string;
    accepted_at?: string;
  } | null;
  events?: Array<Record<string, any>>;
  cta?: {
    whatsapp_url?: string;
    can_accept_proposal?: boolean;
  };
};

type LoadState = 'loading' | 'ready' | 'error';
type AcceptState = 'idle' | 'loading' | 'done' | 'error';

const statusSteps = [
  { keys: ['invoice_uploaded', 'new_lead'], label: 'Factura recibida' },
  { keys: ['invoice_processing', 'data_extracted', 'needs_review'], label: 'Datos detectados' },
  { keys: ['comparison_in_progress'], label: 'Comparación de tarifas' },
  { keys: ['simulation_ready'], label: 'Simulación preparada' },
  { keys: ['proposal_ready', 'proposal_sent', 'proposal_accepted', 'switching_in_progress', 'completed'], label: 'Propuesta lista' },
];

const fieldLabels: Array<[string, string[]]> = [
  ['Comercializadora actual', ['retailer', 'supplier_name', 'current_supplier']],
  ['CUPS', ['cups']],
  ['Tarifa actual', ['access_tariff', 'tariff_name']],
  ['Potencia contratada', ['contracted_power', 'billed_power_p1', 'billed_power_p2']],
  ['Consumo estimado', ['energy_consumption_kwh', 'consumption_p1', 'consumption_p2', 'consumption_p3']],
  ['Importe factura', ['invoice_amount_with_vat', 'total_amount']],
  ['Periodo de facturación', ['billing_period', 'start_date', 'end_date', 'billing_period_start', 'billing_period_end']],
];

const formatDate = (value?: string) => {
  if (!value) return 'Pendiente';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const formatMoney = (value: any) => {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return value ? String(value) : 'Pendiente';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(numeric);
};

const asNumber = (value: any): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const firstFinite = (...values: any[]): number | null => {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const valueFrom = (source: Record<string, any> | undefined, keys: string[]) => {
  if (!source) return '';
  const values = keys
    .map((key) => source[key])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '');

  if (values.length === 0) return 'Pendiente';
  if (values.length === 1) return String(values[0]);
  return values.map((value, index) => `P${index + 1} ${value}`).join(' / ');
};

const billingPeriodFrom = (source: Record<string, any> | undefined) => {
  if (!source) return 'Pendiente';
  if (source.billing_period) return String(source.billing_period);
  const start = source.start_date || source.billing_period_start;
  const end = source.end_date || source.billing_period_end;
  if (start && end) return `${start} - ${end}`;
  return start || end || 'Pendiente';
};

const consumptionFrom = (source: Record<string, any> | undefined) => {
  if (!source) return 'Pendiente';
  if (source.energy_consumption_kwh) return `${source.energy_consumption_kwh} kWh`;
  const parts = [
    source.consumption_p1 ? `P1 ${source.consumption_p1} kWh` : '',
    source.consumption_p2 ? `P2 ${source.consumption_p2} kWh` : '',
    source.consumption_p3 ? `P3 ${source.consumption_p3} kWh` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' / ') : 'Pendiente';
};

const statusIndex = (status?: string) => {
  const normalized = status || 'invoice_uploaded';
  const index = statusSteps.findIndex((step) => step.keys.includes(normalized));
  return index >= 0 ? index : 0;
};

const ClientAreaPage: React.FC<{ token: string }> = ({ token }) => {
  const [payload, setPayload] = useState<ClientAreaPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [acceptState, setAcceptState] = useState<AcceptState>('idle');

  useEffect(() => {
    let isMounted = true;

    const loadClientArea = async () => {
      setLoadState('loading');
      setErrorMessage('');
      try {
        const response = await fetch(`${API_BASE_URL}/client-area/${encodeURIComponent(token)}`);
        if (!response.ok) {
          throw new Error('No hemos podido abrir esta área personal.');
        }
        const data = await response.json();
        if (isMounted) {
          setPayload(data);
          setLoadState('ready');
        }
      } catch (error: any) {
        if (isMounted) {
          setErrorMessage(error?.message || 'El enlace no es válido o ha caducado.');
          setLoadState('error');
        }
      }
    };

    if (token) {
      loadClientArea();
    } else {
      setLoadState('error');
      setErrorMessage('Falta el token seguro de acceso.');
    }

    return () => {
      isMounted = false;
    };
  }, [token]);

  const application = payload?.application;
  const selectedSimulation = useMemo(() => {
    const simulations = payload?.simulations || [];
    return simulations.find((simulation) => simulation.is_selected) || simulations[0];
  }, [payload?.simulations]);
  const monthlySavings = useMemo(() => {
    if (!selectedSimulation) return null;
    const direct = firstFinite(
      selectedSimulation.savings_monthly_eur,
      selectedSimulation.monthly_saving,
      selectedSimulation.monthly_savings,
      selectedSimulation.monthly_saving_eur,
      selectedSimulation.ahorro_mensual,
    );
    if (direct !== null) return direct;
    const currentMonthly = firstFinite(
      payload?.extracted_data?.avg_monthly_cost_eur,
      payload?.extracted_data?.monthly_cost_eur,
    );
    const newMonthly = firstFinite(
      selectedSimulation.new_monthly_cost_eur,
      selectedSimulation.estimated_monthly_cost,
    );
    if (currentMonthly !== null && newMonthly !== null) return Math.max(0, currentMonthly - newMonthly);
    return null;
  }, [selectedSimulation, payload?.extracted_data]);
  const annualSavings = useMemo(() => {
    if (!selectedSimulation) return null;
    const direct = firstFinite(
      selectedSimulation.annual_saving,
      selectedSimulation.savings_annual_eur,
      selectedSimulation.ahorro_anual,
    );
    if (direct !== null) return direct;
    return monthlySavings !== null ? monthlySavings * 12 : null;
  }, [selectedSimulation, monthlySavings]);

  const activeStatusIndex = statusIndex(application?.client_visible_status);
  const hasProposal = Boolean(payload?.proposal?.pdf_url);
  const needsReview = application?.client_visible_status === 'needs_review';
  const whatsappUrl = payload?.cta?.whatsapp_url
    ? `${payload.cta.whatsapp_url}?text=${encodeURIComponent(`Hola, quiero consultar mi solicitud ${application?.public_code || ''}.`)}`
    : 'https://wa.me/34611974984';

  const handleAcceptProposal = async () => {
    setAcceptState('loading');
    try {
      const response = await fetch(`${API_BASE_URL}/client-area/${encodeURIComponent(token)}/accept-proposal`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('No hemos podido registrar la aceptación.');
      }
      const data = await response.json();
      setPayload((current) => current ? {
        ...current,
        application: {
          ...current.application,
          status: data.application_status || current.application?.status,
          client_visible_label: data.client_visible_label || current.application?.client_visible_label,
          client_visible_status: 'proposal_accepted',
        },
        proposal: current.proposal ? {
          ...current.proposal,
          status: data.proposal_status || 'accepted',
          accepted_at: new Date().toISOString(),
        } : current.proposal,
      } : current);
      setAcceptState('done');
    } catch {
      setAcceptState('error');
    }
  };

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <Header />
        <main className="flex min-h-[70vh] items-center justify-center px-4 pt-28">
          <div className="rounded-[2rem] border border-white bg-white/90 p-10 text-center shadow-2xl shadow-blue-100">
            <SpinnerIcon className="mx-auto h-10 w-10 text-blue-600" />
            <h1 className="mt-5 text-2xl font-black">Abriendo tu área personal</h1>
            <p className="mt-2 text-slate-500">Estamos cargando el estado de tu solicitud.</p>
          </div>
        </main>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <Header />
        <main className="flex min-h-[70vh] items-center justify-center px-4 pt-28">
          <div className="max-w-xl rounded-[2rem] border border-red-100 bg-white p-8 text-center shadow-2xl shadow-red-100">
            <XCircleIcon className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-5 text-3xl font-black">No podemos abrir este enlace</h1>
            <p className="mt-3 leading-7 text-slate-600">{errorMessage}</p>
            <a href="https://wa.me/34611974984" className="mt-7 inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-emerald-500 px-6 font-black text-white shadow-lg shadow-emerald-200">
              Hablar por WhatsApp
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7fbff] text-slate-950">
      <Header />
      <main className="relative overflow-hidden pt-28">
        <div className="absolute left-[-10rem] top-16 h-96 w-96 rounded-full bg-blue-200/50 blur-3xl" />
        <div className="absolute right-[-8rem] top-52 h-[28rem] w-[28rem] rounded-full bg-emerald-200/40 blur-3xl" />

        <section className="relative mx-auto max-w-7xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-2xl shadow-blue-100/70 backdrop-blur sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">Tu área personal</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                  {hasProposal ? 'Tu propuesta está lista' : 'Estamos analizando tu factura'}
                </h1>
                <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
                  Consulta el estado de tu análisis, tus simulaciones y tu propuesta personalizada.
                </p>
              </div>
              <div className="rounded-3xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Código de seguimiento</p>
                <p className="mt-2 text-3xl font-black">{application?.public_code || 'EC-000000'}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-500">Estado actual</p>
                <p className="mt-2 text-xl font-black">{application?.client_visible_label || 'Solicitud recibida'}</p>
              </div>
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">WhatsApp</p>
                <p className="mt-2 text-xl font-black">{application?.whatsapp_verified ? 'Confirmado' : 'Pendiente'}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">Fecha de recepción</p>
                <p className="mt-2 text-lg font-black">{formatDate(application?.created_at || application?.submission_date)}</p>
              </div>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex min-h-[90px] items-center justify-center gap-3 rounded-3xl bg-emerald-500 px-5 text-center font-black text-white shadow-xl shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-600">
                <WhatsAppIcon className="h-7 w-7" />
                Hablar por WhatsApp
              </a>
            </div>
          </div>

          <section className="mt-8 rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
            <h2 className="flex items-center gap-3 text-2xl font-black">
              <SparklesIcon className="h-7 w-7 text-blue-600" />
              Estado del proceso
            </h2>
            <div className="mt-7 grid gap-4 lg:grid-cols-5">
              {statusSteps.map((step, index) => {
                const isDone = index < activeStatusIndex || (hasProposal && index <= activeStatusIndex);
                const isActive = index === activeStatusIndex && !hasProposal;
                const isProposalStep = step.label === 'Propuesta lista';
                return (
                  <div key={step.label} className={`rounded-3xl border p-5 ${isDone ? 'border-emerald-100 bg-emerald-50' : isActive ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>
                      {isDone ? <CheckCircleIconSolid className="h-5 w-5" /> : isActive ? <span className="h-3 w-3 rounded-full bg-white" /> : index + 1}
                    </div>
                    <p className="mt-4 font-black">{step.label}</p>
                    <p className="mt-1 text-sm text-slate-500">{isDone ? 'Completado' : isActive ? 'En curso' : 'Pendiente'}</p>
                    {isProposalStep && hasProposal && payload?.proposal?.pdf_url && (
                      <a
                        href={payload.proposal.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex min-h-[38px] items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white transition hover:bg-blue-700"
                      >
                        Ver propuesta
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            {needsReview && (
              <div className="mt-6 rounded-3xl border border-amber-100 bg-amber-50 p-5 text-amber-900">
                Estamos revisando algunos datos manualmente. Esto nos ayuda a preparar una propuesta más precisa.
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
              <h2 className="text-2xl font-black">Datos de la solicitud</h2>
              <div className="mt-6 space-y-4">
                {[
                  ['Nombre', payload?.client?.name],
                  ['Teléfono', payload?.client?.phone],
                  ['Email', payload?.client?.email || 'No indicado'],
                  ['Tipo de servicio', payload?.client?.service_type || 'Comparación de electricidad'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
                    <p className="mt-1 font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <h3 className="mt-8 text-xl font-black">Factura subida</h3>
              <div className="mt-4 space-y-3">
                {(payload?.files || []).length > 0 ? payload?.files?.map((file) => (
                  <a key={file.id || file.file_url} href={file.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50">
                    <DocumentIcon className="h-6 w-6 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate font-bold">{file.file_name || 'Factura'}</span>
                    <span className="text-sm text-slate-400">{file.status || 'uploaded'}</span>
                  </a>
                )) : (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-500">No hay archivos visibles.</div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
              <h2 className="text-2xl font-black">Datos detectados</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {fieldLabels.map(([label, keys]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
                    <p className="mt-1 break-words font-bold text-slate-900">
                      {label === 'Periodo de facturación'
                        ? billingPeriodFrom(payload?.extracted_data)
                        : label === 'Consumo estimado'
                        ? consumptionFrom(payload?.extracted_data)
                        : valueFrom(payload?.extracted_data, keys)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="mt-8 rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-3xl font-black">{hasProposal ? 'Propuesta recomendada' : 'Estamos preparando tu propuesta'}</h2>
                <p className="mt-3 max-w-3xl leading-7 text-slate-600">
                  {hasProposal
                    ? 'Hemos preparado una propuesta personalizada. Puedes revisarla, aceptarla o hablar con un asesor.'
                    : 'Te avisaremos por WhatsApp cuando esté lista. Mientras tanto, puedes consultar el avance del análisis aquí.'}
                </p>
              </div>
              {hasProposal && (
                <a href={payload?.proposal?.pdf_url} target="_blank" rel="noreferrer" className="inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-blue-600 px-6 font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">
                  Ver propuesta PDF
                </a>
              )}
            </div>

            {selectedSimulation ? (
              <div className="mt-7 grid gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-500">Proveedor</p>
                  <p className="mt-2 text-xl font-black">{selectedSimulation.new_provider || selectedSimulation.provider_name || 'Pendiente'}</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">Tarifa</p>
                  <p className="mt-2 text-xl font-black">{selectedSimulation.new_tariff || selectedSimulation.tariff_name || 'Pendiente'}</p>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">Ahorro mensual</p>
                  <p className="mt-2 text-2xl font-black">{formatMoney(monthlySavings)}</p>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">Ahorro anual</p>
                  <p className="mt-2 text-2xl font-black">{formatMoney(annualSavings)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-7 rounded-3xl border border-blue-100 bg-blue-50 p-6">
                Aún no hay simulaciones visibles para el cliente.
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {hasProposal && (
                <button
                  onClick={handleAcceptProposal}
                  disabled={acceptState === 'loading' || acceptState === 'done'}
                  className="min-h-[58px] flex-1 rounded-2xl bg-emerald-500 px-6 text-lg font-black text-white shadow-xl shadow-emerald-200 transition hover:bg-emerald-600 disabled:opacity-70"
                >
                  {acceptState === 'loading' ? 'Confirmando...' : acceptState === 'done' ? 'Propuesta aceptada' : 'Aceptar propuesta'}
                </button>
              )}
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[58px] flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-6 text-center text-lg font-black text-emerald-700 transition hover:bg-emerald-50">
                <WhatsAppIcon className="h-5 w-5" />
                Hablar por WhatsApp
              </a>
            </div>
            {acceptState === 'error' && (
              <p className="mt-3 text-sm font-bold text-red-600">No hemos podido registrar la aceptación. Escríbenos por WhatsApp y lo revisamos.</p>
            )}
          </section>

          <section className="mt-8 rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
            <h2 className="flex items-center gap-3 text-2xl font-black">
              <TrustBadgeIcon className="h-7 w-7 text-blue-600" />
              Historial visible
            </h2>
            <div className="mt-6 space-y-3">
              {(payload?.events || []).length > 0 ? payload?.events?.map((event, index) => (
                <div key={event.id || index} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{formatDate(event.created_at)}</p>
                  <p className="mt-1 font-semibold leading-6">{event.message || event.content || 'Actualización de la solicitud.'}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-500">
                  Todavía no hay actualizaciones visibles para el cliente.
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default ClientAreaPage;
