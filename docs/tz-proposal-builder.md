# Техническое задание: Раздел "Подготовка КП" (Proposal Builder)

> Статус: Draft  
> Проект: Entraycompara Platform  
> Дата: 2026-04-21

---

## 1. Общее описание

В CRM (`admin-panel`) создаётся новый полноценный раздел **"Подготовка КП"** внутри карточки лида. Раздел заменяет текущую простую загрузку PDF (`upload-proposal`) на структурированный workflow подготовки коммерческого предложения из трёх этапов:

1. **Сбор данных** — извлечение и структурирование данных из загруженных клиентом счетов.
2. **Симуляция** — загрузка и сопоставление расчётов/тарифов от поставщика.
3. **Генерация КП** — создание финального PDF-документа на фирменном бланке Entraycompara.

Текущая функция "Загрузить КП" (`upload-proposal`) и "Отправить КП в WhatsApp" (`send-proposal`) сохраняются, но становятся **финальным шагом** workflow — оператор загружает или генерирует КП, после чего отправляет клиенту.

---

## 2. Цель

- Сократить время оператора на ручной анализ счетов.
- Стандартизировать процесс подготовки КП.
- Автоматизировать генерацию фирменного PDF с подстановкой данных клиента и расчётов.
- Сохранить историю всех промежуточных шагов в подколлекции заявки.

---

## 3. Структура раздела

### 3.1 Этап 1: Сбор данных (Data Extraction)

**Контекст:** Клиент загружает счета (PDF/JPG) через лендинг. Файлы хранятся в `gs://entraycompara-invoices/submissions/YYYY/MM/DD/`.

**Что делает оператор:**
1. В разделе "Подготовка КП" видит все файлы, загруженные клиентом (`uploaded_files`).
2. Может запустить **AI-анализ** одного или нескольких файлов — бэкенд отправляет файл в Gemini (или аналог) с промптом для извлечения:
   - Тип услуги (электричество / газ / интернет / мобильная связь)
   - Название текущего поставщика
   - Номер договора / CUPS
   - Текущий тариф / мощность
   - Среднемесячное потребление (кВтч / м³)
   - Средняя ежемесячная стоимость (€)
   - Период действия контракта (если виден)
3. Результат извлечения отображается в **редактируемой форме** — оператор может скорректировать данные вручную.
4. По кнопке "Сохранить данные" структурированная информация записывается в Firestore.

**Модель данных (Firestore):**
```
applications/{id}/proposal_data/
  ├── extracted_data: {
  │     service_type: "electricity",
  │     current_provider: "Iberdrola",
  │     contract_number: "ES0021...",
  │     current_tariff: "2.0TD",
  │     power_kw: 4.6,
  │     avg_monthly_consumption_kwh: 350,
  │     avg_monthly_cost_eur: 87.50,
  │     contract_end_date: null,
  │     source_files: ["gs://.../file1.pdf", "gs://.../file2.jpg"]
  │  }
  ├── extracted_at: timestamp
  ├── extracted_by: "Operator"
  └── manually_corrected: boolean
```

**Backend:**
- `POST /api/applications/{id}/proposal/extract-data`
  - Body: `{ file_urls: string[], force_reextract: boolean }`
  - Логика: скачивает файлы из GCS (через Signed URL), конвертирует изображения в base64 / PDF в текст, отправляет в Gemini с промптом-шаблоном, возвращает JSON. Сохраняет результат в `proposal_data/extracted_data`.
- `PUT /api/applications/{id}/proposal/extracted-data`
  - Body: `{ extracted_data: ExtractedData }`
  - Логика: оператор сохраняет откорректированные данные. `manually_corrected = true`.

**UI (CRM):**
- Новый компонент `ProposalBuilder.tsx` (вкладка в DetailView или отдельный блок).
- Подблок "Сбор данных":
  - Список файлов с чекбоксами для выбора.
  - Кнопка "Извлечь данные ИИ" (⚡).
  - Форма с полями (input / select): Поставщик, Тариф, Мощность, Потребление, Стоимость, и т.д.
  - Индикатор `manually_corrected` (если данные правились руками).

---

### 3.2 Этап 2: Симуляция (Supplier Simulation)

**Контекст:** Оператор получает от поставщика (партнёра) файл с расчётом/предложением — обычно это Excel, PDF или вручную введённые данные.

**Что делает оператор:**
1. Загружает файл от поставщика (новый тип загрузки — `simulation_files`).
2. Или вручную заполняет форму с данными нового предложения:
   - Новый поставщик
   - Новый тариф
   - Расчётная мощность (если меняется)
   - Прогнозируемое среднемесячное потребление
   - Новая средняя стоимость (€/мес)
   - Экономия (% и €/мес)
   - Срок окупаемости (если есть взнос)
   - Условия контракта (длительность, штрафы)
   - Дополнительные бонусы (например, "3 месяца бесплатно")
3. Система автоматически считает **экономию** по сравнению с `extracted_data.avg_monthly_cost_eur`.
4. Оператор может создать несколько симуляций (сценариев) и выбрать лучший.

**Модель данных (Firestore):**
```
applications/{id}/proposal_simulations/
  ├── {simulation_id}: {
  │     simulation_name: "Ибердрола → Октубре Энергия",
  │     new_provider: "Octubre Energía",
  │     new_tariff: "2.0TD",
  │     new_monthly_cost_eur: 62.00,
  │     savings_monthly_eur: 25.50,
  │     savings_percent: 29.1,
  │     contract_duration_months: 12,
  │     bonus_description: "Sin permanencia",
  │     simulation_file_url: "gs://.../simulacion.xlsx",
  │     is_selected: true,
  │     created_at: timestamp,
  │     created_by: "Operator"
  │  }
```

**Backend:**
- `POST /api/applications/{id}/proposal/simulations`
  - Body: `{ simulation: SimulationInput }`
  - Логика: создаёт документ в подколлекции. Если `is_selected: true`, сбрасывает флаг у других симуляций (только одна активная).
- `PUT /api/applications/{id}/proposal/simulations/{sim_id}`
  - Редактирование симуляции.
- `DELETE /api/applications/{id}/proposal/simulations/{sim_id}`
  - Удаление.
- `POST /api/applications/{id}/proposal/simulations/{sim_id}/select`
  - Выбор симуляции как финальной (для подстановки в КП).

**UI (CRM):**
- Подблок "Симуляция":
  - Кнопка "Добавить симуляцию" (+).
  - Список карточек симуляций с основными цифрами (стоимость, экономия %).
  - Возможность загрузить файл симуляции.
  - Кнопка "Выбрать для КП" на карточке.
  - Выбранная симуляция подсвечивается.

---

### 3.3 Этап 3: Разработка КП (Proposal Generation)

**Контекст:** На основе собранных данных (этап 1) и выбранной симуляции (этап 2) система генерирует финальный PDF-документ.

**Варианты создания КП:**

#### Вариант A: Автогенерация PDF (рекомендуемый)
Бэкенд формирует PDF на фирменном бланке Entraycompara:
- Шапка с логотипом и контактами.
- Блок "Данные клиента": имя, телефон, дата.
- Блок "Текущая ситуация": данные из `extracted_data`.
- Блок "Наше предложение": данные из выбранной `simulation`.
- Блок "Экономия": визуализация (старая цена → новая цена, годовая экономия).
- Блок "Следующие шаги": что нужно сделать клиенту.
- Подвал с юридическими реквизитами.

Инструмент генерации: `fpdf2` (уже есть в `requirements.txt`) или `reportlab`. PDF хранится в GCS (`proposals/YYYY/MM/DD/{uuid}.pdf`) и ссылка записывается в `proposal_file_url` (текущее поле).

#### Вариант B: Ручная загрузка (сохраняем текущий функционал)
Оператор может по-прежнему загрузить готовый PDF через `upload-proposal`. Это fallback для сложных случаев.

**Backend:**
- `POST /api/applications/{id}/proposal/generate`
  - Логика:
    1. Проверяет наличие `extracted_data` и выбранной `simulation`.
    2. Генерирует PDF с помощью шаблонизатора.
    3. Загружает в GCS.
    4. Обновляет `proposal_file_url` в заявке.
    5. Создаёт запись в Timeline: "КП сгенерировано автоматически".
  - Возвращает: `{ success, proposal_file_url, preview_url }`.
- `GET /api/applications/{id}/proposal/preview`
  - Возвращает Signed URL на PDF для предпросмотра в iframe.

**UI (CRM):**
- Подблок "Генерация КП":
  - Превью выбранной симуляции (экономия, тариф).
  - Кнопка "Сгенерировать КП на бланке" (генерирует PDF).
  - iframe / ссылка для предпросмотра сгенерированного PDF.
  - Кнопка "Отправить клиенту в WhatsApp" (использует текущий `sendProposalViaWhatsApp`).
  - Fallback: кнопка "Загрузить свой PDF" (текущий `upload-proposal`).

---

## 4. Изменения в модели данных (Application)

Текущие поля заявки дополняются:

```typescript
interface Application {
  // ... существующие поля ...
  
  // --- Proposal Builder ---
  proposal_data?: {
    extracted_data?: ExtractedData;
    extracted_at?: string;
    manually_corrected?: boolean;
  };
  proposal_simulations?: ProposalSimulation[]; // или подколлекция
  selected_simulation_id?: string;
  proposal_file_url?: string; // уже существует
  proposal_generated_at?: string;
  proposal_generated_by?: string;
}
```

**Важно:** `proposal_data` и `simulations` лучше хранить как **подколлекции** Firestore (`applications/{id}/proposal_data/{doc}` и `applications/{id}/proposal_simulations/{id}`), чтобы не раздувать документ заявки.

---

## 5. Новые API Endpoints (Backend)

| Метод | Endpoint | Описание |
|---|---|---|
| POST | `/api/applications/{id}/proposal/extract-data` | AI-извлечение данных из файлов |
| PUT | `/api/applications/{id}/proposal/extracted-data` | Сохранение/корректировка данных |
| GET | `/api/applications/{id}/proposal/extracted-data` | Получение извлечённых данных |
| POST | `/api/applications/{id}/proposal/simulations` | Создание симуляции |
| GET | `/api/applications/{id}/proposal/simulations` | Список симуляций |
| PUT | `/api/applications/{id}/proposal/simulations/{sim_id}` | Редактирование |
| DELETE | `/api/applications/{id}/proposal/simulations/{sim_id}` | Удаление |
| POST | `/api/applications/{id}/proposal/simulations/{sim_id}/select` | Выбор финальной |
| POST | `/api/applications/{id}/proposal/generate` | Генерация PDF-КП |
| GET | `/api/applications/{id}/proposal/preview` | Signed URL для просмотра PDF |

Существующие эндпоинты остаются без изменений:
- `POST /api/applications/{id}/upload-proposal`
- `POST /api/whatsapp/send-proposal`

---

## 6. UI/UX — Новые компоненты CRM

### 6.1 ProposalBuilder (основной контейнер)
- Размещается в `DetailView` как отдельная **вкладка** (tab) или раскрываемый блок между "Профиль клиента" и "Действия".
- Содержит 3 подблока (stepper / accordion): Сбор данных → Симуляция → КП.
- Индикатор прогресса: какие этапы завершены.

### 6.2 DataExtractionPanel
- Список `uploaded_files` с чекбоксами.
- Кнопка "Извлечь ИИ".
- Редактируемая форма извлечённых данных.

### 6.3 SimulationPanel
- Список карточек симуляций (drag-and-drop опционально).
- Форма добавления/редактирования симуляции.
- Автоматический расчёт экономии при вводе цифр.

### 6.4 ProposalPreviewPanel
- Превью сгенерированного PDF (iframe или ссылка).
- Кнопки: "Пересоздать", "Загрузить свой", "Отправить в WhatsApp".

---

## 7. PDF-шаблон КП (фирменный бланк)

**Требования к дизайну:**
- Формат A4.
- Цвета бренда Entraycompara (primary: `#2a6a96`, secondary: slate).
- Шрифт: DejaVuSans (уже есть в `apps/backend-upload-service/fonts/DejaVuSans.ttf`).
- Обязательные элементы:
  1. Логотип + слоган.
  2. Дата и ID заявки.
  3. "Уважаемый(ая) {client_name}".
  4. Таблица "Ваш текущий тариф" vs "Наше предложение".
  5. Блок экономии (крупными цифрами: "Вы экономите €{savings_monthly} в месяц / €{savings_yearly} в год").
  6. График (опционально): столбчатая диаграмма стоимости по месяцам.
  7. Блок "Как подключиться" (3 шага).
  8. Подвал: телефон, email, сайт, юридический адрес.

**Техническая реализация:**
- Класс-генератор `ProposalPDFGenerator` в `apps/backend-upload-service/`.
- Использует `fpdf2` (уже в `requirements.txt`) или `reportlab`.
- Шаблонизация через Jinja2 (html → pdf через `weasyprint`?) — **нет**, лучше чистый Python + fpdf2 для минимизации зависимостей и стабильности в Cloud Run.
- Локализация PDF: язык берётся из `application.language` (`es`, `ru`, `uk`, `eu`). Для каждого языка — свой шаблон текстов.

---

## 8. AI-извлечение данных (Gemini)

**Промпт-шаблон:**
```
Ты — аналитик коммунальных счетов. Извлеки из предоставленных файлов (счета за электричество/газ/интернет/мобильную связь) следующие данные в формате JSON:
{
  "service_type": "electricity|gas|internet|mobile",
  "current_provider": "string",
  "contract_number": "string|null",
  "current_tariff": "string|null",
  "power_kw": "number|null",
  "avg_monthly_consumption_kwh": "number|null",
  "avg_monthly_cost_eur": "number|null",
  "contract_end_date": "YYYY-MM-DD|null"
}
Если данных нет — используй null. Отвечай ТОЛЬКО JSON, без пояснений.
```

**Ограничения:**
- Gemini может не справиться с размытыми сканами. Оператор всегда может откорректировать данные вручную.
- Лимит на размер файла: если файл > 20 MB — отказать и предложить оператору ввести данные руками.

---

## 9. Безопасность и права доступа

- Все новые endpoints требуют `authenticate_operator` (Bearer-токен).
- Доступ к GCS-файлам через Signed URLs (как сейчас) или через сервисный аккаунт бэкенда.
- PDF-КП хранятся в том же bucket `entraycompara-invoices`, папка `proposals/...` (уже используется).

---

## 10. Этапы реализации (рекомендуемая декомпозиция)

### Этап 1: Сбор данных (MVP)
- [ ] Backend: модели `ExtractedData`, endpoints extract-data / extracted-data.
- [ ] Backend: интеграция Gemini для извлечения из PDF/картинок.
- [ ] CRM: компонент `DataExtractionPanel` (список файлов, кнопка ИИ, форма).
- [ ] CRM: вкладка "Подготовка КП" в DetailView.

### Этап 2: Симуляция
- [ ] Backend: модель `Simulation`, CRUD endpoints.
- [ ] CRM: компонент `SimulationPanel` (список, форма, расчёт экономии).

### Этап 3: Генерация PDF
- [ ] Backend: `ProposalPDFGenerator` на fpdf2 с фирменным бланком.
- [ ] Backend: endpoint `POST .../generate` + `GET .../preview`.
- [ ] CRM: компонент `ProposalPreviewPanel` (превью, кнопки).
- [ ] Локализация PDF на 4 языка.

### Этап 4: Интеграция и полировка
- [ ] Связка: при смене статуса на `Proposal` — автоподстановка сгенерированного КП.
- [ ] Timeline: автозаписи о каждом этапе ("Данные извлечены", "Симуляция создана", "КП сгенерировано").
- [ ] Удаление/архивация старых КП.
- [ ] Тесты Playwright.

---

## 11. Открытые вопросы (для обсуждения)

1. **Шаблон PDF:** Есть ли готовый макет бланка в Figma / PDF? Или разрабатываем с нуля?
2. **Симуляция от поставщика:** Поставщики присылают файлы в стандартном формате или каждый раз по-разному? Нужен ли AI-парсинг и для файлов симуляции?
3. **Подпись КП:** Нужна ли цифровая подпись или печать на PDF?
4. **Email-отправка КП:** Кроме WhatsApp, нужно ли отправлять КП на email клиента?
5. **История версий КП:** Хранить все предыдущие версии сгенерированных КП или только последнюю?

---

## Приложение А: Минимальная схема Firestore (подколлекции)

```
applications/{application_id}
  ├── proposal_data (документ, не подколлекция — singleton)
  │     extracted_data: { ... }
  │     extracted_at: timestamp
  │     manually_corrected: false
  │
  ├── proposal_simulations (подколлекция)
  │     └── {simulation_id}
  │           simulation_name: "..."
  │           new_provider: "..."
  │           new_monthly_cost_eur: 62.0
  │           savings_monthly_eur: 25.5
  │           is_selected: true
  │           created_at: timestamp
  │
  ├── timeline (уже существует)
  │     └── {note_id}
  │
  └── [остальные поля заявки]
```

---
*Документ составлен для планирования. После согласования может быть декомпозирован на GitHub Issues.*
