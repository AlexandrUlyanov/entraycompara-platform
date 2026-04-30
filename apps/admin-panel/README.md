# Entraycompara Admin Panel / CRM

Внутренняя CRM для операторов Entraycompara: управление лидами, Kanban, карточка клиента, таймлайн, WhatsApp, AI Sales Department, Proposal Builder и настройки интеграций.

## Стек

- React 19
- TypeScript
- Vite
- `@tanstack/react-query`
- `@hello-pangea/dnd`
- Tailwind via runtime CDN in `compiled/index.html`
- Express static server for Cloud Run

## Структура

```text
admin-panel/
├── compiled/                 # Готовая сборка, именно она попадает в Docker
├── components/
│   ├── Dashboard.tsx
│   ├── DetailView.tsx
│   ├── Header.tsx
│   ├── SettingsView.tsx      # Настройки CRM, WhatsApp Connection Health
│   ├── SalesDepartmentPanel.tsx
│   ├── ProposalBuilder.tsx
│   ├── DataExtractionPanel.tsx
│   ├── SimulationPanel.tsx
│   ├── ProposalPreviewPanel.tsx
│   ├── Timeline.tsx
│   └── WhatsAppChatPanel.tsx
├── services/api.ts           # API client, прямой URL staging backend
├── server/                   # Express server
├── App.tsx                   # Простая внутренняя навигация dashboard/detail/settings
├── i18n.ts                   # RU/ES локализация
├── types.ts
└── Dockerfile
```

## Основные экраны

- Dashboard: таблица и Kanban по статусам.
- DetailView: карточка лида, профиль, Proposal Builder, WhatsApp, Timeline, Sales Department.
- SettingsView: раздел `Настройки CRM`.
- Первый пункт настроек: `Подключение WhatsApp`.
- WhatsApp Connection Health: проверяет секреты backend, Meta Graph API, webhook URL, номер и качество подключения.

## API

CRM ходит напрямую в staging backend:

```ts
const API_BASE_URL = 'https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api';
```

Ключевые группы API:

- Applications: список, карточка, статус, тип услуги, удаление.
- Timeline: заметки, звонки, email, WhatsApp.
- Files: signed URLs и загрузка файлов.
- WhatsApp: отправка текста, файлов, КП, первого шаблонного сообщения, health-check.
- Proposal Builder: extraction, simulations, auto-simulation, proposal generation.
- Sales Department: state, analysis, actions, autopilot, audit, follow-ups.

## WhatsApp в CRM

Функции:

- Кнопка `Отправить первое сообщение` отправляет approved template `hola`.
- Chat panel отправляет текст и документы через backend.
- Входящие сообщения приходят через Meta webhook и отображаются в Timeline.
- Статусы доставки обновляются по webhook `message_statuses`.
- В Settings доступен `WhatsApp Connection Health`, который вызывает `GET /api/whatsapp/health`.

Health-check read-only: он не отправляет сообщения клиентам.

## Локальная разработка

```bash
npm install --legacy-peer-deps
npm run dev
```

По умолчанию Vite откроется на `http://localhost:5173`.

## Сборка и `compiled/`

Cloud Run Dockerfile не запускает `npm run build`. Он копирует `compiled/`:

```dockerfile
COPY compiled/ ./dist/
```

После любых изменений frontend:

```bash
npm run build
```

PowerShell-copy:

```powershell
$compiled = Resolve-Path 'compiled'
$dist = Resolve-Path 'dist'
Get-ChildItem -LiteralPath $compiled.Path -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $dist.Path '*') -Destination $compiled.Path -Recurse -Force
```

Затем убедись, что `compiled/assets/index-*.js` обновился.

## Деплой

- Staging: `entraycompara-adminpanel-staging` в `europe-west1`
- Домен staging/рабочей CRM: `https://crm.entraycompara.com`
- Production: `entraycompara-adminpanel` в `us-west1`

Staging deploy запускается автоматически при push в `main`.
Production deploy запускается только вручную через GitHub Actions после подтверждения.

## Проверки

```bash
npm run build
git diff --check
```

Документ актуален на: 30 апреля 2026.
