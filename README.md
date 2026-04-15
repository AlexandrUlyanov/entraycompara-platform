# Entraycompara Platform

Монорепозиторий, содержащий полную кодовую базу всех сервисов Entraycompara.

🔗 **GitHub**: https://github.com/AlexandrUlyanov/entraycompara-platform  
☁️ **GCP Project**: `entraycompara`

---

## Что входит в платформу

| Сервис | Описание | Домен / URL |
|--------|----------|-------------|
| **Landing Page** | Публичный лендинг для привлечения клиентов | `https://entraycompara.com` |
| **Admin Panel (CRM)** | Внутренняя CRM для операторов | `https://crm.entraycompara.com` |
| **Backend Upload Service** | API для загрузки файлов, email-уведомлений, управления заявками | `https://backend-upload-service-910753338248.europe-west1.run.app` |

---

## Структура репозитория

```
entraycompara-platform/
├── apps/
│   ├── landing-page/              # Лендинг (React + Express)
│   ├── admin-panel/               # CRM (React + Express)
│   └── backend-upload-service/    # Backend API (Python + FastAPI)
├── infra/
│   ├── cloud-run-configs/         # JSON-конфигурации Cloud Run
│   └── cloud-build-triggers.json  # Старые Cloud Build триггеры
├── .github/workflows/
│   ├── deploy-staging.yml         # Автодеплой в staging
│   └── deploy-production.yml      # Ручной деплой в продакшен
├── AGENTS.md                      # ← Обязательно к прочтению для разработчиков
└── README.md                      # Этот файл
```

---

## Архитектура деплоя

### Активные сервисы в Google Cloud Run

| Сервис | Регион | Назначение |
|--------|--------|------------|
| `entraycompara-landing-page-prod` | `us-west1` | Продакшен лендинг (без домена) |
| `entraycompara-adminpanel` | `us-west1` | Продакшен CRM (без домена) |
| `backend-upload-service` | `europe-west1` | Продакшен API |
| `entraycompara-landing-page-staging` | `europe-west1` | **Staging лендинг** (`entraycompara.com`) |
| `entraycompara-adminpanel-staging` | `europe-west1` | **Staging CRM** (`crm.entraycompara.com`) |
| `backend-upload-service-staging` | `europe-west1` | Staging API |

### Базы данных
- **Firestore Native:** `projects/entraycompara/databases/(default)` в `europe-west1`
- **Коллекция заявок:** `applications`
- **Подколлекция событий:** `applications/{id}/timeline`

### Хранилище (GCS)
- `gs://entraycompara-invoices/` — загруженные файлы клиентов
- `gs://ai-studio-bucket-910753338248-us-west1/` — артефакты AI Studio

### Secrets (Google Secret Manager)
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `deepapi`
- `deepseek-api-key-invoice-fn`
- `sendgrid-api-key`

---

## CI/CD

### Staging (автоматический деплой)
**Триггер**: push в `main`

При каждом push GitHub Actions собирает Docker-образы всех трёх приложений и деплоит их в staging-сервисы в `europe-west1`.

### Production (ручной деплой)
**Триггер**: `workflow_dispatch` в GitHub Actions

Запускается вручную через вкладку **Actions → Deploy to Production → Run workflow**.

### GitHub Secrets
- `GCP_SA_KEY` — ключ сервисного аккаунта для GCP
- `BACKEND_OPERATOR_SECRET_KEY` — секретный ключ бэкенда

---

## Локальный запуск

### Landing Page
```bash
cd apps/landing-page
npm install
npm run dev
```

### Admin Panel
```bash
cd apps/admin-panel
npm install --legacy-peer-deps
npm run dev
```

### Backend
```bash
cd apps/backend-upload-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

---

## Критически важно для разработчиков

> ⚠️ **Прочитай `AGENTS.md` перед любыми изменениями!**

Основные правила:
- **Фронтенды** (`landing-page`, `admin-panel`) деплоятся из папки `compiled/`, а не из `dist/` после локальной сборки.
- Если меняешь исходники фронтенда, обязательно пересобери проект и скопируй `dist/` в `compiled/`.
- **Staging использует продакшен-данные**: Firestore и GCS bucket общие для staging и prod.
- **Не деплой в production без явного разрешения**.

---

## История проекта

Проект был создан из двух отдельных репозиториев (`EntraycomparaPROD` и `crm.entraycompara`) плюс бэкенд, который существовал только в Cloud Run. Все исходники были выгружены из ZIP-архивов Google Cloud Storage для гарантии идентичности с продакшеном.

---

*Документ актуален на: апрель 2026*
