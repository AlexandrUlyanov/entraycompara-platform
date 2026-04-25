# Roadmap: Sales Department и Automatic Lead Processing

Документ фиксирует порядок выполнения GitHub-задач `#24-#31` по новому разделу CRM `Отдел продаж` и режиму автоматической обработки лидов.

## Принцип внедрения

Новый функционал внедряется как additive layer поверх существующих процессов:

- `Timeline` остаётся source of truth по коммуникациям.
- `WhatsAppChatPanel` и ручная отправка сообщений остаются рабочими независимо от AI-раздела.
- `Proposal Builder`, extraction, simulation и PDF generation не меняют свои контракты.
- Full Auto включается только после state, UI и safety guardrails.

## Фаза 1: Foundation

### `#26 [Sales Department] Backend foundation и Firestore state`

Цель: заложить backend state и audit model.

Сделать:

- Firestore state: `applications/{id}/sales_department/state`
- Run history: `applications/{id}/sales_department/state/runs/{run_id}`
- `GET /api/applications/{id}/sales-department/state`
- `POST /api/applications/{id}/sales-department/analyze`
- `GET /api/applications/{id}/sales-department/latest-run`
- live lead snapshot builder: lead, timeline, documents, extraction, simulations, proposal

Готово, когда state читается/пересчитывается, run сохраняется, а существующие endpoints не затронуты.

### `#25 [Sales Department] Frontend foundation в CRM`

Цель: добавить стабильный раздел в карточку лида.

Сделать:

- `SalesDepartmentPanel.tsx`
- интеграция в `DetailView.tsx`
- состояния empty / loading / ready / stale / error
- react-query hooks / API client
- rebuild `compiled/`

## Фаза 2: Autopilot Control

### `#28 [Autopilot] Foundation, режимы и control panel`

Цель: добавить управляемые режимы.

Сделать:

- `Manual / Assisted Auto / Full Auto`
- Firestore state `sales_department/autopilot`
- API для чтения/обновления/recalculate/handoff
- UI block `Autopilot Control`

На этом этапе `Full Auto` остаётся pilot/disabled by default.

### `#29 [Autopilot] Safety engine, guardrails и handoff`

Цель: заблокировать небезопасные действия до auto-send.

Сделать:

- `safe_to_send`
- anti-spam spacing
- allowed action policy
- блокировка повторного запроса уже загруженных файлов
- handoff при low-confidence/high-risk
- логирование решений в Timeline

## Фаза 3: Sales Molecule

### `#27 [Sales Department] AI orchestration layer и molecule roles`

Цель: заменить простую рекомендацию структурированной молекулой ролей.

Сделать:

- Lead State Analyst
- Sales Strategist
- Message Composer
- Trust Guard
- Follow-up Controller
- JSON output: `client_state`, `friction_point`, `recommended_action`, `why_now`, `message_text`, `followup_needed`

### `#30 [Sales Department] Message Studio и интеграция с WhatsApp`

Цель: сделать suggested message рабочим инструментом менеджера.

Сделать:

- Message Studio
- insert suggested message into `WhatsAppChatPanel.tsx`
- manual / AI draft / auto-ready distinction
- timeline logging of draft usage

## Фаза 4: HUD и визуализация

### `#31 [Sales Department] HUD, radar и activity pipeline`

Цель: визуально показать работу AI-отдела продаж.

Сделать:

- Sales Control Header
- Client State Radar
- Recommended Action
- AI Team Activity pipeline
- Follow-up & Deal Control
- motion states driven by real state

## Epic

### `#24 [Epic] Sales Department и Automatic Lead Processing Mode`

Эпик закрывается после завершения дочерних задач, проверки staging и подтверждения, что ручные workflow CRM не сломаны.

