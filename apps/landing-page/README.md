# Entraycompara Landing Page

Публичный сайт Entraycompara для сбора заявок на анализ счетов и сравнение услуг в Испании.

## Стек

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Express static server for Cloud Run

## Структура

```text
landing-page/
├── compiled/             # Готовая сборка, именно она попадает в Docker
├── components/           # React components
├── context/              # LanguageContext
├── locales/              # es, eu, ru, uk
├── public/               # static assets
├── server/               # Express server
├── styles/
├── App.tsx
├── index.html
└── Dockerfile
```

## Что делает лендинг

- Показывает оффер Entraycompara.
- Объясняет анализ счетов, сравнение тарифов и бесплатность сервиса.
- Поддерживает языки `es`, `ru`, `uk`, `eu`.
- Собирает заявки и файлы через backend upload service, если форма включена в сборку.

Важно: в текущей production/staging сборке форма загрузки может быть исключена tree-shaking'ом, если компонент не импортирован в `App.tsx`. Перед изменениями формы проверь фактический `App.tsx` и `compiled/assets/index-*.js`.

## Локальная разработка

```bash
npm install
npm run dev
```

Vite обычно запускается на `http://localhost:5173`.

## Сборка и `compiled/`

Dockerfile не выполняет Vite build. Он копирует готовые файлы:

```dockerfile
COPY compiled/ ./dist/
COPY public/image/ ./dist/image/
COPY public/locales/ ./dist/locales/
```

После изменений:

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

Проверь, что `compiled/assets/index-*.js` обновился.

## Backend

Если форма загрузки активна, она должна отправлять заявки в backend:

```text
https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api/submit_application
```

Перед включением формы учитывай: staging backend использует реальные Firestore/GCS и может отправлять реальные email-уведомления.

## Деплой

- Staging: `entraycompara-landing-page-staging` в `europe-west1`
- Домен staging/рабочего лендинга: `https://entraycompara.com`
- Production: `entraycompara-landing-page-prod` в `us-west1`

Staging deploy запускается автоматически при push в `main`.
Production deploy запускается только вручную после подтверждения.

## Проверки

```bash
npm run build
git diff --check
```

Документ актуален на: 30 апреля 2026.
