# Entraycompara Admin Panel (CRM)

Внутренняя CRM-система для операторов: просмотр заявок, Kanban-доска, таймлайн коммуникаций, управление статусами.

## Стек

- React 19
- TypeScript
- Vite
- `@hello-pangea/dnd` (drag-and-drop Kanban)
- `i18next` (локализация)
- Express (статический сервер в продакшене)

## Структура

```
admin-panel/
├── compiled/           # ← Продакшен-ассеты (выгружены из GCS)
├── components/         # React-компоненты
├── services/           # API-клиент (api.ts)
├── server/             # Express-сервер для продакшена
├── App.tsx             # Корневой компонент
├── types.ts            # TypeScript-типы
├── Dockerfile          # Образ для Cloud Run
└── README.md           # Этот файл
```

## Локальная разработка

```bash
npm install --legacy-peer-deps
npm run dev
```

Приложение запустится на `http://localhost:5173`.

## Как внести изменения

1. Отредактируй компоненты в `components/` или типы в `types.ts`
2. Собери проект:
   ```bash
   npm run build
   ```
3. Скопируй результат сборки в `compiled/`:
   ```bash
   cp -r dist/* compiled/
   ```
4. Убедись, что `compiled/index.html` увеличился в размере (~125 KB)
5. Commit и push
6. Дождись автодеплоя в staging

## Важный нюанс: `compiled/`

Папка `compiled/` содержит **финальную сборку**, которая раздаётся в Cloud Run. Docker-образ берёт готовые файлы из `compiled/`, а не собирает проект заново.

## API

CRM обращается к бэкенду через `services/api.ts`:
- `GET /api/applications` — список заявок
- `GET /api/applications/{id}` — детали заявки
- `PUT /api/applications/{id}/status` — изменение статуса
- `GET /api/applications/{id}/timeline` — таймлайн событий
- `POST /api/generate-signed-url` — подписанная ссылка на файл

Авторизация операторов — через Bearer-токен (`OPERATOR_SECRET_KEY`).

## Деплой

- **Staging**: `https://entraycompara-adminpanel-staging-910753338248.europe-west1.run.app`
- **Production**: `entraycompara-adminpanel` (us-west1)
- **Домен**: `https://crm.entraycompara.com` (в данный момент указывает на staging)

Автодеплой настроен через GitHub Actions (`.github/workflows/deploy-staging.yml`).
