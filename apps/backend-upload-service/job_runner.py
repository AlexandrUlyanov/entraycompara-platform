#!/usr/bin/env python3
"""
Cloud Run Job entrypoint for Eni Plenitude auto-simulation.
Reads params from env vars, runs Playwright, saves result to Firestore.
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timedelta

from google.cloud import firestore, storage
import eni_simulator

FIRESTORE_COLLECTION = os.environ.get("FIRESTORE_COLLECTION", "applications")
BUCKET_NAME = os.environ.get("GCP_BUCKET_NAME", "entraycompara-invoices")


def _get_float_env(name: str) -> float | None:
    val = os.environ.get(name)
    if not val:
        return None
    try:
        v = float(val)
        return v if v != 0 else None
    except ValueError:
        return None


def _set_task_status_sync(firestore_client, application_id: str, task_id: str, status: dict):
    """Synchronous Firestore write."""
    doc_ref = (
        firestore_client.collection(FIRESTORE_COLLECTION)
        .document(application_id)
        .collection("auto_simulation_tasks")
        .document(task_id)
    )
    doc_ref.set(status, merge=True)


def _create_timeline_event_sync(firestore_client, application_id: str, content: str):
    """Lightweight timeline event creation."""
    try:
        doc_ref = (
            firestore_client.collection(FIRESTORE_COLLECTION)
            .document(application_id)
            .collection("timeline")
            .document()
        )
        doc_ref.set({
            "content": content,
            "type": "NOTE",
            "created_by": "System",
            "created_at": datetime.utcnow(),
        })
    except Exception as e:
        print(f"[Timeline] Warning: failed to create event: {e}")


async def main():
    application_id = os.environ.get("APPLICATION_ID")
    task_id = os.environ.get("TASK_ID")
    cups = os.environ.get("CUPS")

    if not all([application_id, task_id, cups]):
        print("ERROR: Missing required env vars: APPLICATION_ID, TASK_ID, CUPS")
        sys.exit(1)

    firestore_client = firestore.Client()

    # Helper: write task status (run in thread to avoid blocking event loop)
    async def _set_task(status: dict):
        await asyncio.to_thread(_set_task_status_sync, firestore_client, application_id, task_id, status)

    async def _set_progress(step_key: str, step_label: str, progress_percent: int, details: str | None = None, status: str = "running"):
        payload = {
            "status": status,
            "step_key": step_key,
            "step_label": step_label,
            "progress_percent": progress_percent,
            "updated_at": datetime.utcnow(),
        }
        if details is not None:
            payload["step_details"] = details
            payload["message"] = details
        else:
            payload["message"] = step_label
        if step_key in {"apply_selected_tariff", "auto_select_tariff", "download_pdf", "completed"}:
            payload["tariffs"] = firestore.DELETE_FIELD
            payload["tariff_selection_deadline"] = firestore.DELETE_FIELD
        await _set_task(payload)

    await _set_task({
        "status": "running",
        "message": "Запущена автоматическая симуляция на Eni Plenitude...",
        "step_key": "job_started",
        "step_label": "Запускаем задачу",
        "step_details": "Подготавливаем Cloud Run Job и Playwright.",
        "progress_percent": 3,
        "simulation_id": None,
        "error": None,
        "updated_at": datetime.utcnow(),
    })

    try:
        print(f"[Job {task_id}] Starting Eni simulation for CUPS={cups}")

        async def _on_tariffs_ready(tariffs: list[dict]):
            selection_deadline = datetime.utcnow() + timedelta(seconds=180)
            await _set_task({
                "status": "awaiting_tariff_selection",
                "message": f"Выберите один из {len(tariffs)} тарифов",
                "step_key": "await_manager_choice",
                "step_label": "Ждём выбор тарифа",
                "step_details": f"Найдено тарифов: {len(tariffs)}. Нужен выбор менеджера.",
                "progress_percent": 82,
                "tariff_selection_deadline": selection_deadline,
                "tariffs": tariffs,
                "updated_at": datetime.utcnow(),
            })
            print(f"[Job {task_id}] Awaiting tariff selection from manager ({len(tariffs)} options)")

        async def _get_selected_tariff() -> int | None:
            def _read():
                doc_ref = (
                    firestore_client.collection(FIRESTORE_COLLECTION)
                    .document(application_id)
                    .collection("auto_simulation_tasks")
                    .document(task_id)
                )
                doc = doc_ref.get()
                if doc.exists:
                    data = doc.to_dict() or {}
                    sel = data.get("selected_tariff_index")
                    print(f"[Job {task_id}] Firestore read: selected_tariff_index={sel!r}, doc_exists=True")
                    return sel
                else:
                    print(f"[Job {task_id}] Firestore read: doc_exists=False")
                    return None

            try:
                sel = await asyncio.to_thread(_read)
                if sel is not None:
                    print(f"[Job {task_id}] Manager selected tariff index: {sel}")
                    return sel
            except Exception as e:
                print(f"[Job {task_id}] Firestore read error: {e}")
            return None

        result = await eni_simulator.run_eni_simulation(
            cups=cups,
            client_type=os.environ.get("CLIENT_TYPE", "Hogar"),
            access_tariff=os.environ.get("ACCESS_TARIFF") or None,
            billed_power_p1=_get_float_env("BILLED_POWER_P1"),
            billed_power_p2=_get_float_env("BILLED_POWER_P2"),
            consumption_p1=_get_float_env("CONSUMPTION_P1"),
            consumption_p2=_get_float_env("CONSUMPTION_P2"),
            consumption_p3=_get_float_env("CONSUMPTION_P3"),
            equipment_rental=_get_float_env("EQUIPMENT_RENTAL"),
            invoice_amount_with_vat=_get_float_env("INVOICE_AMOUNT_WITH_VAT"),
            retailer=os.environ.get("RETAILER") or None,
            start_date=os.environ.get("START_DATE") or None,
            end_date=os.environ.get("END_DATE") or None,
            headless=True,
            interactive=True,
            on_tariffs_ready=_on_tariffs_ready,
            get_selected_tariff=_get_selected_tariff,
            progress_callback=_set_progress,
        )

        pdf_path = result.get("pdf_path")
        extracted_cost = result.get("new_monthly_cost_eur")
        extracted_savings = result.get("savings_monthly_eur")
        extracted_percent = result.get("savings_percent")
        extracted_billing_days = result.get("billing_period_days")

        # Upload PDF to GCS only when the simulator produced one.
        # By default Eni PDF download is skipped, because IMPRIMIR is unstable while tariff data is already available.
        pdf_url = None
        if pdf_path and os.path.exists(pdf_path):
            today = datetime.utcnow()
            prefix = f"simulation_files/{today.year}/{today.month:02}/{today.day:02}"
            unique_name = f"{uuid.uuid4()}.pdf"
            blob_name = f"{prefix}/{unique_name}"

            storage_client = storage.Client()
            bucket = storage_client.bucket(BUCKET_NAME)
            blob = bucket.blob(blob_name)
            blob.upload_from_filename(pdf_path)
            blob.acl.all().grant_read()
            blob.acl.save()

            pdf_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_name}"
            print(f"[Job {task_id}] PDF uploaded: {pdf_url}")
        else:
            print(f"[Job {task_id}] PDF download skipped; creating simulation from extracted tariff data.")

        # Create simulation document
        sim_data = {
            "simulation_name": f"Eni Auto — {cups}",
            "new_provider": "Eni Plenitude",
            "new_tariff": os.environ.get("ACCESS_TARIFF"),
            "new_monthly_cost_eur": extracted_cost if extracted_cost is not None else 0.0,
            "contract_duration_months": None,
            "bonus_description": None,
            "simulation_file_url": pdf_url,
            "is_selected": False,
            "savings_monthly_eur": extracted_savings,
            "savings_percent": extracted_percent,
            "billing_period_days": extracted_billing_days,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

        def _create_sim():
            sim_ref = (
                firestore_client.collection(FIRESTORE_COLLECTION)
                .document(application_id)
                .collection("proposal_simulations")
                .document()
            )
            sim_ref.set(sim_data)
            return sim_ref.id

        sim_id = await asyncio.to_thread(_create_sim)
        print(f"[Job {task_id}] Simulation doc created: {sim_id}")

        # Timeline event
        timeline_content = (
            "Автоматическая симуляция Eni завершена.\n"
            f"CUPS: {cups}\n"
            f"Поставщик: Eni Plenitude\n"
            f"{f'PDF симуляции: {pdf_url}' if pdf_url else 'PDF симуляции: не скачивался, данные расчёта сохранены.'}\n"
            f"Новый ежемесячный платёж: €{extracted_cost if extracted_cost is not None else 0.0}\n"
            f"Экономия в месяц: €{extracted_savings if extracted_savings is not None else 'N/A'}\n"
            f"Экономия: {extracted_percent if extracted_percent is not None else 'N/A'}%"
        )
        await asyncio.to_thread(
            _create_timeline_event_sync,
            firestore_client,
            application_id,
            timeline_content,
        )

        # Cleanup local file
        if pdf_path:
            try:
                os.remove(pdf_path)
            except Exception:
                pass

        await _set_task({
            "status": "completed",
            "message": "Симуляция успешно создана.",
            "step_key": "completed",
            "step_label": "Симуляция завершена",
            "step_details": "Симуляция добавлена в CRM." if pdf_url else "Данные расчёта сохранены без скачивания PDF.",
            "progress_percent": 100,
            "simulation_id": sim_id,
            "simulation_file_url": pdf_url,
            "error": None,
            "updated_at": datetime.utcnow(),
        })

        print(f"[Job {task_id}] Completed successfully")

    except Exception as e:
        print(f"[Job {task_id}] ERROR: {e}")
        await _set_task({
            "status": "failed",
            "message": str(e),
            "step_key": "failed",
            "step_label": "Симуляция прервана",
            "step_details": str(e),
            "simulation_id": None,
            "error": str(e),
            "updated_at": datetime.utcnow(),
        })
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
