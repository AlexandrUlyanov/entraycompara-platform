import React, { useEffect, useMemo, useState } from 'react';
import Header from './Header.tsx';
import Footer from './Footer.tsx';
import { WhatsAppIcon, CheckCircleIconSolid, DocumentIcon, SparklesIcon, TrustBadgeIcon } from './Icons.tsx';
import { useLanguage } from '../context/LanguageContext.tsx';

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

type PublicStatusResponse = {
  public_code?: string;
  client_visible_status?: string;
  client_visible_label?: string;
  whatsapp_verified?: boolean;
  client_area_enabled?: boolean;
  client_area_url?: string | null;
};

const STORAGE_KEY = 'entraycompara_post_submit';

const PAGE_COPY = {
  es: {
    requestCreated: 'Solicitud creada',
    title: 'Hemos recibido tu factura',
    subtitle: 'Tu análisis ya está en marcha. Estamos revisando tus datos para buscar mejores opciones de ahorro.',
    trackingCode: 'Código de seguimiento',
    receivedAt: 'Recibida el {{date}}',
    caseOpened: 'Tu caso ya está abierto.',
    currentStatus: 'Estado actual',
    safeClose: 'Puedes cerrar esta página. Te avisaremos por WhatsApp cuando el resultado esté listo.',
    reopenTitle: '¿Has cerrado la página de confirmación?',
    reopenSubtitle: 'Puedes consultar el estado limitado con tu código de seguimiento.',
    checkStatus: 'Consultar estado',
    checking: 'Consultando...',
    codePlaceholder: 'EC-482913',
    codeFormatError: 'Introduce un código con formato EC-123456.',
    codeNotFound: 'No encontramos una solicitud con ese código.',
    lookupFailed: 'No hemos podido consultar el estado.',
    whatsapp: 'WhatsApp',
    activateArea: 'Activa tu área personal',
    whatsappHelp: 'Envíanos este código para confirmar tu contacto y recibir el resultado del análisis.',
    activationCode: 'Código de activación',
    activateByWhatsapp: 'Activar mi área personal por WhatsApp',
    missingLink: 'El enlace de activación aparecerá después de enviar una factura desde el formulario.',
    consent: 'Al activar tu área personal por WhatsApp, aceptas recibir comunicaciones relacionadas con tu solicitud.',
    analysisStatus: 'Estado del análisis',
    done: 'Completado',
    active: 'En revisión ahora',
    pending: 'Pendiente',
    nextTitle: '¿Qué pasará ahora?',
    privacyText: 'Tus datos se utilizarán únicamente para analizar tu factura y preparar una propuesta personalizada. Consulta nuestra',
    privacyPolicy: 'Política de privacidad',
    trustItems: ['Análisis gratuito', 'Sin compromiso', 'Datos protegidos', 'Aviso por WhatsApp'],
    timeline: ['Factura recibida', 'Lectura de datos', 'Comparación de tarifas', 'Simulación de ahorro', 'Propuesta preparada'],
    nextSteps: [
      'Revisamos los datos de tu factura actual.',
      'Comparamos opciones disponibles.',
      'Calculamos tu posible ahorro.',
      'Preparamos una propuesta clara.',
      'Tú decides si quieres cambiar o no.',
    ],
  },
  ru: {
    requestCreated: 'Заявка создана',
    title: 'Мы получили ваш счет',
    subtitle: 'Анализ уже начался. Мы проверяем ваши данные, чтобы найти более выгодные варианты.',
    trackingCode: 'Код заявки',
    receivedAt: 'Получено {{date}}',
    caseOpened: 'Ваш кейс уже открыт.',
    currentStatus: 'Текущий статус',
    safeClose: 'Можно закрыть эту страницу. Мы напишем в WhatsApp, когда результат будет готов.',
    reopenTitle: 'Закрыли страницу подтверждения?',
    reopenSubtitle: 'Вы можете проверить статус по коду заявки.',
    checkStatus: 'Проверить статус',
    checking: 'Проверяем...',
    codePlaceholder: 'EC-482913',
    codeFormatError: 'Введите код в формате EC-123456.',
    codeNotFound: 'Заявка с таким кодом не найдена.',
    lookupFailed: 'Не удалось получить статус заявки.',
    whatsapp: 'WhatsApp',
    activateArea: 'Активируйте личный кабинет',
    whatsappHelp: 'Отправьте этот код, чтобы подтвердить контакт и получать статус анализа.',
    activationCode: 'Код активации',
    activateByWhatsapp: 'Активировать личный кабинет через WhatsApp',
    missingLink: 'Ссылка активации появится после отправки счета через форму.',
    consent: 'Активируя личный кабинет через WhatsApp, вы соглашаетесь получать сообщения по вашей заявке.',
    analysisStatus: 'Статус анализа',
    done: 'Готово',
    active: 'Сейчас в работе',
    pending: 'Ожидает',
    nextTitle: 'Что будет дальше?',
    privacyText: 'Ваши данные используются только для анализа счета и подготовки персонального предложения. Смотрите',
    privacyPolicy: 'Политику конфиденциальности',
    trustItems: ['Бесплатный анализ', 'Без обязательств', 'Данные защищены', 'Уведомления в WhatsApp'],
    timeline: ['Счет получен', 'Извлечение данных', 'Сравнение тарифов', 'Симуляция экономии', 'Предложение готовится'],
    nextSteps: [
      'Проверяем данные вашего текущего счета.',
      'Сравниваем доступные варианты.',
      'Рассчитываем возможную экономию.',
      'Готовим понятное предложение.',
      'Вы сами решаете, переходить или нет.',
    ],
  },
  uk: {
    requestCreated: 'Заявку створено',
    title: 'Ми отримали ваш рахунок',
    subtitle: 'Аналіз уже розпочато. Ми перевіряємо ваші дані, щоб знайти вигідніші варіанти.',
    trackingCode: 'Код заявки',
    receivedAt: 'Отримано {{date}}',
    caseOpened: 'Ваш кейс уже відкрито.',
    currentStatus: 'Поточний статус',
    safeClose: 'Можете закрити цю сторінку. Ми повідомимо у WhatsApp, коли результат буде готовий.',
    reopenTitle: 'Закрили сторінку підтвердження?',
    reopenSubtitle: 'Ви можете перевірити статус за кодом заявки.',
    checkStatus: 'Перевірити статус',
    checking: 'Перевіряємо...',
    codePlaceholder: 'EC-482913',
    codeFormatError: 'Введіть код у форматі EC-123456.',
    codeNotFound: 'Заявку з таким кодом не знайдено.',
    lookupFailed: 'Не вдалося отримати статус заявки.',
    whatsapp: 'WhatsApp',
    activateArea: 'Активуйте особистий кабінет',
    whatsappHelp: 'Надішліть цей код, щоб підтвердити контакт і отримувати результат аналізу.',
    activationCode: 'Код активації',
    activateByWhatsapp: 'Активувати кабінет через WhatsApp',
    missingLink: 'Посилання активації зʼявиться після надсилання рахунку через форму.',
    consent: 'Активуючи кабінет через WhatsApp, ви погоджуєтесь отримувати повідомлення щодо заявки.',
    analysisStatus: 'Статус аналізу',
    done: 'Готово',
    active: 'Зараз у роботі',
    pending: 'Очікує',
    nextTitle: 'Що буде далі?',
    privacyText: 'Ваші дані використовуються лише для аналізу рахунку та підготовки персональної пропозиції. Дивіться',
    privacyPolicy: 'Політику конфіденційності',
    trustItems: ['Безкоштовний аналіз', 'Без зобовʼязань', 'Дані захищені', 'Сповіщення у WhatsApp'],
    timeline: ['Рахунок отримано', 'Зчитування даних', 'Порівняння тарифів', 'Симуляція економії', 'Пропозиція готується'],
    nextSteps: [
      'Перевіряємо дані вашого поточного рахунку.',
      'Порівнюємо доступні варіанти.',
      'Рахуємо можливу економію.',
      'Готуємо зрозумілу пропозицію.',
      'Ви самі вирішуєте, переходити чи ні.',
    ],
  },
  eu: {
    requestCreated: 'Eskaria sortuta',
    title: 'Zure faktura jaso dugu',
    subtitle: 'Zure analisia martxan dago. Datuak berrikusten ari gara aurrezki aukerarik onenak bilatzeko.',
    trackingCode: 'Jarraipen kodea',
    receivedAt: 'Jasoa {{date}}',
    caseOpened: 'Zure kasua dagoeneko irekita dago.',
    currentStatus: 'Uneko egoera',
    safeClose: 'Orrialdea itxi dezakezu. WhatsApp bidez jakinaraziko dizugu emaitza prest dagoenean.',
    reopenTitle: 'Baieztapen-orria itxi duzu?',
    reopenSubtitle: 'Egoera mugatua kontsulta dezakezu zure jarraipen kodearekin.',
    checkStatus: 'Egoera kontsultatu',
    checking: 'Kontsultatzen...',
    codePlaceholder: 'EC-482913',
    codeFormatError: 'Sartu kodea EC-123456 formatuan.',
    codeNotFound: 'Ez dugu kode horrekin eskaririk aurkitu.',
    lookupFailed: 'Ezin izan dugu egoera kontsultatu.',
    whatsapp: 'WhatsApp',
    activateArea: 'Aktibatu zure eremu pertsonala',
    whatsappHelp: 'Bidali kode hau zure kontaktua baieztatzeko eta analisiaren emaitza jasotzeko.',
    activationCode: 'Aktibazio kodea',
    activateByWhatsapp: 'Aktibatu nire eremu pertsonala WhatsApp bidez',
    missingLink: 'Aktibazio esteka inprimakitik faktura bidali ondoren agertuko da.',
    consent: 'WhatsApp bidez zure eremu pertsonala aktibatzean, zure eskariarekin lotutako komunikazioak jasotzea onartzen duzu.',
    analysisStatus: 'Analisiaren egoera',
    done: 'Osatuta',
    active: 'Orain berrikusten',
    pending: 'Zain',
    nextTitle: 'Zer gertatuko da orain?',
    privacyText: 'Zure datuak faktura aztertzeko eta proposamen pertsonalizatua prestatzeko bakarrik erabiliko dira. Ikusi gure',
    privacyPolicy: 'Pribatutasun politika',
    trustItems: ['Doako analisia', 'Konpromisorik gabe', 'Datu babestuak', 'WhatsApp abisua'],
    timeline: ['Faktura jasota', 'Datuen irakurketa', 'Tarifen konparazioa', 'Aurrezki simulazioa', 'Proposamena prestatua'],
    nextSteps: [
      'Zure egungo fakturaren datuak berrikusten ditugu.',
      'Aukera eskuragarriak konparatzen ditugu.',
      'Zure aurrezki posiblea kalkulatzen dugu.',
      'Proposamen argia prestatzen dugu.',
      'Aldatu nahi duzun ala ez, zuk erabakitzen duzu.',
    ],
  },
} as const;

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
  const { language } = useLanguage();
  const copy = PAGE_COPY[(language as keyof typeof PAGE_COPY)] || PAGE_COPY.es;
  const [payload, setPayload] = useState<PostSubmitPayload | null>(null);
  const [trackingCode, setTrackingCode] = useState('');
  const [statusLookup, setStatusLookup] = useState<any | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [isLookupLoading, setIsLookupLoading] = useState(false);

  useEffect(() => {
    setPayload(getStoredPayload());
  }, []);

  useEffect(() => {
    const publicCode = payload?.application?.public_code;
    if (!publicCode) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/application/status/${encodeURIComponent(publicCode)}`);
        if (!response.ok) return;
        const status: PublicStatusResponse = await response.json();
        if (status?.client_area_enabled && status?.client_area_url) {
          window.location.href = status.client_area_url;
        }
      } catch {
        // Silent polling fail; user can still continue manually.
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [payload?.application?.public_code]);

  const application = payload?.application;
  const verificationDisplay = application?.verification_code_display || application?.verification_code || '--- ---';
  const statusLabel = application?.client_visible_label || copy.timeline[0];

  const createdAtLabel = useMemo(() => {
    if (!application?.created_at) return '';
    try {
      const localeByLang: Record<string, string> = { es: 'es-ES', ru: 'ru-RU', uk: 'uk-UA', eu: 'eu-ES' };
      return new Intl.DateTimeFormat(localeByLang[language] || 'es-ES', {
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
      setLookupError(copy.codeFormatError);
      return;
    }

    setIsLookupLoading(true);
    try {
      const response = await fetch(`https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/application/status/${encodeURIComponent(code)}`);
      if (!response.ok) {
        throw new Error(copy.codeNotFound);
      }
      setStatusLookup(await response.json());
    } catch (error: any) {
      setLookupError(error?.message || copy.lookupFailed);
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
                {copy.requestCreated}
              </div>
              <h1 className="max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                {copy.title}
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                {copy.subtitle}
              </p>

              {application ? (
                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-500">{copy.trackingCode}</p>
                    <p className="mt-3 text-4xl font-black tracking-tight text-blue-700">{application.public_code}</p>
                    <p className="mt-3 text-sm text-slate-500">{createdAtLabel ? copy.receivedAt.replace('{{date}}', createdAtLabel) : copy.caseOpened}</p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{copy.currentStatus}</p>
                    <p className="mt-3 text-2xl font-black text-slate-950">{statusLabel}</p>
                    <p className="mt-3 text-sm text-slate-500">{copy.safeClose}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-6">
                  <p className="font-bold text-amber-900">{copy.reopenTitle}</p>
                  <p className="mt-2 text-sm text-amber-800">{copy.reopenSubtitle}</p>
                  <form onSubmit={handleLookup} className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      value={trackingCode}
                      onChange={(event) => setTrackingCode(event.target.value)}
                      placeholder={copy.codePlaceholder}
                      className="min-h-[52px] flex-1 rounded-2xl border border-amber-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
                    />
                    <button className="min-h-[52px] rounded-2xl bg-blue-600 px-6 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700" disabled={isLookupLoading}>
                      {isLookupLoading ? copy.checking : copy.checkStatus}
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
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-600">{copy.whatsapp}</p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">{copy.activateArea}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {copy.whatsappHelp}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl bg-slate-950 p-6 text-center text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">{copy.activationCode}</p>
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
                    {copy.activateByWhatsapp}
                  </a>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    {copy.missingLink}
                  </div>
                )}

                <p className="mt-4 text-xs leading-5 text-slate-500">
                  {copy.consent}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {copy.trustItems.map((item) => (
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
                {copy.analysisStatus}
              </h2>
              <div className="mt-7 space-y-4">
                {copy.timeline.map((stepLabel, index) => (
                  <div key={`${index}-${stepLabel}`} className="flex items-center gap-4">
                    <StatusDot state={index === 0 ? 'done' : index === 1 ? 'active' : 'pending'} index={index} />
                    <div className="flex-1 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
                      <p className="font-bold text-slate-900">{stepLabel}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {index === 0 ? copy.done : index === 1 ? copy.active : copy.pending}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white bg-white/85 p-7 shadow-xl shadow-blue-100/50">
              <h2 className="flex items-center gap-3 text-2xl font-black text-slate-950">
                <DocumentIcon className="h-7 w-7 text-blue-600" />
                {copy.nextTitle}
              </h2>
              <div className="mt-7 grid gap-4 sm:grid-cols-2">
                {copy.nextSteps.map((item, index) => (
                  <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <p className="text-sm font-black text-blue-600">0{index + 1}</p>
                    <p className="mt-2 font-semibold leading-6 text-slate-800">{item}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                {copy.privacyText}{' '}
                <a href="#/privacy-policy" className="font-bold underline">{copy.privacyPolicy}</a>.
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
