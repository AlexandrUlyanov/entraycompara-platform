# ТЗ: Post-submit flow и личный кабинет клиента

Проект: Entraycompara Platform  
Раздел: Landing Page, Backend Upload Service, WhatsApp Cloud API, CRM, Client Area  
Язык клиентского интерфейса MVP: испанский  
Статус документа: актуализировано под текущий код на 30.04.2026

## 1. Контекст текущей системы

Сейчас `POST /api/submit_application` уже принимает заявку, валидирует и загружает файлы в GCS, создаёт документ в Firestore `applications`, пишет первое событие в `timeline`, запускает Sales Department reanalysis и отправляет email оператору.

В текущем ответе backend возвращает только `application_id` и `uploaded_files`. Клиент на landing видит обычное сообщение об успехе, без публичного номера заявки, WhatsApp-активации и личного кабинета.

WhatsApp Cloud API уже подключён на backend: есть отправка сообщений, отправка template `hola`, webhook верификации и приём входящих сообщений/статусов. Но webhook сейчас привязывает входящие сообщения к заявке по телефону среди последних заявок и не выполняет verification-flow по `public_code + verification_code`. Проверка `X-Hub-Signature-256` также должна быть добавлена в рамках security-задачи.

CRM уже умеет показывать заявки, timeline, файлы, извлечённые данные, симуляции, КП, WhatsApp-переписку, Sales Department AI и WhatsApp Connection Health. Новый модуль должен расширять эту модель, а не создавать параллельную CRM.

## 2. Цель продукта

После отправки фактуры клиент должен сразу понять:

- заявка создана;
- у заявки есть понятный номер;
- работа реально началась;
- WhatsApp можно подтвердить одним действием;
- после подтверждения появится защищённая зона заявки;
- в зоне заявки будут видны статус, документы, извлечённые данные, симуляции, КП и следующий шаг.

Итоговая продуктовая формула:

```text
Factura enviada -> Caso abierto -> Código de seguimiento -> WhatsApp confirmado -> Área personal -> Simulación -> Propuesta -> Aceptación
```

## 3. MVP scope

В MVP обязательно реализовать:

1. Расширение `POST /api/submit_application`: генерация `public_code`, `verification_code`, `secure_token`, клиентского статуса и WhatsApp activation URL.
2. Post-submit экран на landing после успешной отправки фактуры.
3. WhatsApp activation flow: клиент отправляет код, webhook проверяет код, заявка становится подтверждённой.
4. Client Area API: получение безопасных данных по `secure_token`.
5. Страница `/area/c/{secure_token}` на landing.
6. CRM-отображение `public_code`, статуса WhatsApp и активности личного кабинета.
7. Возможность найти заявку по `public_code`.
8. Безопасное хранение verification-кода в hash-формате.
9. События в timeline для всех важных шагов.
10. Базовая локализация клиентского UI на испанском.

Можно отложить после MVP:

- сложную авторизацию с аккаунтом/паролем;
- электронную подпись;
- автоматическую отправку всех follow-up;
- полную миграцию GCS на private-only storage;
- глубокую историю изменений для клиента;
- интеграцию нескольких поставщиков за пределами уже существующего Proposal Builder.

## 4. Клиентский сценарий

1. Клиент открывает landing.
2. Загружает factura.
3. Заполняет имя, телефон, email и тип услуги.
4. Нажимает `Enviar factura`.
5. Backend создаёт заявку и возвращает данные post-submit flow.
6. Landing показывает экран `Hemos recibido tu factura`.
7. Клиент видит `Código de seguimiento`, `Código de activación`, timeline и кнопку WhatsApp.
8. Клиент нажимает `Activar mi área personal por WhatsApp`.
9. WhatsApp открывается с подготовленным сообщением.
10. Клиент отправляет код.
11. Webhook получает сообщение, проверяет код и срок действия.
12. Backend активирует WhatsApp и client area.
13. Клиент получает WhatsApp-сообщение со ссылкой `/area/c/{secure_token}`.
14. В личном кабинете клиент видит текущий статус, файлы, данные, симуляции, КП и CTA.

## 5. Испанский UX-текст

Post-submit экран:

```text
Hemos recibido tu factura
Tu análisis ya está en marcha. Estamos revisando tus datos para buscar mejores opciones de ahorro.

Tu caso ya está abierto
Código de seguimiento: EC-482913
Estado actual: Factura recibida

Activa tu área personal por WhatsApp
Envíanos este código para confirmar tu contacto y recibir el resultado del análisis.
Código de activación: 739 284

Activar mi área personal por WhatsApp

Puedes cerrar esta página. Te avisaremos por WhatsApp cuando el resultado esté listo.
```

Не использовать обещания вида `Esto solo tarda unos segundos. No cierres la página.` Для production текст должен честно разрешать закрыть страницу.

Личный кабинет, анализ в процессе:

```text
Tu área personal
Estamos analizando tu factura.
Estado actual: Comparando tarifas
Te avisaremos por WhatsApp cuando tu propuesta esté lista.
```

Личный кабинет, КП готово:

```text
Tu propuesta está lista
Hemos encontrado una opción que podría ayudarte a reducir tus costes.
Ahorro estimado: 29%
Ver propuesta
Aceptar propuesta
Hablar por WhatsApp
```

## 6. Идентификаторы и коды

### 6.1. `public_code`

Формат: `EC-482913`

Требования:

- генерируется только backend;
- уникален в `applications`;
- можно показывать клиенту;
- используется для поиска в CRM;
- используется в WhatsApp-сообщении и email;
- не является секретом и не даёт доступ к личному кабинету.

### 6.2. `verification_code`

Формат: `739284`

Требования:

- 6 цифр;
- генерируется только backend;
- хранится как hash;
- срок действия 24 часа;
- можно перевыпустить;
- ограничить попытки проверки;
- не использовать как URL-токен.

### 6.3. `secure_token`

Требования:

- криптостойкий случайный токен;
- используется в URL `/area/c/{secure_token}`;
- в Firestore хранить `secure_token_hash`;
- токен должен иметь возможность отзыва;
- не использовать `public_code` как единственный способ входа.

## 7. Firestore: расширение текущей модели

Текущая коллекция остаётся `applications`. Новые поля добавляются в существующий документ заявки.

### 7.1. `applications/{application_id}`

Добавить поля:

```text
public_code
client_visible_status
whatsapp_verified
whatsapp_verified_at
whatsapp_verified_phone
client_area_enabled
client_area_enabled_at
secure_token_hash
secure_token_created_at
secure_token_revoked_at
verification_code_hash
verification_code_expires_at
verification_code_attempts
verification_code_last_sent_at
verification_code_resend_count
source_page
utm_source
utm_medium
utm_campaign
consent_version
consent_accepted_at
updated_at
```

Текущие поля `client_name`, `client_phone`, `client_email`, `service_type`, `language`, `uploaded_files`, `submission_date`, `status` остаются совместимыми.

### 7.2. Подколлекции

Использовать существующие и будущие подколлекции:

- `timeline` - история событий, WhatsApp, системные события.
- `proposal_data/data` - извлечённые данные счета.
- `proposal_simulations` - симуляции, включая `visible_to_client`.
- `proposal_files` или поля в заявке - PDF КП и статус отправки.
- `client_area_events` можно не заводить отдельно в MVP, если `timeline.visible_to_client` покрывает задачу.

## 8. Статусы

Внутренние статусы CRM сейчас представлены enum:

- `New Lead`
- `Analysis`
- `Proposal`
- `Negotiation`
- `Contract Won`
- `Deal Lost`

Для MVP не ломаем текущий enum. Добавляем отдельный `client_visible_status`, чтобы клиентская зона могла показывать более точные состояния без миграции всей CRM-воронки.

Маппинг:

| CRM/internal | client_visible_status | Клиентский текст |
| --- | --- | --- |
| New Lead | invoice_uploaded | Factura recibida |
| Analysis | invoice_processing | Estamos leyendo tu factura |
| Analysis | data_extracted | Datos principales detectados |
| Analysis | needs_review | Revisión manual en curso |
| Analysis | comparison_in_progress | Comparando tarifas |
| Analysis | simulation_ready | Simulación preparada |
| Proposal | proposal_ready | Propuesta lista |
| Proposal | proposal_sent | Propuesta enviada |
| Negotiation | client_contacted | Hablando con el asesor |
| Contract Won | proposal_accepted | Propuesta aceptada |
| Contract Won | switching_in_progress | Cambio en trámite |
| Contract Won | completed | Proceso finalizado |
| Deal Lost | lost | Proceso cerrado |
| любой | error | Necesitamos revisar tu caso |

## 9. Backend API

### 9.1. `POST /api/submit_application`

Расширить текущий endpoint без удаления существующих полей ответа.

Дополнительные input-поля:

```text
source_page
utm_source
utm_medium
utm_campaign
consent_version
```

Backend должен:

1. Проверить обязательные поля и файлы.
2. Сохранить файлы в GCS текущим механизмом.
3. Создать заявку в `applications`.
4. Сгенерировать `public_code`.
5. Сгенерировать `verification_code` и сохранить hash.
6. Сгенерировать `secure_token` и сохранить hash.
7. Установить `client_visible_status = invoice_uploaded`.
8. Установить `whatsapp_verified = false`.
9. Установить `client_area_enabled = false` до WhatsApp-активации.
10. Записать timeline-события `invoice_uploaded` и `whatsapp_code_generated`.
11. Вернуть данные для post-submit экрана.

Пример ответа:

```json
{
  "success": true,
  "message": "Заявка успешно принята.",
  "application_id": "firestore_id",
  "uploaded_files": [],
  "application": {
    "id": "firestore_id",
    "public_code": "EC-482913",
    "verification_code": "739284",
    "status": "New Lead",
    "client_visible_status": "invoice_uploaded",
    "client_area_url": null,
    "whatsapp_url": "https://wa.me/34611974984?text=...",
    "created_at": "2026-04-30T16:20:00+02:00"
  }
}
```

### 9.2. `GET /api/application/status/{public_code}`

Публичный endpoint без персональных данных.

Возвращает:

```json
{
  "public_code": "EC-482913",
  "client_visible_status": "invoice_uploaded",
  "client_visible_label": "Factura recibida",
  "whatsapp_verified": false,
  "client_area_enabled": false
}
```

### 9.3. `GET /api/client-area/{secure_token}`

Возвращает безопасный payload личного кабинета:

- application summary;
- client summary;
- files;
- extracted data;
- simulations with `visible_to_client = true`;
- proposal if visible/ready;
- visible timeline events.

Если токен не найден, отозван или истёк, вернуть `404` без деталей.

### 9.4. `POST /api/application/{public_code}/resend-code`

Перевыпускает verification-code.

Ограничения:

- не чаще 1 раза в 60 секунд;
- не больше 5 раз в сутки;
- писать событие `whatsapp_code_regenerated`;
- возвращать новый `whatsapp_url`.

### 9.5. `POST /api/client-area/{secure_token}/accept-proposal`

После принятия:

- proposal status = `accepted`;
- CRM status = `Contract Won` или промежуточный статус в текущей воронке;
- `client_visible_status = proposal_accepted`;
- timeline event `proposal_accepted`;
- уведомление менеджеру;
- WhatsApp-подтверждение клиенту, если WhatsApp подтверждён.

## 10. WhatsApp verification flow

Кнопка post-submit получает готовый `whatsapp_url` от backend. Номер WhatsApp и текст не должны быть захардкожены на frontend.

Текст:

```text
Hola, soy cliente de Entra y Compara. Mi código es EC-482913 / 739284.
```

Webhook `POST /api/whatsapp/webhook` должен:

1. Проверить `X-Hub-Signature-256`.
2. Извлечь номер отправителя.
3. Извлечь `public_code` и `verification_code` из текста.
4. Найти заявку по `public_code`.
5. Проверить hash кода.
6. Проверить срок действия.
7. Проверить лимит попыток.
8. Привязать WhatsApp-номер к заявке.
9. Установить `whatsapp_verified = true`.
10. Установить `client_area_enabled = true`.
11. Активировать или переиздать `secure_token`.
12. Отправить клиенту ссылку `/area/c/{secure_token}`.
13. Записать события `whatsapp_verified` и входящее сообщение в timeline.
14. Запустить Sales Department reanalysis.

Успешный ответ клиенту:

```text
Perfecto, hemos activado tu área personal.
Puedes consultar el estado de tu análisis aquí:
https://entraycompara.com/area/c/{secure_token}
Te avisaremos por WhatsApp cuando tu propuesta esté lista.
```

Неверный код:

```text
No hemos podido validar el código. Por favor, revisa el código que aparece en la página de confirmación o solicita uno nuevo.
```

Истёкший код:

```text
Este código ha caducado. Puedes solicitar un nuevo código desde la página de tu solicitud.
```

## 11. Landing frontend

### 11.1. Post-submit экран

Маршрут SPA:

```text
#/solicitud-recibida
```

Компоненты:

- header;
- confirmation hero;
- tracking code card;
- WhatsApp activation card;
- status timeline;
- trust block;
- GDPR note;
- footer.

Состояние post-submit можно передавать через in-memory state после submit и дублировать в `sessionStorage`. Если страницу открыли напрямую без state, показывать форму поиска статуса по `public_code` или мягкий fallback.

### 11.2. Client Area

Маршрут SPA:

```text
#/area/c/{secure_token}
```

Компоненты:

- status summary;
- application timeline;
- client data;
- uploaded invoices;
- extracted invoice data;
- simulations;
- recommended proposal;
- events/history;
- WhatsApp CTA.

Если КП ещё не готово:

```text
Estamos preparando tu propuesta. Te avisaremos por WhatsApp cuando esté lista.
```

Если нужна ручная проверка:

```text
Estamos revisando algunos datos manualmente. Esto nos ayuda a preparar una propuesta más precisa.
```

## 12. CRM изменения

В CRM добавить:

- отображение `public_code` в карточке и detail view;
- поиск по `public_code`;
- WhatsApp confirmado: `sí/no`;
- Área personal: `activa/inactiva`;
- клиентский видимый статус;
- дата последней активности личного кабинета;
- действия: reenviar código, copiar enlace área personal, abrir área personal;
- timeline-события activation/resend/accept proposal.

CRM должна сохранять существующий workflow операторов: извлечение данных, симуляция, КП и Sales Department не должны ломаться.

## 13. Security и GDPR

Обязательно:

- verification-code генерируется только backend;
- хранить только hash verification-code;
- хранить только hash secure-token;
- limit attempts и resend rate limit;
- webhook signature verification;
- не раскрывать персональные данные при ошибке кода;
- consent text/version сохранять в заявке;
- публичный статус по `public_code` не возвращает персональные данные;
- client-area endpoint возвращает данные только по валидному token;
- все события security-sensitive писать в timeline/system events.

Рекомендуемая следующая итерация:

- перейти от публичных GCS URL к signed URLs для клиентских документов;
- добавить аудит доступа к client area;
- добавить revoke-token действие в CRM.

## 14. Acceptance Criteria

### 14.1. Отправка фактуры

Готово, если:

- заявка создаётся в Firestore;
- файл сохраняется;
- создаётся `public_code`;
- создаётся `verification_code`;
- создаётся `secure_token_hash`;
- клиент видит post-submit экран;
- CRM видит заявку и `public_code`;
- timeline содержит событие создания заявки и генерации кода.

### 14.2. WhatsApp-активация

Готово, если:

- кнопка открывает WhatsApp с правильным текстом;
- webhook получает сообщение;
- код проверяется;
- заявка получает `whatsapp_verified = true`;
- `client_area_enabled = true`;
- клиент получает secure link;
- CRM показывает подтверждение WhatsApp.

### 14.3. Личный кабинет

Готово, если:

- `/area/c/{secure_token}` открывает только свою заявку;
- клиент видит статус, данные, файлы, timeline;
- видит симуляции и КП только когда они доступны;
- может нажать `Aceptar propuesta`;
- чужую заявку открыть нельзя.

### 14.4. CRM

Готово, если менеджер может:

- найти заявку по `public_code`;
- увидеть WhatsApp/client-area статус;
- посмотреть файлы и данные;
- изменить статус;
- подготовить/отправить КП;
- увидеть принятие предложения клиентом.

## 15. GitHub decomposition

Реализацию вести через один MVP-эпик и отдельные задачи:

1. Backend: submit_application codes/tokens.
2. Backend: Firestore schema and status mapping.
3. Backend: WhatsApp verification webhook.
4. Backend: Client Area API.
5. Landing: Post-submit screen.
6. Landing: Client Area page.
7. CRM: public_code, WhatsApp/client-area visibility and search.
8. Notifications: WhatsApp messages for activation/proposal readiness.
9. Security/GDPR: hashes, signatures, rate limits, consent.
10. QA: end-to-end acceptance suite.

## 16. Implementation notes

- Все frontend-изменения требуют rebuild и обновления `compiled/`.
- Backend staging использует реальные Firestore/GCS/secrets, поэтому тестировать submit flow аккуратно.
- Production-деплой только после явного разрешения.
- Новый функционал должен быть совместим с текущими заявками, где `public_code` и токены отсутствуют.
- Для старых заявок CRM должна показывать `-` или `No generado`, а не падать.
