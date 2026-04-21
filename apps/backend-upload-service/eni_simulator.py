import asyncio
import os
import uuid
from datetime import datetime
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from google.cloud import storage

REFERRAL_URL = "https://g2e.eniplenitude.es/index.php?refid=60335660J3"
GCS_BUCKET = os.environ.get("GCP_BUCKET_NAME", "entraycompara-invoices")


class EniSimulationError(Exception):
    pass


async def run_eni_simulation(
    cups: str,
    client_type: str = "Hogar",
    access_tariff: str | None = None,
    billed_power_p1: float | None = None,
    billed_power_p2: float | None = None,
    consumption_p1: float | None = None,
    consumption_p2: float | None = None,
    consumption_p3: float | None = None,
    equipment_rental: float | None = None,
    invoice_amount_with_vat: float | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    headless: bool = True,
) -> str:
    """
    Автоматически проходит симуляцию на Eni Plenitude и возвращает путь к скачанному PDF.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        try:
            # Шаг 1: Открыть реферальную ссылку
            print("[Eni] Step 1: Opening referral URL...")
            await page.goto(REFERRAL_URL, wait_until="networkidle", timeout=30000)

            # Закрыть cookie banner если есть
            await _dismiss_cookie_banner(page)

            # Шаг 2: Нажать Simulador
            print("[Eni] Step 2: Clicking Simulador...")
            await page.click('button[name="option"][value="simulador"]', timeout=10000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(1)
            print(f"[Eni] URL after Step 2: {page.url}")

            # Шаг 3: Выбрать Hogar / Empresa
            print(f"[Eni] Step 3: Selecting client type: {client_type}...")
            if client_type == "Empresa":
                await page.click('button[name="tipo_cliente"][value="2"]', timeout=10000)
            else:
                await page.click('button[name="tipo_cliente"][value="1"]', timeout=10000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(1)
            print(f"[Eni] URL after Step 3: {page.url}")

            # Шаг 4: Выбрать Factura de Electricidad
            print("[Eni] Step 4: Selecting Factura de Electricidad...")
            await page.click('button[name="tipo_suministro"][value="suministro_luz"]', timeout=10000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(1)
            print(f"[Eni] URL after Step 4: {page.url}")

            # Шаг 5: Ввести CUPS
            print(f"[Eni] Step 5: Entering CUPS: {cups}...")
            await page.fill('input#cups_luz', cups, timeout=10000)
            await asyncio.sleep(1)
            print(f"[Eni] URL after Step 5: {page.url}")

            # Шаг 6: Нажать Comenzar Simulación
            print("[Eni] Step 6: Clicking Comenzar Simulación...")
            await page.click('button#simulador_submit', timeout=10000)
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(2)  # Ждём загрузки формы
            print(f"[Eni] URL after Comenzar: {page.url}")

            # Проверка на ошибку CUPS (если CUPS невалиден)
            error_selector = '.alert-danger, .error-message, .mensaje-error'
            error_el = await page.query_selector(error_selector)
            if error_el:
                error_text = await error_el.inner_text()
                raise EniSimulationError(f"Eni returned error after CUPS input: {error_text}")

            # Шаг 7: Заполнить форму данными
            print("[Eni] Step 7: Filling simulation form...")
            await _fill_simulation_form(page, {
                "access_tariff": access_tariff,
                "billed_power_p1": billed_power_p1,
                "billed_power_p2": billed_power_p2,
                "consumption_p1": consumption_p1,
                "consumption_p2": consumption_p2,
                "consumption_p3": consumption_p3,
                "equipment_rental": equipment_rental,
                "invoice_amount": invoice_amount_with_vat,
                "start_date": start_date,
                "end_date": end_date,
            })

            # Шаг 8: Нажать Continuar
            print("[Eni] Step 8: Clicking Continuar...")
            await _click_continuar(page)
            await page.wait_for_load_state("networkidle", timeout=30000)

            # Шаг 9: Выбрать 3-й тариф снизу
            print("[Eni] Step 9: Selecting tariff (3rd from bottom)...")
            await _select_third_tariff_from_bottom(page)

            # Шаг 10: Подтвердить выбор (если есть дополнительная кнопка)
            submit_btn = await page.query_selector('button[type="submit"], button.btn-app')
            if submit_btn:
                await submit_btn.click()
                await page.wait_for_load_state("networkidle", timeout=30000)

            # Шаг 11: Ожидать результат (до 3 минут)
            print("[Eni] Step 11: Waiting for simulation result (up to 3 min)...")
            download_path = await _wait_for_download(page, timeout_seconds=180)

            print(f"[Eni] Simulation completed. PDF saved to: {download_path}")
            await browser.close()
            return download_path

        except PlaywrightTimeout as e:
            await _save_debug_snapshot(page, browser, "timeout")
            raise EniSimulationError(f"Timeout during Eni simulation: {str(e)}")
        except Exception as e:
            await _save_debug_snapshot(page, browser, "error")
            raise EniSimulationError(f"Eni simulation failed: {str(e)}")


async def _dismiss_cookie_banner(page):
    """Удаляет cookie banner, если он мешает кликам."""
    try:
        # Пробуем кликнуть на кнопку принятия cookies
        accept_btn = await page.query_selector(
            '#div_banner button, .contCookie button, #cookiescript_accept, .btn-accept-cookies, [class*="cookie"] button'
        )
        if accept_btn:
            await accept_btn.click()
            print("[Eni] Cookie banner dismissed (click)")
            await asyncio.sleep(0.5)
            return
    except Exception:
        pass

    # Если кнопка не сработала — удаляем баннер из DOM
    try:
        await page.evaluate("""() => {
            const selectors = ['#div_banner', '.contCookie', '#cookie-banner', '.cookie-banner', '.cookies-banner'];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) { el.remove(); }
            }
        }""")
        print("[Eni] Cookie banner dismissed (remove)")
        await asyncio.sleep(0.3)
    except Exception:
        pass


async def _click_continuar(page):
    """Нажимает кнопку Continuar/Siguiente с fallback'ами."""
    await asyncio.sleep(1)  # Даём странице время на рендер
    selectors = [
        'text=Continuar',
        'text=SIGUIENTE',
        'text=Siguiente',
        'button:has-text("Continuar")',
        'button:has-text("Siguiente")',
        'button[type="submit"]',
        '.btn-continuar',
        '#btn-continuar',
        '[value="continuar"]',
        '#continuar',
        '.btn-primary',
        'button.btn-default',
    ]
    for sel in selectors:
        try:
            el = await page.query_selector(sel)
            if el:
                await el.click()
                print(f"[Eni] Clicked Continuar via selector: {sel}")
                return
        except Exception:
            continue
    # Fallback: JavaScript click on any button containing "Continuar" or "Siguiente"
    try:
        clicked = await page.evaluate("""() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
            const target = buttons.find(b => /continuar|siguiente/i.test(b.innerText || b.value || ''));
            if (target) { target.click(); return true; }
            return false;
        }""")
        if clicked:
            print("[Eni] Clicked Continuar via JavaScript fallback")
            return
    except Exception:
        pass
    raise EniSimulationError("Could not find Continuar/Siguiente button")


async def _fill_simulation_form(page, data: dict):
    """Заполняет форму симуляции данными из счета."""
    # Потенциальные селекторы для полей (Eni может менять вёрстку)
    field_map = {
        "tarifa": ['select[name="tarifa"]', 'input[name="tarifa"]', '#tarifa', '[name="tarifa"]'],
        "potencia_p1": ['input[name="potencia_p1"]', 'input[name="potenciaContratadaP1"]', '#potencia_p1', '[name="potencia_p1"]', '[id*="potencia"]'],
        "potencia_p2": ['input[name="potencia_p2"]', 'input[name="potenciaContratadaP2"]', '#potencia_p2', '[name="potencia_p2"]', '[id*="potencia"]'],
        "consumo_p1": ['input[name="consumo_p1"]', 'input[name="consumoAnualP1"]', '#consumo_p1', '[name="consumo_p1"]', '[id*="consumo"]'],
        "consumo_p2": ['input[name="consumo_p2"]', 'input[name="consumoAnualP2"]', '#consumo_p2', '[name="consumo_p2"]', '[id*="consumo"]'],
        "consumo_p3": ['input[name="consumo_p3"]', 'input[name="consumoAnualP3"]', '#consumo_p3', '[name="consumo_p3"]', '[id*="consumo"]'],
        "alquiler": ['input[name="alquiler"]', 'input[name="alquilerEquipo"]', '#alquiler', '[name="alquiler"]'],
        "importe": ['input[name="importe"]', 'input[name="importeFactura"]', '#importe', '[name="importe"]'],
        "fecha_inicio": ['input[name="fecha_inicio"]', 'input[name="fechaInicio"]', '#fecha_inicio', '[name="fecha_inicio"]'],
        "fecha_fin": ['input[name="fecha_fin"]', 'input[name="fechaFin"]', '#fecha_fin', '[name="fecha_fin"]'],
    }

    # Дополнительное ожидание появления формы
    try:
        await page.wait_for_selector('input, select, textarea', timeout=5000)
    except Exception:
        pass

    async def fill_field(field_name: str, value):
        if value is None:
            return
        selectors = field_map.get(field_name, [])
        for sel in selectors:
            try:
                el = await page.query_selector(sel)
                if el:
                    tag = await el.evaluate("el => el.tagName.toLowerCase()")
                    if tag == "select":
                        await el.select_option(str(value))
                    else:
                        await el.fill("")
                        await el.fill(str(value))
                    print(f"[Eni] Filled {field_name} = {value}")
                    return
            except Exception:
                continue
        print(f"[Eni] Warning: could not find field {field_name}")

    # Заполняем поля
    await fill_field("tarifa", data.get("access_tariff"))
    await fill_field("potencia_p1", data.get("billed_power_p1"))
    await fill_field("potencia_p2", data.get("billed_power_p2"))
    await fill_field("consumo_p1", data.get("consumption_p1"))
    await fill_field("consumo_p2", data.get("consumption_p2"))
    await fill_field("consumo_p3", data.get("consumption_p3"))
    await fill_field("alquiler", data.get("equipment_rental"))
    await fill_field("importe", data.get("invoice_amount"))
    await fill_field("fecha_inicio", data.get("start_date"))
    await fill_field("fecha_fin", data.get("end_date"))

    # Пауза после заполнения
    await asyncio.sleep(0.5)


async def _select_third_tariff_from_bottom(page):
    """Выбирает 3-й тариф снизу из списка."""
    # Возможные селекторы для строк тарифов
    tariff_selectors = [
        '.tarifa-row',
        '.tarifa',
        '.row-tarifa',
        '[class*="tarifa"]',
        'tr.tarifa',
        '.panel-tarifa',
    ]

    tariffs = []
    for sel in tariff_selectors:
        tariffs = await page.query_selector_all(sel)
        if len(tariffs) >= 3:
            break

    if len(tariffs) == 0:
        raise EniSimulationError("No tariffs found on the page")

    if len(tariffs) < 3:
        # Если меньше 3 тарифов — выбираем последний
        target = tariffs[-1]
        print(f"[Eni] Only {len(tariffs)} tariffs found, selecting last one")
    else:
        target = tariffs[-3]
        print(f"[Eni] Selecting 3rd tariff from bottom (index {len(tariffs)-3} of {len(tariffs)})")

    # Пытаемся кликнуть radio внутри строки тарифа
    radio = await target.query_selector('input[type="radio"]')
    if radio:
        await radio.click()
    else:
        await target.click()

    await asyncio.sleep(0.5)


async def _wait_for_download(page, timeout_seconds: int = 180) -> str:
    """Ожидает появления кнопки/ссылки для скачивания PDF."""
    download_selectors = [
        'a[href$=".pdf"]',
        'a[download]',
        '.download-link',
        'button:has-text("Descargar")',
        'a:has-text("PDF")',
        'a:has-text("descargar")',
    ]

    start_time = asyncio.get_event_loop().time()
    while (asyncio.get_event_loop().time() - start_time) < timeout_seconds:
        for sel in download_selectors:
            link = await page.query_selector(sel)
            if link:
                print(f"[Eni] Download link found: {sel}")
                # Ждём скачивание
                async with page.expect_download(timeout=30000) as download_info:
                    await link.click()
                download = await download_info.value
                path = await download.path()
                return str(path)

        # Также проверяем, не появилась ли кнопка "Continuar" или "Finalizar"
        # (возможно, нужно ещё один шаг)
        next_btn = await page.query_selector('button:has-text("Continuar"), button:has-text("Finalizar")')
        if next_btn:
            await next_btn.click()
            await page.wait_for_load_state("networkidle", timeout=15000)

        await asyncio.sleep(5)

    raise EniSimulationError(f"Download did not appear within {timeout_seconds} seconds")


async def _save_debug_snapshot(page, browser, prefix: str):
    """Сохраняет скриншот и HTML в GCS для отладки."""
    try:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        screenshot_local = f"/tmp/eni_{prefix}_{timestamp}.png"
        html_local = f"/tmp/eni_{prefix}_{timestamp}.html"

        await page.screenshot(path=screenshot_local, full_page=True)
        html_content = await page.content()
        with open(html_local, "w", encoding="utf-8") as f:
            f.write(html_content)

        # Upload to GCS
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        base_path = f"eni_debug/{timestamp}"

        blob_png = bucket.blob(f"{base_path}/screenshot.png")
        blob_png.upload_from_filename(screenshot_local)
        blob_png.acl.all().grant_read()
        blob_png.acl.save()

        blob_html = bucket.blob(f"{base_path}/page.html")
        blob_html.upload_from_filename(html_local)
        blob_html.acl.all().grant_read()
        blob_html.acl.save()

        png_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{base_path}/screenshot.png"
        html_url = f"https://storage.googleapis.com/{GCS_BUCKET}/{base_path}/page.html"
        print(f"[Eni] Debug snapshot uploaded: {png_url}")
        print(f"[Eni] Debug HTML uploaded: {html_url}")
    except Exception as e:
        print(f"[Eni] Failed to save debug snapshot: {e}")
    finally:
        try:
            await browser.close()
        except Exception:
            pass
