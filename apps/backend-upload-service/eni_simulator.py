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
    trace_path = "/tmp/eni_trace.zip"
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(accept_downloads=True)
        # Включаем Playwright Trace — полная запись со скриншотами, DOM, сетью и консолью
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = await context.new_page()
        # Увеличиваем viewport, чтобы элементы не "прятались" за пределами экрана
        await page.set_viewport_size({"width": 1920, "height": 1080})

        try:
            # Шаг 1: Открыть реферальную ссылку
            print("[Eni] Step 1: Opening referral URL...")
            await page.goto(REFERRAL_URL, wait_until="networkidle", timeout=30000)

            # Закрыть cookie banner и все overlay/modal-backdrop'ы
            await _dismiss_cookie_banner(page)
            await _remove_all_overlays(page)

            # Шаг 2: Нажать Simulador
            print("[Eni] Step 2: Clicking Simulador...")
            await _scroll_and_click(page, 'button[name="option"][value="simulador"]')
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(1)
            print(f"[Eni] URL after Step 2: {page.url}")

            # Шаг 3: Выбрать Hogar / Empresa
            print(f"[Eni] Step 3: Selecting client type: {client_type}...")
            if client_type == "Empresa":
                await _scroll_and_click(page, 'button[name="tipo_cliente"][value="2"]')
            else:
                await _scroll_and_click(page, 'button[name="tipo_cliente"][value="1"]')
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(1)
            print(f"[Eni] URL after Step 3: {page.url}")

            # Шаг 4: Выбрать Factura de Electricidad
            print("[Eni] Step 4: Selecting Factura de Electricidad...")
            await _scroll_and_click(page, 'button[name="tipo_suministro"][value="suministro_luz"]')
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(1)
            print(f"[Eni] URL after Step 4: {page.url}")

            # Шаг 5: Ввести CUPS и дождаться валидации
            print(f"[Eni] Step 5: Entering CUPS: {cups}...")
            await page.fill('input#cups_luz', cups, timeout=10000)
            await page.keyboard.press('Tab')  # Trigger blur/validation
            print("[Eni] Waiting for CUPS validation (5s)...")
            await asyncio.sleep(5)
            print(f"[Eni] URL after Step 5: {page.url}")

            # Удаляем overlay'и ещё раз — они могли появиться после взаимодействия
            await _remove_all_overlays(page)

            # Проверяем статус кнопки
            submit_btn = await page.query_selector('button#simulador_submit')
            is_disabled = await submit_btn.evaluate('el => el.disabled') if submit_btn else True
            if is_disabled:
                # Проверяем сообщение об ошибке
                error_msg = await page.evaluate("""() => {
                    const el = document.querySelector('.error_input, .alert-danger, .mensaje-error');
                    return el ? el.innerText || el.textContent : '';
                }""")
                raise EniSimulationError(f"CUPS validation failed. Eni message: {error_msg or 'No data for this CUPS'}")

            # Шаг 6: Нажать Comenzar Simulación
            print("[Eni] Step 6: Clicking Comenzar Simulación...")
            # Кнопка часто перекрыта баннером или вне viewport — используем JS fallback
            await _scroll_and_click(page, 'button#simulador_submit')
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(3)  # Ждём загрузки формы симуляции
            print(f"[Eni] URL after Comenzar: {page.url}")

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

            # Шаг 8: Нажать Comenzar Simulación повторно для отправки данных
            print("[Eni] Step 8: Clicking Comenzar Simulación (submit simulation data)...")
            await _scroll_and_click(page, 'button#simulador_submit')
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(5)  # Увеличили ожидание — Eni долго рендерит следующий экран
            print(f"[Eni] URL after Step 8: {page.url}")
            await _take_step_screenshot(page, "08_after_submit")

            # Возможен промежуточный экран с кнопкой "Continuar" / "Siguiente"
            try:
                await _click_continuar(page)
                await page.wait_for_load_state("networkidle", timeout=30000)
                await asyncio.sleep(3)
                print(f"[Eni] URL after Continuar: {page.url}")
                await _take_step_screenshot(page, "08b_after_continuar")
            except Exception:
                print("[Eni] No Continuar button found, proceeding to tariff selection")

            # Шаг 9: Выбрать 3-й тариф снизу
            print("[Eni] Step 9: Selecting tariff (3rd from bottom)...")
            await _take_step_screenshot(page, "09_before_tariff_selection")
            await _select_third_tariff_from_bottom(page)

            # Шаг 10: Подтвердить выбор (если есть дополнительная кнопка)
            try:
                await _scroll_and_click(page, 'button[type="submit"], button.btn-app')
                await page.wait_for_load_state("networkidle", timeout=30000)
            except Exception:
                # Если кнопки нет — возможно, она уже нажата автоматически
                pass

            # Шаг 11: Ожидать результат (до 3 минут)
            print("[Eni] Step 11: Waiting for simulation result (up to 3 min)...")
            download_path = await _wait_for_download(page, timeout_seconds=180)

            print(f"[Eni] Simulation completed. PDF saved to: {download_path}")
            await context.tracing.stop(path=trace_path)
            await _upload_trace(trace_path)
            await browser.close()
            return download_path

        except PlaywrightTimeout as e:
            await context.tracing.stop(path=trace_path)
            await _upload_trace(trace_path)
            await _save_debug_snapshot(page, browser, "timeout")
            raise EniSimulationError(f"Timeout during Eni simulation: {str(e)}")
        except Exception as e:
            await context.tracing.stop(path=trace_path)
            await _upload_trace(trace_path)
            await _save_debug_snapshot(page, browser, "error")
            raise EniSimulationError(f"Eni simulation failed: {str(e)}")


async def _dismiss_cookie_banner(page):
    """Удаляет cookie banner, если он мешает кликам."""
    try:
        # Пробуем кликнуть на кнопку принятия cookies
        accept_btn = await page.query_selector(
            '#div_banner button, .contCookie button, #cookiescript_accept, .btn-accept-cookies, [class*="cookie"] button, #onetrust-accept-btn-handler, .accept-cookies-btn'
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
            const selectors = ['#div_banner', '.contCookie', '#cookie-banner', '.cookie-banner', '.cookies-banner', '#onetrust-banner-sdk', '.cookie-consent', '.gdpr-banner'];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) { el.remove(); }
            }
        }""")
        print("[Eni] Cookie banner dismissed (remove)")
        await asyncio.sleep(0.3)
    except Exception:
        pass


async def _remove_all_overlays(page):
    """Удаляет modal-backdrop, overlay'ы и разблокирует скролл страницы."""
    try:
        await page.evaluate("""() => {
            // Удаляем backdrop'ы модалок
            const backdrops = document.querySelectorAll('.modal-backdrop, .overlay, .modal-overlay, .backdrop, .loading-overlay, .spinner-overlay');
            backdrops.forEach(el => el.remove());

            // Удаляем фиксированные элементы с высоким z-index, которые часто перекрывают контент
            document.querySelectorAll('*').forEach(el => {
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                // Если элемент фиксированный/стики и занимает почти всю ширину/высоту — возможно это overlay
                if ((style.position === 'fixed' || style.position === 'sticky') &&
                    rect.width > window.innerWidth * 0.8 &&
                    rect.height > window.innerHeight * 0.3 &&
                    parseInt(style.zIndex) > 100) {
                    // Не удаляем если это явно header/footer/nav
                    const tag = el.tagName.toLowerCase();
                    const role = el.getAttribute('role') || '';
                    if (!['header', 'nav', 'footer'].includes(tag) && !role.includes('navigation')) {
                        el.remove();
                    }
                }
            });

            // Разблокируем скролл body
            document.body.style.overflow = 'auto';
            document.body.style.position = 'static';
            document.documentElement.style.overflow = 'auto';
        }""")
        print("[Eni] Overlays removed")
        await asyncio.sleep(0.3)
    except Exception:
        pass


async def _scroll_and_click(page, selector: str, timeout: int = 10000):
    """Скроллит к элементу и кликает. Если обычный клик не сработал (overlay/visibility) — использует JavaScript click."""
    # Ждём появления элемента
    await page.wait_for_selector(selector, state="attached", timeout=timeout)

    # Скроллим к элементу
    try:
        await page.evaluate(f"""() => {{
            const el = document.querySelector('{selector}');
            if (el) el.scrollIntoView({{block: 'center', inline: 'center'}});
        }}""")
        await asyncio.sleep(0.3)
    except Exception:
        pass

    # Пробуем обычный клик с force=True (игнорирует проверку actionability, но не перекрытие)
    try:
        await page.locator(selector).click(force=True, timeout=timeout)
        print(f"[Eni] Clicked {selector} (force)")
        return
    except Exception as e:
        print(f"[Eni] Force click failed for {selector}: {e}")

    # Fallback: JavaScript click — работает даже если элемент перекрыт
    try:
        await page.evaluate(f"""() => {{
            const el = document.querySelector('{selector}');
            if (!el) throw new Error('Element not found: {selector}');
            el.click();
            el.dispatchEvent(new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }}));
        }}""")
        print(f"[Eni] Clicked {selector} (JavaScript fallback)")
        await asyncio.sleep(0.5)
    except Exception as e:
        raise EniSimulationError(f"Failed to click {selector}: {e}")


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
        "tarifa": ['select[name="tarifa"]', 'input[name="tarifa"]', '#tarifa', '[name="tarifa"]', '#tarifa_cliente_electricidad', '[name="tarifa_cliente_electricidad"]'],
        "potencia_p1": ['input[name="potencia_p1"]', 'input[name="potenciaContratadaP1"]', '#potencia_p1', '[name="potencia_p1"]', '#p1_electricidad', '[name="p1_electricidad"]'],
        "potencia_p2": ['input[name="potencia_p2"]', 'input[name="potenciaContratadaP2"]', '#potencia_p2', '[name="potencia_p2"]', '#p2_electricidad', '[name="p2_electricidad"]'],
        "consumo_p1": ['input[name="consumo_p1"]', 'input[name="consumoAnualP1"]', '#consumo_p1', '[name="consumo_p1"]', '#e1_electricidad', '[name="e1_electricidad"]'],
        "consumo_p2": ['input[name="consumo_p2"]', 'input[name="consumoAnualP2"]', '#consumo_p2', '[name="consumo_p2"]', '#e2_electricidad', '[name="e2_electricidad"]'],
        "consumo_p3": ['input[name="consumo_p3"]', 'input[name="consumoAnualP3"]', '#consumo_p3', '[name="consumo_p3"]', '#e3_electricidad', '[name="e3_electricidad"]'],
        "alquiler": ['input[name="alquiler"]', 'input[name="alquilerEquipo"]', '#alquiler', '[name="alquiler"]', '#alquiler_equipos_electricidad', '[name="alquiler_equipos_electricidad"]'],
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
    """Выбирает 3-й тариф снизу из списка с множеством fallback'ов."""
    title = await page.title()
    print(f"[Eni] Page title: {title}")
    print(f"[Eni] Page URL: {page.url}")

    # Сначала пробуем классические селекторы
    tariff_selectors = [
        '.tarifa-row',
        '.tarifa',
        '.row-tarifa',
        '[class*="tarifa"]',
        'tr.tarifa',
        '.panel-tarifa',
        '.oferta-row',
        '.oferta',
        '[class*="oferta"]',
        '.plan-row',
        '.plan',
        '.producto-row',
        '.producto',
        # Табличные варианты
        'table tbody tr',
        'table tr',
        '.table tbody tr',
    ]

    tariffs = []
    used_selector = None
    for sel in tariff_selectors:
        tariffs = await page.query_selector_all(sel)
        if len(tariffs) >= 3:
            used_selector = sel
            break
        # Если нашли хоть что-то — запоминаем, но продолжаем искать лучший селектор
        if len(tariffs) > 0 and used_selector is None:
            used_selector = sel

    # Fallback: если не нашли по классам — ищем ВСЕ radio buttons на странице
    # и считаем, что каждый относится к отдельному тарифу
    if len(tariffs) == 0:
        print("[Eni] No tariffs by class selectors, trying radio buttons...")
        radios = await page.query_selector_all('input[type="radio"]')
        if len(radios) >= 1:
            tariffs = radios
            used_selector = "input[type='radio']"
            print(f"[Eni] Found {len(radios)} radio buttons, treating as tariffs")

    # Ещё fallback: ищем label'ы, связанные с radio, или div'ы с текстом "€"
    if len(tariffs) == 0:
        print("[Eni] Trying JavaScript fallback to find tariff containers...")
        js_tariffs = await page.evaluate(r"""() => {
            // Ищем элементы, которые содержат цену (€) и radio/click
            const all = Array.from(document.querySelectorAll('*'));
            const candidates = all.filter(el => {
                const text = el.innerText || '';
                const hasPrice = text.includes('€') && /\d+[,.]\d+/.test(text);
                const hasRadio = el.querySelector('input[type="radio"]') !== null;
                const isContainer = el.children.length >= 2;
                return hasPrice && hasRadio && isContainer;
            });
            // Возвращаем уникальные ближайшие родители
            const parents = [];
            candidates.forEach(el => {
                const parent = el.closest('div, tr, li, article, section');
                if (parent && !parents.includes(parent)) parents.push(parent);
            });
            return parents.length;
        }""")
        print(f"[Eni] JS fallback found {js_tariffs} tariff-like containers")

        # Если JS нашёл контейнеры — пробуем кликнуть на 3-й снизу через JS
        if js_tariffs >= 1:
            clicked = await page.evaluate(r"""() => {
                const all = Array.from(document.querySelectorAll('*'));
                const candidates = all.filter(el => {
                    const text = el.innerText || '';
                    const hasPrice = text.includes('€') && /\d+[,.]\d+/.test(text);
                    const hasRadio = el.querySelector('input[type="radio"]') !== null;
                    const isContainer = el.children.length >= 2;
                    return hasPrice && hasRadio && isContainer;
                });
                const parents = [];
                candidates.forEach(el => {
                    const parent = el.closest('div, tr, li, article, section');
                    if (parent && !parents.includes(parent)) parents.push(parent);
                });
                if (parents.length === 0) return false;
                const target = parents.length < 3 ? parents[parents.length - 1] : parents[parents.length - 3];
                const radio = target.querySelector('input[type="radio"]');
                if (radio) radio.click();
                else target.click();
                return true;
            }""")
            if clicked:
                print("[Eni] Selected tariff via JavaScript fallback")
                await asyncio.sleep(1)
                return

    if len(tariffs) == 0:
        # Последняя попытка: сохраняем HTML для анализа и падаем
        html_snippet = await page.evaluate("() => document.body.innerHTML.substring(0, 2000)")
        print(f"[Eni] Page HTML snippet:\n{html_snippet}\n...")
        raise EniSimulationError("No tariffs found on the page")

    print(f"[Eni] Found {len(tariffs)} tariffs via selector: {used_selector}")

    if len(tariffs) < 3:
        target = tariffs[-1]
        print(f"[Eni] Only {len(tariffs)} tariffs found, selecting last one")
    else:
        target = tariffs[-3]
        print(f"[Eni] Selecting 3rd tariff from bottom (index {len(tariffs)-3} of {len(tariffs)})")

    # Пытаемся кликнуть radio внутри строки тарифа
    try:
        radio = await target.query_selector('input[type="radio"]')
        if radio:
            await radio.click(force=True)
        else:
            await target.click(force=True)
    except Exception:
        # Fallback: JS click на родителе
        await target.evaluate('el => el.click()')

    await asyncio.sleep(1)


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
                    try:
                        await link.click(force=True)
                    except Exception:
                        await link.evaluate('el => el.click()')
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


async def _take_step_screenshot(page, step_name: str):
    """Сохраняет скриншот шага в GCS для визуальной отладки."""
    try:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        local_path = f"/tmp/eni_step_{step_name}_{timestamp}.png"
        await page.screenshot(path=local_path, full_page=True)

        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        blob_path = f"eni_debug/{timestamp}_step_{step_name}.png"
        blob = bucket.blob(blob_path)
        blob.upload_from_filename(local_path)
        blob.acl.all().grant_read()
        blob.acl.save()

        url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_path}"
        print(f"[Eni] Step screenshot [{step_name}]: {url}")
    except Exception as e:
        print(f"[Eni] Failed to save step screenshot: {e}")


async def _upload_trace(trace_path: str):
    """Загружает Playwright Trace в GCS."""
    try:
        if not os.path.exists(trace_path):
            return
        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        blob_path = f"eni_debug/{timestamp}_trace.zip"
        blob = bucket.blob(blob_path)
        blob.upload_from_filename(trace_path)
        blob.acl.all().grant_read()
        blob.acl.save()
        url = f"https://storage.googleapis.com/{GCS_BUCKET}/{blob_path}"
        print(f"[Eni] Playwright Trace uploaded: {url}")
        print(f"[Eni] Open in viewer: https://trace.playwright.dev/?trace={url}")
    except Exception as e:
        print(f"[Eni] Failed to upload trace: {e}")


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
