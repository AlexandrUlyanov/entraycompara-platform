# ТЗ: режим автоматической обработки лидов

## 1. Назначение

Этот документ описывает отдельный продуктовый и технический режим:

`Automatic Lead Processing Mode`

Цель режима:
- автоматически обрабатывать часть лидов без постоянного ручного участия оператора;
- сокращать время до первого контакта;
- уменьшать потери лидов на этапе ожидания;
- повышать конверсию в ответ, анализ, ознакомление с предложением и сделку;
- при этом не ломать текущие ручные процессы CRM.

Это ТЗ дополняет, а не заменяет документ:

- [docs/tz-sales-department-molecule.md](E:/work/es/EnytayCompara.com/git/entraycompara-platform/docs/tz-sales-department-molecule.md)

Если `Sales Department` — это AI-отдел продаж как интеллектуальная система, то `Automatic Lead Processing Mode` — это режим автопилота, в котором эта система сама выполняет допустимые действия по лиду в заданных пределах.

---

## 2. Контекст текущего проекта

Режим должен быть встроен в существующую архитектуру платформы:

- CRM: `apps/admin-panel/`
- Backend: `apps/backend-upload-service/main.py`
- Firestore: `applications`
- Timeline: `applications/{id}/timeline`
- WhatsApp AI response: `POST /api/ai/generate-response`
- WhatsApp send: `POST /api/whatsapp/send`
- Proposal pipeline:
  - extraction
  - simulations
  - proposal generation

Критичные ограничения:
- staging и production используют общие данные Firestore/GCS;
- авто-действия должны быть безопасными и объяснимыми;
- оператор должен видеть, почему и что было сделано автоматически;
- ручной режим оператора всегда должен иметь приоритет.

---

## 3. Что такое автоматический режим

Автоматический режим = controlled autopilot для лида.

Система может сама:
- оценить состояние лида;
- определить следующий микро-шаг;
- сгенерировать сообщение;
- отправить его в WhatsApp;
- запланировать follow-up;
- эскалировать лид оператору;
- остановить автопилот при риске или неоднозначности.

Автоматический режим НЕ означает:
- полный бесконтрольный чат-бот;
- автоматические обещания клиенту;
- автоматическую смену статуса без правил;
- автоматическое принятие бизнес-решений без guardrails.

---

## 4. Продуктовая цель

Режим должен автоматически закрывать типовые задачи:

1. Новый лид прислал счёт, но ему ещё не ответили.
2. Клиент отправил документы и ждёт подтверждение.
3. Анализ уже идёт, но клиент волнуется и пишет повторно.
4. Предложение отправлено, но клиент молчит.
5. Клиент задал простой вопрос, на который можно безопасно ответить.
6. Клиент исчез, и нужен корректный follow-up.

---

## 5. Главный принцип

Автоматический режим должен работать как:

- безопасный;
- обратимый;
- объяснимый;
- ограниченный;
- управляемый.

Ключевое правило:

Автопилот выполняет только те действия, которые:
- низкорисковые;
- соответствуют реальному состоянию лида;
- не противоречат данным из CRM;
- не требуют сложного человеческого judgement;
- не ухудшают доверие к бренду.

---

## 6. Что именно должно автоматизироваться

## 6.1. Автоматические действия первого этапа

Разрешённые автоматические действия в v1:

1. Автоматический first-touch reply
- если лид создался и есть WhatsApp-канал;
- если это не противоречит правилам контакта;
- если шаблон контакта безопасен.

2. Автоматическое подтверждение получения документов
- если `uploaded_files_count > 0`;
- если клиент ещё не получил явное подтверждение.

3. Автоматическое сообщение “анализ в работе”
- если статус `Analysis`;
- если клиент спрашивает или долго ждёт.

4. Автоматическое мягкое напоминание о предложении
- если статус `Proposal`;
- если предложение уже есть;
- если follow-up окно наступило.

5. Автоматический follow-up без давления
- если клиент молчит;
- если есть валидный и безопасный reason-to-follow-up.

6. Автоматический handoff оператору
- если автопилот не уверен;
- если есть нестандартный вопрос;
- если клиент раздражён;
- если detected objection high-risk;
- если требуется ручное решение.

---

## 6.2. Действия, которые НЕЛЬЗЯ автоматизировать в v1

Запрещено для автопилота:

- обещать клиенту гарантированную экономию;
- утверждать, что предложение точно выгоднее;
- убеждать принять предложение агрессивно;
- самостоятельно закрывать сделку;
- обещать сроки, которых нет в данных;
- автоматически отправлять спорные юридические/договорные утверждения;
- менять критические статусы без понятных бизнес-правил;
- запускать рискованные сценарии без human approval;
- автоматом принимать решения по спорным кейсам.

---

## 7. Продуктовые режимы

Нужно ввести 3 режима работы:

### 7.1. Manual

Полностью ручной режим.

Система:
- анализирует;
- рекомендует;
- ничего сама не отправляет.

### 7.2. Assisted Auto

Полуавтоматический режим.

Система:
- сама формирует действие и сообщение;
- оператор должен подтвердить отправку.

### 7.3. Full Auto

Полный автоматический режим.

Система:
- сама решает, когда безопасно отправить;
- сама логирует действие;
- сама создаёт follow-up;
- сама останавливается при риске.

На первом этапе рекомендуется запускать только:
- `Manual`
- `Assisted Auto`

`Full Auto` делать как feature flag / pilot mode.

---

## 8. Где это должно жить в CRM

Новый функционал должен быть встроен в новый раздел:

`Отдел продаж`

внутри детальной карточки лида.

Автоматический режим должен быть отдельным модулем в этом разделе.

Рекомендуемый новый UI-блок:

`Autopilot Control`

---

## 9. UI/HUD спецификация

## 9.1. Блок `Autopilot Control`

Назначение:
- включать и выключать автопилот;
- показывать текущий режим;
- показывать, что система может делать автоматически;
- показывать последнее auto-action.

Содержимое:
- переключатель:
  - `Manual`
  - `Assisted Auto`
  - `Full Auto`
- badge:
  - `Active`
  - `Paused`
  - `Needs review`
  - `Escalated`
- поля:
  - `Last auto action`
  - `Next planned action`
  - `Safety level`
  - `Human override`

Кнопки:
- `Включить автопилот`
- `Поставить на паузу`
- `Передать менеджеру`
- `Разрешить только safe actions`

---

## 9.2. Блок `Autopilot Timeline`

Отдельный подблок внутри Sales Department.

Он показывает:
- какие авто-решения уже были приняты;
- какие сообщения были отправлены автоматически;
- что было остановлено;
- где был сделан handoff.

Формат:
- карточки-ивенты;
- иконки:
  - auto sent
  - auto draft
  - paused
  - escalated
  - blocked

---

## 9.3. Блок `Safety Guard`

Показывает:
- можно ли сейчас безопасно действовать;
- почему нельзя действовать;
- какие условия блокируют автопилот.

Поля:
- `Current Risk`
- `Blocked Because`
- `Safe To Send`
- `Needs Human`

---

## 9.4. Блок `Next Action Queue`

Назначение:
- визуально показать pipeline будущих auto-actions.

Примеры:
- `now: confirm receipt`
- `in 24h: follow-up proposal`
- `if no reply: handoff`

Формат:
- вертикальная очередь
- ETA
- trigger condition
- action type

---

## 10. UX поведения

### 10.1. При создании нового лида

Если режим автопилота включён:
- система оценивает тип лида;
- определяет, можно ли безопасно сделать first-touch;
- если да, создаёт `planned_action`;
- в `Assisted Auto` предлагает оператору подтверждение;
- в `Full Auto` может отправить автоматически.

### 10.2. При приходе нового WhatsApp от клиента

Система:
- пересчитывает client state;
- пересчитывает reply strategy;
- проверяет safety;
- либо формирует ответ;
- либо эскалирует человеку.

### 10.3. При смене статуса лида

Система:
- пересчитывает допустимые действия;
- пересчитывает follow-up policy;
- обновляет auto queue.

### 10.4. При появлении новых файлов / extraction / proposal

Система:
- понимает, что контекст изменился;
- обновляет авто-стратегию;
- может закрыть старый запланированный follow-up и создать новый.

---

## 11. Firestore-модель

## 11.1. Новый документ состояния автопилота

Путь:

`applications/{id}/sales_department/autopilot`

Структура:

```json
{
  "enabled": true,
  "mode": "assisted_auto",
  "status": "active",
  "safety_level": "safe",
  "paused_reason": null,
  "last_decision_at": "...",
  "last_action_at": "...",
  "last_action_type": "send_receipt_confirmation",
  "last_action_result": "draft_created",
  "next_action_type": "followup_proposal",
  "next_action_eta": "...",
  "next_action_reason": "proposal_sent_no_reply",
  "blocked": false,
  "blocked_reason": null,
  "needs_human": false,
  "human_owner": null,
  "version": 1
}
```

## 11.2. Журнал автопилота

Путь:

`applications/{id}/sales_department/autopilot_runs/{run_id}`

Структура:

```json
{
  "started_at": "...",
  "completed_at": "...",
  "status": "completed",
  "trigger": "incoming_whatsapp",
  "decision": {
    "client_state": "waiting_for_analysis",
    "recommended_action": "reassure_progress",
    "safe_to_send": true
  },
  "execution": {
    "mode": "assisted_auto",
    "action_type": "draft_whatsapp_message",
    "message_text": "...",
    "sent": false
  }
}
```

---

## 12. Backend API

### 12.1. Включить/обновить режим

`PUT /api/applications/{id}/sales-department/autopilot`

Body:

```json
{
  "enabled": true,
  "mode": "manual | assisted_auto | full_auto"
}
```

### 12.2. Получить состояние

`GET /api/applications/{id}/sales-department/autopilot`

### 12.3. Принудительный пересчёт

`POST /api/applications/{id}/sales-department/autopilot/recalculate`

### 12.4. Выполнить следующее действие

`POST /api/applications/{id}/sales-department/autopilot/execute`

### 12.5. Принудительный handoff

`POST /api/applications/{id}/sales-department/autopilot/handoff`

### 12.6. История автопилота

`GET /api/applications/{id}/sales-department/autopilot/runs`

---

## 13. Источники триггеров

Автопилот должен запускаться по событиям:

1. `lead_created`
2. `timeline_updated`
3. `incoming_whatsapp`
4. `uploaded_files_changed`
5. `extraction_completed`
6. `proposal_generated`
7. `proposal_sent`
8. `status_changed`
9. `manual_override`
10. `scheduled_followup_due`

---

## 14. Логика принятия решения

Автопилот не должен “думать вслепую”.

Pipeline должен быть таким:

1. Build live lead snapshot
2. Read chat history
3. Read interaction history
4. Detect current client state
5. Detect allowed action set
6. Score risks
7. Pick best action
8. Decide:
   - send automatically
   - create draft
   - do nothing
   - escalate
9. Persist decision
10. Update UI/HUD

---

## 15. Safety engine

Перед любым auto-action нужен `Safety Guard`.

Он должен отвечать на вопросы:

1. Есть ли достаточный контекст?
2. Не противоречит ли действие status?
3. Не просим ли повторно документы?
4. Не обещаем ли лишнего?
5. Не звучит ли сообщение неуместно?
6. Не прошло ли слишком мало времени с прошлого касания?
7. Не писал ли уже недавно оператор вручную?
8. Нет ли у клиента high-friction состояния?
9. Не нужен ли human handoff?

Если любой пункт критически негативен:
- `safe_to_send = false`
- action запрещается
- создаётся handoff

---

## 16. Правила времени и частоты

Нужно ввести anti-spam правила:

### 16.1. Minimal spacing

- не отправлять 2 auto-message подряд слишком близко;
- не отправлять follow-up раньше допустимого окна;
- не перебивать живую переписку оператора.

### 16.2. Suggested conservative defaults

- after new lead with files: first confirmation within 1–5 min
- analysis reassurance: не чаще 1 раза за окно ожидания
- proposal follow-up: не сразу, а через controlled delay
- silent lead reactivation: ограниченное число касаний

Конкретные интервалы должны быть вынесены в конфиг.

---

## 17. Конфигурация автопилота

Нужен конфиг-policy слой.

Например:

```json
{
  "allow_auto_send_new_lead_confirmation": true,
  "allow_auto_send_analysis_reassurance": true,
  "allow_auto_send_proposal_followup": true,
  "allow_full_auto_on_high_risk_leads": false,
  "max_auto_followups_per_stage": 2,
  "min_minutes_between_auto_messages": 180
}
```

Лучше хранить это:
- либо в backend config
- либо в отдельной Firestore config doc

---

## 18. Визуализация в CRM

### 18.1. Что должен видеть менеджер

Менеджер должен видеть не только “включён/выключен”.

Он должен понимать:
- что автопилот сейчас знает о лиде;
- что он планирует сделать;
- что он уже сделал;
- почему он ничего не делает;
- почему он эскалировал кейс человеку.

### 18.2. HUD-состояния

Для нового блока `Autopilot Control`:

- `Idle`
- `Analyzing`
- `Waiting Window`
- `Draft Ready`
- `Sent Automatically`
- `Blocked`
- `Escalated`
- `Paused by Operator`

### 18.3. Motion

Можно использовать существующий стиль `ProcessMotion.tsx`.

Нужно:
- мягкая live-анимация, когда автопилот анализирует;
- отдельный paused-state;
- visible queue animation для next action;
- safe success animation после auto-action;
- warning glow для blocked/escalated.

---

## 19. Интеграция с существующими экранами

### 19.1. `DetailView.tsx`

Добавить:
- `AutopilotPanel.tsx`

### 19.2. `WhatsAppChatPanel.tsx`

Добавить:
- визуальный индикатор, было ли последнее сообщение:
  - manual
  - assisted draft
  - auto-sent

### 19.3. `Timeline.tsx`

Timeline должен фиксировать auto-actions как system notes.

Примеры:
- `Автопилот подтвердил получение документов.`
- `Автопилот подготовил draft follow-up по предложению.`
- `Автопилот остановлен: нужен ручной разбор.`

---

## 20. Правила handoff оператору

Автопилот обязан передавать лид человеку, если:

- клиент задал сложный или нестандартный вопрос;
- клиент раздражён;
- клиент сомневается по юридическим/договорным вещам;
- есть противоречия в данных;
- риск ошибки высокий;
- сообщение нельзя безопасно отправить автоматически;
- клиент явно просит живого менеджера.

При handoff нужно:
- записать причину;
- подсветить это в CRM;
- остановить auto-send до решения человека.

---

## 21. Мегапромпт для автопилота

Нужен не просто промпт “что написать клиенту”, а meta-prompt orchestration.

Он должен выдавать:

```json
{
  "client_state": "...",
  "friction_point": "...",
  "recommended_action": "...",
  "safe_to_send": true,
  "send_mode": "auto | draft | handoff | none",
  "why_now": "...",
  "message_text": "...",
  "followup_needed": true,
  "followup_eta_hours": 24,
  "handoff_needed": false,
  "handoff_reason": null
}
```

Этот prompt должен:
- использовать текущий lead snapshot;
- использовать history;
- использовать status;
- использовать file state;
- использовать current proposal/simulation state;
- подчиняться strict safety rules.

---

## 22. Rollout стратегия

### Phase 1

Только:
- UI control
- state storage
- decision engine
- draft-only mode

То есть без реального auto-send.

### Phase 2

Разрешить safe auto-actions:
- confirmation of files
- analysis reassurance

### Phase 3

Добавить:
- proposal follow-up
- scheduled auto follow-ups

### Phase 4

Pilot full auto mode на части лидов / feature flag.

---

## 23. Безопасность внедрения

Чтобы не поломать рабочие процессы:

1. Не удалять текущий ручной `generate-response`
2. Не удалять ручную отправку WhatsApp
3. Не менять существующий Timeline contract радикально
4. Делать автопилот additive-layer
5. Все auto-actions логировать
6. У оператора всегда должна быть возможность:
   - остановить автопилот
   - перехватить лид
   - отменить следующий auto-step

---

## 24. Definition of Done

Фича считается готовой, если:

1. В CRM есть отдельный контролируемый автопилот-режим.
2. Он умеет хранить состояние.
3. Он умеет анализировать лид.
4. Он умеет безопасно предлагать или выполнять следующий шаг.
5. Он визуально показывает текущее состояние.
6. Он объясняет, почему сделал или не сделал действие.
7. Он не ломает ручную работу оператора.
8. Он умеет делать handoff.
9. Все авто-действия фиксируются в Timeline.
10. У оператора есть override.

---

## 25. Рекомендация по реализации для текущего проекта

Оптимальный старт для этого репозитория:

### Backend

Добавить в `apps/backend-upload-service/main.py`:
- endpoints автопилота
- state builder
- safety engine
- orchestration layer

### Frontend

Добавить в `apps/admin-panel/components/`:
- `AutopilotPanel.tsx`
- `AutopilotTimeline.tsx`
- `AutopilotQueue.tsx`

И встроить в:
- `DetailView.tsx`

### Firestore

Добавить:
- `sales_department/autopilot`
- `sales_department/autopilot_runs`

### Rollout

Сначала:
- draft-only
- assisted mode

Только потом:
- full auto send

---

## 26. Итог

Автоматический режим обработки лидов должен стать не “автоответчиком”, а контролируемым AI-autopilot слоем внутри CRM.

Он должен:
- понимать стадию клиента;
- понимать данные лида;
- уважать контекст;
- действовать мягко;
- не спамить;
- не врать;
- вовремя уступать человеку;
- и быть полностью прозрачным визуально и логически для менеджера.
