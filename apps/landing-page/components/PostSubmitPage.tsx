import React, { useEffect, useMemo, useState } from 'react';
import Header from './Header.tsx';
import Footer from './Footer.tsx';
import { WhatsAppIcon, CheckCircleIconSolid, DocumentIcon, SparklesIcon, TrustBadgeIcon } from './Icons.tsx';

type PostSubmitApplication = {
  id?: string;
  public_code?: string;
  verification_code?: string;
  verification_code_display?: string;
  client_visible_label?: string;
  whatsapp_url?: string;
  created_at?: string;
  verification_code_expires_at?: string;
};

type PostSubmitPayload = {
  application?: PostSubmitApplication;
};

const STORAGE_KEY = 'entraycompara_post_submit';

const timelineSteps = [
  { key: 'received', label: 'Factura recibida', state: 'done' },
  { key: 'reading', label: 'Lectura de datos', state: 'active' },
  { key: 'compare', label: 'Comparación de tarifas', state: 'pending' },
  { key: 'simulation', label: 'Simulación de ahorro', state: 'pending' },
  { key: 'proposal', label: 'Propuesta preparada', state: 'pending' },
];

const trustItems = [
  'Análisis gratuito',
  'Sin compromiso',
  'Datos protegidos',
  'Aviso por WhatsApp',
];

export function savePostSubmitPayload(payload: PostSubmitPayload) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('No se pudo guardar el estado de solicitud recibida.', error);
  }
}

const getStoredPayload = (): PostSubmitPayload | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('No se pudo leer el estado de solicitud recibida.', error);
    return null;
  }
};

const StatusDot: React.FC<{ state: string; index: number }> = ({ state, index }) => {
  if (state === 'done') {
    return (
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
        <CheckCircleIconSolid className="h-5 w-5" />
      </span>
    );
  }

  if (state === 'active') {
    return (
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200">
        <span className="absolute h-full w-full animate-ping rounded-full bg-blue-400 opacity-30" />
        <span className="relative h-3 w-3 rounded-full bg-white" />
      </span>
    );
  }

  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-400">
      {index + 1}
    </span>
  );
};

const PostSubmitPage: React.FC = () => {
  const [payload, setPayload] = useState<PostSubmitPayload | null>(null);
  const [trackingCode, setTrackingCode] = useState('');
  const [statusLookup, setStatusLookup] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  useEffect(() => {
    setPayload(getStoredPayload());
  }, []);

  const application = payload?.application;
  const verificationDisplay = application?.verification_code_display || application?.verification_code || '--- ---';
  const statusLabel = application?.client_visible_label || 'Factura recibida';

  const createdAtLabel = useMemo(() => {
    if (!application?.created_at) return '';
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(application.created_at));
    } catch {
      return '';
    }
  }, [application?.created_at]);

  const handleLookup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLookupError('');
    setStatusLookup(null);
    const code = trackingCode.trim().toUpperCase();
    if (!/^EC-\d{6}$/.test(code)) {
      setLookupError('Introduce un código con formato EC-123456.');
      return;
    }

    setIsLookupLoading(true);
    try {
      const response = await fetch(`https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/application/status/${encodeURIComponent(code)}`);
      if (!response.ok) {
        throw new Error('No encontramos una solicitud con ese código.');
      }
      setStatusLookup(await response.json());
    } catch (error: any) {
      setLookupError(error?.message || 'No hemos podido consultar el estado.');
    } finally {
      setIsLookupLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7fbff] text-slate-950">
      <Header />
      <main className="relative overflow-hidden pt-28">
        <div className="absolute left-[-10rem] top-20 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute right-[-8rem] top-40 h-[28rem] w-[28rem] rounded-full bg-blue-200/50 blur-3xl" />

        <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="rounded-[2rem] border border-white/70 bg-white/85 p-7 shadow-2xl shadow-blue-100/70 backdrop-blur sm:p-10">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 ring-1 ring-emerald-100">
                <CheckCircleIconSolid className="h-5 w-5" />
                Solicitud creada
              </div>
              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                Hemos recibido tu factura
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                Tu análisis ya está en marcha. Estamos revisando tus datos para buscar mejores opciones de ahorro.
              </p>

              {application ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">Código de seguimiento</p>
                    <p className="mt-3 text-4xl font-black tracking-tight text-blue-700">{application.public_code}</p>
                    <p className="mt-3 text-sm text-slate-500">{createdAtLabel ? `Recibida el ${createdAtLabel}` : 'Tu caso ya está abierto.'}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Estado actual</p>
                    <p className="mt-3 text-2xl font-black text-slate-950">{statusLabel}</p>
                    <p className="mt-3 text-sm text-slate-500">Puedes cerrar esta página. Te avisaremos por WhatsApp cuando el resultado esté listo.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6">
                  <p className="font-bold text-amber-900">¿Has cerrado la página de confirmación?</p>
                  <p className="mt-2 text-sm text-amber-800">Puedes consultar el estado limitado con tu código de seguimiento.</p>
                  <form onSubmit={handleLookup} className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={trackingCode}
                      onChange={(event) => setTrackingCode(event.target.value)}
                      placeholder="EC-482913"
                      className="min-h-[52px] flex-1 rounded-2xl border border-amber-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    />
                    <button className="min-h-[52px] rounded-2xl bg-blue-600 px-6 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700" disabled={isLookupLoading}>
                      {isLookupLoading ? 'Consultando...' : 'Consultar estado'}
                    </button>
                  </form>
                  {lookupError && <p className="mt-3 text-sm font-semibold text-red-600">{lookupError}</p>}
                  {statusLookup && (
                    <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-700">
                      <strong>{statusLookup.public_code}</strong>: {statusLookup.client_visible_label}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="rounded-[2rem] border border-emerald-100 bg-white p-7 shadow-2xl shadow-emerald-100/60">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-200">
                    <WhatsAppIcon className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">WhatsApp</p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">Activa tu área personal</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Envíanos este código para confirmar tu contacto y recibir el resultado del análisis.
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-slate-950 p-6 text-center text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Código de activación</p>
                  <p className="mt-2 text-5xl font-black tracking-[0.08em]">{verificationDisplay}</p>
                </div>

                {application?.whatsapp_url ? (
                  <a
                    href={application.whatsapp_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 flex min-h-[58px] items-center justify-center gap-3 rounded-2xl bg-emerald-500 px-5 text-center text-base font-black text-white shadow-xl shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-600"
                  >
                    <WhatsAppIcon className="h-6 w-6" />
                    Activar mi área personal por WhatsApp
                  </a>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    El enlace de activación aparecerá después de enviar una factura desde el formulario.
                  </div>
                )}

                <p className="mt-4 text-xs leading-5 text-slate-500">
                  Al activar tu área personal por WhatsApp, aceptas recibir comunicaciones relacionadas con tu solicitud.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {trustItems.map((item) => (
                  <div key={item} className="rounded-2xl border border-white bg-white/80 p-4 shadow-lg shadow-blue-100/40">
                    <TrustBadgeIcon className="mb-2 h-6 w-6 text-blue-600" />
                    <p className="text-sm font-bold text-slate-800">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="rounded-[2rem] border border-white bg-white/85 p-7 shadow-xl shadow-blue-100/50">
              <h2 className="flex items-center gap-3 text-2xl font-black text-slate-950">
                <SparklesIcon className="h-7 w-7 text-blue-600" />
                Estado del análisis
              </h2>
              <div className="mt-7 space-y-4">
                {timelineSteps.map((step, index) => (
                  <div key={step.key} className="flex items-center gap-4">
                    <StatusDot state={step.state} index={index} />
                    <div className="flex-1 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
                      <p className="font-bold text-slate-900">{step.label}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {step.state === 'done' ? 'Completado' : step.state === 'active' ? 'En revisión ahora' : 'Pendiente'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white bg-white/85 p-7 shadow-xl shadow-blue-100/50">
              <h2 className="flex items-center gap-3 text-2xl font-black text-slate-950">
                <DocumentIcon className="h-7 w-7 text-blue-600" />
                ¿Qué pasará ahora?
              </h2>
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                {[
                  'Revisamos los datos de tu factura actual.',
                  'Comparamos opciones disponibles.',
                  'Calculamos tu posible ahorro.',
                  'Preparamos una propuesta clara.',
                  'Tú decides si quieres cambiar o no.',
                ].map((item, index) => (
                  <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <p className="text-sm font-black text-blue-600">0{index + 1}</p>
                    <p className="mt-2 font-semibold leading-6 text-slate-800">{item}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                Tus datos se utilizarán únicamente para analizar tu factura y preparar una propuesta personalizada.
                Consulta nuestra <a href="#/privacy-policy" className="font-bold underline">Política de privacidad</a>.
              </p>
            </section>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default PostSubmitPage;
