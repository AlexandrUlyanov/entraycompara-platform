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
import { useLanguage } from '../context/LanguageContext.tsx';

const API_BASE_URL = 'https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api';

const CLIENT_AREA_COPY = {
  es: {
    openArea: 'Abriendo tu área personal',
    loadingState: 'Estamos cargando el estado de tu solicitud.',
    cannotOpen: 'No podemos abrir este enlace',
    invalidLink: 'El enlace no es válido o ha caducado.',
    missingToken: 'Falta el token seguro de acceso.',
    talkWhatsApp: 'Hablar por WhatsApp',
    personalArea: 'Tu área personal',
    proposalReady: 'Tu propuesta está lista',
    analyzing: 'Estamos analizando tu factura',
    intro: 'Consulta el estado de tu análisis, tus simulaciones y tu propuesta personalizada.',
    trackingCode: 'Código de seguimiento',
    currentStatus: 'Estado actual',
    requestReceived: 'Solicitud recibida',
    whatsapp: 'WhatsApp',
    confirmed: 'Confirmado',
    pending: 'Pendiente',
    receivedAt: 'Fecha de recepción',
    processStatus: 'Estado del proceso',
    done: 'Completado',
    inProgress: 'En curso',
    pendingShort: 'Pendiente',
    viewProposal: 'Ver propuesta',
    manualReview: 'Estamos revisando algunos datos manualmente. Esto nos ayuda a preparar una propuesta más precisa.',
    applicationData: 'Datos de la solicitud',
    name: 'Nombre',
    phone: 'Teléfono',
    email: 'Email',
    notProvided: 'No indicado',
    serviceType: 'Tipo de servicio',
    electricityComparison: 'Comparación de electricidad',
    uploadedInvoice: 'Factura subida',
    invoice: 'Factura',
    uploaded: 'uploaded',
    noFiles: 'No hay archivos visibles.',
    detectedData: 'Datos detectados',
    recommendedTitle: 'Propuesta recomendada',
    preparingProposal: 'Estamos preparando tu propuesta',
    recommendedDesc: 'Hemos preparado una propuesta personalizada. Puedes revisarla, aceptarla o hablar con un asesor.',
    preparingDesc: 'Te avisaremos por WhatsApp cuando esté lista. Mientras tanto, puedes consultar el avance del análisis aquí.',
    viewProposalPdf: 'Ver propuesta PDF',
    provider: 'Proveedor',
    tariff: 'Tarifa',
    monthlySaving: 'Ahorro mensual',
    annualSaving: 'Ahorro anual',
    noSimulations: 'Aún no hay simulaciones visibles para el cliente.',
    confirming: 'Confirmando...',
    accepted: 'Propuesta aceptada',
    acceptProposal: 'Aceptar propuesta',
    acceptError: 'No hemos podido registrar la aceptación. Escríbenos por WhatsApp y lo revisamos.',
    history: 'Historial visible',
    updateFallback: 'Actualización de la solicitud.',
    noUpdates: 'Todavía no hay actualizaciones visibles para el cliente.',
  },
  ru: {
    openArea: 'Открываем личный кабинет',
    loadingState: 'Загружаем статус вашей заявки.',
    cannotOpen: 'Не удается открыть ссылку',
    invalidLink: 'Ссылка недействительна или истекла.',
    missingToken: 'Отсутствует безопасный токен доступа.',
    talkWhatsApp: 'Написать в WhatsApp',
    personalArea: 'Личный кабинет',
    proposalReady: 'Ваше предложение готово',
    analyzing: 'Мы анализируем ваш счет',
    intro: 'Здесь вы можете видеть статус анализа, симуляции и персональное предложение.',
    trackingCode: 'Код заявки',
    currentStatus: 'Текущий статус',
    requestReceived: 'Заявка получена',
    whatsapp: 'WhatsApp',
    confirmed: 'Подтвержден',
    pending: 'Ожидает',
    receivedAt: 'Дата получения',
    processStatus: 'Статус процесса',
    done: 'Готово',
    inProgress: 'В работе',
    pendingShort: 'Ожидает',
    viewProposal: 'Смотреть КП',
    manualReview: 'Мы вручную проверяем часть данных, чтобы подготовить более точное предложение.',
    applicationData: 'Данные заявки',
    name: 'Имя',
    phone: 'Телефон',
    email: 'Email',
    notProvided: 'Не указано',
    serviceType: 'Тип услуги',
    electricityComparison: 'Сравнение электроэнергии',
    uploadedInvoice: 'Загруженный счет',
    invoice: 'Счет',
    uploaded: 'загружен',
    noFiles: 'Файлы пока не отображаются.',
    detectedData: 'Распознанные данные',
    recommendedTitle: 'Рекомендованное предложение',
    preparingProposal: 'Мы готовим ваше предложение',
    recommendedDesc: 'Мы подготовили персональное предложение. Вы можете посмотреть его, принять или написать менеджеру.',
    preparingDesc: 'Мы уведомим вас в WhatsApp, когда оно будет готово. Пока вы можете отслеживать прогресс здесь.',
    viewProposalPdf: 'Открыть КП PDF',
    provider: 'Поставщик',
    tariff: 'Тариф',
    monthlySaving: 'Экономия в месяц',
    annualSaving: 'Экономия в год',
    noSimulations: 'Пока нет симуляций для отображения клиенту.',
    confirming: 'Подтверждаем...',
    accepted: 'Предложение принято',
    acceptProposal: 'Принять предложение',
    acceptError: 'Не удалось зафиксировать принятие. Напишите нам в WhatsApp, и мы проверим.',
    history: 'История',
    updateFallback: 'Обновление по заявке.',
    noUpdates: 'Пока нет обновлений для клиента.',
  },
  uk: {
    openArea: 'Відкриваємо особистий кабінет',
    loadingState: 'Завантажуємо статус вашої заявки.',
    cannotOpen: 'Не вдалося відкрити посилання',
    invalidLink: 'Посилання недійсне або вже недоступне.',
    missingToken: 'Відсутній безпечний токен доступу.',
    talkWhatsApp: 'Написати у WhatsApp',
    personalArea: 'Особистий кабінет',
    proposalReady: 'Ваша пропозиція готова',
    analyzing: 'Ми аналізуємо ваш рахунок',
    intro: 'Тут ви можете бачити статус аналізу, симуляції та персональну пропозицію.',
    trackingCode: 'Код заявки',
    currentStatus: 'Поточний статус',
    requestReceived: 'Заявку отримано',
    whatsapp: 'WhatsApp',
    confirmed: 'Підтверджено',
    pending: 'Очікує',
    receivedAt: 'Дата отримання',
    processStatus: 'Статус процесу',
    done: 'Готово',
    inProgress: 'У роботі',
    pendingShort: 'Очікує',
    viewProposal: 'Переглянути КП',
    manualReview: 'Ми вручну перевіряємо частину даних, щоб підготувати точнішу пропозицію.',
    applicationData: 'Дані заявки',
    name: "Ім'я",
    phone: 'Телефон',
    email: 'Email',
    notProvided: 'Не вказано',
    serviceType: 'Тип послуги',
    electricityComparison: 'Порівняння електроенергії',
    uploadedInvoice: 'Завантажений рахунок',
    invoice: 'Рахунок',
    uploaded: 'завантажено',
    noFiles: 'Файли поки не відображаються.',
    detectedData: 'Розпізнані дані',
    recommendedTitle: 'Рекомендована пропозиція',
    preparingProposal: 'Ми готуємо вашу пропозицію',
    recommendedDesc: 'Ми підготували персональну пропозицію. Ви можете переглянути її, прийняти або написати менеджеру.',
    preparingDesc: 'Ми повідомимо у WhatsApp, коли вона буде готова. Поки можна відстежувати прогрес тут.',
    viewProposalPdf: 'Відкрити КП PDF',
    provider: 'Постачальник',
    tariff: 'Тариф',
    monthlySaving: 'Економія на місяць',
    annualSaving: 'Економія на рік',
    noSimulations: 'Поки немає симуляцій для показу клієнту.',
    confirming: 'Підтверджуємо...',
    accepted: 'Пропозицію прийнято',
    acceptProposal: 'Прийняти пропозицію',
    acceptError: 'Не вдалося зафіксувати прийняття. Напишіть нам у WhatsApp, і ми перевіримо.',
    history: 'Історія',
    updateFallback: 'Оновлення заявки.',
    noUpdates: 'Поки немає оновлень для клієнта.',
  },
  eu: {
    openArea: 'Zure eremu pertsonala irekitzen',
    loadingState: 'Zure eskariaren egoera kargatzen ari gara.',
    cannotOpen: 'Ezin dugu esteka hau ireki',
    invalidLink: 'Esteka ez da baliozkoa edo iraungi da.',
    missingToken: 'Sarbide token segurua falta da.',
    talkWhatsApp: 'WhatsApp bidez hitz egin',
    personalArea: 'Zure eremu pertsonala',
    proposalReady: 'Zure proposamena prest dago',
    analyzing: 'Zure faktura aztertzen ari gara',
    intro: 'Hemen ikus dezakezu analisiaren egoera, simulazioak eta proposamen pertsonalizatua.',
    trackingCode: 'Jarraipen kodea',
    currentStatus: 'Uneko egoera',
    requestReceived: 'Eskaria jasota',
    whatsapp: 'WhatsApp',
    confirmed: 'Baieztatua',
    pending: 'Zain',
    receivedAt: 'Jasotze-data',
    processStatus: 'Prozesuaren egoera',
    done: 'Osatuta',
    inProgress: 'Martxan',
    pendingShort: 'Zain',
    viewProposal: 'Proposamena ikusi',
    manualReview: 'Datu batzuk eskuz berrikusten ari gara proposamen zehatzagoa prestatzeko.',
    applicationData: 'Eskariaren datuak',
    name: 'Izena',
    phone: 'Telefonoa',
    email: 'Emaila',
    notProvided: 'Adierazi gabe',
    serviceType: 'Zerbitzu mota',
    electricityComparison: 'Elektrizitate konparazioa',
    uploadedInvoice: 'Igotako faktura',
    invoice: 'Faktura',
    uploaded: 'igota',
    noFiles: 'Ez dago fitxategirik ikusgai.',
    detectedData: 'Detektatutako datuak',
    recommendedTitle: 'Gomendatutako proposamena',
    preparingProposal: 'Zure proposamena prestatzen ari gara',
    recommendedDesc: 'Proposamen pertsonalizatua prestatu dugu. Berrikusi, onartu edo aholkulariarekin hitz egin dezakezu.',
    preparingDesc: 'WhatsApp bidez abisatuko dizugu prest dagoenean. Bien bitartean, aurrerapena hemen ikus dezakezu.',
    viewProposalPdf: 'Proposamena PDF ikusi',
    provider: 'Hornitzailea',
    tariff: 'Tarifa',
    monthlySaving: 'Hileko aurrezkia',
    annualSaving: 'Urteko aurrezkia',
    noSimulations: 'Oraindik ez dago bezeroarentzat simulaziorik ikusgai.',
    confirming: 'Baieztatzen...',
    accepted: 'Proposamena onartuta',
    acceptProposal: 'Proposamena onartu',
    acceptError: 'Ezin izan dugu onarpena erregistratu. Idatzi WhatsApp bidez eta berrikusiko dugu.',
    history: 'Historia ikusgarria',
    updateFallback: 'Eskariaren eguneraketa.',
    noUpdates: 'Oraindik ez dago bezeroari erakusteko eguneraketarik.',
  },
} as const;

const STATUS_STEP_LABELS = {
  es: ['Factura recibida', 'Datos detectados', 'Comparación de tarifas', 'Simulación preparada', 'Propuesta lista'],
  ru: ['Счет получен', 'Данные распознаны', 'Сравнение тарифов', 'Симуляция готова', 'Предложение готово'],
  uk: ['Рахунок отримано', 'Дані розпізнано', 'Порівняння тарифів', 'Симуляцію підготовлено', 'Пропозиція готова'],
  eu: ['Faktura jasota', 'Datuak detektatuta', 'Tarifen konparazioa', 'Simulazioa prestatuta', 'Proposamena prest'],
} as const;

const FIELD_LABELS = {
  es: {
    supplier: 'Comercializadora actual',
    cups: 'CUPS',
    tariff: 'Tarifa actual',
    power: 'Potencia contratada',
    consumption: 'Consumo estimado',
    invoice_amount: 'Importe factura',
    billing_period: 'Periodo de facturación',
  },
  ru: {
    supplier: 'Текущий поставщик',
    cups: 'CUPS',
    tariff: 'Текущий тариф',
    power: 'Подключенная мощность',
    consumption: 'Оценка потребления',
    invoice_amount: 'Сумма счета',
    billing_period: 'Период счета',
  },
  uk: {
    supplier: 'Поточний постачальник',
    cups: 'CUPS',
    tariff: 'Поточний тариф',
    power: 'Підключена потужність',
    consumption: 'Оцінка споживання',
    invoice_amount: 'Сума рахунку',
    billing_period: 'Період рахунку',
  },
  eu: {
    supplier: 'Egungo hornitzailea',
    cups: 'CUPS',
    tariff: 'Egungo tarifa',
    power: 'Kontratatutako potentzia',
    consumption: 'Kalkulatutako kontsumoa',
    invoice_amount: 'Fakturaren zenbatekoa',
    billing_period: 'Fakturazio epea',
  },
} as const;

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
  { id: 'invoice_received', keys: ['invoice_uploaded', 'new_lead'] },
  { id: 'data_detected', keys: ['invoice_processing', 'data_extracted', 'needs_review'] },
  { id: 'comparison', keys: ['comparison_in_progress'] },
  { id: 'simulation', keys: ['simulation_ready'] },
  { id: 'proposal_ready', keys: ['proposal_ready', 'proposal_sent', 'proposal_accepted', 'switching_in_progress', 'completed'] },
];

const fieldLabels: Array<{ id: string; keys: string[] }> = [
  { id: 'supplier', keys: ['retailer', 'supplier_name', 'current_supplier'] },
  { id: 'cups', keys: ['cups'] },
  { id: 'tariff', keys: ['access_tariff', 'tariff_name'] },
  { id: 'power', keys: ['contracted_power', 'billed_power_p1', 'billed_power_p2'] },
  { id: 'consumption', keys: ['energy_consumption_kwh', 'consumption_p1', 'consumption_p2', 'consumption_p3'] },
  { id: 'invoice_amount', keys: ['invoice_amount_with_vat', 'total_amount'] },
  { id: 'billing_period', keys: ['billing_period', 'start_date', 'end_date', 'billing_period_start', 'billing_period_end'] },
];

const formatDate = (value?: string, language: string = 'es') => {
  if (!value) return 'Pendiente';
  try {
    const localeByLang: Record<string, string> = { es: 'es-ES', ru: 'ru-RU', uk: 'uk-UA', eu: 'eu-ES' };
    return new Intl.DateTimeFormat(localeByLang[language] || 'es-ES', {
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

const formatMoney = (value: any, language: string = 'es') => {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return value ? String(value) : 'Pendiente';
  const localeByLang: Record<string, string> = { es: 'es-ES', ru: 'ru-RU', uk: 'uk-UA', eu: 'eu-ES' };
  return new Intl.NumberFormat(localeByLang[language] || 'es-ES', { style: 'currency', currency: 'EUR' }).format(numeric);
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
  const { language } = useLanguage();
  const copy = CLIENT_AREA_COPY[(language as keyof typeof CLIENT_AREA_COPY)] || CLIENT_AREA_COPY.es;
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
          throw new Error(copy.cannotOpen);
        }
        const data = await response.json();
        if (isMounted) {
          setPayload(data);
          setLoadState('ready');
        }
      } catch (error: any) {
        if (isMounted) {
          setErrorMessage(error?.message || copy.invalidLink);
          setLoadState('error');
        }
      }
    };

    if (token) {
      loadClientArea();
    } else {
      setLoadState('error');
      setErrorMessage(copy.missingToken);
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
      selectedSimulation.savings_monthly,
      selectedSimulation.monthly_saving,
      selectedSimulation.monthly_savings,
      selectedSimulation.monthly_saving_eur,
      selectedSimulation.estimated_monthly_saving,
      selectedSimulation.estimated_savings_monthly,
      selectedSimulation.ahorro_mensual,
      selectedSimulation.ahorro_mensual_eur,
    );
    const currentMonthly = firstFinite(
      payload?.extracted_data?.avg_monthly_cost_eur,
      payload?.extracted_data?.monthly_cost_eur,
      selectedSimulation.current_monthly_cost,
      selectedSimulation.current_monthly_cost_eur,
    );
    const newMonthly = firstFinite(
      selectedSimulation.new_monthly_cost_eur,
      selectedSimulation.new_monthly_cost,
      selectedSimulation.estimated_monthly_cost,
      selectedSimulation.estimated_monthly_cost_eur,
    );
    const computed = currentMonthly !== null && newMonthly !== null
      ? Math.max(0, currentMonthly - newMonthly)
      : null;
    if (direct !== null && direct > 0) return direct;
    if (computed !== null && computed > 0) return computed;
    if (direct !== null) return direct;
    if (computed !== null) return computed;
    return null;
  }, [selectedSimulation, payload?.extracted_data]);
  const annualSavings = useMemo(() => {
    if (!selectedSimulation) return null;
    const direct = firstFinite(
      selectedSimulation.annual_saving,
      selectedSimulation.annual_savings,
      selectedSimulation.savings_annual_eur,
      selectedSimulation.estimated_annual_saving,
      selectedSimulation.estimated_savings_annual,
      selectedSimulation.ahorro_anual,
      selectedSimulation.ahorro_anual_eur,
    );
    const computed = monthlySavings !== null ? monthlySavings * 12 : null;
    if (direct !== null && direct > 0) return direct;
    if (computed !== null && computed > 0) return computed;
    if (direct !== null) return direct;
    return computed;
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
        throw new Error(copy.acceptError);
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
            <h1 className="mt-5 text-2xl font-black">{copy.openArea}</h1>
            <p className="mt-2 text-slate-500">{copy.loadingState}</p>
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
            <h1 className="mt-5 text-3xl font-black">{copy.cannotOpen}</h1>
            <p className="mt-3 leading-7 text-slate-600">{errorMessage}</p>
            <a href="https://wa.me/34611974984" className="mt-7 inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-emerald-500 px-6 font-black text-white shadow-lg shadow-emerald-200">
              {copy.talkWhatsApp}
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
                <p className="text-sm font-black uppercase tracking-[0.18em] text-blue-600">{copy.personalArea}</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                  {hasProposal ? copy.proposalReady : copy.analyzing}
                </h1>
                <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
                  {copy.intro}
                </p>
              </div>
              <div className="rounded-3xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-300">{copy.trackingCode}</p>
                <p className="mt-2 text-3xl font-black">{application?.public_code || 'EC-000000'}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-4">
              <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-500">{copy.currentStatus}</p>
                <p className="mt-2 text-xl font-black">{application?.client_visible_label || copy.requestReceived}</p>
              </div>
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">{copy.whatsapp}</p>
                <p className="mt-2 text-xl font-black">{application?.whatsapp_verified ? copy.confirmed : copy.pending}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{copy.receivedAt}</p>
                <p className="mt-2 text-lg font-black">{formatDate(application?.created_at || application?.submission_date, language)}</p>
              </div>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex min-h-[90px] items-center justify-center gap-3 rounded-3xl bg-emerald-500 px-5 text-center font-black text-white shadow-xl shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-600">
                <WhatsAppIcon className="h-7 w-7" />
                {copy.talkWhatsApp}
              </a>
            </div>
          </div>

          <section className="mt-8 rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
            <h2 className="flex items-center gap-3 text-2xl font-black">
              <SparklesIcon className="h-7 w-7 text-blue-600" />
              {copy.processStatus}
            </h2>
            <div className="mt-7 grid gap-4 lg:grid-cols-5">
              {statusSteps.map((step, index) => {
                const isDone = index < activeStatusIndex || (hasProposal && index <= activeStatusIndex);
                const isActive = index === activeStatusIndex && !hasProposal;
                const statusLabels = STATUS_STEP_LABELS[(language as keyof typeof STATUS_STEP_LABELS)] || STATUS_STEP_LABELS.es;
                const stepLabel = statusLabels[index] || statusLabels[0];
                const isProposalStep = step.id === 'proposal_ready';
                return (
                  <div key={step.id} className={`rounded-3xl border p-5 ${isDone ? 'border-emerald-100 bg-emerald-50' : isActive ? 'border-blue-100 bg-blue-50' : 'border-slate-100 bg-slate-50'}`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-600 text-white' : 'bg-white text-slate-400'}`}>
                      {isDone ? <CheckCircleIconSolid className="h-5 w-5" /> : isActive ? <span className="h-3 w-3 rounded-full bg-white" /> : index + 1}
                    </div>
                    <p className="mt-4 font-black">{stepLabel}</p>
                    <p className="mt-1 text-sm text-slate-500">{isDone ? copy.done : isActive ? copy.inProgress : copy.pendingShort}</p>
                    {isProposalStep && hasProposal && payload?.proposal?.pdf_url && (
                      <a
                        href={payload.proposal.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex min-h-[38px] items-center justify-center rounded-xl bg-blue-600 px-3 text-xs font-black text-white transition hover:bg-blue-700"
                      >
                        {copy.viewProposal}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
            {needsReview && (
              <div className="mt-6 rounded-3xl border border-amber-100 bg-amber-50 p-5 text-amber-900">
                {copy.manualReview}
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
              <h2 className="text-2xl font-black">{copy.applicationData}</h2>
              <div className="mt-6 space-y-4">
                {[
                  [copy.name, payload?.client?.name],
                  [copy.phone, payload?.client?.phone],
                  [copy.email, payload?.client?.email || copy.notProvided],
                  [copy.serviceType, payload?.client?.service_type || copy.electricityComparison],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
                    <p className="mt-1 font-bold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <h3 className="mt-8 text-xl font-black">{copy.uploadedInvoice}</h3>
              <div className="mt-4 space-y-3">
                {(payload?.files || []).length > 0 ? payload?.files?.map((file) => (
                  <a key={file.id || file.file_url} href={file.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50">
                    <DocumentIcon className="h-6 w-6 text-blue-600" />
                    <span className="min-w-0 flex-1 truncate font-bold">{file.file_name || copy.invoice}</span>
                    <span className="text-sm text-slate-400">{file.status || copy.uploaded}</span>
                  </a>
                )) : (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-500">{copy.noFiles}</div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
              <h2 className="text-2xl font-black">{copy.detectedData}</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {fieldLabels.map((field) => {
                  const labelsByLang = FIELD_LABELS[(language as keyof typeof FIELD_LABELS)] || FIELD_LABELS.es;
                  const label = labelsByLang[field.id as keyof typeof labelsByLang] || field.id;
                  return (
                  <div key={field.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{label}</p>
                    <p className="mt-1 break-words font-bold text-slate-900">
                      {field.id === 'billing_period'
                        ? billingPeriodFrom(payload?.extracted_data)
                        : field.id === 'consumption'
                        ? consumptionFrom(payload?.extracted_data)
                        : valueFrom(payload?.extracted_data, field.keys)}
                    </p>
                  </div>
                )})}
              </div>
            </section>
          </div>

          <section className="mt-8 rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-3xl font-black">{hasProposal ? copy.recommendedTitle : copy.preparingProposal}</h2>
                <p className="mt-3 max-w-3xl leading-7 text-slate-600">
                  {hasProposal
                    ? copy.recommendedDesc
                    : copy.preparingDesc}
                </p>
              </div>
              {hasProposal && (
                <a href={payload?.proposal?.pdf_url} target="_blank" rel="noreferrer" className="inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-blue-600 px-6 font-black text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">
                  {copy.viewProposalPdf}
                </a>
              )}
            </div>

            {selectedSimulation ? (
              <div className="mt-7 grid gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-500">{copy.provider}</p>
                  <p className="mt-2 text-xl font-black">{selectedSimulation.new_provider || selectedSimulation.provider_name || copy.pending}</p>
                </div>
                <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{copy.tariff}</p>
                  <p className="mt-2 text-xl font-black">{selectedSimulation.new_tariff || selectedSimulation.tariff_name || copy.pending}</p>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">{copy.monthlySaving}</p>
                  <p className="mt-2 text-2xl font-black">{formatMoney(monthlySavings, language)}</p>
                </div>
                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600">{copy.annualSaving}</p>
                  <p className="mt-2 text-2xl font-black">{formatMoney(annualSavings, language)}</p>
                </div>
              </div>
            ) : (
              <div className="mt-7 rounded-3xl border border-blue-100 bg-blue-50 p-6">
                {copy.noSimulations}
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {hasProposal && (
                <button
                  onClick={handleAcceptProposal}
                  disabled={acceptState === 'loading' || acceptState === 'done'}
                  className="min-h-[58px] flex-1 rounded-2xl bg-emerald-500 px-6 text-lg font-black text-white shadow-xl shadow-emerald-200 transition hover:bg-emerald-600 disabled:opacity-70"
                >
                  {acceptState === 'loading' ? copy.confirming : acceptState === 'done' ? copy.accepted : copy.acceptProposal}
                </button>
              )}
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[58px] flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-6 text-center text-lg font-black text-emerald-700 transition hover:bg-emerald-50">
                <WhatsAppIcon className="h-5 w-5" />
                {copy.talkWhatsApp}
              </a>
            </div>
            {acceptState === 'error' && (
              <p className="mt-3 text-sm font-bold text-red-600">{copy.acceptError}</p>
            )}
          </section>

          <section className="mt-8 rounded-[2rem] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50">
            <h2 className="flex items-center gap-3 text-2xl font-black">
              <TrustBadgeIcon className="h-7 w-7 text-blue-600" />
              {copy.history}
            </h2>
            <div className="mt-6 space-y-3">
              {(payload?.events || []).length > 0 ? payload?.events?.map((event, index) => (
                <div key={event.id || index} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{formatDate(event.created_at, language)}</p>
                  <p className="mt-1 font-semibold leading-6">{event.message || event.content || copy.updateFallback}</p>
                </div>
              )) : (
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-slate-500">
                  {copy.noUpdates}
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
