# Инструкция для LLM-агентов: Entraycompara Platform

> ⚠️ **ВАЖНО**: Перед любыми изменениями прочитай этот файл целиком. Проект — продакшен-система с живыми пользователями, платежами и данными клиентов.

---

## 1. Общее описание проекта

**Entraycompara Platform** — монорепозиторий, объединяющий три продакшен-сервиса:

1. **Landing Page** (`apps/landing-page/`) — публичный лендинг для сбора заявок от клиентов (сравнение коммунальных счетов в Испании)
2. **Admin Panel** (`apps/admin-panel/`) — внутренняя CRM-система для операторов (Kanban, таймлайн, управление заявками)
3. **Backend Upload Service** (`apps/backend-upload-service/`) — Python/FastAPI API для загрузки файлов, email-уведомлений и управления заявками в Firestore

### Архитектура деплоя

| Сервис | Продакшен URL | Staging URL | Домен | Технология |
|--------|---------------|-------------|-------|------------|
| Landing | `entraycompara-landing-page-prod` (us-west1) | `entraycompara-landing-page-staging` (europe-west1) | `https://entraycompara.com` | React + Express |
| Admin | `entraycompara-adminpanel` (us-west1) | `entraycompara-adminpanel-staging` (europe-west1) | `https://crm.entraycompara.com` | React + Express |
| Backend | `backend-upload-service` (europe-west1) | `backend-upload-service-staging` (europe-west1) | — | Python/FastAPI |

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
│   │   ├── Dockerfile             # Сборка через node:22-alpine
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
│   ├── deploy-staging.yml         # Автодеплой в staging
│   └── deploy-production.yml      # Ручной деплой в продакшен
└── README.md
```

---

## 3. КРИТИЧЕСКИ ВАЖНЫЕ НЮАНСЫ

### 3.1. `compiled/` — святая святых

Папки `apps/landing-page/compiled/` и `apps/admin-panel/compiled/` содержат **точные копии** того, что сейчас работает в продакшене. Эти файлы были выгружены из Google Cloud Storage (`gs://ai-studio-bucket-.../compiled/`).

**ПРАВИЛО**: 
- Если ты меняешь логику фронтенда (landing или admin), нужно обновлять **и** исходники (`components/`, `App.tsx`) **и** `compiled/`.
- `compiled/index.html` — это **полностью собранное** SPA-приложение (весь JS/CSS заинлайнен в один HTML-файл размером ~190 KB для landing и ~125 KB для admin).
- Docker-образы для landing и admin **не собирают** проект через Vite. Они копируют `compiled/` и раздают его через Express `server.js`.

**Как обновлять `compiled/`:**
1. Внеси изменения в исходники (`components/`, `App.tsx`)
2. Локально запусти `npm install && npm run build` в папке приложения
3. Скопируй содержимое `dist/` в `compiled/`:
   ```bash
   cp -r apps/landing-page/dist/* apps/landing-page/compiled/
   ```
4. Убедись, что `compiled/index.html` увеличился в размере и содержит изменения
5. Только тогда коммить

### 3.2. Backend URL жёстко зашит в `source.zip`, но НЕ в `compiled/`

В исходниках (`source.zip`) landing и admin были задеплоены через Google AI Studio. AI Studio при деплое создавала **два артефакта**:
- `source.zip` — исходный код
- `compiled/` — финальная сборка

В `compiled/index.html` **нет** прямых ссылок на бэкенд. Вместо этого используется прокси через `/api-proxy` на Express-сервере (`server.js`), который добавляется AI Studio.

**НО**: в нашем репозитории мы используем `server.js` из `source.zip`, который добавляет прокси для Gemini API. Для бэкенда `api.ts` (admin) и `FileUploadForm.tsx` (landing) в **исходниках** есть прямые URL на `backend-upload-service-...run.app`.

**Для staging** (europe-west1) фронтенды и бэкенд находятся в одном регионе, но URL разные. Сейчас в workflow **не делается** автозамена URL, потому что:
- Landing `compiled/index.html` не обращается напрямую к бэкенду (нет формы загрузки в продакшенной сборке)
- Admin `compiled/index.html` тоже не содержит прямых URL
- Backend URL используется только в **исходниках** (`api.ts`, `FileUploadForm.tsx`)

**Если нужно, чтобы staging-версия фронтенда работала с staging-бэкендом**, придётся либо:
- Обновлять `compiled/` вручную с правильным URL
- Либо настраивать переменную окружения в `server.js`

### 3.3. Бэкенд работает с продакшен-данными даже в staging

`backend-upload-service-staging` использует:
- **Тот же Firestore** (`(default)` в `europe-west1`)
- **Тот же GCS bucket** (`entraycompara-invoices`)
- **Те же Secrets** (`GMAIL_USER`, `GMAIL_APP_PASSWORD`)

Это означает: **тестовые запросы на staging-бэкенд создают реальные заявки и отправляют реальные письма**.

**ПРАВИЛО**: не спамь staging бэкенд тестовыми данными.

### 3.4. Dockerfile landing и admin — особые

Они НЕ используют `npm run build` внутри Docker. Вместо этого:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY compiled/ ./dist/          # ← готовые ассеты
COPY server/package.json ./
COPY server/server.js ./
COPY server/public/ ./public/
RUN npm install                 # ← только зависимости сервера
ENV PORT=3000
CMD ["node", "server.js"]
```

**НЕ меняй** эту структуру, если не хочешь сломать идентичность с продакшеном.

### 3.5. Backend Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
ENV PORT=8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

Стандартный, без нюансов.

---

## 4. CI/CD процесс

### Staging деплой (`deploy-staging.yml`)
**Триггер**: push в `main`
**Что происходит**:
1. Сборка и пуш Docker-образа backend
2. Деплой backend в `backend-upload-service-staging` (europe-west1)
3. Сборка и пуш Docker-образа landing
4. Деплой landing в `entraycompara-landing-page-staging` (europe-west1)
5. Сборка и пуш Docker-образа admin
6. Деплой admin в `entraycompara-adminpanel-staging` (europe-west1)

### Production деплой (`deploy-production.yml`)
**Триггер**: только ручной запуск (`workflow_dispatch`)
**Что происходит**:
- Те же шаги, но в продакшен-сервисы:
  - `backend-upload-service`
  - `entraycompara-landing-page-prod`
  - `entraycompara-adminpanel`

### GitHub Secrets
- `GCP_SA_KEY` — JSON-ключ сервисного аккаунта `github-actions@entraycompara.iam.gserviceaccount.com`
- `BACKEND_OPERATOR_SECRET_KEY` — секретный ключ для авторизации операторов в API

---

## 5. Как безопасно вносить изменения

### Алгоритм для любого изменения:

1. **Пойми, какой сервис(ы) трогаешь**
2. **Внеси изменения локально**
3. **Для фронтендов**: обязательно обнови `compiled/`
4. **Проверь staging** (автодеплой запустится после push в `main`)
5. **Убедись, что всё работает на staging URL'ах**
6. **Только потом** запускай `Deploy to Production` вручную через GitHub Actions

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

**Стек**: Python 3.12, FastAPI, Uvicorn, google-cloud-storage, google-cloud-firestore

**Ключевые эндпоинты**:
- `POST /api/submit_application` — публичная отправка заявки с файлами
- `GET /api/applications` — список заявок для CRM (с пагинацией, фильтрами)
- `GET /api/applications/{id}` — детали заявки
- `PUT /api/applications/{id}/status` — смена статуса
- `GET /api/applications/{id}/timeline` — таймлайн событий
- `POST /api/generate-signed-url` — подписанная ссылка на файл из GCS
- `GET /docs` — Swagger UI

**Авторизация операторов**: Bearer-токен, сверяется с `OPERATOR_SECRET_KEY`

**Email-уведомления**: Отправка через Gmail SMTP (`ulyanov.ht@gmail.com`) при создании заявки

**CORS**: Разрешены `*`, `http://localhost:3000`, `https://entraycompara.com`, `https://www.entraycompara.com`

### 6.2. Admin Panel (`apps/admin-panel/`)

**Стек**: React 19, TypeScript, Vite, `@hello-pangea/dnd` (Kanban), `i18next` (локализация)

**Ключевые компоненты**:
- `Dashboard.tsx` — основная панель со списком заявок
- `KanbanBoard.tsx` — Kanban-доска по статусам
- `DetailView.tsx` — детальный просмотр заявки
- `Timeline.tsx` — таймлайн коммуникаций
- `Auth.tsx` — простая авторизация по секретному ключу
- `services/api.ts` — HTTP-клиент к бэкенду

**Важно**: В `compiled/index.html` нет разделения на страницы — это SPA с хэш-роутингом (`#/`).

### 6.3. Landing Page (`apps/landing-page/`)

**Стек**: React 19, TypeScript, Vite, Tailwind CSS

**Ключевые компоненты**:
- `HeroSection.tsx` — главный экран
- `FileUploadForm.tsx` — форма загрузки файлов (НЕ используется в `compiled/`!)
- `LanguageContext.tsx` — мультиязычность (es, eu, ru, uk)
- `SEOMetadata.tsx` — SEO-теги

**ВАЖНО**: Форма `FileUploadForm.tsx` есть в исходниках, но она **не импортирована в `App.tsx`**, поэтому Vite вырезает её при сборке (tree shaking). В `compiled/index.html` её нет.

---

## 7. Инфраструктура Google Cloud

### Cloud Run сервисы

| Сервис | Регион | Тип трафика | SA | Домен |
|--------|--------|-------------|-----|-------|
| `backend-upload-service` | europe-west1 | All (public) | 910753338248-compute@developer.gserviceaccount.com | — |
| `entraycompara-landing-page-prod` | us-west1 | All (public) | 910753338248-compute@developer.gserviceaccount.com | — |
| `entraycompara-adminpanel` | us-west1 | All (public) | 910753338248-compute@developer.gserviceaccount.com | — |
| `backend-upload-service-staging` | europe-west1 | All (public) | 910753338248-compute@developer.gserviceaccount.com | — |
| `entraycompara-landing-page-staging` | europe-west1 | All (public) | 910753338248-compute@developer.gserviceaccount.com | `entraycompara.com` |
| `entraycompara-adminpanel-staging` | europe-west1 | All (public) | 910753338248-compute@developer.gserviceaccount.com | `crm.entraycompara.com` |

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
4. Проверь размер `compiled/index.html` (~190 KB)
5. Commit, push
6. Дождись staging-деплоя
7. Проверь https://entraycompara-landing-page-staging-910753338248.europe-west1.run.app/
8. Запусти production workflow вручную

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
5. Commit, push, проверь staging

### 8.3. Изменить API бэкенда

1. Отредактируй `apps/backend-upload-service/main.py`
2. **НЕ меняй** структуру Firestore без согласования
3. Commit, push
4. Проверь staging: https://backend-upload-service-staging-910753338248.europe-west1.run.app/docs
5. Запусти production workflow

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
- [ ] Для бэкенда: новые эндпоинты проверены через Swagger (/docs)
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

**Почему `compiled/` важен**: Продакшен landing и admin задеплоены через Google AI Studio, которая использует особый формат сборки (всё в один HTML). Чтобы staging был идентичен продакшену, мы используем эти же `compiled/` ассеты.

---

*Документ актуален на: апрель 2026*
