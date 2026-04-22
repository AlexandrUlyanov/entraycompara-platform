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

            # Нормализуем CUPS: только заглавные буквы и цифры, без пробелов/дефисов
            cups_clean = cups.upper().replace(' ', '').replace('-', '').replace('.', '')
            print(f"[Eni] Step 5: Entering CUPS: {cups_clean} (original: {cups})...")
            await page.fill('input#cups_luz', cups_clean, timeout=10000)
            # Явно триггерим change event (Eni валидирует CUPS через JS onchange)
            await page.evaluate("""() => {
                const el = document.getElementById('cups_luz');
                if (el) { el.dispatchEvent(new Event('change', { bubbles: true })); }
            }""")
            await asyncio.sleep(3)  # Даём JS-валидации время на AJAX-запрос
            print(f"[Eni] URL after Step 5: {page.url}")

            # Удаляем overlay'и ещё раз — они могли появиться после взаимодействия
            await _remove_all_overlays(page)

            # НЕ проверяем клиентскую ошибку .text-danger здесь!
            # Eni JS может ложно показывать "No hay datos" через AJAX,
            # но сервер при POST принимает тот же CUPS.
            # Проверим результат после нажатия кнопки (шаг 6).

            # Шаг 6: Нажать Comenzar Simulación
            print("[Eni] Step 6: Clicking Comenzar Simulación...")
            await _scroll_and_click(page, 'button#simulador_submit')
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(3)  # Ждём загрузки формы симуляции
            print(f"[Eni] URL after Comenzar: {page.url}")
            await _take_step_screenshot(page, "06_after_comenzar")

            # Проверяем успешность CUPS: ищем видимую форму симуляции (#form_simulador)
            # Важно: .text-danger.h3 может существовать в скрытом #form_cups — это ложный сигнал
            sim_form_visible = await page.evaluate(r"""() => {
                const form = document.getElementById('form_simulador');
                if (!form) return false;
                const style = window.getComputedStyle(form);
                return style.display !== 'none' && style.visibility !== 'hidden';
            }""")
            print(f"[Eni] Simulation form visible: {sim_form_visible}")

            if not sim_form_visible:
                # Проверяем, не показана ли реальная ошибка сервера (видимая)
                visible_error = await page.evaluate(r"""() => {
                    const msg = document.getElementById('mensaje_error');
                    if (!msg) return '';
                    const style = window.getComputedStyle(msg);
                    if (style.display === 'none') return '';
                    const err = msg.querySelector('.text-danger.h3, .alert-danger');
                    return err ? (err.innerText || '').trim() : '';
                }""")
                if visible_error:
                    raise EniSimulationError(f"CUPS rejected by Eni server: {visible_error}")
                # Может быть, нужно попробовать 20-символьный CUPS
                still_cups_form = await page.query_selector('input#cups_luz')
                if still_cups_form and 'pantalla=2' in page.url and len(cups_clean) == 22:
                    cups_20 = cups_clean[:20]
                    print(f"[Eni] Trying shortened CUPS (20 chars): {cups_20}")
                    await page.fill('input#cups_luz', cups_20, timeout=10000)
                    await page.evaluate("""() => {
                        const el = document.getElementById('cups_luz');
                        if (el) { el.dispatchEvent(new Event('change', { bubbles: true })); }
                    }""")
                    await asyncio.sleep(2)
                    await _scroll_and_click(page, 'button#simulador_submit')
                    await page.wait_for_load_state("networkidle", timeout=30000)
                    await asyncio.sleep(3)
                    sim_form_visible_20 = await page.evaluate(r"""() => {
                        const form = document.getElementById('form_simulador');
                        if (!form) return false;
                        const style = window.getComputedStyle(form);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    }""")
                    if not sim_form_visible_20:
                        raise EniSimulationError(f"CUPS validation failed on server. Tried: {cups_clean} and {cups_20}")
                else:
                    raise EniSimulationError(f"CUPS validation failed on server: {cups_clean}")

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
                "invoice_amount_with_vat": invoice_amount_with_vat,
                "start_date": start_date,
                "end_date": end_date,
            })
            await _take_step_screenshot(page, "07_after_fill")

            # Шаг 8: Отправить #form_simulador через JS form.submit()
            # Важно: jquery.form.js перехватывает клик на кнопку, поэтому
            # обычный Playwright click (даже force=True) не срабатывает.
            # form.submit() напрямую обходит все JS-перехватчики.
            print("[Eni] Step 8: Submitting simulation form...")
            await page.evaluate(r"""() => {
                const form = document.getElementById('form_simulador');
                if (form) { form.submit(); }
            }""")
            await page.wait_for_load_state("networkidle", timeout=30000)
            await asyncio.sleep(5)
            current_url = page.url
            print(f"[Eni] URL after Step 8: {current_url}")
            await _take_step_screenshot(page, "08_after_submit")

            # КРИТИЧНАЯ ПРОВЕРКА: если мы всё ещё на pantalla=2 — форма не принята
            if 'pantalla=2' in current_url:
                # Проверяем, нет ли ВИДИМОЙ ошибки на странице
                visible_error = await page.evaluate(r"""() => {
                    const msg = document.getElementById('mensaje_error');
                    if (msg && window.getComputedStyle(msg).display !== 'none') {
                        const el = msg.querySelector('.text-danger.h3, .alert-danger');
                        return el ? (el.innerText || '').trim() : '';
                    }
                    const el = document.querySelector('.text-danger.h3, .alert-danger');
                    if (el && window.getComputedStyle(el).display !== 'none') {
                        return (el.innerText || '').trim();
                    }
                    return '';
                }""")
                if visible_error:
                    raise EniSimulationError(f"Form submission failed. Eni says: {visible_error}")
                # Пробуем найти и кликнуть "Continuar" как fallback
                try:
                    await _click_continuar(page)
                    await page.wait_for_load_state("networkidle", timeout=30000)
                    await asyncio.sleep(3)
                    current_url = page.url
                    print(f"[Eni] URL after Continuar: {current_url}")
                    await _take_step_screenshot(page, "08b_after_continuar")
                except Exception:
                    print("[Eni] No Continuar button found")

            # Ещё раз проверяем URL — если всё ещё pantalla=2, значит что-то пошло не так
            if 'pantalla=2' in page.url:
                raise EniSimulationError("Still on pantalla=2 after form submission. Check CUPS validity and required fields.")

            # Шаг 9: Выбрать 3-й тариф снизу
            print("[Eni] Step 9: Selecting tariff (3rd from bottom)...")
            await _take_step_screenshot(page, "09_before_tariff_selection")
            await _select_third_tariff_from_bottom(page)
            await asyncio.sleep(1)
            await _take_step_screenshot(page, "09_after_tariff_selection")

            # Шаг 10: Отправить на симуляцию
            print("[Eni] Step 10: Sending simulation request...")
            try:
                await _click_send_simulation(page)
                await page.wait_for_load_state("networkidle", timeout=30000)
                await asyncio.sleep(3)
                print(f"[Eni] URL after Step 10: {page.url}")
                await _take_step_screenshot(page, "10_after_send")
            except Exception as e:
                print(f"[Eni] No send button found or already submitted: {e}")

            # Шаг 11: Ожидать результат (до 5 минут)
            print("[Eni] Step 11: Waiting for simulation result (up to 5 min)...")
            download_path = await _wait_for_download(page, timeout_seconds=300)

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


async def _click_send_simulation(page):
    """Нажимает кнопку отправки симуляции после выбора тарифа."""
    await asyncio.sleep(1)
    send_selectors = [
        'button:has-text("Continuar")',
        'button:has-text("SIGUIENTE")',
        'button:has-text("Siguiente")',
        'button:has-text("Simular")',
        'button:has-text("Enviar")',
        'button:has-text("Confirmar")',
        'button:has-text("Aceptar")',
        'button:has-text("Generar")',
        'button:has-text("Solicitar")',
        'input[type="submit"]',
        'button[type="submit"]',
        '.btn-primary',
        '.btn-app',
        '.btn-success',
        '#btn-enviar',
        '#btn-simular',
        '#btn-continuar',
    ]
    for sel in send_selectors:
        try:
            el = await page.query_selector(sel)
            if el:
                visible = await el.evaluate('el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)')
                if visible:
                    await _scroll_and_click(page, sel)
                    print(f"[Eni] Clicked send-simulation via selector: {sel}")
                    return
        except Exception:
            continue
    # Fallback: JS click на любую кнопку с текстом Continuar/Simular/Enviar/Confirmar/Generar
    clicked = await page.evaluate(r"""() => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
        const target = buttons.find(b => /continuar|siguiente|simular|enviar|confirmar|aceptar|generar|solicitar/i.test(b.innerText || b.value || ''));
        if (target) { target.click(); return true; }
        return false;
    }""")
    if clicked:
        print("[Eni] Clicked send-simulation via JavaScript fallback")
        return
    raise EniSimulationError("Could not find send-simulation button")


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
    # Реальные селекторы Eni Plenitude (g2e.eniplenitude.es)
    # Важно: consumo_actual = Importe Factura Actual (con iva), а НЕ kWh потребления
    # Потребление по периодам = energia_p1/p2/p3
    field_map = {
        "tarifa": ['select[name="tarifa_acceso"]', '#tarifa_acceso', 'select#tarifa_acceso', '[name="tarifa_acceso"]'],
        "potencia_p1": ['input[name="potencia_p1"]', '#potencia_p1', '[name="potencia_p1"]'],
        "potencia_p2": ['input[name="potencia_p2"]', '#potencia_p2', '[name="potencia_p2"]'],
        "consumo_actual": ['input[name="consumo_actual"]', '#consumo_actual', '[name="consumo_actual"]'],
        "energia_p1": ['input[name="energia_p1"]', '#energia_p1', '[name="energia_p1"]'],
        "energia_p2": ['input[name="energia_p2"]', '#energia_p2', '[name="energia_p2"]'],
        "energia_p3": ['input[name="energia_p3"]', '#energia_p3', '[name="energia_p3"]'],
        "alquiler_equipos": ['input[name="alquiler_equipos"]', '#alquiler_equipos', '[name="alquiler_equipos"]'],
        "fecha_inicio": ['input[name="fecha_inicio"]', '#fecha_inicio', '[name="fecha_inicio"]'],
        "fecha_fin": ['input[name="fecha_fin"]', '#fecha_fin', '[name="fecha_fin"]'],
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

    # Заполняем поля согласно реальной вёрстке Eni
    # Tarifa de acceso обычно readonly (выбирается автоматически по CUPS)
    await fill_field("tarifa", data.get("access_tariff"))
    # Potencia: сервер предзаполняет из SIPS, но можем переопределить если есть данные
    await fill_field("potencia_p1", data.get("billed_power_p1"))
    await fill_field("potencia_p2", data.get("billed_power_p2"))
    # consumo_actual = Importe Factura Actual (con iva) — сумма счёта, НЕ kWh
    await fill_field("consumo_actual", data.get("invoice_amount_with_vat"))
    # Потребление по периодам (kWh) — отдельные поля
    await fill_field("energia_p1", data.get("consumption_p1"))
    await fill_field("energia_p2", data.get("consumption_p2"))
    await fill_field("energia_p3", data.get("consumption_p3"))
    await fill_field("alquiler_equipos", data.get("equipment_rental"))
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


async def _wait_for_download(page, timeout_seconds: int = 300) -> str:
    """Ожидает появления кнопки/ссылки для скачивания PDF с расширенными fallback'ами."""
    download_selectors = [
        'a[href$=".pdf"]',
        'a[download]',
        '.download-link',
        'button:has-text("Descargar")',
        'a:has-text("PDF")',
        'a:has-text("descargar")',
        'a:has-text("Descargar")',
        'button:has-text("PDF")',
        'button:has-text("Descargar PDF")',
        'button:has-text("Download")',
        '.btn-download',
        '#btn-download',
        '[class*="download"]',
        '[id*="download"]',
        'a[target="_blank"]',
    ]

    start_time = asyncio.get_event_loop().time()
    last_screenshot = start_time
    iteration = 0

    while (asyncio.get_event_loop().time() - start_time) < timeout_seconds:
        iteration += 1
        print(f"[Eni] Waiting for download... iteration {iteration}, elapsed {int(asyncio.get_event_loop().time() - start_time)}s")

        # Скриншот каждые 30 секунд для понимания, что происходит на экране
        if (asyncio.get_event_loop().time() - last_screenshot) >= 30:
            await _take_step_screenshot(page, f"11_wait_{int(asyncio.get_event_loop().time() - start_time)}s")
            last_screenshot = asyncio.get_event_loop().time()

        # 1. Пробуем классические селекторы
        for sel in download_selectors:
            link = await page.query_selector(sel)
            if link:
                visible = await link.evaluate('el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)')
                if visible:
                    print(f"[Eni] Download link found: {sel}")
                    async with page.expect_download(timeout=30000) as download_info:
                        try:
                            await link.click(force=True)
                        except Exception:
                            await link.evaluate('el => el.click()')
                    download = await download_info.value
                    path = await download.path()
                    return str(path)

        # 2. JS fallback: ищем любую ссылку, содержащую .pdf в href или тексте "descargar"
        js_link = await page.evaluate(r"""() => {
            const links = Array.from(document.querySelectorAll('a, button'));
            const found = links.find(el => {
                const href = el.href || '';
                const text = (el.innerText || el.value || '').toLowerCase();
                return href.includes('.pdf') || text.includes('descargar') || text.includes('pdf') || text.includes('download');
            });
            return found ? { tag: found.tagName, text: found.innerText || found.value || '', href: found.href || '' } : null;
        }""")
        if js_link:
            print(f"[Eni] JS fallback found download element: {js_link}")
            # Пробуем кликнуть по найденному элементу
            clicked = await page.evaluate(r"""() => {
                const links = Array.from(document.querySelectorAll('a, button'));
                const found = links.find(el => {
                    const href = el.href || '';
                    const text = (el.innerText || el.value || '').toLowerCase();
                    return href.includes('.pdf') || text.includes('descargar') || text.includes('pdf') || text.includes('download');
                });
                if (found) { found.click(); return true; }
                return false;
            }""")
            if clicked:
                # Ждём скачивание без expect_download (т.к. клик был через evaluate)
                await asyncio.sleep(10)
                # Проверим, не появился ли файл в downloads
                # Playwright не отследит этот клик, но мы можем проверить default download path
                # Пока просто продолжим цикл — если файл скачался, он появится в следующей итерации
                pass

        # 3. Проверяем iframe'ы — возможно, PDF загружается во фрейме
        frames = page.frames
        if len(frames) > 1:
            for frame in frames:
                try:
                    frame_url = frame.url
                    if '.pdf' in frame_url:
                        print(f"[Eni] PDF detected in iframe: {frame_url}")
                        # Скачиваем через requests? Или просто возвращаем URL?
                        # Пока сохраняем URL как результат
                        return frame_url
                    for sel in download_selectors:
                        link = await frame.query_selector(sel)
                        if link:
                            print(f"[Eni] Download link found in iframe: {sel}")
                            async with frame.page.expect_download(timeout=30000) as download_info:
                                await link.click(force=True)
                            download = await download_info.value
                            path = await download.path()
                            return str(path)
                except Exception:
                    continue

        # 4. Проверяем, не появилась ли кнопка "Continuar", "Finalizar" или "Generar PDF"
        next_btn = await page.query_selector('button:has-text("Continuar"), button:has-text("Finalizar"), button:has-text("Generar"), button:has-text("Aceptar")')
        if next_btn:
            print("[Eni] Found intermediate button (Continuar/Finalizar/Generar), clicking...")
            try:
                await next_btn.click()
            except Exception:
                await next_btn.evaluate('el => el.click()')
            await page.wait_for_load_state("networkidle", timeout=15000)

        # 5. Проверяем, не сменился ли URL на прямую ссылку к PDF
        current_url = page.url
        if current_url.endswith('.pdf'):
            print(f"[Eni] Browser navigated directly to PDF: {current_url}")
            return current_url

        await asyncio.sleep(5)

    # Перед падением делаем финальный скриншот
    await _take_step_screenshot(page, "11_timeout_no_download")
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
