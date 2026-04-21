# ТЗ: Автоматизация симуляций Eni Plenitude (Playwright)

## 1. Цель
Автоматизировать создание симуляции тарифа на сайте Eni Plenitude (`https://g2e.eniplenitude.es`) через headless-браузер (Playwright), используя данные, извлечённые из счета клиента.

**Реферальная ссылка оператора:** `https://g2e.eniplenitude.es/index.php?refid=60335660J3`

---

## 2. Исходные данные

### 2.1. Flow ручной симуляции (который нужно автоматизировать)
1. Открыть `https://g2e.eniplenitude.es/index.php?refid=60335660J3`
2. Нажать **"Simulador"** (`<button name="option" value="simulador">`)
3. Дождаться загрузки → нажать **"Hogar"** (`<button name="tipo_cliente" value="1">`)
4. Дождаться загрузки → нажать **"Factura de Electricidad"** (`<button name="tipo_suministro" value="suministro_luz">`)
5. Ввести **CUPS** в поле `<input name="cups_luz" id="cups_luz" maxlength="22">`
6. Нажать **"Comenzar Simulación"** (`<button id="simulador_submit" name="option" value="simulador">`)
7. Заполнить форму данными из счета
8. Нажать **"Continuar"** (`<button name="option" value="simulador">`)
9. На странице тарифов выбрать **3-й снизу** (в 95% случаев). Если разница между 3-м и 4-м снизу небольшая — выбирать 3-й снизу.
10. Отправить на симуляцию
11. **Ожидать 3 минуты**
12. Скачать PDF с результатом симуляции

### 2.2. Поля для заполнения формы (из `ExtractedData`)
| Поле Eni | Поле `ExtractedData` | Примечание |
|----------|---------------------|------------|
| CUPS | `cups` | Обязательное поле |
| Tipo de cliente | `client_type` | Hogar / Empresa |
| Tarifa de Acceso | `access_tariff` | 2.0A, 2.0DHA, 3.0A и т.д. |
| Potencia P1 | `billed_power_p1` | kW |
| Potencia P2 | `billed_power_p2` | kW (может отсутствовать) |
| Consumo P1 | `consumption_p1` | kWh (Punta) |
| Consumo P2 | `consumption_p2` | kWh (Llano) |
| Consumo P3 | `consumption_p3` | kWh (Valle) |
| Alquiler equipos | `equipment_rental` | € |

---

## 3. Архитектура решения

```
┌──────────────┐     POST /api/applications/{id}/proposal/simulations/auto-create
│   CRM Admin  │ ──────────────────────────────────────────────────────────────►
│   (Frontend) │                                                                       
└──────────────┘                                                                        
                                                                                        
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           Backend (Cloud Run)                                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  FastAPI Endpoint                                                            │   │
│  │  • Проверяет `ExtractedData` и `cups`                                        │   │
│  │  • Запускает `EniSimulationWorker` в фоновом потоке                          │   │
│  │  • Возвращает `task_id` (имитация async job)                                 │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                    │                                                  │
│                                    ▼                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  EniSimulationWorker (async background task)                                 │   │
│  │  • Playwright + Chromium headless                                              │   │
│  │  • Проходит 12 шагов на g2e.eniplenitude.es                                    │   │
│  │  • Скачивает PDF симуляции                                                     │   │
│  │  • Загружает PDF в GCS (`simulation_files/YYYY/MM/DD/{uuid}.pdf`)              │   │
│  │  • Создаёт документ в `proposal_simulations`                                   │   │
│  │  • Пишет в Timeline                                                            │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Технический стек

| Компонент | Технология |
|-----------|------------|
| Browser Automation | `playwright` (Python) |
| Headless Browser | Chromium (bundled with Playwright) |
| Background Tasks | `asyncio` + `threading` (для MVP) или `celery` (для продакшена) |
| PDF Download | Playwright `download` event |
| File Storage | GCS (существующий bucket) |
| Firestore | Существующая подколлекция `proposal_simulations` |

---

## 5. Docker-изменения

### 5.1. `apps/backend-upload-service/Dockerfile`
Playwright требует системные зависимости для Chromium:

```dockerfile
FROM python:3.12-slim

# Установка системных зависимостей для Playwright + Chromium
RUN apt-get update && apt-get install -y \
    libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Установка Playwright browsers
RUN playwright install chromium
RUN playwright install-deps chromium

COPY . .
ENV PORT=8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

**Размер образа:** увеличится примерно на **400-500 MB** из-за Chromium.

### 5.2. `requirements.txt`
Добавить:
```
playwright
```

---

## 6. API Endpoints

### 6.1. Запуск автоматической симуляции
```
POST /api/applications/{application_id}/proposal/simulations/auto-create
```

**Request Body:**
```json
{
  "cups": "ES0021000012345678AA",
  "client_type": "Hogar",
  "access_tariff": "2.0A",
  "billed_power_p1": 3.3,
  "billed_power_p2": null,
  "consumption_p1": 251,
  "consumption_p2": 180,
  "consumption_p3": 120,
  "equipment_rental": 1.62
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "task_id": "auto-sim-abc123",
  "message": "Автоматическая симуляция запущена. Ожидайте ~3 минуты.",
  "status": "pending"
}
```

### 6.2. Проверка статуса задачи
```
GET /api/applications/{application_id}/proposal/simulations/auto-create/{task_id}/status
```

**Response:**
```json
{
  "task_id": "auto-sim-abc123",
  "status": "running" | "completed" | "failed",
  "simulation_id": "sim_xxx" | null,
  "error": null | "Ошибка..."
}
```

---

## 7. Playwright Script (псевдокод)

```python
async def run_eni_simulation(data: dict) -> str:
    """Возвращает путь к скачанному PDF."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()
        
        # Шаг 1: Открыть реферальную ссылку
        await page.goto("https://g2e.eniplenitude.es/index.php?refid=60335660J3")
        
        # Шаг 2: Нажать Simulador
        await page.click('button[value="simulador"]')
        await page.wait_for_load_state('networkidle')
        
        # Шаг 3: Нажать Hogar / Empresa
        if data['client_type'] == 'Hogar':
            await page.click('button[name="tipo_cliente"][value="1"]')
        else:
            await page.click('button[name="tipo_cliente"][value="2"]')
        await page.wait_for_load_state('networkidle')
        
        # Шаг 4: Нажать Factura de Electricidad
        await page.click('button[name="tipo_suministro"][value="suministro_luz"]')
        await page.wait_for_load_state('networkidle')
        
        # Шаг 5: Ввести CUPS
        await page.fill('input#cups_luz', data['cups'])
        
        # Шаг 6: Нажать Comenzar Simulación
        await page.click('button#simulador_submit')
        await page.wait_for_load_state('networkidle')
        
        # Шаг 7: Заполнить форму
        # (селекторы зависят от реальной вёрстки Eni)
        await page.fill('input[name="potencia_p1"]', str(data['billed_power_p1']))
        if data.get('billed_power_p2'):
            await page.fill('input[name="potencia_p2"]', str(data['billed_power_p2']))
        await page.fill('input[name="consumo_p1"]', str(data['consumption_p1']))
        await page.fill('input[name="consumo_p2"]', str(data['consumption_p2']))
        await page.fill('input[name="consumo_p3"]', str(data['consumption_p3']))
        
        # Шаг 8: Нажать Continuar
        await page.click('button[value="simulador"]')
        await page.wait_for_load_state('networkidle')
        
        # Шаг 9: Выбрать 3-й тариф снизу
        tariffs = await page.query_selector_all('.tarifa-row')  # примерный селектор
        target_tariff = tariffs[-3]  # 3-й снизу
        await target_tariff.click('input[type="radio"]')
        
        # Шаг 10: Отправить
        await page.click('button[type="submit"]')
        
        # Шаг 11: Ожидать 3 минуты с проверкой прогресса
        for _ in range(36):  # 36 * 5 сек = 3 мин
            await asyncio.sleep(5)
            if await page.query_selector('.download-link'):
                break
        
        # Шаг 12: Скачать PDF
        async with page.expect_download() as download_info:
            await page.click('.download-link')
        download = await download_info.value
        path = await download.path()
        
        await browser.close()
        return path
```

---

## 8. Обработка ошибок

| Сценарий | Действие |
|----------|----------|
| CAPTCHA / Cloudflare | Вернуть `failed`, записать в Timeline. Предложить оператору ручное создание. |
| Изменилась вёрстка Eni | Вернуть `failed`. Логировать HTML snapshot для отладки. |
| CUPS не найден в системе Eni | Вернуть `failed` с текстом ошибки Eni. |
| Таймаут (>5 мин) | Вернуть `failed`. |
| Нет 3-го тарифа снизу | Выбрать последний доступный. |

---

## 9. Риски и ограничения

1. **Bot Detection**: Eni может заблокировать IP Cloud Run. Нужен ротация proxy (необязательно для MVP).
2. **Вёрстка**: Любое обновление сайта Eni сломает скрипт.
3. **Размер Docker**: +400-500 MB.
4. **ToS**: Автоматизация может нарушать условия использования Eni Plenitude.
5. **Время**: 3 минуты — слишком долго для синхронного HTTP-запроса. Нужен async job.

---

## 10. Этапы реализации

### Этап 1: Инфраструктура (30 мин)
- Обновить `Dockerfile` (+ системные зависимости)
- Обновить `requirements.txt` (+ playwright)
- Проверить локальный запуск Chromium

### Этап 2: Playwright Script (1-2 часа)
- Написать `eni_simulator.py` с полным flow
- Протестировать локально на реальной ссылке
- Добавить селекторы для всех шагов

### Этап 3: Backend Integration (1 час)
- Добавить endpoint `POST .../auto-create`
- Добавить endpoint `GET .../status`
- Интеграция с GCS загрузкой
- Интеграция с Firestore (создание simulation)
- Timeline-запись

### Этап 4: Frontend (30 мин)
- Кнопка «Создать симуляцию автоматически (Eni)» в `SimulationPanel`
- Показ статуса задачи (polling)
- Fallback на ручное создание при ошибке

### Этап 5: Тестирование и деплой (30 мин)
- Проверить Docker build
- Deploy staging
- Тест на реальном CUPS

**Итого: ~4-5 часов работы**

---

## 11. Альтернатива (рекомендуется если Playwright нестабилен)

Если Eni блокирует автоматизацию — оставить текущий ручной flow:
1. Оператор заходит на Eni вручную
2. Создаёт симуляцию
3. В CRM нажимает «Загрузить PDF симуляции»
4. Система сохраняет файл + считает экономию

Это **уже работает** и не требует изменений.
