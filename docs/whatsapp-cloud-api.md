# WhatsApp Cloud API и CRM Connection Health

Документ описывает официальную интеграцию WhatsApp Cloud API в Entraycompara CRM.

## Что уже реализовано

Backend:

- Отправка текстовых сообщений через `POST /api/whatsapp/send`.
- Отправка файлов через `POST /api/whatsapp/send-media`.
- Отправка существующих документов через `POST /api/whatsapp/send-document`.
- Отправка PDF-КП через `POST /api/whatsapp/send-proposal`.
- Первое шаблонное сообщение `hola` через `POST /api/whatsapp/send-first-message`.
- Верификация webhook Meta через `GET /api/whatsapp/webhook`.
- Приём входящих сообщений и статусов через `POST /api/whatsapp/webhook`.
- Read-only health-check через `GET /api/whatsapp/health`.

CRM:

- WhatsApp chat panel в карточке лида.
- Timeline bubbles для входящих и исходящих сообщений.
- Статусы доставки `sent`, `delivered`, `read`, `failed` при наличии webhook status events.
- Раздел `Настройки CRM`.
- Первый пункт настроек: `Подключение WhatsApp`.
- Блок `WhatsApp Connection Health`.

## Secrets

Нужны GitHub Actions secrets:

```text
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_ACCESS_TOKEN
WHATSAPP_VERIFY_TOKEN
```

Они прокидываются в Cloud Run backend через `deploy-staging.yml` и `deploy-production.yml`.

## Meta permissions

Access Token должен иметь права:

```text
whatsapp_business_messaging
whatsapp_business_management
```

Рекомендуемый источник токена: Meta Business system user с нужными правами на WhatsApp Business Account.

## Webhook URLs

Staging:

```text
https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/whatsapp/webhook
```

Production:

```text
https://backend-upload-service-910753338248.europe-west1.run.app/api/whatsapp/webhook
```

В Meta for Developers нужно подписаться минимум на:

```text
messages
message_statuses
```

## Connection Health

Endpoint:

```http
GET /api/whatsapp/health
Authorization: Bearer <OPERATOR_SECRET_KEY>
```

Endpoint ничего не отправляет клиентам. Он проверяет:

- `WHATSAPP_PHONE_NUMBER_ID` присутствует.
- `WHATSAPP_ACCESS_TOKEN` присутствует.
- `WHATSAPP_VERIFY_TOKEN` присутствует.
- Meta Graph API отвечает на read-only запрос по phone number id.
- Возвращаются данные номера: display phone number, verified name, quality rating, verification status.
- Backend формирует webhook callback URL.

Пример ответа:

```json
{
  "configured": true,
  "ready_to_send": true,
  "webhook_ready": true,
  "api_version": "v25.0",
  "phone_number_id_present": true,
  "access_token_present": true,
  "verify_token_present": true,
  "meta_ok": true,
  "meta_error": null,
  "phone_number": "+34 611 97 49 84",
  "verified_name": "Entraycompara",
  "quality_rating": "GREEN",
  "code_verification_status": "VERIFIED",
  "webhook_callback_url": "https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/whatsapp/webhook",
  "checked_at": "2026-04-30T12:00:00Z"
}
```

CRM отображает это в `Настройки` -> `Подключение WhatsApp`.

## Проверка после деплоя

1. Открой `https://crm.entraycompara.com`.
2. Войди как оператор.
3. Нажми `Настройки`.
4. Открой `Подключение WhatsApp`.
5. Проверь `WhatsApp Connection Health`.
6. Если `Meta Graph API` красный, проверь токен и права system user.
7. Если `Verify Token` красный, проверь GitHub secret `WHATSAPP_VERIFY_TOKEN` и Cloud Run revision.
8. Если webhook не получает входящие, проверь подписки `messages` и `message_statuses` в Meta.

## Привязка входящих сообщений к лидам

Webhook нормализует телефон до цифр и ищет заявку по номеру клиента. Поэтому номер в CRM должен совпадать с номером WhatsApp клиента с учётом country code.

Если сообщение не привязалось:

- проверь `client_phone` в заявке;
- проверь формат номера в Meta webhook payload;
- проверь Cloud Run logs backend;
- убедись, что staging и production webhooks не конфликтуют.

## Ограничения WhatsApp

- Вне customer service window Meta требует approved template.
- Первое сообщение должно идти через template, сейчас используется `hola`.
- Обычный свободный текст можно отправлять, когда окно коммуникации открыто.
- Не считать статус `sent` финальным успехом: финальная диагностика строится по webhook status events.

## Безопасность

- Не логировать access token.
- Не сохранять токены в коде или документации.
- Не тестировать массовую отправку на реальных клиентах.
- Health-check read-only и безопасен для регулярного использования.

Документ актуален на: 30 апреля 2026.
