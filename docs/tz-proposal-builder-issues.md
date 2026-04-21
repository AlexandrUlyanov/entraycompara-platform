# Готовые issues для импорта в GitHub

> Скопируй заголовок и тело каждого issue в https://github.com/AlexandrUlyanov/entraycompara-platform/issues/new
> Лейблы: `feature`, `backend`, `frontend`, `design`, `discussion`

---

## Issue 1 — Epic

**Title:** [Proposal Builder] Раздел «Подготовка КП» в CRM

**Labels:** `epic`, `feature`

**Body:**
```
## Epic

Создать новый раздел **«Подготовка КП»** внутри карточки лида CRM. Заменяет текущую простую загрузку PDF на структурированный workflow из трёх этапов:

1. **Сбор данных** — AI-извлечение и ручная корректировка данных из счетов клиента.
2. **Симуляция** — создание и сравнение сценариев от поставщиков с автоматическим расчётом экономии.
3. **Генерация КП** — автоматическое создание PDF на фирменном бланке Entraycompara.

### Связанные задачи
- AI-извлечение данных (Backend)
- UI сбор данных (Frontend)
- CRUD симуляций (Backend)
- UI симуляций (Frontend)
- Генерация PDF (Backend)
- UI генерации КП (Frontend)
- Интеграция и полировка

### Документация
Полное ТЗ: `docs/tz-proposal-builder.md`

### Текущий fallback
- `POST /api/applications/{id}/upload-proposal` — ручная загрузка PDF
- `POST /api/whatsapp/send-proposal` — отправка в WhatsApp

Эти эндпоинты остаются без изменений и становятся fallback'ом для сложных случаев.
```

---

## Issue 2 — Backend, Этап 1

**Title:** [Proposal Builder — Этап 1] AI-извлечение данных из загруженных счетов (Backend)

**Labels:** `backend`, `feature`

**Body:**
```
## Описание
Реализовать бэкенд для первого этапа «Подготовка КП» — извлечение структурированных данных из счетов клиента с помощью Gemini.

## Что нужно сделать

### 1. Модели данных (Pydantic)
```python
class ExtractedData(BaseModel):
    service_type: Literal["electricity", "gas", "internet", "mobile"]
    current_provider: str | None = None
    contract_number: str | None = None
    current_tariff: str | None = None
    power_kw: float | None = None
    avg_monthly_consumption_kwh: float | None = None
    avg_monthly_cost_eur: float | None = None
    contract_end_date: str | None = None  # YYYY-MM-DD
    source_files: list[str] = []
```

### 2. Firestore
- Создавать/обновлять документ в подколлекции `applications/{id}/proposal_data` (singleton).
- Поля: `extracted_data`, `extracted_at`, `extracted_by`, `manually_corrected`.

### 3. Новые endpoints
- `POST /api/applications/{id}/proposal/extract-data`
  - Body: `{ file_urls: string[], force_reextract: boolean }`
  - Скачивает файлы из GCS, отправляет в Gemini с промптом-шаблоном, возвращает JSON.
  - Сохраняет результат в `proposal_data`.
- `PUT /api/applications/{id}/proposal/extracted-data`
  - Body: `{ extracted_data: ExtractedData }`
  - Сохраняет откорректированные данные оператора. `manually_corrected = true`.
- `GET /api/applications/{id}/proposal/extracted-data`
  - Возвращает текущие извлечённые данные или 404.

### 4. AI-интеграция
- Использовать существующий `google-generativeai` (`gemini-2.5-flash-lite` или `gemini-2.0-flash`).
- Промпт должен требовать ответ строго в JSON.
- Обработка ошибок: если Gemini вернул не JSON — возвращать 502 с сырым текстом для отладки.
- Лимит размера файла: если файл > 20 MB — отказ (400).

### 5. Безопасность
- Все endpoints под `authenticate_operator`.

## Критерии приёмки
- [ ] Endpoint `extract-data` принимает список `file_urls`, возвращает структурированный JSON.
- [ ] Данные сохраняются в Firestore подколлекцию `proposal_data`.
- [ ] Оператор может пересохранить данные вручную через `PUT`.
- [ ] При `force_reextract=true` данные пересоздаются заново.
- [ ] Swagger UI обновлён (`/docs`).
```

---

## Issue 3 — Frontend, Этап 1

**Title:** [Proposal Builder — Этап 1] UI сбор данных — форма извлечения и корректировки (Frontend)

**Labels:** `frontend`, `feature`

**Body:**
```
## Описание
Реализовать frontend для первого этапа «Подготовка КП» — интерфейс просмотра файлов клиента, запуска AI-извлечения и ручной корректировки данных.

## Что нужно сделать

### 1. Компонент `DataExtractionPanel`
Разместить внутри нового блока «Подготовка КП» (вкладка или accordion в `DetailView`).

**UI-элементы:**
- Список `uploaded_files` заявки с чекбоксами для выбора файлов на анализ.
- Кнопка **«Извлечь данные ИИ»** (⚡) — вызывает `POST /api/applications/{id}/proposal/extract-data`.
- Индикатор загрузки во время AI-анализа.
- Редактируемая форма с полями:
  - Тип услуги (select: electricity / gas / internet / mobile)
  - Текущий поставщик (input)
  - Номер договора / CUPS (input)
  - Текущий тариф (input)
  - Мощность, кВт (input number)
  - Среднее потребление, кВтч/мес (input number)
  - Средняя стоимость, €/мес (input number)
  - Дата окончания контракта (input date)
- Кнопка **«Сохранить данные»** — `PUT /api/applications/{id}/proposal/extracted-data`.
- Бейдж `manually_corrected` — если данные редактировались руками.

### 2. Интеграция
- Использовать `@tanstack/react-query` (mutations + invalidation).
- Обновить `types.ts`:
  ```ts
  interface ProposalData {
    extracted_data?: ExtractedData;
    extracted_at?: string;
    manually_corrected?: boolean;
  }
  
  interface ExtractedData {
    service_type: 'electricity' | 'gas' | 'internet' | 'mobile';
    current_provider?: string;
    contract_number?: string;
    current_tariff?: string;
    power_kw?: number;
    avg_monthly_consumption_kwh?: number;
    avg_monthly_cost_eur?: number;
    contract_end_date?: string;
    source_files?: string[];
  }
  ```
- Добавить функции в `services/api.ts`.

### 3. Локализация
- Добавить ключи в `i18n.ts` (ru + es) для всех label'ов формы.

## Критерии приёмки
- [ ] Оператор видит файлы клиента и может выбрать их для анализа.
- [ ] Кнопка ИИ вызывает endpoint и заполняет форму полученными данными.
- [ ] Оператор может отредактировать любое поле и сохранить.
- [ ] При повторном открытии карточки данные подгружаются из Firestore.
- [ ] После сохранения `compiled/` обновлён и `dist/` скопирован.
```

---

## Issue 4 — Backend, Этап 2

**Title:** [Proposal Builder — Этап 2] CRUD симуляций тарифов от поставщика (Backend)

**Labels:** `backend`, `feature`

**Body:**
```
## Описание
Реализовать бэкенд для второго этапа «Подготовка КП» — создание, редактирование и выбор симуляций (сценариев) от поставщиков.

## Что нужно сделать

### 1. Модель данных (Pydantic)
```python
class SimulationInput(BaseModel):
    simulation_name: str
    new_provider: str
    new_tariff: str | None = None
    new_monthly_cost_eur: float
    contract_duration_months: int | None = None
    bonus_description: str | None = None
    simulation_file_url: str | None = None
    is_selected: bool = False
```

### 2. Firestore
- Подколлекция `applications/{id}/proposal_simulations/{simulation_id}`.
- Поля: `simulation_name`, `new_provider`, `new_tariff`, `new_monthly_cost_eur`, `savings_monthly_eur`, `savings_percent`, `contract_duration_months`, `bonus_description`, `simulation_file_url`, `is_selected`, `created_at`, `created_by`.
- `savings_monthly_eur` и `savings_percent` считает бэкенд при создании/обновлении на основе `proposal_data.extracted_data.avg_monthly_cost_eur`.
- Только одна симуляция может иметь `is_selected = true`.

### 3. Новые endpoints
- `POST /api/applications/{id}/proposal/simulations`
  - Body: `{ simulation: SimulationInput }`
  - Автоподсчёт экономии. Если `is_selected=true` — сбросить флаг у остальных.
- `GET /api/applications/{id}/proposal/simulations`
  - Список всех симуляций заявки.
- `PUT /api/applications/{id}/proposal/simulations/{sim_id}`
  - Редактирование. Пересчёт экономии при изменении стоимости.
- `DELETE /api/applications/{id}/proposal/simulations/{sim_id}`
  - Удаление.
- `POST /api/applications/{id}/proposal/simulations/{sim_id}/select`
  - Выбор симуляции как финальной (для подстановки в КП).

### 4. Загрузка файла симуляции
- Использовать существующий `POST /api/applications/{id}/upload-files` или создать отдельный endpoint `POST /api/applications/{id}/proposal/simulations/{sim_id}/upload-file`.
- Файлы сохранять в GCS: `simulation_files/YYYY/MM/DD/{uuid}.{ext}`.

## Критерии приёмки
- [ ] Создание симуляции с автоподсчётом `savings_monthly_eur` и `savings_percent`.
- [ ] Только одна симуляция может быть `is_selected=true`.
- [ ] CRUD endpoints работают и защищены `authenticate_operator`.
- [ ] Файл симуляции загружается в GCS и сохраняется в документе.
```

---

## Issue 5 — Frontend, Этап 2

**Title:** [Proposal Builder — Этап 2] UI симуляций — карточки сценариев и расчёт экономии (Frontend)

**Labels:** `frontend`, `feature`

**Body:**
```
## Описание
Реализовать frontend для второго этапа «Подготовка КП» — интерфейс создания, просмотра и выбора симуляций тарифов.

## Что нужно сделать

### 1. Компонент `SimulationPanel`
Разместить внутри блока «Подготовка КП» после `DataExtractionPanel`.

**UI-элементы:**
- Кнопка **«Добавить симуляцию»** — открывает модалку/форму.
- Список карточек симуляций:
  - Название симуляции, новый поставщик, тариф.
  - **Крупные цифры**: новая стоимость (€/мес) и экономия (% и €/мес).
  - Бейдж `Выбрана для КП` на активной карточке.
  - Кнопки: «Редактировать», «Удалить», «Выбрать для КП».
- Форма добавления/редактирования:
  - Название симуляции (input)
  - Новый поставщик (input)
  - Новый тариф (input)
  - Новая стоимость, €/мес (input number) — **при вводе автоматически считается экономия** от текущей стоимости из `extracted_data.avg_monthly_cost_eur`.
  - Длительность контракта, мес (input number)
  - Бонусы/условия (textarea)
  - Загрузка файла симуляции (input file)

### 2. Интеграция
- API-функции в `services/api.ts` для всех CRUD операций.
- React Query mutations с invalidation.
- При выборе симуляции (`select`) обновляется UI без перезагрузки.

### 3. Локализация
- Ключи в `i18n.ts` для label'ов формы и кнопок.

## Критерии приёмки
- [ ] Оператор видит список симуляций с цифрами экономии.
- [ ] При создании/редактировании экономия считается автоматически (frontend-валидATION).
- [ ] Можно выбрать одну симуляцию как финальную — она подсвечивается.
- [ ] Можно загрузить файл от поставщика к конкретной симуляции.
- [ ] После сохранения `compiled/` обновлён.
```

---

## Issue 6 — Backend, Этап 3

**Title:** [Proposal Builder — Этап 3] Генерация PDF-КП на фирменном бланке (Backend)

**Labels:** `backend`, `feature`

**Body:**
```
## Описание
Реализовать генерацию PDF коммерческого предложения на фирменном бланке Entraycompara на основе собранных данных (этап 1) и выбранной симуляции (этап 2).

## Что нужно сделать

### 1. PDF-генератор
Создать класс `ProposalPDFGenerator` в `apps/backend-upload-service/`.

**Инструмент:** `fpdf2` (уже в `requirements.txt`) или `reportlab`.
**Шрифт:** `DejaVuSans.ttf` (уже есть в `fonts/`).

**Структура PDF (A4):**
1. Шапка: логотип + название + слоган.
2. Дата и ID заявки.
3. Обращение: «Уважаемый(ая) {client_name}».
4. Блок «Текущая ситуация» (данные из `extracted_data`):
   - Поставщик, тариф, стоимость.
5. Блок «Наше предложение» (данные из выбранной `simulation`):
   - Новый поставщик, тариф, стоимость.
6. Блок «Ваша экономия»:
   - Крупные цифры: €/мес и €/год.
   - Процент экономии.
7. Блок «Следующие шаги» — 3 шага для клиента.
8. Подвал: телефон, email, сайт, юридический адрес.

**Локализация:**
- Тексты шаблона на 4 языках: `es`, `ru`, `uk`, `eu`.
- Язык берётся из `application.language`.
- Хранить текстовые константы в словаре по языкам.

### 2. Новые endpoints
- `POST /api/applications/{id}/proposal/generate`
  - Проверяет наличие `extracted_data` и выбранной `simulation`.
  - Генерирует PDF.
  - Загружает в GCS: `proposals/YYYY/MM/DD/{uuid}.pdf`.
  - Обновляет `proposal_file_url` и `proposal_generated_at` в заявке.
  - Создаёт запись в Timeline: "КП сгенерировано автоматически".
  - Возвращает: `{ success, proposal_file_url, preview_url }`.
- `GET /api/applications/{id}/proposal/preview`
  - Генерирует Signed URL на `proposal_file_url` для iframe.

### 3. Fallback
- Сохранить текущий `POST /api/applications/{id}/upload-proposal` — оператор всё ещё может загрузить свой PDF.

## Критерии приёмки
- [ ] PDF генерируется с корректными данными клиента и симуляции.
- [ ] Дизайн соответствует фирменному стилю (цвета, шрифты, структура).
- [ ] PDF локализован на язык заявки (`es`, `ru`, `uk`, `eu`).
- [ ] Файл сохраняется в GCS и доступен по Signed URL.
- [ ] Timeline пополняется записью о генерации.
- [ ] Swagger UI обновлён.
```

---

## Issue 7 — Frontend, Этап 3

**Title:** [Proposal Builder — Этап 3] UI генерации и превью КП (Frontend)

**Labels:** `frontend`, `feature`

**Body:**
```
## Описание
Реализовать frontend для финального этапа «Подготовка КП» — генерация, превью и отправка коммерческого предложения.

## Что нужно сделать

### 1. Компонент `ProposalPreviewPanel`
Разместить внутри блока «Подготовка КП» после `SimulationPanel`.

**UI-элементы:**
- Блок «Данные для КП»:
  - Проверочная сводка: текущий поставщик/стоимость → новый поставщик/стоимость → экономия.
  - Если данных недостаточно (нет `extracted_data` или нет выбранной симуляции) — показать предупреждение и disabled кнопку генерации.
- Кнопка **«Сгенерировать КП на бланке»** — вызывает `POST /api/applications/{id}/proposal/generate`.
- После генерации:
  - iframe с превью PDF (`GET /api/applications/{id}/proposal/preview`) или ссылка "Открыть PDF".
  - Кнопка **«Пересоздать КП»** — повторная генерация.
  - Кнопка **«Отправить клиенту в WhatsApp»** — использует существующий `sendProposalViaWhatsApp(appId)`.
- Fallback-блок:
  - Кнопка **«Загрузить свой PDF»** — текущий input file + `uploadProposal`.
  - Если `proposal_file_url` загружен вручную — показывать его и кнопку отправки.

### 2. Интеграция
- React Query mutations.
- После успешной генерации — invalidate `['application', appId]` и `['timeline', appId]`.

### 3. Локализация
- Ключи в `i18n.ts` для всех label'ов и кнопок.

## Критерии приёмки
- [ ] Кнопка генерации активна только при наличии данных и выбранной симуляции.
- [ ] После генерации PDF отображается превью.
- [ ] Кнопка отправки в WhatsApp работает и отправляет актуальный `proposal_file_url`.
- [ ] Fallback-загрузка своего PDF сохраняет текущее поведение.
- [ ] После сохранения `compiled/` обновлён и `dist/` скопирован.
```

---

## Issue 8 — Frontend + Backend, Этап 4

**Title:** [Proposal Builder — Этап 4] Интеграция с Timeline, автозаписи, полировка

**Labels:** `backend`, `frontend`, `feature`

**Body:**
```
## Описание
Финальный этап — связать все компоненты Proposal Builder между собой, добавить автоматизацию в Timeline и довести UX до продакшен-уровня.

## Что нужно сделать

### 1. Timeline-автоматизация
При следующих событиях создавать записи в `applications/{id}/timeline`:
- AI-извлечение завершено → `NOTE`: "Данные счетов извлечены ИИ. Поставщик: {provider}."
- Данные откорректированы вручную → `NOTE`: "Данные счетов скорректированы оператором."
- Симуляция создана → `NOTE`: "Создана симуляция '{name}'. Экономия: {savings}%"
- Симуляция выбрана → `NOTE`: "Выбрана симуляция '{name}' для КП."
- КП сгенерировано → `NOTE`: "Коммерческое предложение сгенерировано автоматически."
- КП отправлено в WhatsApp → `WHATSAPP` outgoing (уже реализовано).

### 2. Связка со статусами
- При успешной генерации КП предлагать оператору сменить статус заявки на `Proposal`.
- Или делать это автоматически (опционально, обсудить).

### 3. Улучшения UX
- Stepper / прогресс-бар в `ProposalBuilder`: Сбор данных ✓ → Симуляция ✓ → КП ✓.
- Валидация: нельзя перейти к генерации КП без `extracted_data` и выбранной симуляции.
- Skeleton loaders при загрузке данных.
- Обработка ошибок с понятными сообщениями.

### 4. Тесты Playwright
- Добавить e2e-тесты в `apps/admin-panel/tests/`:
  - Открыть карточку лида → вкладка «Подготовка КП» видна.
  - Заполнить форму данных → сохранить.
  - Создать симуляцию → выбрать.
  - Сгенерировать КП → проверить наличие preview.

### 5. Обновление `AGENTS.md`
- Добавить описание нового раздела в раздел 6.2.

## Критерии приёмки
- [ ] Все шаги Proposal Builder создают записи в Timeline.
- [ ] Stepper показывает прогресс оператора.
- [ ] Генерация КП блокируется, если не хватает данных.
- [ ] Playwright-тесты проходят локально.
- [ ] Документация `AGENTS.md` обновлена.
- [ ] Staging-деплой проходит без ошибок.
```

---

## Issue 9 — Design / Discussion

**Title:** [Proposal Builder] Дизайн и макет фирменного бланка КП

**Labels:** `design`, `discussion`

**Body:**
```
## Описание
Перед реализацией генерации PDF (Этап 3) необходимо определить визуальный стиль фирменного бланка коммерческого предложения.

## Что нужно решить / предоставить

### 1. Визуальный макет
Нужен макет или референс в формате:
- Figma (предпочтительно)
- PDF/PNG мокап
- Описание в тексте

### 2. Обязательные элементы бланка
- [ ] Логотип Entraycompara (есть ли вектор/SVG?)
- [ ] Цвета: primary `#2a6a96`, фон, акценты.
- [ ] Шрифт: DejaVuSans (есть) или кастомный?
- [ ] Структура страницы (см. ТЗ, раздел 7):
  - Шапка
  - Данные клиента
  - Сравнительная таблица (было → стало)
  - Блок экономии (крупные цифры)
  - Следующие шаги
  - Подвал с реквизитами

### 3. Открытые вопросы
- Нужна ли **цифровая подпись / печать** на PDF?
- Нужен ли **график/диаграмма** (столбчатая) визуализации экономии?
- Бланк **одностраничный** или может занимать 2 страницы при большом количестве данных?
- Есть ли **юридический текст** (оферта, согласие на обработку данных), который должен быть внизу?

## Критерии приёмки
- [ ] Макет или детальное текстовое описание утверждено.
- [ ] Определены цвета, шрифты, расположение блоков.
- [ ] Согласовано, нужна ли печать/подпись.
- [ ] Информация перенесена в комментарии к задаче на Backend генерацию PDF.
```

---

## Быстрое создание через `gh` CLI

Если у тебя локально установлен и авторизован `gh`:

```bash
cd /path/to/entraycompara-platform

gh issue create --title "[Proposal Builder] Раздел «Подготовка КП» в CRM" --label "epic,feature" --body-file docs/tz-proposal-builder-issues.md
# ...и так далее для каждого issue
```

Или создай вручную через GitHub UI: https://github.com/AlexandrUlyanov/entraycompara-platform/issues/new
