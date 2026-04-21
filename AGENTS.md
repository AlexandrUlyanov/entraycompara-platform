# Инструкция для LLM-агентов: Entraycompara Platform

> ⚠️ **ВАЖНО**: Перед любыми изменениями прочитай этот файл целиком. Проект — продакшен-система с живыми пользователями, платежами и данными клиентов.

---

## 1. Общее описание проекта

**Entraycompara Platform** — монорепозиторий, объединяющий три продакшен-сервиса:

1. **Landing Page** (`apps/landing-page/`) — публичный лендинг для сбора заявок от клиентов (сравнение коммунальных счетов в Испании)
2. **Admin Panel** (`apps/admin-panel/`) — внутренняя CRM-система для операторов (Kanban, таймлайн, управление заявками)
3. **Backend Upload Service** (`apps/backend-upload-service/`) — Python/FastAPI API для загрузки файлов, email-уведомлений, WhatsApp и управления заявками в Firestore

### Архитектура деплоя

| Сервис | Продакшен | Staging | Домен | Технология |
|--------|-----------|---------|-------|------------|
| Landing | `entraycompara-landing-page-prod` (`us-west1`) | `entraycompara-landing-page-staging` (`europe-west1`) | `https://entraycompara.com` | React + Express |
| Admin | `entraycompara-adminpanel` (`us-west1`) | `entraycompara-adminpanel-staging` (`europe-west1`) | `https://crm.entraycompara.com` | React + Express |
| Backend | `backend-upload-service` (`europe-west1`) | `backend-upload-service-staging` (`europe-west1`) | — | Python/FastAPI |

**База данных**: Firestore Native (коллекция `applications`)
**Хранилище файлов**: GCS bucket `entraycompara-invoices`
**CI/CD**: GitHub Actions

---

## 2. Структура репозитория

```
entraycompara-platform/
├── apps/
│   ├── landing-page/              # Лендинг
│   │   ├── compiled/              # ← КРИТИЧНО: продакшен-ассеты из GCS
│   │   ├── components/            # React-компоненты (исходники)
│   │   ├── context/               # LanguageContext
│   │   ├── server/                # Express-сервер (server.js)
│   │   ├── public/                # Статика (image/, locales/)
│   │   ├── Dockerfile
│   │   └── ...
│   ├── admin-panel/               # CRM
│   │   ├── compiled/              # ← КРИТИЧНО: продакшен-ассеты из GCS
│   │   ├── components/            # React-компоненты
│   │   ├── services/api.ts        # API-клиент для бэкенда
│   │   ├── server/                # Express-сервер
│   │   ├── Dockerfile
│   │   └── ...
│   └── backend-upload-service/    # Бэкенд API
│       ├── main.py                # FastAPI приложение
│       ├── Dockerfile             # Python 3.12
│       └── requirements.txt
├── infra/
│   ├── cloud-run-configs/         # JSON-дампы конфигураций Cloud Run
│   └── cloud-build-triggers.json  # Старые триггеры
├── .github/workflows/
│   ├── deploy-staging.yml         # Автодеплой в staging (push в main)
│   └── deploy-production.yml      # Ручной деплой в продакшен
├── AGENTS.md
└── README.md
```

---

## 3. КРИТИЧЕСКИ ВАЖНЫЕ НЮАНСЫ

### 3.1. `compiled/` — святая святых

Папки `apps/landing-page/compiled/` и `apps/admin-panel/compiled/` содержат **точные копии** продакшен-артефактов, выгруженных из Google Cloud Storage (`gs://ai-studio-bucket-.../compiled/`).

**Фактический формат `compiled/`:**
- `compiled/index.html` — это **HTML-файл размером ~6–7 KB**, который загружает React и зависимости через **внешние CDN** (`aistudiocdn.com`, `esm.sh`, `cdn.tailwindcss.com`) с помощью `<script type="importmap">`.
- Бизнес-логика находится в отдельных JS-чанках в `compiled/assets/`:
  - Landing: `assets/index-*.js` — ~224 KB
  - Admin: `assets/index-*.js` — ~403 KB
- Также могут присутствовать дополнительные lazy-loaded чанки (например, `PrivacyPolicyPage-*.js`).

**ПРАВИЛО**:
- Если ты меняешь логику фронтенда (landing или admin), нужно обновлять **и** исходники (`components/`, `App.tsx`) **и** `compiled/`.
- Docker-образы для landing и admin **не собирают** проект через Vite внутри Docker. Они копируют `compiled/` и раздают его через Express `server.js`.

**Как обновлять `compiled/`:**
1. Внеси изменения в исходники (`components/`, `App.tsx`)
2. Локально запусти `npm install && npm run build` в папке приложения
3. Скопируй содержимое `dist/` в `compiled/`:
   ```bash
   cp -r apps/landing-page/dist/* apps/landing-page/compiled/
   # или для admin:
   cp -r apps/admin-panel/dist/* apps/admin-panel/compiled/
   ```
4. Убедись, что `compiled/assets/index-*.js` обновился и содержит изменения
5. Только тогда коммить

### 3.2. Backend URL жёстко зашит в исходниках

В `apps/admin-panel/services/api.ts` зашит прямой URL staging-бэкенда:
```ts
const API_BASE_URL = 'https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api';
```

Аналогично, в `apps/landing-page/components/FileUploadForm.tsx` (который не используется в продакшенной сборке) может быть хардкожен URL.

**Важно:**
- `server.js` **НЕ содержит** прокси для backend API. Он проксирует только Gemini API (`/api-proxy`).
- Admin Panel обращается к бэкенду **напрямую** с клиента.
- В workflow **не делается** автозамена URL при деплое.
- Landing `compiled/index.html` не обращается напрямую к бэкенду (форма загрузки вырезана tree-shaking'ом).

### 3.3. Бэкенд работает с продакшен-данными даже в staging

`backend-upload-service-staging` использует:
- **Тот же Firestore** (`(default)` в `europe-west1`)
- **Тот же GCS bucket** (`entraycompara-invoices`)
- **Те же Secrets** (`GMAIL_USER`, `GMAIL_APP_PASSWORD`)

Это означает: **тестовые запросы на staging-бэкенд создают реальные заявки и отправляют реальные письма**.

**ПРАВИЛО**: не спамь staging бэкенд тестовыми данными.

### 3.4. Dockerfile landing и admin — особые

Они **НЕ используют** `npm run build` внутри Docker. Вместо этого:

**Landing Dockerfile** (в отличие от admin) дополнительно копирует статические ассеты:
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY compiled/ ./dist/
COPY public/image/ ./dist/image/       # ← только в landing
COPY public/locales/ ./dist/locales/   # ← только в landing
COPY server/package.json ./
COPY server/server.js ./
COPY server/public/ ./public/
RUN npm install
ENV PORT=3000
CMD ["node", "server.js"]
```

**Admin Dockerfile** (нет `public/` копирования):
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY compiled/ ./dist/
COPY server/package.json ./
COPY server/server.js ./
COPY server/public/ ./public/
RUN npm install
ENV PORT=3000
CMD ["node", "server.js"]
```

**НЕ меняй** эту структуру без крайней необходимости.

### 3.5. Backend Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## 4. CI/CD процесс

### Staging деплой (`deploy-staging.yml`)
**Триггер**: `push` в ветку `main`

**Что происходит**:
1. Сборка и пуш Docker-образа backend
2. Деплой backend в `backend-upload-service-staging` (`europe-west1`)
3. Сборка и пуш Docker-образа landing
4. Деплой landing в `entraycompara-landing-page-staging` (`europe-west1`) — на этом сервисе висят домены
5. Сборка и пуш Docker-образа admin
6. Деплой admin в `entraycompara-adminpanel-staging` (`europe-west1`) — на этом сервисе висят домены

### Production деплой (`deploy-production.yml`)
**Триггер**: только ручной запуск (`workflow_dispatch`) через вкладку Actions

**Что происходит**:
- Те же шаги сборки Docker, но деплой в продакшен-сервисы:
  - `backend-upload-service` (`europe-west1`)
  - `entraycompara-landing-page-prod` (`us-west1`)
  - `entraycompara-adminpanel` (`us-west1`)

### GitHub Secrets
- `GCP_SA_KEY` — JSON-ключ сервисного аккаунта `github-actions@entraycompara.iam.gserviceaccount.com`
- `BACKEND_OPERATOR_SECRET_KEY` — секретный ключ для авторизации операторов в API
- `WHATSAPP_PHONE_NUMBER_ID` — ID номера телефона в WhatsApp Business API
- `WHATSAPP_ACCESS_TOKEN` — Access Token для Meta Graph API
- `WHATSAPP_VERIFY_TOKEN` — Verify Token для верификации webhook'ов Meta
- `GEMINI_API_KEY` — API-ключ Google Gemini для генерации ответов ИИ-ассистента

---

## 4.5. Настройка WhatsApp Webhooks в Meta (Facebook Developers)

Чтобы входящие сообщения от клиентов попадали в CRM, необходимо настроить webhook в [Meta for Developers](https://developers.facebook.com/):

### 1. Получение необходимых данных
- **Phone Number ID**: `https://business.facebook.com/wa/manage/phone-numbers/`
- **Access Token**: `https://business.facebook.com/settings/system-users` → создай System User с правами Admin → сгенерируй Token с `whatsapp_business_messaging` и `whatsapp_business_management`
- **Verify Token**: придумай любую случайную строку (например, `entraycompara_webhook_verify_2026`)

### 2. Добавление Secrets в GitHub
Добавь три secrets в настройках репозитория (`Settings → Secrets and variables → Actions`):
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_VERIFY_TOKEN`

### 3. Настройка Webhook URL в Meta
1. Перейди в **Meta for Developers** → твоё приложение → **WhatsApp → Configuration**
2. В разделе **Webhooks** нажми **Edit** → **Add callback URL**
3. **Callback URL**: `https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/whatsapp/webhook`
   - Для продакшена используй URL продакшен-бэкенда: `https://backend-upload-service-910753338248.europe-west1.run.app/api/whatsapp/webhook`
4. **Verify token**: тот же токен, что в `WHATSAPP_VERIFY_TOKEN`
5. После успешной верификации нажми **Add Subscriptions** и подпишись на:
   - `messages` (обязательно — входящие сообщения)
   - `message_statuses` (опционально — статусы доставки)

### 4. Проверка работы
1. Задеплой бэкенд (push в `main` запустит staging-деплой автоматически)
2. Убедись, что Cloud Run сервис получил env vars:
   ```bash
   gcloud run services describe backend-upload-service-staging --region=europe-west1 --format='value(spec.template.spec.containers[0].env)'
   ```
3. Отправь тестовое сообщение на номер WhatsApp Business
4. Проверь, что оно появилось в Timeline заявки с соответствующим телефоном клиента

### Важно
- **Номер телефона клиента в заявке** должен совпадать с номером, с которого отправлено сообщение (с учётом нормализации — только цифры).
- Если webhook не верифицируется, проверь:
  - Доступен ли бэкенд по HTTPS (Cloud Run должен быть развёрнут)
  - Совпадает ли `hub.verify_token` с `WHATSAPP_VERIFY_TOKEN`
  - Возвращает ли `GET /api/whatsapp/webhook` именно `hub_challenge` (число), а не строку
- **Staging и продакшен используют одинаковый Firestore**. Входящие сообщения из продакшена webhook'а будут отображаться в staging CRM и наоборот.

---

## 5. Как безопасно вносить изменения

### Алгоритм для любого изменения:

1. **Пойми, какой сервис(ы) трогаешь**
2. **Создай feature-ветку от `main`** (или работай напрямую в `main` для мелких фиксов)
3. **Внеси изменения локально**
4. **Для фронтендов**: обязательно обнови `compiled/` (скопируй `dist/` в `compiled/` после `npm run build`)
5. **Замерджи в `main`**
6. **Проверь staging** (автодеплой запустится после push в `main`)
7. **Убедись, что всё работает на доменах** `entraycompara.com` / `crm.entraycompara.com`
8. **Только потом** запускай production workflow вручную через GitHub Actions

### Что НЕЛЬЗЯ делать без разрешения пользователя:
- Запускать production-деплой
- Менять IAM-политики в GCP
- Удалять Cloud Run сервисы
- Менять структуру Firestore (имена коллекций, формат документов)
- Менять `Dockerfile` бэкенда, если не уверен на 100%
- Удалять или перезаписывать `compiled/` без проверки

---

## 6. Технические детали приложений

### 6.1. Backend Upload Service (`apps/backend-upload-service/`)

**Стек**: Python 3.12, FastAPI, Uvicorn, google-cloud-storage, google-cloud-firestore, requests

**Ключевые эндпоинты**:
- `POST /api/submit_application` — публичная отправка заявки с файлами (создаёт заявку в Firestore, загружает файлы в GCS с публичным ACL, отправляет email оператору, создаёт первую запись в Timeline)
- `GET /api/applications` — список заявок для CRM (курсорная пагинация, фильтры по `status` и `service_type`, поиск по `client_name`/`client_phone`/`client_email`)
- `GET /api/applications/{id}` — детали заявки
- `PUT /api/applications/{id}/status` — смена статуса
- `PUT /api/applications/{id}/service_type` — смена типа услуги
- `GET /api/applications/{id}/timeline` — таймлайн событий
- `POST /api/applications/{id}/timeline` — добавление события в таймлайн
- `DELETE /api/applications/{id}/timeline/{note_id}` — удаление события
- `POST /api/generate-signed-url` — подписанная ссылка на файл из GCS
- `POST /api/whatsapp/send` — отправка сообщения клиенту через WhatsApp Business API
- `GET /api/whatsapp/webhook` — верификация webhook от Meta
- `POST /api/whatsapp/webhook` — получение входящих сообщений от Meta
- `POST /api/applications/{id}/proposal/extract-data` — AI-извлечение данных из счетов (Gemini)
- `PUT /api/applications/{id}/proposal/extracted-data` — сохранение/корректировка извлеченных данных
- `GET /api/applications/{id}/proposal/extracted-data` — получение извлеченных данных
- `GET /docs` — Swagger UI

**Авторизация операторов**: Bearer-токен, сверяется с `OPERATOR_SECRET_KEY`.

**Email-уведомления**: Отправка через Gmail SMTP (`ulyanov.ht@gmail.com` → `ulyanov.ht@gmail.com`) при создании заявки. HTML-письмо содержит ссылки на загруженные файлы.

**WhatsApp Business API**:
- Исходящие сообщения отправляются через `POST /api/whatsapp/send`
- Входящие сообщения принимаются на `POST /api/whatsapp/webhook`
- Webhook URL: `https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/whatsapp/webhook`
- Сообщения автоматически привязываются к заявке по номеру телефона клиента (нормализация: `re.sub(r'\D', '', phone)`)
- В Timeline сохраняется `direction: incoming/outgoing` и `created_by: Client/Operator`

**AI Assistant (Gemini)**:
- Эндпоинт: `POST /api/ai/generate-response` — генерирует ответ менеджера на основе истории WhatsApp-переписки, данных заявки и базы знаний компании
- Использует Google Gemini (`gemini-2.5-flash-lite`) через `google-generativeai`
- Требует `GEMINI_API_KEY` в переменных окружения
- Работает в ручном режиме: оператор в CRM нажимает кнопку «ИИ ответ» и получает сгенерированный текст в поле ввода

**Proposal Builder (AI-извлечение данных)**:
- Stage 1: Извлечение данных — Gemini анализирует загруженные счета и возвращает структурированные данные (`service_type`, `current_provider`, `contract_number`, `current_tariff`, `power_kw`, `avg_monthly_consumption_kwh`, `avg_monthly_cost_eur`, `contract_end_date`)
- Данные сохраняются в подколлекции `proposal_data` (документ `data`)
- Stage 2 (TODO): Симуляции поставщиков — создание сравнительных предложений
- Stage 3 (TODO): Генерация PDF коммерческого предложения

**CORS**: Разрешены `*`, `http://localhost:3000`, `https://entraycompara.com`, `https://www.entraycompara.com`

### 6.2. Admin Panel (`apps/admin-panel/`)

**Стек**: React 19, TypeScript, Vite, `@hello-pangea/dnd` (Kanban), `i18next` (локализация), `@tanstack/react-query`

**Ключевые компоненты**:
- `Dashboard.tsx` — основная панель со списком заявок (таблица / Kanban)
- `KanbanBoard.tsx` — Kanban-доска по статусам с drag-and-drop
- `DetailView.tsx` — детальный просмотр заявки, смена статуса/типа услуги, удаление
- `Timeline.tsx` — таймлайн коммуникаций (NOTE, WHATSAPP, CALL, EMAIL)
- `WhatsAppChatPanel.tsx` — панель для отправки/получения WhatsApp сообщений
- `Auth.tsx` — простая авторизация по секретному ключу (сохраняется в `localStorage` как `authToken`)
- `services/api.ts` — HTTP-клиент к бэкенду (хардкожен `API_BASE_URL`)

**WhatsApp в CRM**:
- В `Timeline.tsx` сообщения WhatsApp отображаются в виде chat bubbles (входящие слева, исходящие справа)
- Оператор может отправить сообщение, выбрав тип **WhatsApp** в форме Timeline
- Добавлена кнопка **Email** для создания email-заметок

**AI Assistant в CRM**:
- В `WhatsAppChatPanel.tsx` добавлена кнопка «ИИ ответ» (⚡) в заголовке чата
- При нажатии вызывается `POST /api/ai/generate-response` — Gemini анализирует историю переписки и данные заявки
- Сгенерированный текст появляется в поле ввода — оператор может отредактировать и отправить

**Важно**: `compiled/index.html` — это SPA с хэш-роутингом (`#/`).

### 6.3. Landing Page (`apps/landing-page/`)

**Стек**: React 19 (в `compiled/` через CDN), TypeScript, Vite, Tailwind CSS

**Ключевые компоненты**:
- `HeroSection.tsx` — главный экран
- `FileUploadForm.tsx` — форма загрузки файлов (существует в исходниках, но **НЕ импортирована в `App.tsx`**, поэтому Vite вырезает её при сборке — tree shaking)
- `LanguageContext.tsx` — мультиязычность (`es`, `eu`, `ru`, `uk`)
- `SEOMetadata.tsx` — SEO-теги
- `LiveRequestsBlock.tsx` — блок "живых" заявок

**ВАЖНО**: Форма `FileUploadForm.tsx` есть в исходниках, но отсутствует в `compiled/`. Если ты добавляешь её в `App.tsx`, не забудь пересобрать и обновить `compiled/`.

---

## 7. Инфраструктура Google Cloud

### Cloud Run сервисы

| Сервис | Регион | Тип трафика | Service Account | Домен |
|--------|--------|-------------|-----------------|-------|
| `backend-upload-service` | `europe-west1` | All (public) | `910753338248-compute@developer.gserviceaccount.com` | — |
| `entraycompara-landing-page-prod` | `us-west1` | All (public) | `910753338248-compute@developer.gserviceaccount.com` | — |
| `entraycompara-adminpanel` | `us-west1` | All (public) | `910753338248-compute@developer.gserviceaccount.com` | — |
| `backend-upload-service-staging` | `europe-west1` | All (public) | `910753338248-compute@developer.gserviceaccount.com` | — |
| `entraycompara-landing-page-staging` | `europe-west1` | All (public) | `910753338248-compute@developer.gserviceaccount.com` | `entraycompara.com` |
| `entraycompara-adminpanel-staging` | `europe-west1` | All (public) | `910753338248-compute@developer.gserviceaccount.com` | `crm.entraycompara.com` |

### Firestore

- **База**: `projects/entraycompara/databases/(default)`
- **Регион**: `europe-west1`
- **Коллекция заявок**: `applications`
- **Подколлекция событий**: `applications/{id}/timeline`

### Cloud Storage

- `gs://entraycompara-invoices/` — файлы клиентов (папка `submissions/YYYY/MM/DD/`)
- `gs://ai-studio-bucket-910753338248-us-west1/` — артефакты AI Studio

### Secret Manager

- `GMAIL_USER` — Gmail-адрес для SMTP
- `GMAIL_APP_PASSWORD` — App-пароль Gmail
- `deepapi` — DeepSeek API ключ
- `deepseek-api-key-invoice-fn` — ещё один DeepSeek ключ
- `sendgrid-api-key` — SendGrid API ключ

---

## 8. Типичные задачи и как их делать

### 8.1. Изменить текст на лендинге

1. Отредактируй `apps/landing-page/locales/*.json` (или компонент)
2. Запусти локально:
   ```bash
   cd apps/landing-page
   npm install
   npm run build
   ```
3. Скопируй `dist/` в `compiled/`:
   ```bash
   cp -r dist/* compiled/
   ```
4. Проверь, что `compiled/assets/index-*.js` обновился
5. Commit, push в `main`
6. Дождись staging-деплоя
7. Проверь `https://entraycompara.com`
8. При необходимости запусти production workflow вручную

### 8.2. Добавить поле в CRM

1. Измени `apps/admin-panel/components/Dashboard.tsx` и/или `DetailView.tsx`
2. Если нужно — обнови `types.ts`
3. Собери проект:
   ```bash
   cd apps/admin-panel
   npm install --legacy-peer-deps
   npm run build
   ```
4. Скопируй `dist/` в `compiled/`
5. Commit, push в `main`, проверь staging

### 8.3. Изменить API бэкенда

1. Отредактируй `apps/backend-upload-service/main.py`
2. **НЕ меняй** структуру Firestore без согласования
3. Commit, push в `main`
4. Проверь staging: `https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/docs`
5. При необходимости запусти production workflow

### 8.4. Обновить зависимости

**Для backend**:
```bash
cd apps/backend-upload-service
pip freeze > requirements.txt
```

**Для фронтендов**:
```bash
cd apps/landing-page
npm install <package>
# Не забудь скопировать dist/ в compiled/ после build
```

---

## 9. Чеклист перед production-деплоем

- [ ] Staging-сервисы отвечают HTTP 200
- [ ] Для фронтендов: `compiled/` обновлён и содержит изменения
- [ ] Для бэкенда: новые эндпоинты проверены через Swagger (`/docs`)
- [ ] Нет изменений в IAM, секретах, bucket-политиках
- [ ] Пользователь явно попросил задеплоить в продакшен

---

## 10. Контакты и доступы

- **GCP Project**: `entraycompara`
- **GitHub Repo**: https://github.com/AlexandrUlyanov/entraycompara-platform
- **GitHub Actions**: вкладка Actions в репозитории
- **Cloud Console**: https://console.cloud.google.com/run?project=entraycompara

---

## 11. История и контекст

Этот проект был создан из двух отдельных репозиториев (`EntraycomparaPROD` и `crm.entraycompara`) плюс бэкенд, который существовал только в Cloud Run без связанного GitHub-репозитория. Все исходники были выгружены из ZIP-архивов Google Cloud Storage, чтобы гарантировать идентичность с продакшеном.

**Почему `compiled/` важен**: Продакшен landing и admin были задеплоены через Google AI Studio, которая создаёт сборку с внешними CDN-зависимостями. Чтобы staging был идентичен продакшену, мы используем эти же `compiled/` ассеты.

---

*Документ актуален на: апрель 2026*
