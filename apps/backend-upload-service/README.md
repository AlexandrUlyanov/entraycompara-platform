# Backend Upload Service

Python/FastAPI сервис для обработки заявок: загрузка файлов в Google Cloud Storage, отправка email-уведомлений, управление заявками и таймлайном в Firestore.

## Стек

- Python 3.12
- FastAPI
- Uvicorn
- google-cloud-storage
- google-cloud-firestore
- python-multipart
- pydantic

## Структура

```
backend-upload-service/
├── main.py             # FastAPI приложение
├── Dockerfile          # Образ для Cloud Run
├── requirements.txt    # Python-зависимости
├── Procfile            # Для совместимости с Heroku/gcloud buildpacks
└── README.md           # Этот файл
```

## Локальная разработка

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

Swagger UI будет доступен по адресу: `http://localhost:8080/docs`

## Основные эндпоинты

### Публичные
- `POST /api/submit_application` — отправка заявки с файлами
  - Сохраняет файлы в `gs://entraycompara-invoices/submissions/YYYY/MM/DD/`
  - Создаёт документ в Firestore (`applications`)
  - Отправляет email-уведомление оператору через Gmail SMTP

### Для операторов (требуется Bearer `OPERATOR_SECRET_KEY`)
- `GET /api/applications` — список заявок (с пагинацией, фильтрами, поиском)
- `GET /api/applications/{id}` — детали заявки
- `PUT /api/applications/{id}/status` — смена статуса
- `PUT /api/applications/{id}/service_type` — смена типа услуги
- `DELETE /api/applications/{id}` — удаление заявки
- `GET /api/applications/{id}/timeline` — таймлайн событий
- `POST /api/applications/{id}/timeline` — добавление события
- `DELETE /api/applications/{id}/timeline/{event_id}` — удаление события
- `POST /api/generate-signed-url` — генерация подписанной ссылки на файл GCS

## Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| `GCP_BUCKET_NAME` | GCS бакет для файлов | `entraycompara-invoices` |
| `OPERATOR_SECRET_KEY` | Секретный ключ для авторизации операторов | — |
| `GMAIL_USER` | Gmail-адрес для SMTP | из Secret Manager |
| `GMAIL_APP_PASSWORD` | App-пароль Gmail | из Secret Manager |

## CORS

Разрешённые origins:
- `*`
- `http://localhost:3000`
- `https://entraycompara.com`
- `https://www.entraycompara.com`

## Деплой

- **Staging**: `https://backend-upload-service-staging-910753338248.europe-west1.run.app/docs`
- **Production**: `https://backend-upload-service-910753338248.europe-west1.run.app/docs`

Автодеплой настроен через GitHub Actions (`.github/workflows/deploy-staging.yml`).
