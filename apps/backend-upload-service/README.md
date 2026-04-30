# Backend Upload Service

Python/FastAPI backend Entraycompara. Отвечает за заявки, файлы, Firestore, GCS, email, WhatsApp Cloud API, Gemini, извлечение данных, симуляции и генерацию PDF-КП.

## Стек

- Python 3.12
- FastAPI + Uvicorn
- Google Cloud Storage
- Google Cloud Firestore
- `requests`
- `google-generativeai`
- Playwright/Chromium для Eni simulation runner
- `fpdf2` и PDF tooling для КП

## Структура

```text
backend-upload-service/
├── main.py                 # FastAPI application
├── eni_simulator.py        # Playwright automation для Eni
├── job_runner.py           # Cloud Run Job entrypoint для авто-симуляции
├── retailer_catalog.py     # Каталог коммерциализаторов
├── requirements.txt
├── Dockerfile
└── README.md
```

## Локальный запуск

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

Swagger UI: `http://localhost:8080/docs`

## Авторизация операторов

Операторские endpoints требуют:

```http
Authorization: Bearer <OPERATOR_SECRET_KEY>
```

CRM хранит токен в `localStorage` как `authToken`.

## Основные endpoints

### Public

- `POST /api/submit_application` — создать заявку и загрузить файлы.
- `GET /api/whatsapp/webhook` — Meta webhook verification.
- `POST /api/whatsapp/webhook` — входящие WhatsApp сообщения и статусы доставки.

### Applications

- `GET /api/applications`
- `GET /api/applications/{id}`
- `PUT /api/applications/{id}`
- `PUT /api/applications/{id}/status`
- `PUT /api/applications/{id}/service_type`
- `DELETE /api/applications/{id}`
- `POST /api/applications/{id}/upload-files`

### Timeline

- `GET /api/applications/{id}/timeline`
- `POST /api/applications/{id}/timeline`
- `DELETE /api/applications/{id}/timeline/{event_id}`

### WhatsApp

- `GET /api/whatsapp/health` — read-only health snapshot для CRM Settings.
- `POST /api/whatsapp/send` — отправка текстового сообщения.
- `POST /api/whatsapp/send-media` — загрузка и отправка файла.
- `POST /api/whatsapp/send-document` — отправка уже доступного URL документа.
- `POST /api/whatsapp/send-proposal` — отправка PDF-КП.
- `POST /api/whatsapp/send-first-message` — первое template-сообщение `hola`.

### AI Assistant

- `POST /api/ai/generate-response` — черновик WhatsApp-сообщения от sales agent.

### Proposal Builder

- `POST /api/applications/{id}/proposal/extract-data`
- `GET /api/applications/{id}/proposal/extract-data/{task_id}/status`
- `GET /api/applications/{id}/proposal/extract-data/latest`
- `PUT /api/applications/{id}/proposal/extracted-data`
- `GET /api/applications/{id}/proposal/extracted-data`
- `GET /api/applications/{id}/proposal/retailers`
- `POST /api/applications/{id}/proposal/simulations`
- `GET /api/applications/{id}/proposal/simulations`
- `PUT /api/applications/{id}/proposal/simulations/{sim_id}`
- `DELETE /api/applications/{id}/proposal/simulations/{sim_id}`
- `POST /api/applications/{id}/proposal/simulations/{sim_id}/select`
- `POST /api/applications/{id}/proposal/simulations/auto-create`
- `GET /api/applications/{id}/proposal/simulations/auto-create/{task_id}/status`
- `GET /api/applications/{id}/proposal/simulations/auto-create/latest`
- `POST /api/applications/{id}/proposal/generate`
- `GET /api/applications/{id}/proposal/preview`

### Sales Department

- `GET /api/applications/{id}/sales-department/state`
- `POST /api/applications/{id}/sales-department/analyze`
- `GET /api/applications/{id}/sales-department/actions`
- `POST /api/applications/{id}/sales-department/actions/{action_id}/approve`
- `POST /api/applications/{id}/sales-department/actions/{action_id}/skip`
- `GET /api/applications/{id}/sales-department/audit`
- `GET /api/applications/{id}/sales-department/followups`
- `POST /api/applications/{id}/sales-department/followups/{followup_id}/approve`
- `POST /api/applications/{id}/sales-department/followups/{followup_id}/skip`
- `POST /api/applications/{id}/sales-department/followups/{followup_id}/cancel`
- `POST /api/applications/{id}/sales-department/followups/{followup_id}/reschedule`
- `PUT /api/applications/{id}/sales-department/autopilot`
- `POST /api/applications/{id}/sales-department/handoff`

## WhatsApp Cloud API

Backend использует Meta Graph API version `v25.0`.

Нужные переменные:

| Переменная | Назначение |
|------------|------------|
| `WHATSAPP_PHONE_NUMBER_ID` | ID номера в WhatsApp Business |
| `WHATSAPP_ACCESS_TOKEN` | Token с `whatsapp_business_messaging` и `whatsapp_business_management` |
| `WHATSAPP_VERIFY_TOKEN` | Verify token для Meta webhook |

`GET /api/whatsapp/health` проверяет:

- наличие `WHATSAPP_PHONE_NUMBER_ID`
- наличие `WHATSAPP_ACCESS_TOKEN`
- наличие `WHATSAPP_VERIFY_TOKEN`
- доступность Meta Graph API
- данные номера: display phone, verified name, quality rating
- webhook callback URL

Endpoint ничего не отправляет клиентам.

Подробно: `docs/whatsapp-cloud-api.md`.

## Gemini

Переменные:

| Переменная | Назначение | Default |
|------------|------------|---------|
| `GEMINI_API_KEY` | API key Google Gemini | — |
| `GEMINI_MODEL` | модель для WhatsApp/Sales AI | `gemini-2.5-flash-lite` |
| `GEMINI_INVOICE_EXTRACTION_MODEL` | модель извлечения счетов | `gemini-2.5-pro` |

## Sales Department Kill Switch

```text
SALES_DEPARTMENT_AUTOMATION_ENABLED=false
```

Отключает event-driven reanalysis и автопилотные действия. Ручные чтения и действия оператора остаются доступны.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `GCP_BUCKET_NAME` | GCS bucket, default `entraycompara-invoices` |
| `OPERATOR_SECRET_KEY` | Bearer token для CRM |
| `GMAIL_USER` | Gmail SMTP user |
| `GMAIL_APP_PASSWORD` | Gmail app password |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp phone number id |
| `WHATSAPP_ACCESS_TOKEN` | Meta access token |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verify token |
| `GEMINI_API_KEY` | Google Gemini key |
| `GEMINI_MODEL` | Gemini model для AI assistant |
| `GEMINI_INVOICE_EXTRACTION_MODEL` | Gemini model для extraction |
| `SALES_DEPARTMENT_AUTOMATION_ENABLED` | kill switch Sales Department |

## CORS

Разрешены:

- `*`
- `http://localhost:3000`
- `https://entraycompara.com`
- `https://www.entraycompara.com`

## Деплой

- Staging: `backend-upload-service-staging` в `europe-west1`
- Production: `backend-upload-service` в `europe-west1`

Staging deploy запускается при push в `main`.
Production deploy только вручную.

## Проверки

```bash
python -m py_compile apps\backend-upload-service\main.py apps\backend-upload-service\job_runner.py
python -m unittest discover -s apps/backend-upload-service/tests
```

Документ актуален на: 30 апреля 2026.
