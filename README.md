# Entraycompara Platform

Монорепозиторий, содержащий полную кодовую базу всех сервисов Entraycompara, выгруженную из Google Cloud.

## Структура

```
entraycompara-platform/
├── apps/
│   ├── landing-page/              # Публичный лендинг (React + Vite)
│   ├── admin-panel/               # CRM / Admin Panel (React + Vite)
│   └── backend-upload-service/    # Backend API (Python + FastAPI)
├── infra/
│   ├── cloud-run-configs/         # JSON-конфигурации активных Cloud Run сервисов
│   └── cloud-build-triggers.json  # Cloud Build CI/CD триггеры
└── README.md
```

## Приложения

### `apps/landing-page`
- **Стек:** React, TypeScript, Vite
- **Описание:** Публичный лендинг для привлечения клиентов и сбора заявок
- **Источник:** ZIP-архив из `gs://ai-studio-bucket-910753338248-us-west1/services/entraycompara-landing-page-prod/version-32/source.zip`
- **Деплой:** Google AI Studio → Cloud Run `entraycompara-landing-page-prod` (`us-west1`)

### `apps/admin-panel`
- **Стек:** React, TypeScript, Vite
- **Описание:** Внутренняя CRM-система для операторов (Kanban, Timeline, Dashboard)
- **Источник:** ZIP-архив из `gs://ai-studio-bucket-910753338248-us-west1/services/entraycompara-adminpanel/version-13/source.zip`
- **Деплой:** Google AI Studio → Cloud Run `entraycompara-adminpanel` (`us-west1`)

### `apps/backend-upload-service`
- **Стек:** Python 3, FastAPI, Uvicorn
- **Описание:** API для загрузки файлов в GCS, отправки email-уведомлений, управления заявками и таймлайном в Firestore
- **Источник:** ZIP-архив из `gs://run-sources-entraycompara-europe-west1/services/backend-upload-service/1763606446.4415-c5af09231d974ab798a264dae87ca394.zip`
- **Деплой:** Cloud Run source deploy (`gcloud`) → `backend-upload-service` (`europe-west1`)

## Инфраструктура (Google Cloud)

### Активные Cloud Run сервисы
| Сервис | Регион | Образ / Источник |
|--------|--------|------------------|
| `entraycompara-landing-page-prod` | `us-west1` | `aistudio/applet-proxy` + GCS volume |
| `entraycompara-adminpanel` | `us-west1` | `aistudio/applet-proxy` + GCS volume |
| `backend-upload-service` | `europe-west1` | Собственный Docker-образ (buildpacks) |

### Базы данных
- **Firestore Native:**
  - `(default)` — `europe-west1`
  - `eyc1` — `eur3`

### Хранилище (GCS)
- `entraycompara-invoices` — загруженные файлы клиентов
- `ai-studio-bucket-910753338248-us-west1` — артефакты AI Studio (исходники landing & admin)
- `run-sources-entraycompara-europe-west1` — исходники backend-upload-service

### Secrets (Google Secret Manager)
- `GMAIL_APP_PASSWORD`
- `GMAIL_USER`
- `deepapi`
- `deepseek-api-key-invoice-fn`
- `sendgrid-api-key`

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
npm install
npm run dev
```

### Backend Upload Service
```bash
cd apps/backend-upload-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

## Переменные окружения

### backend-upload-service
| Переменная | Описание | Источник |
|------------|----------|----------|
| `GCP_BUCKET_NAME` | Имя GCS бакета для загрузки файлов | Hardcoded fallback: `entraycompara-invoices` |
| `OPERATOR_SECRET_KEY` | Секретный ключ для авторизации операторов | Environment variable |
| `GMAIL_USER` | Gmail-адрес для SMTP | Secret Manager |
| `GMAIL_APP_PASSWORD` | App-пароль Gmail | Secret Manager |

### landing-page / admin-panel
| Переменная | Описание |
|------------|----------|
| `GEMINI_API_KEY` | Placeholder в `.env.local` (не используется в продакшене) |

## Важные замечания

- **Все исходники взяты из ZIP-архивов GCS**, которые сейчас реально задеплоены в Cloud Run. Это гарантирует, что локальная копия идентична продакшену.
- **Cloud Build trigger** `entraycompara-prod` настроен на репозиторий `EntraycomparaPROD`, но активного Cloud Run сервиса с таким именем сейчас нет — вероятно, он был переименован в `entraycompara-landing-page-prod`.
- Для полного перехода на монорепозиторий рекомендуется настроить единый CI/CD (GitHub Actions или Cloud Build) для всех трёх приложений.
