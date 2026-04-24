# ТЗ: новый раздел CRM `Отдел продаж` / `Sales Department`

## 1. Цель документа

Этот документ описывает новый раздел CRM `Отдел продаж`, который должен работать как управляемая "молекула" из нескольких специализированных AI-ролей поверх текущей карточки лида, Timeline, WhatsApp и Proposal Builder.

Цель:
- повысить конверсию из лида в следующий шаг и сделку;
- сделать работу с клиентом последовательной и визуально прозрачной;
- не ломать текущие workflow:
  - Timeline
  - WhatsApp Chat
  - Proposal Builder
  - Extraction
  - Auto Simulation
  - Proposal PDF

---

## 2. Контекст текущего проекта

Новый раздел должен быть встроен в существующую архитектуру:

- Frontend CRM: `apps/admin-panel/`
- Backend API: `apps/backend-upload-service/main.py`
- Хранилище заявок: Firestore `applications`
- История взаимодействий: `applications/{id}/timeline`
- Текущий AI-ответчик WhatsApp: `POST /api/ai/generate-response`
- Текущая карточка лида: `DetailView.tsx`
- Текущий чат WhatsApp: `WhatsAppChatPanel.tsx`
- Текущий Proposal flow: `ProposalBuilder.tsx`

Критичное ограничение:
- новый раздел не должен подменять существующие процессы;
- он должен быть надстройкой orchestration-layer;
- source of truth по работе с лидом остаётся Firestore + Timeline.

---

## 3. Продуктовая идея

### 3.1. Атом

Атом = один агент / одна роль / одна узкая функция.

Примеры атомов:
- анализ состояния клиента;
- выбор следующего шага;
- генерация WhatsApp-сообщения;
- контроль follow-up;
- контроль риска потери лида;
- контроль статуса сделки;
- объяснение предложения;
- реактивация молчащего клиента.

### 3.2. Молекула

Молекула = координируемая система AI-ролей, которая вместе выполняет функцию полноценного отдела продаж.

Новый раздел CRM должен реализовать именно молекулу, а не просто "один большой промпт".

---

## 4. Что такое `Sales Department Molecule`

`Sales Department Molecule` = модуль в CRM, который:

1. читает актуальное состояние лида;
2. читает Timeline, WhatsApp, документы, extraction, simulations, proposal;
3. определяет стадию клиента и узкое место;
4. раскладывает задачу по специализированным AI-ролям;
5. предлагает менеджеру:
   - лучший следующий шаг;
   - лучший канал/тип действия;
   - лучший текст сообщения;
   - причину этого действия;
   - уровень риска;
   - ожидаемый outcome.

---

## 5. Состав молекулы

### 5.1. Agent 1: Lead State Analyst

Функция:
- определяет текущее состояние клиента.

Выход:
- `client_state`
- `friction_point`
- `temperature`
- `engagement_level`
- `response_likelihood`

Примеры `client_state`:
- interested
- waiting_for_analysis
- waiting_for_proposal
- reviewing_proposal
- confused
- hesitant
- silent
- objection_price
- objection_trust
- objection_complexity
- ready_to_continue
- lost

### 5.2. Agent 2: Sales Strategist

Функция:
- определяет лучший следующий микро-шаг.

Выход:
- `recommended_action`
- `action_priority`
- `goal_of_message`
- `cta_type`
- `why_now`

Примеры `recommended_action`:
- confirm_receipt
- reassure_progress
- answer_question
- explain_proposal
- reactivate_dialog
- ask_light_confirmation
- invite_question
- close_without_pressure

### 5.3. Agent 3: WhatsApp Message Composer

Функция:
- пишет итоговый текст сообщения клиенту.

Выход:
- `message_text`

Это единственный агент, который генерирует готовый клиентский текст.

### 5.4. Agent 4: Compliance / Trust Guard

Функция:
- проверяет, что текст:
  - не обещает лишнего;
  - не просит повторно документы;
  - не врёт о статусе;
  - не нарушает tone of brand;
  - не звучит как бот/спам.

Выход:
- `is_safe`
- `violations[]`
- `fixed_message_text`

### 5.5. Agent 5: Follow-up Scheduler

Функция:
- понимает, нужен ли follow-up;
- предлагает, когда и зачем написать снова.

Выход:
- `followup_needed`
- `followup_reason`
- `followup_eta`
- `followup_message_goal`

### 5.6. Agent 6: Deal Control Agent

Функция:
- следит за тем, движется ли лид к реальному этапу сделки.

Выход:
- `deal_stage`
- `pipeline_health`
- `next_required_business_step`
- `blocker_owner`

---

## 6. Архитектурный принцип

### 6.1. Где должна жить молекула

Молекула должна быть разделена на:

- UI-слой в CRM
- orchestration-слой в backend
- timeline/state слой в Firestore

### 6.2. Нельзя делать

Нельзя:
- прятать всю логику только в одном giant prompt;
- генерировать ответ без state machine;
- делать отдельный параллельный timeline;
- ломать существующий `Timeline`;
- дублировать source of truth в несвязанном месте.

### 6.3. Нужно делать

Нужно:
- использовать существующую заявку как primary entity;
- использовать Timeline как каноническую историю;
- использовать новый поддокумент/подколлекцию для AI-sales state;
- делать объяснимое решение: "почему агент предлагает именно это".

---

## 7. Новый раздел CRM: `Sales Department`

### 7.1. Место в продукте

Новый раздел должен быть встроен в детальную карточку лида, а не жить отдельно от неё.

Рекомендуемое размещение:
- новый крупный блок внутри `DetailView.tsx`
- на одном уровне важности с:
  - `WhatsAppChatPanel`
  - `Timeline`
  - `ProposalBuilder`

### 7.2. Название раздела

UI title:
- `Отдел продаж`
- secondary label: `Sales Department AI`

---

## 8. UI/HUD-спецификация

## 8.1. Общая структура экрана

Новый раздел должен быть разбит на 6 блоков:

1. `Sales Control Header`
2. `Client State Radar`
3. `Recommended Action`
4. `AI Team Activity`
5. `Message Studio`
6. `Follow-up & Deal Control`

---

## 8.2. Блок 1: Sales Control Header

Назначение:
- быстро показать, что делает “отдел продаж” по этому лиду.

Содержимое:
- статус молекулы: `active / waiting / blocked / completed`
- текущая стадия клиента
- confidence
- last analysis time
- quick CTA:
  - `Обновить анализ`
  - `Сгенерировать следующий шаг`
  - `Подготовить сообщение`

Визуально:
- premium card
- верхняя summary strip
- маленький live-indicator
- аккуратная motion-пульсация, если идёт анализ

---

## 8.3. Блок 2: Client State Radar

Назначение:
- визуально показать, в каком состоянии клиент.

Поля:
- `Client State`
- `Main Friction`
- `Intent`
- `Trust Level`
- `Reply Probability`
- `Deal Temperature`

Формат:
- 5–6 компактных tiles
- цветовая система:
  - зелёный = healthy / ready
  - синий = in progress / controlled
  - жёлтый = hesitation / needs clarification
  - красный = risk / silent / objection

---

## 8.4. Блок 3: Recommended Action

Назначение:
- показать лучший следующий шаг как решение “отдела продаж”.

Поля:
- `Recommended Next Action`
- `Goal`
- `Why this now`
- `Expected Outcome`
- `Pressure Level`
- `Suggested CTA`

Кнопки:
- `Принять стратегию`
- `Сгенерировать другой вариант`
- `Снизить давление`
- `Сделать мягче`

---

## 8.5. Блок 4: AI Team Activity

Назначение:
- визуально показать, как работает молекула как “отдел продаж”.

Это ключевой визуальный блок.

Формат:
- вертикальный pipeline / live HUD
- 6 строк по агентам:
  - Lead State Analyst
  - Sales Strategist
  - Message Composer
  - Trust Guard
  - Follow-up Scheduler
  - Deal Control

Для каждого агента:
- статус: `idle / running / done / needs_attention`
- краткий output в 1 строку
- confidence
- timestamp

Motion:
- активный агент подсвечивается
- переход между агентами анимируется линией прогресса
- успешное завершение даёт clean success state

Важно:
- этот блок должен быть не “фейковой анимацией”, а визуализацией реального orchestration state.

---

## 8.6. Блок 5: Message Studio

Назначение:
- менеджер видит, что именно хочет отправить молекула.

Содержимое:
- `Final Suggested Message`
- `Tone`
- `Language`
- `Based on`
- `Reasoning summary`

Кнопки:
- `Вставить в WhatsApp`
- `Сгенерировать заново`
- `Сделать короче`
- `Сделать теплее`
- `Сделать формальнее`

Важно:
- это не заменяет существующий `WhatsAppChatPanel`;
- это подаёт в него улучшенный output.

---

## 8.7. Блок 6: Follow-up & Deal Control

Назначение:
- держать ритм работы по лиду.

Поля:
- `Need Follow-up`
- `Best Follow-up Window`
- `Deal Risk`
- `Next Required Business Step`
- `Owner`

Кнопки:
- `Запланировать follow-up`
- `Оставить без follow-up`
- `Перевести в Negotiation`
- `Нужен ручной разбор`

---

## 9. UX-поведение

### 9.1. При открытии карточки лида

Система должна:
1. поднять текущие данные лида;
2. поднять timeline;
3. поднять proposal state;
4. поднять simulations;
5. собрать `sales molecule state`;
6. отрисовать HUD.

### 9.2. При изменении данных лида

Если меняется:
- статус
- язык
- новые файлы
- extraction
- selected simulation
- proposal
- новые WhatsApp сообщения

То `Sales Department` должен автоматически помечать свой state как stale и уметь пересчитать рекомендации.

### 9.3. При отправке сообщения

После отправки через WhatsApp:
- обновляется timeline;
- пересчитывается состояние клиента;
- пересчитывается follow-up логика.

---

## 10. Backend: новые сущности

### 10.1. Firestore

Добавить подколлекцию:

`applications/{id}/sales_department`

Документ:

`applications/{id}/sales_department/state`

Структура:

```json
{
  "version": 1,
  "updated_at": "...",
  "status": "active",
  "client_state": "waiting_for_proposal",
  "friction_point": "client_silent_after_proposal",
  "reply_probability": 0.61,
  "trust_level": 0.78,
  "deal_temperature": "warm",
  "recommended_action": "reactivate_dialog",
  "goal": "get_response_without_pressure",
  "why_now": "proposal already sent, no response yet",
  "expected_outcome": "client replies or asks question",
  "suggested_cta": "soft_question",
  "suggested_message": "...",
  "language_used": "es",
  "followup_needed": true,
  "followup_eta_hours": 24,
  "deal_stage": "proposal_review",
  "pipeline_health": "watch",
  "last_inputs_hash": "..."
}
```

### 10.2. Firestore optional subcollection for runs

`applications/{id}/sales_department/runs/{run_id}`

Для аудита и визуализации pipeline:

```json
{
  "started_at": "...",
  "completed_at": "...",
  "status": "completed",
  "agents": [
    {
      "agent_key": "lead_state_analyst",
      "status": "completed",
      "summary": "client waiting for analysis",
      "confidence": 0.83
    }
  ]
}
```

---

## 11. Backend API

### 11.1. Новый endpoint анализа

`POST /api/applications/{id}/sales-department/analyze`

Функция:
- собирает актуальный state;
- запускает молекулу;
- сохраняет результат в Firestore.

Ответ:

```json
{
  "success": true,
  "run_id": "...",
  "state": { ... }
}
```

### 11.2. Получение текущего состояния

`GET /api/applications/{id}/sales-department/state`

### 11.3. Получение последнего run

`GET /api/applications/{id}/sales-department/latest-run`

### 11.4. Генерация сообщения по стратегии

`POST /api/applications/{id}/sales-department/generate-message`

Вход:
- modifier: `shorter | warmer | more_formal | softer | stronger`

### 11.5. Планирование follow-up

`POST /api/applications/{id}/sales-department/follow-up`

---

## 12. Orchestration-логика

### 12.1. Реализация на первом этапе

На первом этапе молекула реализуется как backend orchestration pipeline, а не как отдельные физические модели.

То есть:
- один backend endpoint
- несколько внутренних prompt stages
- структурированные outputs между стадиями

Это безопаснее для текущей системы.

### 12.2. Этапы pipeline

1. Build lead context
2. Lead state analysis
3. Sales strategy selection
4. Message composition
5. Compliance / trust check
6. Follow-up planning
7. Persist result

---

## 13. Мегапромпт: архитектура

### 13.1. Нельзя

Нельзя делать один giant unstructured prompt без role layers.

### 13.2. Нужно

Нужно делать meta-prompt с внутренними ролями:

#### Role A — Lead State Analyst
- определяет состояние клиента

#### Role B — Sales Strategist
- выбирает лучший следующий шаг

#### Role C — Message Composer
- пишет итоговое сообщение

#### Role D — Trust Guard
- проверяет, не нарушены ли ограничения

#### Role E — Follow-up Controller
- рекомендует следующий ритм контакта

### 13.3. Выход мегапромпта

Результат должен быть строго структурирован:

```json
{
  "client_state": "...",
  "friction_point": "...",
  "recommended_action": "...",
  "goal": "...",
  "why_now": "...",
  "expected_outcome": "...",
  "language_used": "...",
  "message_text": "...",
  "followup_needed": true,
  "followup_eta_hours": 24,
  "deal_stage": "...",
  "pipeline_health": "..."
}
```

---

## 14. Мегапромпт: требования к содержанию

Мегапромпт должен:
- брать весь актуальный lead context;
- брать Timeline;
- брать chat_history;
- брать extracted data;
- брать proposal status;
- брать selected simulation;
- знать текущий язык клиента;
- знать, есть ли уже файлы;
- знать, есть ли уже КП;
- знать, на какой стадии клиент.

Он должен уметь:
- не просить повторно файлы;
- не путать этап analysis / proposal;
- не отвечать на неправильном языке;
- не игнорировать состояние клиента;
- не делать два конкурирующих CTA.

---

## 15. UI-состояния

### 15.1. Empty

Показывается если для лида ещё не было sales-analysis.

Кнопка:
- `Запустить отдел продаж`

### 15.2. Running

Показывается live HUD с progress.

### 15.3. Ready

Показываются:
- state radar
- recommended action
- message studio
- follow-up

### 15.4. Stale

Если данные лида изменились после последнего analysis.

Показывать badge:
- `Нужен пересчёт`

### 15.5. Error

Показывать безопасный fallback:
- `Не удалось собрать рекомендацию`
- `Попробовать снова`

---

## 16. Интеграция с существующим UI

### 16.1. `DetailView.tsx`

Нужно добавить новый контейнер-компонент:

- `SalesDepartmentPanel.tsx`

Рекомендуемое расположение:
- в левой колонке под header card и client details
- выше либо сразу перед `ProposalBuilder`

### 16.2. `WhatsAppChatPanel.tsx`

Нужно добавить вход для интеграции:
- принять готовый `suggested_message`
- уметь вставлять текст из `Sales Department`

### 16.3. `Timeline.tsx`

Не ломать.

Дополнительно:
- можно логировать system notes по запуску/завершению sales-analysis.

---

## 17. Motion / visual layer

### 17.1. Общий принцип

Визуально должно ощущаться как “отдел продаж в работе”, а не “ещё одна форма”.

### 17.2. Использовать существующий стиль

Опираться на текущую визуальную систему CRM:
- glass cards
- rounded premium surfaces
- мягкие тени
- ProcessMotion-style animation patterns

### 17.3. Новые motion-паттерны

Допустимо добавить:
- agent pulse
- orchestration line shimmer
- confidence fill animation
- success settle animation
- stale warning glow

Важно:
- motion не должен ломать текущие async flows;
- motion должен быть driven by real state;
- не делать декоративную шумную анимацию.

---

## 18. Безопасность и ограничения

### 18.1. Нельзя ломать

- текущую отправку WhatsApp
- extraction
- auto-simulation
- proposal generation
- timeline loading
- detail view performance

### 18.2. Нельзя удалять

- существующий `generate-response`
- существующий `WhatsAppChatPanel`

На первом этапе новый раздел должен быть additive-layer.

### 18.3. Fail-safe

Если `Sales Department` не отработал:
- оператор всё равно должен уметь работать как сейчас;
- чат, timeline и proposal-flow должны жить независимо.

---

## 19. Этапы внедрения

### Iteration 1 — foundation

- backend state model
- Firestore state
- analyze endpoint
- basic UI panel
- recommended action
- message studio

### Iteration 2 — molecule HUD

- multi-agent visualization
- runs history
- confidence radar
- follow-up block

### Iteration 3 — deep integration

- push suggested message into WhatsAppChatPanel
- stale detection on lead updates
- smarter orchestration
- better compliance layer

---

## 20. Definition of Done

Фича считается готовой, если:

1. В CRM появился новый раздел `Отдел продаж`.
2. Он читает реальные данные лида.
3. Он показывает актуальное состояние клиента.
4. Он показывает лучший следующий шаг.
5. Он генерирует корректное WhatsApp-сообщение.
6. Он визуально показывает работу “молекулы”.
7. Он не ломает существующие workflow.
8. После перезагрузки страницы state не теряется.
9. Оператор понимает, что система делает и почему.
10. Timeline и WhatsApp продолжают оставаться source of truth по коммуникации.

---

## 21. Рекомендация по реализации

Для текущего проекта оптимальный старт:

- backend:
  - расширить `main.py` новым sales-department API
  - использовать текущую AI-инфраструктуру и Timeline
- frontend:
  - добавить `SalesDepartmentPanel.tsx`
  - встроить в `DetailView.tsx`
  - интегрировать с `WhatsAppChatPanel.tsx`
- storage:
  - Firestore subcollection `sales_department`
- rollout:
  - сначала staging
  - без удаления старого пути генерации ответа

---

## 22. Что дизайнеру важно знать

Дизайнер должен спроектировать это не как “аналитику”, а как:
- AI control room;
- sales desk;
- intelligent assistant layer;
- живой отдел продаж в интерфейсе.

Ключевой визуальный образ:
- менеджер видит не хаос, а управляемую команду AI-ролей, работающую на один outcome.

---

## 23. Что фронтендеру важно знать

Фронтенд не должен ждать "идеальной" backend-архитектуры.

Можно делать progressive enhancement:
- сначала basic panel
- потом HUD
- потом deep orchestration rendering

Но:
- контракты state должны быть стабильными;
- UI должен быть resilient к partial data;
- при отсутствии AI-result не должно рушиться ничего в `DetailView`.

---

## 24. Что backend-разработчику важно знать

Нужно проектировать не просто endpoint генерации текста, а stateful orchestration.

Ключевая задача backend:
- собирать lead snapshot;
- структурировать AI-выход;
- сохранять результат;
- давать UI не только message, но и управленческий контекст.

---

## 25. Итог

Новый раздел `Отдел продаж` — это не чат-бот.

Это AI-layer уровня sales operations, встроенный в CRM Entraycompara, который:
- понимает лид;
- понимает стадию;
- понимает контекст;
- рекомендует следующий шаг;
- готовит правильное сообщение;
- делает это объяснимо, визуально и безопасно для существующих бизнес-процессов.
