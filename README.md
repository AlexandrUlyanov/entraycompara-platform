# Entraycompara Platform

Монорепозиторий Entraycompara: публичный лендинг, внутренняя CRM и backend API для обработки заявок, документов, WhatsApp-коммуникации, AI-извлечения данных, симуляций и коммерческих предложений.

GitHub: https://github.com/AlexandrUlyanov/entraycompara-platform
GCP Project: `entraycompara`

---

## Сервисы

| Сервис | Папка | Назначение | Домен / URL |
|--------|-------|------------|-------------|
| Landing Page | `apps/landing-page/` | Публичный сайт для сбора заявок | `https://entraycompara.com` |
| Admin Panel / CRM | `apps/admin-panel/` | CRM операторов, воронка, таймлайн, КП, Sales Department, настройки | `https://crm.entraycompara.com` |
| Backend Upload Service | `apps/backend-upload-service/` | FastAPI API, Firestore, GCS, WhatsApp, Gemini, генерация КП | `https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app` |

---

## Структура

```text
entraycompara-platform/
├── apps/
│   ├── landing-page/              # React + Express, публичный лендинг
│   ├── admin-panel/               # React + Express, CRM
│   └── backend-upload-service/    # Python/FastAPI backend
├── docs/                          # ТЗ, rollout-документы и интеграционные инструкции
├── infra/                         # Cloud Run конфиги и старые Cloud Build артефакты
├── .github/workflows/
│   ├── deploy-staging.yml         # Автодеплой staging при push в main
│   └── deploy-production.yml      # Ручной production deploy
├── AGENTS.md                      # Обязательные инструкции для LLM/разработчиков
└── README.md
```

---

## Деплой

### Staging

`push` в `main` запускает `.github/workflows/deploy-staging.yml`.

| Сервис Cloud Run | Регион | Что деплоит |
|------------------|--------|-------------|
| `backend-upload-service-staging` | `europe-west1` | Backend API |
| `entraycompara-landing-page-staging` | `europe-west1` | Landing, домен `entraycompara.com` |
| `entraycompara-adminpanel-staging` | `europe-west1` | CRM, домен `crm.entraycompara.com` |

### Production

Production деплоится только вручную через `.github/workflows/deploy-production.yml` после явного подтверждения.

| Сервис Cloud Run | Регион |
|------------------|--------|
| `backend-upload-service` | `europe-west1` |
| `entraycompara-landing-page-prod` | `us-west1` |
| `entraycompara-adminpanel` | `us-west1` |

---

## Данные и инфраструктура

- Firestore: `projects/entraycompara/databases/(default)` в `europe-west1`
- Основная коллекция: `applications`
- Таймлайн: `applications/{id}/timeline`
- GCS bucket: `gs://entraycompara-invoices/`
- AI Studio artifacts: `gs://ai-studio-bucket-910753338248-us-west1/`

Важно: staging и production используют один Firestore и один GCS bucket. Любые тесты на staging могут затронуть реальные данные.

---

## Ключевые возможности

- Загрузка заявок и документов с лендинга.
- CRM с таблицей, Kanban, карточкой лида и таймлайном.
- WhatsApp Cloud API: исходящие сообщения, входящие webhook, статусы sent/delivered/read/failed.
- CRM Settings: раздел `Настройки CRM` → `Подключение WhatsApp` → `WhatsApp Connection Health`.
- AI Assistant для черновиков WhatsApp-сообщений.
- Sales Department AI: Next Best Action, safety guardrails, follow-up control, audit trail.
- Proposal Builder: извлечение данных, симуляции, генерация PDF-КП.
- Eni auto-simulation runner через Cloud Run Job.

---

## Frontend `compiled/`

Landing и CRM в Docker не собираются через Vite. Docker копирует готовую сборку из `compiled/`.

Если меняешь frontend:

```bash
cd apps/admin-panel
npm install --legacy-peer-deps
npm run build
```

Затем скопируй `dist/` в `compiled/`. На PowerShell:

```powershell
$compiled = Resolve-Path 'compiled'
$dist = Resolve-Path 'dist'
Get-ChildItem -LiteralPath $compiled.Path -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $dist.Path '*') -Destination $compiled.Path -Recurse -Force
```

То же правило действует для `apps/landing-page/`.

---

## Локальный запуск

### CRM

```bash
cd apps/admin-panel
npm install --legacy-peer-deps
npm run dev
```

### Landing

```bash
cd apps/landing-page
npm install
npm run dev
```

### Backend

```bash
cd apps/backend-upload-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

Swagger: `http://localhost:8080/docs`

---

## Важные документы

- `AGENTS.md` — обязательные правила работы с проектом.
- `docs/README.md` — индекс документации.
- `docs/whatsapp-cloud-api.md` — WhatsApp Cloud API и Connection Health.
- `docs/sales-department-rollout.md` — rollout Sales Department.
- `docs/roadmap-sales-department-autopilot.md` — roadmap автопилота.

---

## Проверки

Backend:

```bash
python -m py_compile apps\backend-upload-service\main.py apps\backend-upload-service\job_runner.py
python -m unittest discover -s apps/backend-upload-service/tests
```

CRM:

```bash
cd apps/admin-panel
npm run build
```

Landing:

```bash
cd apps/landing-page
npm run build
```

---

Документ актуален на: 30 апреля 2026.
