# Entraycompara Landing Page

Публичный лендинг для привлечения клиентов и сбора заявок на анализ коммунальных счетов.

## Стек

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Express (статический сервер в продакшене)

## Структура

```
landing-page/
├── compiled/           # ← Продакшен-ассеты (выгружены из GCS)
├── components/         # React-компоненты
├── context/            # LanguageContext (мультиязычность)
├── locales/            # Переводы: es, eu, ru, uk
├── server/             # Express-сервер для продакшена
├── styles/             # CSS-анимации
├── App.tsx             # Корневой компонент
├── index.html          # HTML-шаблон для dev-сборки
├── Dockerfile          # Образ для Cloud Run
└── README.md           # Этот файл
```

## Локальная разработка

```bash
npm install
npm run dev
```

Приложение запустится на `http://localhost:5173` (порт Vite по умолчанию).

## Как внести изменения

1. Отредактируй компоненты в `components/` или переводы в `locales/`
2. Собери проект:
   ```bash
   npm run build
   ```
3. Скопируй результат сборки в `compiled/`:
   ```bash
   cp -r dist/* compiled/
   ```
4. Убедись, что `compiled/index.html` увеличился в размере (~190 KB)
5. Commit и push
6. Дождись автодеплоя в staging

## Важный нюанс: `compiled/`

Папка `compiled/` содержит **финальную сборку**, которая раздаётся в Cloud Run. В отличие от стандартного Vite-проекта, Docker-образ **не собирает** приложение — он берёт готовые файлы из `compiled/`.

## Переменные окружения

- `GEMINI_API_KEY` — placeholder в `.env.local` (используется только при локальной разработке)
- `PORT=3000` — порт, на котором слушает Express-сервер в продакшене

## Деплой

- **Staging**: `https://entraycompara-landing-page-staging-910753338248.europe-west1.run.app`
- **Production**: `entraycompara-landing-page-prod` (us-west1)
- **Домен**: `https://entraycompara.com` (в данный момент указывает на staging)

Автодеплой настроен через GitHub Actions (`.github/workflows/deploy-staging.yml`).
