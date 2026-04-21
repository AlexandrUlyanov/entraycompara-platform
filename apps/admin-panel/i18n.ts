
import React, { createContext, useState, useContext, ReactNode } from 'react';

type Language = 'ru' | 'es';

const translations: Record<Language, Record<string, string>> = {
  ru: {
    "header.title": "Entraycompara AdminPanel",
    "header.logout": "Выйти",
    "auth.title": "Доступ к панели",
    "auth.prompt": "Пожалуйста, введите секретный ключ оператора для доступа к панели.",
    "auth.placeholder": "Введите ваш секретный ключ...",
    "auth.button": "Аутентификация",
    "dashboard.title": "Воронка Продаж",
    "dashboard.description": "Управление лидами от заявки до контракта.",
    "dashboard.searchPlaceholder": "Поиск по имени, email или телефону...",
    "dashboard.allStatuses": "Все этапы",
    "dashboard.allServiceTypes": "Все услуги",
    "dashboard.showingCount": "Показано заявок: {{count}}",
    "dashboard.tableId": "ID",
    "dashboard.tableDate": "Дата",
    "dashboard.tableClient": "Клиент",
    "dashboard.tableServiceType": "Тип услуги",
    "dashboard.tableLanguage": "Язык",
    "dashboard.tableStatus": "Этап",
    "dashboard.rowsPerPage": "Строк на странице:",
    "dashboard.error.filter.title": "Ошибка сервера при фильтрации",
    "dashboard.error.filter.description": "Сервер не смог обработать фильтр.",
    "dashboard.error.filter.action": "Сбросьте фильтры для просмотра списка.",
    "dashboard.error.generic": "Ошибка: {{message}}",
    "dashboard.view.table": "Таблица",
    "dashboard.view.kanban": "Воронка",
    
    "kanban.column.NewLead": "Новый Лид",
    "kanban.column.Analysis": "Анализ",
    "kanban.column.Proposal": "КП Отправлено",
    "kanban.column.Negotiation": "Переговоры",
    "kanban.column.ContractWon": "Контракт (Победа)",
    "kanban.column.DealLost": "Отказ",
    
    "kanban.wipLimitReached": "Лимит на этапе Анализа превышен!",
    "kanban.noItems": "Нет сделок на этом этапе",
    "kanban.statusUpdateError": "Не удалось обновить этап",
    "kanban.delete.tooltip": "Удалить сделку",
    "pagination.previous": "Назад",
    "pagination.next": "Вперед",
    "pagination.page": "Страница {{page}}",
    "detail.backToList": "Назад к заявкам",
    "detail.title": "Карточка сделки",
    "detail.id": "ID",
    "detail.clientInfo.title": "Профиль Клиента",
    "detail.clientInfo.fullName": "Имя",
    "detail.clientInfo.email": "Email",
    "detail.clientInfo.phone": "Телефон",
    "detail.clientInfo.serviceType": "Услуга",
    "detail.clientInfo.language": "Язык",
    "detail.clientInfo.submitted": "Создан",
    "detail.clientInfo.notes": "История Взаимодействия",
    "detail.clientInfo.notesPlaceholder": "История пуста.",
    "detail.updateStatus.title": "Движение по воронке",
    "detail.actions.title": "Действия",
    "detail.delete.button": "Удалить сделку",
    "detail.delete.confirmTitle": "Подтвердите удаление",
    "detail.delete.confirmText": "Вы уверены? История сделки будет потеряна навсегда.",
    "detail.delete.confirmButton": "Удалить",
    "detail.delete.cancelButton": "Отмена",
    "detail.documents.title": "Файлы и Счета",
    "detail.documents.none": "Нет файлов.",
    "detail.error.notFound": "Сделка не найдена.",
    "detail.error.generic": "Ошибка: {{message}}",
    "timeline.addNote": "Добавить",
    "timeline.placeholder": "Комментарий, итог звонка или сообщение...",
    "timeline.type.NOTE": "Заметка",
    "timeline.type.WHATSAPP": "WhatsApp",
    "timeline.type.CALL": "Звонок",
    "timeline.type.SYSTEM": "Система",
    "timeline.system.statusChange": "Статус изменен на: {{status}}",
    "timeline.empty": "Начните работу с лидом!",
    "timeline.deleteConfirm": "Удалить запись?",
    "common.notAvailable": "Н/Д",
    
    "status.NewLead": "Новый Лид",
    "status.Analysis": "Анализ",
    "status.Proposal": "КП Отправлено",
    "status.Negotiation": "Переговоры",
    "status.ContractWon": "Контракт",
    "status.DealLost": "Отказ",
    
    "serviceType.Consulting": "Консультация",
    "serviceType.Development": "Разработка",
    "serviceType.Support": "Поддержка",
    "serviceType.Marketing": "Маркетинг",
    "serviceType.GasComparison": "Сравнение газа",
    "language.es": "Español",
    "language.ru": "Русский",
    "language.uk": "Українська",
    "language.eu": "Euskara",
    
    "whatsappChat.openButton": "Открыть чат WhatsApp",
    "whatsappChat.placeholder": "Введите сообщение...",
    "whatsappChat.empty": "Начните переписку с клиентом"
  },
  es: {
    "header.title": "Entraycompara Panel",
    "header.logout": "Cerrar Sesión",
    "auth.title": "Acceso al CRM",
    "auth.prompt": "Introduce tu clave de operador.",
    "auth.placeholder": "Clave secreta...",
    "auth.button": "Entrar",
    "dashboard.title": "Embudo de Ventas",
    "dashboard.description": "Gestión de leads desde la solicitud hasta el contrato.",
    "dashboard.searchPlaceholder": "Buscar cliente...",
    "dashboard.allStatuses": "Todas las etapas",
    "dashboard.allServiceTypes": "Todos los servicios",
    "dashboard.showingCount": "{{count}} leads",
    "dashboard.tableId": "ID",
    "dashboard.tableDate": "Fecha",
    "dashboard.tableClient": "Cliente",
    "dashboard.tableServiceType": "Servicio",
    "dashboard.tableLanguage": "Idioma",
    "dashboard.tableStatus": "Etapa",
    "dashboard.rowsPerPage": "Filas por página:",
    "dashboard.error.filter.title": "Error de filtro",
    "dashboard.error.filter.description": "No se pudo procesar el filtro.",
    "dashboard.error.filter.action": "Restablece los filtros.",
    "dashboard.error.generic": "Error: {{message}}",
    "dashboard.view.table": "Tabla",
    "dashboard.view.kanban": "Embudo",
    
    "kanban.column.NewLead": "Nuevo Lead",
    "kanban.column.Analysis": "Análisis",
    "kanban.column.Proposal": "Propuesta Enviada",
    "kanban.column.Negotiation": "Negociación",
    "kanban.column.ContractWon": "Contrato Ganado",
    "kanban.column.DealLost": "Perdido",
    
    "kanban.wipLimitReached": "Límite de Análisis alcanzado",
    "kanban.noItems": "Sin leads",
    "kanban.statusUpdateError": "Error al actualizar",
    "kanban.delete.tooltip": "Eliminar lead",
    "pagination.previous": "Anterior",
    "pagination.next": "Siguiente",
    "pagination.page": "Pág {{page}}",
    "detail.backToList": "Volver a la lista",
    "detail.title": "Ficha del Cliente",
    "detail.id": "ID",
    "detail.clientInfo.title": "Perfil del Cliente",
    "detail.clientInfo.fullName": "Nombre",
    "detail.clientInfo.email": "Email",
    "detail.clientInfo.phone": "Teléfono",
    "detail.clientInfo.serviceType": "Servicio",
    "detail.clientInfo.language": "Idioma",
    "detail.clientInfo.submitted": "Creadо",
    "detail.clientInfo.notes": "Historial",
    "detail.clientInfo.notesPlaceholder": "Historial vacío.",
    "detail.updateStatus.title": "Mover en Embudo",
    "detail.actions.title": "Acciones",
    "detail.delete.button": "Eliminar Lead",
    "detail.delete.confirmTitle": "Confirmar",
    "detail.delete.confirmText": "¿Estás seguro? Se perderá todo el historial.",
    "detail.delete.confirmButton": "Eliminar",
    "detail.delete.cancelButton": "Cancelar",
    "detail.documents.title": "Documentos",
    "detail.documents.none": "Sin documentos.",
    "detail.error.notFound": "No encontrado.",
    "detail.error.generic": "Error: {{message}}",
    "timeline.addNote": "Añadir",
    "timeline.placeholder": "Comentario, resumen o mensaje...",
    "timeline.type.NOTE": "Nota",
    "timeline.type.WHATSAPP": "WhatsApp",
    "timeline.type.CALL": "Llamada",
    "timeline.type.SYSTEM": "Sistema",
    "timeline.system.statusChange": "Estado cambiado a: {{status}}",
    "timeline.empty": "¡Inicia la gestión!",
    "timeline.deleteConfirm": "¿Borrar nota?",
    "common.notAvailable": "N/D",
    
    "status.NewLead": "Nuevo Lead",
    "status.Analysis": "Análisis",
    "status.Proposal": "Propuesta",
    "status.Negotiation": "Negociación",
    "status.ContractWon": "Ganado",
    "status.DealLost": "Perdido",
    
    "serviceType.Consulting": "Consultoría",
    "serviceType.Development": "Desarrollo",
    "serviceType.Support": "Soporte",
    "serviceType.Marketing": "Marketing",
    "serviceType.GasComparison": "Gas",
    "language.es": "Español",
    "language.ru": "Ruso",
    "language.uk": "Ucraniano",
    "language.eu": "Euskera",
    
    "whatsappChat.openButton": "Abrir chat de WhatsApp",
    "whatsappChat.placeholder": "Escribe un mensaje...",
    "whatsappChat.empty": "Inicia la conversación con el cliente"
  }
};

interface I18nContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const savedLang = localStorage.getItem('language');
    return (savedLang === 'ru' || savedLang === 'es') ? savedLang : 'ru';
  });

  const setLanguage = (lang: Language) => {
    localStorage.setItem('language', lang);
    setLanguageState(lang);
  };

  const t = (key: string, values: Record<string, string | number> = {}) => {
    let text = translations[language][key] || key;
    Object.keys(values).forEach(valueKey => {
      const regex = new RegExp(`{{${valueKey}}}`, 'g');
      text = text.replace(regex, String(values[valueKey]));
    });
    return text;
  };
  
  return React.createElement(
    I18nContext.Provider,
    { value: { language, setLanguage, t } },
    children
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};
