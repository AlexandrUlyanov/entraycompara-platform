# main.py
import os
import uuid
import datetime
import smtplib
import re
import requests
import json
import mimetypes
import asyncio
import threading
import difflib
import unicodedata
import hashlib
from typing import List, Optional, Dict, Any 
from enum import Enum 
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Depends, Query, status, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import storage, firestore 
from pydantic import BaseModel
import google.generativeai as genai
import eni_simulator

try:
    from stdnum.es import cups as stdnum_cups
except ImportError:
    stdnum_cups = None


app = FastAPI()

# --- БЛОК CORS (для продакшена и разработки) ---
origins = [
    "*", 
    "http://localhost:3000", 
    "https://entraycompara.com", 
    "https://www.entraycompara.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"], 
)

# --- Настройки ---
OPERATOR_SECRET_KEY = os.environ.get("OPERATOR_SECRET_KEY") 
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE_MB = 10
BUCKET_NAME = os.environ.get("GCP_BUCKET_NAME", "entraycompara-invoices")
FIRESTORE_COLLECTION = "applications" 

# --- Настройки WhatsApp Business API ---
WHATSAPP_PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN")
WHATSAPP_VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN")
WHATSAPP_API_VERSION = "v25.0"
# -------------------------

# --- Настройки Gemini AI ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")
GEMINI_INVOICE_EXTRACTION_MODEL = os.environ.get("GEMINI_INVOICE_EXTRACTION_MODEL", "gemini-2.5-pro")
# -------------------------

INVOICE_EXTRACTION_FIELDS = [
    "cups",
    "client_type",
    "access_tariff",
    "start_date",
    "end_date",
    "equipment_rental",
    "invoice_amount_with_vat",
    "retailer",
    "billed_power_p1",
    "billed_power_p2",
    "consumption_p1",
    "consumption_p2",
    "consumption_p3",
]

KNOWN_ACCESS_TARIFFS = {
    "2.0A", "2.0DHA", "2.0DHS", "2.0TD", "3.0A", "3.0TD", "3.1A", "6.1TD", "6.2TD", "6.3TD", "6.4TD"
}

RETAILER_ALIAS_RULES = {
    "endesa energia xxi": "ENDESA ENERGÍA XXI",
    "energía xxi": "ENDESA ENERGÍA XXI",
    "energia xxi": "ENDESA ENERGÍA XXI",
    "endesa energia": "ENDESA ENERGÍA",
    "endesa": "ENDESA ENERGÍA",
    "iberdrola": "Iberdrola",
    "naturgy": "Naturgy",
    "plenitude": "Eni Plenitude",
    "eni": "Eni Plenitude",
    "repsol": "Repsol",
    "holaluz": "Holaluz",
    "totalenergies": "TotalEnergies",
    "total energies": "TotalEnergies",
    "edp": "EDP",
}

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
ENI_RETAILERS_PATH = os.path.join(DATA_DIR, "eni_retailers.json")


def _load_known_retailers() -> list[dict[str, str]]:
    try:
        with open(ENI_RETAILERS_PATH, "r", encoding="utf-8") as f:
            raw_items = json.load(f)
    except Exception as exc:
        print(f"Failed to load retailer catalog: {exc}")
        return []

    seen: set[str] = set()
    items: list[dict[str, str]] = []
    for item in raw_items:
        label = re.sub(r"\s+", " ", str(item.get("label") or "")).strip()
        value = str(item.get("value") or "").strip()
        if not label:
            continue
        key = label.casefold()
        if key in seen:
            continue
        seen.add(key)
        items.append({"value": value, "label": label})
    return items


KNOWN_RETAILER_ITEMS = _load_known_retailers()
KNOWN_RETAILER_LABELS = [item["label"] for item in KNOWN_RETAILER_ITEMS]

DISTRIBUTOR_HINTS = [
    "edistribucion",
    "e-distribucion",
    "i-de redes",
    "redes electricas inteligentes",
    "union fenosa distribucion",
    "ufd",
    "e-redes",
    "distribucion electrica",
]

# --- Настройки Email (Gmail SMTP) ---
OPERATOR_EMAIL = "ulyanov.ht@gmail.com"
SMTP_USER = os.environ.get("GMAIL_USER")
SMTP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD")
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = SMTP_USER
# -------------------------

# Инициализация клиентов
storage_client = storage.Client()
firestore_client = firestore.Client()


# --- Pydantic Модели ---

# 1.1. Новые статусы (Воронка продаж)
class Status(str, Enum):
    NEW_LEAD = 'New Lead' # Новая заявка
    ANALYSIS = 'Analysis' # Анализ и расчет
    PROPOSAL = 'Proposal' # КП отправлено
    NEGOTIATION = 'Negotiation' # Переговоры
    CONTRACT_WON = 'Contract Won' # Победа!
    DEAL_LOST = 'Deal Lost' # Отказ

# 1.2. Типы Услуг (ServiceType)
class ServiceType(str, Enum):
    GasComparison = 'Gas Comparison'
    ElectricityComparison = 'Electricity Comparison'

# 1.3. Типы Событий Ленты (EventType)
class EventType(str, Enum): 
    NOTE = 'NOTE'
    WHATSAPP = 'WHATSAPP'
    CALL = 'CALL'
    EMAIL = 'EMAIL'

class ApplicationSchema(BaseModel):
    client_name: str
    client_phone: str
    client_email: str
    service_type: str 
    notes: str | None = None

class ApplicationUpdateStatus(BaseModel):
    status: Status 
    
class ApplicationUpdateServiceType(BaseModel): 
    service_type: ServiceType 

class ApplicationUpdate(BaseModel):
    client_name: str | None = None
    client_phone: str | None = None
    client_email: str | None = None
    notes: str | None = None
    language: str | None = None

# 1.4. Модели для Ленты событий
class TimelineCreate(BaseModel):
    content: str
    type: EventType = EventType.NOTE # По умолчанию NOTE

class TimelineResponse(BaseModel):
    id: str
    application_id: str
    type: EventType
    content: str
    created_by: str = "Operator"
    created_at: datetime.datetime
    direction: str | None = None
    wa_message_id: str | None = None
    wa_status: str | None = None 

# 1.5. Модели для Signed URLs
class SignedUrlRequest(BaseModel): 
    gcs_path: str

class SignedUrlResponse(BaseModel): 
    url: str
    
class WhatsAppSendRequest(BaseModel):
    application_id: str
    message: str

class WhatsAppProposalRequest(BaseModel):
    application_id: str

class WhatsAppFirstMessageRequest(BaseModel):
    application_id: str

class AIGenerateRequest(BaseModel):
    application_id: str

class SalesDepartmentAnalyzeRequest(BaseModel):
    force_recalculate: bool = False

# 1.6. Модели для Proposal Builder (Extracted Data)
class ExtractedData(BaseModel):
    # Поля для симуляции испанских электрических счетов (facturas de luz)
    cups: str | None = None                 # CUPS — уникальный номер счетчика
    client_type: str | None = None          # Tipo de cliente: Hogar / Empresa
    access_tariff: str | None = None        # Tarifa de Acceso: 2.0TD / 3.0TD / etc
    start_date: str | None = None           # Fecha de Inicio
    end_date: str | None = None             # Fecha de Fin
    equipment_rental: float | None = None   # Alquiler de equipos (€)
    invoice_amount_with_vat: float | None = None  # Importe Factura Actual con IVA (€)
    retailer: str | None = None             # Comercializadora
    billed_power_p1: float | None = None    # Potencia Facturada P1 (kW)
    billed_power_p2: float | None = None    # Potencia Facturada P2 (kW)
    consumption_p1: float | None = None     # Consumo P1 (kWh)
    consumption_p2: float | None = None     # Consumo P2 (kWh)
    consumption_p3: float | None = None     # Consumo P3 (kWh)
    source_files: list[str] = []

class ExtractDataRequest(BaseModel):
    file_urls: list[str]
    force_reextract: bool = False

class ExtractedDataUpdate(BaseModel):
    extracted_data: ExtractedData

# 1.7. Модели для Proposal Builder (Simulations)
class SimulationInput(BaseModel):
    simulation_name: str
    new_provider: str
    new_tariff: str | None = None
    new_monthly_cost_eur: float
    contract_duration_months: int | None = None
    bonus_description: str | None = None
    simulation_file_url: str | None = None
    is_selected: bool = False

class SimulationUpdate(BaseModel):
    simulation_name: str | None = None
    new_provider: str | None = None
    new_tariff: str | None = None
    new_monthly_cost_eur: float | None = None
    contract_duration_months: int | None = None
    bonus_description: str | None = None
    simulation_file_url: str | None = None
    is_selected: bool | None = None

class SimulationResponse(BaseModel):
    id: str
    simulation_name: str
    new_provider: str
    new_tariff: str | None = None
    new_monthly_cost_eur: float
    contract_duration_months: int | None = None
    bonus_description: str | None = None
    simulation_file_url: str | None = None
    is_selected: bool
    savings_monthly_eur: float | None = None
    savings_percent: float | None = None
    billing_period_days: int | None = None
    created_at: datetime.datetime

class ProposalGenerateRequest(BaseModel):
    comment: str | None = None

# 1.8. Модель для автоматического создания симуляции (Eni)
class AutoCreateSimulationRequest(BaseModel):
    cups: str
    client_type: str | None = None
    access_tariff: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    equipment_rental: float | None = None
    invoice_amount_with_vat: float | None = None
    retailer: str | None = None
    billed_power_p1: float | None = None
    billed_power_p2: float | None = None
    consumption_p1: float | None = None
    consumption_p2: float | None = None
    consumption_p3: float | None = None

# --- База знаний компании ---
KNOWLEDGE_BASE = """
EntrayCompara — сервис помощи клиентам в Испании по снижению расходов на коммунальные услуги.

Что мы делаем:
• Анализируем счета клиентов (электричество, газ, мобильная связь, интернет)
• Подбираем лучшие тарифы на рынке Испании
• Помогаем с переходом к новому оператору
• Сопровождаем клиента на всех этапах

Преимущества для клиента:
• Услуга полностью бесплатна для клиента (мы получаем комиссию от операторов)
• Средняя экономия: 20–40% на ежемесячных счетах
• Экономия времени: не нужно самому изучать десятки тарифов
• Работаем по всей территории Испании
• Поддержка на нескольких языках: испанский, русский, украинский, баскский

Процесс работы:
1. Клиент оставляет заявку и загружает свои счета
2. Мы проводим бесплатный анализ
3. Предлагаем лучшие варианты с расчётом экономии
4. По согласию клиента оформляем переход к новому оператору
5. Поддерживаем связь после перехода

Контактная информация:
• Email: ulyanov.ht@gmail.com
• WhatsApp: через официальный номер компании
• Сайт: https://entraycompara.com

Важные правила общения:
• Всегда отвечай на языке клиента
• Будь дружелюбным, но профессиональным
• Не обещай конкретную сумму экономии без анализа счетов
• Не используй технический жаргон без объяснений
• Мягко подталкивай клиента к следующему шагу (загрузка счетов, звонок, согласование)
"""

# --- Вспомогательные функции ---

def create_timeline_event_internal(application_id: str, content: str, event_type: EventType, created_by: str):
    """Внутренняя функция для создания записи в Timeline, используемая автоматизацией."""
    doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
    
    new_event_data = {
        "application_id": application_id,
        "content": content,
        "type": event_type.value,
        "created_by": created_by,
        "created_at": datetime.datetime.utcnow(),
    }
    
    # Добавление документа в под-коллекцию
    doc_ref.collection("timeline").add(new_event_data)


def _extract_filename_from_url(file_url: str) -> str:
    try:
        return file_url.split("/")[-1].split("?")[0]
    except Exception:
        return file_url


def _format_file_links(file_urls: list[str] | None, max_items: int = 10) -> str:
    if not file_urls:
        return "Нет файлов."
    lines: list[str] = []
    for index, file_url in enumerate(file_urls[:max_items], start=1):
        file_name = _extract_filename_from_url(file_url)
        lines.append(f"{index}. {file_name} — {file_url}")
    if len(file_urls) > max_items:
        lines.append(f"... и ещё {len(file_urls) - max_items} файл(ов).")
    return "\n".join(lines)


def _format_simulation_summary(simulation: dict) -> str:
    parts = [
        f"Название: {simulation.get('simulation_name', 'Без названия')}",
        f"Поставщик: {simulation.get('new_provider', 'Не указан')}",
    ]
    if simulation.get("new_tariff"):
        parts.append(f"Тариф: {simulation['new_tariff']}")
    if simulation.get("new_monthly_cost_eur") is not None:
        parts.append(f"Новый ежемесячный платёж: €{simulation['new_monthly_cost_eur']}")
    if simulation.get("savings_monthly_eur") is not None:
        parts.append(f"Экономия в месяц: €{simulation['savings_monthly_eur']}")
    if simulation.get("savings_percent") is not None:
        parts.append(f"Экономия: {simulation['savings_percent']}%")
    if simulation.get("simulation_file_url"):
        parts.append(f"PDF симуляции: {simulation['simulation_file_url']}")
    return "\n".join(parts)


def _build_interaction_history_context(doc_ref, app_data: dict, max_events: int = 40) -> str:
    timeline_docs = (
        doc_ref.collection("timeline")
        .order_by("created_at", direction=firestore.Query.ASCENDING)
        .limit(max_events)
        .stream()
    )

    lines: list[str] = []
    for tdoc in timeline_docs:
        tdata = tdoc.to_dict() or {}
        created_at = tdata.get("created_at")
        try:
            created_label = created_at.strftime("%Y-%m-%d %H:%M") if created_at else "Без даты"
        except Exception:
            created_label = str(created_at or "Без даты")

        event_type = tdata.get("type", EventType.NOTE.value)
        if event_type == EventType.WHATSAPP.value:
            actor = "Клиент" if tdata.get("direction") == "incoming" or tdata.get("created_by") == "Client" else "Менеджер"
            lines.append(f"[{created_label}] WhatsApp / {actor}: {tdata.get('content', '')}")
            continue

        actor = tdata.get("created_by", "System")
        lines.append(f"[{created_label}] {event_type} / {actor}: {tdata.get('content', '')}")

    current_files = app_data.get("uploaded_files", []) or []
    if current_files:
        lines.append("[Актуальные документы в карточке]")
        lines.append(_format_file_links(current_files, max_items=12))

    proposal_url = app_data.get("proposal_file_url")
    if proposal_url:
        lines.append(f"[Текущее коммерческое предложение]\n{proposal_url}")

    try:
        proposal_data_doc = doc_ref.collection("proposal_data").document("data").get()
        if proposal_data_doc.exists:
            proposal_data = proposal_data_doc.to_dict() or {}
            extracted = proposal_data.get("extracted_data") or {}
            if extracted:
                extracted_lines = [
                    "[Извлечённые данные по счёту]",
                    f"CUPS: {extracted.get('cups', 'Не найден')}",
                    f"Коммерциализатор: {extracted.get('retailer', 'Не найден')}",
                    f"Тариф доступа: {extracted.get('access_tariff', 'Не найден')}",
                    f"Сумма счёта: {extracted.get('invoice_amount_with_vat', 'Не найдена')}",
                ]
                lines.extend(extracted_lines)
    except Exception as exc:
        print(f"[AI Context] Failed to read proposal_data: {exc}")

    try:
        sims = (
            doc_ref.collection("proposal_simulations")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(3)
            .stream()
        )
        sim_summaries = []
        for sim_doc in sims:
            sim_data = sim_doc.to_dict() or {}
            sim_data["id"] = sim_doc.id
            prefix = "[Выбранная симуляция]" if sim_data.get("is_selected") else "[Симуляция]"
            sim_summaries.append(f"{prefix}\n{_format_simulation_summary(sim_data)}")
        if sim_summaries:
            lines.extend(sim_summaries)
    except Exception as exc:
        print(f"[AI Context] Failed to read simulations: {exc}")

    return "\n\n".join(lines) if lines else "История взаимодействия пока пуста."


def _detect_client_language_from_messages(messages: list[str], fallback: str = "es") -> str:
    if not messages:
        return fallback

    sample = " ".join(messages[-6:]).lower()
    if not sample.strip():
        return fallback

    spanish_markers = [
        "hola", "gracias", "factura", "propuesta", "tarifa", "compañía", "cambio",
        "quiero", "puede", "puedo", "vale", "luz", "gas", "correo", "enviar", "si ",
        "sí", "buenas", "perfecto", "claro", "duda",
    ]
    russian_markers = [
        "привет", "спасибо", "счет", "предложение", "тариф", "хочу", "можно",
        "отправ", "понял", "понятно", "да", "нет", "здравствуйте", "документ",
    ]
    ukrainian_markers = [
        "добрий", "дякую", "рахунок", "пропозиція", "тариф", "хочу", "можна",
        "відправ", "зрозуміло", "документ", "будь ласка", "так", "ні",
    ]
    basque_markers = [
        "kaixo", "eskerrik", "faktura", "proposamena", "tarifa", "bidali",
        "mesedez", "argi", "gas", "nahi", "duzu",
    ]

    scores = {
        "es": sum(1 for marker in spanish_markers if marker in sample),
        "ru": sum(1 for marker in russian_markers if marker in sample),
        "uk": sum(1 for marker in ukrainian_markers if marker in sample),
        "eu": sum(1 for marker in basque_markers if marker in sample),
    }

    best_lang = max(scores, key=scores.get)
    if scores[best_lang] == 0:
        return fallback
    return best_lang


def _build_live_lead_snapshot(doc_ref, app_data: dict) -> str:
    lines = [
        f"Текущий статус: {app_data.get('status', 'New Lead')}",
        f"Тип услуги: {app_data.get('service_type', 'Не указан')}",
        f"Язык в карточке: {app_data.get('language', 'es')}",
        f"Файлов в карточке: {len(app_data.get('uploaded_files', []) or [])}",
    ]

    if app_data.get("uploaded_files"):
        lines.append("Документы в карточке:")
        lines.append(_format_file_links(app_data.get("uploaded_files") or [], max_items=12))

    if app_data.get("proposal_file_url"):
        lines.append(f"Текущее КП: {app_data.get('proposal_file_url')}")

    try:
        proposal_data_doc = doc_ref.collection("proposal_data").document("data").get()
        if proposal_data_doc.exists:
            proposal_data = proposal_data_doc.to_dict() or {}
            extracted = proposal_data.get("extracted_data") or {}
            if extracted:
                lines.extend([
                    "Извлечённые данные:",
                    f"CUPS: {extracted.get('cups', 'Не найден')}",
                    f"Коммерциализатор: {extracted.get('retailer', 'Не найден')}",
                    f"Тариф доступа: {extracted.get('access_tariff', 'Не найден')}",
                    f"Сумма счёта: {extracted.get('invoice_amount_with_vat', 'Не найдена')}",
                ])
    except Exception as exc:
        print(f"[AI Context] Failed to build live lead snapshot from proposal_data: {exc}")

    try:
        selected_sim = (
            doc_ref.collection("proposal_simulations")
            .where("is_selected", "==", True)
            .limit(1)
            .stream()
        )
        for sim_doc in selected_sim:
            sim_data = sim_doc.to_dict() or {}
            lines.append("Выбранная симуляция:")
            lines.append(_format_simulation_summary(sim_data))
            break
    except Exception as exc:
        print(f"[AI Context] Failed to build live lead snapshot from selected simulation: {exc}")

    return "\n".join(lines)


SALES_DEPARTMENT_AGENT_KEYS = [
    "lead_state_analyst",
    "sales_strategist",
    "message_composer",
    "trust_guard",
    "followup_scheduler",
    "deal_control",
]


def get_sales_department_state_ref(application_id: str):
    return (
        firestore_client.collection(FIRESTORE_COLLECTION)
        .document(application_id)
        .collection("sales_department")
        .document("state")
    )


def normalize_firestore_value(value):
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, list):
        return [normalize_firestore_value(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_firestore_value(item) for key, item in value.items()}
    return value


def _get_recent_timeline_items(doc_ref, max_events: int = 20) -> list[dict]:
    docs = (
        doc_ref.collection("timeline")
        .order_by("created_at", direction=firestore.Query.DESCENDING)
        .limit(max_events)
        .stream()
    )
    items: list[dict] = []
    for tdoc in docs:
        data = tdoc.to_dict() or {}
        data["id"] = tdoc.id
        items.append(normalize_firestore_value(data))
    return list(reversed(items))


def _get_proposal_data_snapshot(doc_ref) -> dict:
    try:
        proposal_doc = doc_ref.collection("proposal_data").document("data").get()
        if not proposal_doc.exists:
            return {}
        data = proposal_doc.to_dict() or {}
        return normalize_firestore_value({
            "extracted_data": data.get("extracted_data") or {},
            "overall_confidence": data.get("overall_confidence"),
            "needs_review": data.get("needs_review", False),
            "needs_review_fields": data.get("needs_review_fields", []),
            "extracted_at": data.get("extracted_at"),
        })
    except Exception as exc:
        print(f"[Sales Department] Failed to read proposal data: {exc}")
        return {}


def _get_simulations_snapshot(doc_ref, max_items: int = 5) -> list[dict]:
    try:
        docs = (
            doc_ref.collection("proposal_simulations")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .limit(max_items)
            .stream()
        )
        simulations = []
        for sim_doc in docs:
            data = sim_doc.to_dict() or {}
            data["id"] = sim_doc.id
            simulations.append(normalize_firestore_value(data))
        return simulations
    except Exception as exc:
        print(f"[Sales Department] Failed to read simulations: {exc}")
        return []


def build_sales_department_snapshot(application_id: str, doc_ref, app_data: dict) -> dict:
    timeline = _get_recent_timeline_items(doc_ref)
    proposal_data = _get_proposal_data_snapshot(doc_ref)
    simulations = _get_simulations_snapshot(doc_ref)
    selected_simulation = next((item for item in simulations if item.get("is_selected")), None)
    incoming_whatsapp = [
        item for item in timeline
        if item.get("type") == EventType.WHATSAPP.value
        and (item.get("direction") == "incoming" or item.get("created_by") == "Client")
    ]
    outgoing_whatsapp = [
        item for item in timeline
        if item.get("type") == EventType.WHATSAPP.value
        and item not in incoming_whatsapp
    ]
    uploaded_files = app_data.get("uploaded_files", []) or []
    extracted_data = proposal_data.get("extracted_data") or {}

    return {
        "application_id": application_id,
        "lead": normalize_firestore_value({
            "client_name": app_data.get("client_name"),
            "client_phone": app_data.get("client_phone"),
            "client_email": app_data.get("client_email"),
            "service_type": app_data.get("service_type"),
            "status": app_data.get("status", Status.NEW_LEAD.value),
            "language": app_data.get("language", "es"),
            "notes": app_data.get("notes"),
            "created_at": app_data.get("created_at"),
            "updated_at": app_data.get("updated_at"),
            "uploaded_files_count": len(uploaded_files),
            "uploaded_files": uploaded_files,
            "proposal_file_url": app_data.get("proposal_file_url"),
            "proposal_uploaded": app_data.get("proposal_uploaded", False),
        }),
        "timeline": timeline,
        "whatsapp": {
            "incoming_count": len(incoming_whatsapp),
            "outgoing_count": len(outgoing_whatsapp),
            "last_incoming": incoming_whatsapp[-1] if incoming_whatsapp else None,
            "last_outgoing": outgoing_whatsapp[-1] if outgoing_whatsapp else None,
        },
        "proposal_data": proposal_data,
        "simulations": simulations,
        "selected_simulation": selected_simulation,
        "signals": {
            "has_files": len(uploaded_files) > 0,
            "has_extracted_data": bool(extracted_data),
            "has_selected_simulation": selected_simulation is not None,
            "has_proposal": bool(app_data.get("proposal_file_url") or app_data.get("proposal_uploaded")),
            "needs_extraction_review": bool(proposal_data.get("needs_review")),
        },
    }


def _estimate_sales_confidence(snapshot: dict) -> float:
    score = 0.35
    signals = snapshot.get("signals", {})
    if signals.get("has_files"):
        score += 0.12
    if signals.get("has_extracted_data"):
        score += 0.16
    if signals.get("has_selected_simulation"):
        score += 0.12
    if signals.get("has_proposal"):
        score += 0.12
    if snapshot.get("whatsapp", {}).get("incoming_count", 0) > 0:
        score += 0.08
    if signals.get("needs_extraction_review"):
        score -= 0.12
    return round(max(0.1, min(score, 0.95)), 2)


def analyze_sales_department_snapshot(snapshot: dict) -> dict:
    lead = snapshot.get("lead", {})
    signals = snapshot.get("signals", {})
    whatsapp = snapshot.get("whatsapp", {})
    status = lead.get("status") or Status.NEW_LEAD.value
    confidence = _estimate_sales_confidence(snapshot)

    if status == Status.DEAL_LOST.value:
        client_state = "lost"
        friction_point = "deal_lost"
        recommended_action = "close_without_pressure"
        goal = "preserve_brand_trust"
        suggested_cta = "leave_door_open"
        deal_stage = "lost"
        pipeline_health = "closed"
        followup_needed = False
    elif status == Status.CONTRACT_WON.value:
        client_state = "contract_won"
        friction_point = "needs_onboarding_confidence"
        recommended_action = "confirm_next_steps"
        goal = "reinforce_trust"
        suggested_cta = "reassure_next_stage"
        deal_stage = "won"
        pipeline_health = "healthy"
        followup_needed = True
    elif signals.get("has_proposal"):
        client_state = "reviewing_proposal"
        friction_point = "client_may_need_clarity_or_reassurance"
        recommended_action = "invite_questions_about_proposal"
        goal = "get_reply_after_proposal"
        suggested_cta = "soft_question"
        deal_stage = "proposal_review"
        pipeline_health = "watch"
        followup_needed = True
    elif signals.get("has_selected_simulation"):
        client_state = "waiting_for_proposal"
        friction_point = "proposal_not_sent_yet"
        recommended_action = "prepare_and_send_proposal"
        goal = "move_to_proposal"
        suggested_cta = "send_proposal"
        deal_stage = "simulation_ready"
        pipeline_health = "healthy"
        followup_needed = False
    elif signals.get("has_extracted_data"):
        client_state = "analysis_ready"
        friction_point = "needs_simulation_or_offer"
        recommended_action = "create_simulation"
        goal = "prepare_comparison"
        suggested_cta = "continue_analysis"
        deal_stage = "analysis"
        pipeline_health = "healthy" if not signals.get("needs_extraction_review") else "watch"
        followup_needed = False
    elif signals.get("has_files"):
        client_state = "waiting_for_analysis"
        friction_point = "client_waiting_for_result"
        recommended_action = "confirm_receipt_and_analysis"
        goal = "reassure_progress"
        suggested_cta = "we_are_reviewing"
        deal_stage = "documents_received"
        pipeline_health = "healthy"
        followup_needed = True
    else:
        client_state = "new_lead_needs_invoice"
        friction_point = "invoice_missing"
        recommended_action = "ask_for_invoice"
        goal = "get_invoice_upload"
        suggested_cta = "send_invoice"
        deal_stage = "new_lead"
        pipeline_health = "needs_input"
        followup_needed = True

    if whatsapp.get("incoming_count", 0) > whatsapp.get("outgoing_count", 0):
        reply_probability = 0.72
        engagement_level = "active"
    elif whatsapp.get("incoming_count", 0) == 0:
        reply_probability = 0.38
        engagement_level = "unknown"
    else:
        reply_probability = 0.54
        engagement_level = "warm"

    if pipeline_health == "closed":
        reply_probability = 0.2
    elif pipeline_health == "needs_input":
        reply_probability = min(reply_probability, 0.48)

    agent_summaries = [
        {
            "agent_key": "lead_state_analyst",
            "status": "completed",
            "summary": f"Client state: {client_state}",
            "confidence": confidence,
        },
        {
            "agent_key": "sales_strategist",
            "status": "completed",
            "summary": f"Recommended action: {recommended_action}",
            "confidence": confidence,
        },
        {
            "agent_key": "message_composer",
            "status": "pending",
            "summary": "Message text will be generated in Message Studio phase.",
            "confidence": None,
        },
        {
            "agent_key": "trust_guard",
            "status": "completed",
            "summary": "No auto-send enabled in foundation phase.",
            "confidence": 1.0,
        },
        {
            "agent_key": "followup_scheduler",
            "status": "completed",
            "summary": "Follow-up recommended." if followup_needed else "No follow-up needed right now.",
            "confidence": confidence,
        },
        {
            "agent_key": "deal_control",
            "status": "completed",
            "summary": f"Deal stage: {deal_stage}; health: {pipeline_health}",
            "confidence": confidence,
        },
    ]

    return {
        "version": 1,
        "status": "active",
        "client_state": client_state,
        "friction_point": friction_point,
        "reply_probability": round(reply_probability, 2),
        "engagement_level": engagement_level,
        "trust_level": confidence,
        "deal_temperature": "warm" if pipeline_health in {"healthy", "watch"} else "cold",
        "recommended_action": recommended_action,
        "action_priority": "high" if pipeline_health in {"needs_input", "watch"} else "normal",
        "goal": goal,
        "why_now": "Based on current lead status, documents, proposal data and recent timeline.",
        "expected_outcome": "Client understands the next step and stays in the process.",
        "suggested_cta": suggested_cta,
        "suggested_message": None,
        "language_used": lead.get("language") or "es",
        "followup_needed": followup_needed,
        "followup_eta_hours": 24 if followup_needed else None,
        "deal_stage": deal_stage,
        "pipeline_health": pipeline_health,
        "agents": agent_summaries,
        "last_inputs_hash": hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode("utf-8")).hexdigest(),
    }


def get_latest_sales_department_run(application_id: str) -> dict | None:
    state_ref = get_sales_department_state_ref(application_id)
    runs = (
        state_ref.collection("runs")
        .order_by("started_at", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )
    for run in runs:
        data = run.to_dict() or {}
        data["run_id"] = data.get("run_id") or run.id
        return normalize_firestore_value(data)
    return None


def download_gcs_file(gcs_path: str) -> tuple[bytes, str]:
    """Скачивает файл из GCS по пути вида gs://bucket/path, https://storage.googleapis.com/... или path внутри bucket."""
    # Публичный URL вида https://storage.googleapis.com/bucket/path
    public_prefix = f"https://storage.googleapis.com/{BUCKET_NAME}/"
    if gcs_path.startswith(public_prefix):
        blob_name = gcs_path[len(public_prefix):]
    elif gcs_path.startswith(f"gs://{BUCKET_NAME}/"):
        blob_name = gcs_path[len(f"gs://{BUCKET_NAME}/"):]
    elif gcs_path.startswith("gs://"):
        # Другой bucket — не поддерживаем
        raise ValueError(f"Unsupported bucket in path: {gcs_path}")
    else:
        blob_name = gcs_path
    
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_name)
    file_bytes = blob.download_as_bytes()
    mime_type = mimetypes.guess_type(blob_name)[0] or "application/octet-stream"
    return file_bytes, mime_type


def append_proposal_data_revision(application_id: str, revision_type: str, payload: dict):
    """Сохраняет историю extraction/correction как основу для golden dataset."""
    history_ref = (
        firestore_client.collection(FIRESTORE_COLLECTION)
        .document(application_id)
        .collection("proposal_data")
        .document("data")
        .collection("revision_history")
        .document()
    )
    history_ref.set({
        "revision_type": revision_type,
        "created_at": datetime.datetime.utcnow(),
        **payload,
    })


EXTRACTION_STEP_PROGRESS = {
    "prepare_task": 3,
    "check_existing": 8,
    "download_files": 20,
    "primary_extraction": 45,
    "validate_primary": 62,
    "second_pass": 78,
    "save_results": 92,
    "completed": 100,
}


def get_proposal_extraction_task_ref(application_id: str, task_id: str):
    return (
        firestore_client.collection(FIRESTORE_COLLECTION)
        .document(application_id)
        .collection("proposal_extraction_tasks")
        .document(task_id)
    )


def get_latest_proposal_extraction_task(application_id: str) -> dict | None:
    tasks = (
        firestore_client.collection(FIRESTORE_COLLECTION)
        .document(application_id)
        .collection("proposal_extraction_tasks")
        .order_by("updated_at", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )
    for task in tasks:
        data = task.to_dict()
        data["task_id"] = data.get("task_id") or task.id
        return data
    return None


def update_proposal_extraction_task(application_id: str, task_id: str, payload: dict):
    task_ref = get_proposal_extraction_task_ref(application_id, task_id)
    task_ref.set({
        **payload,
        "updated_at": datetime.datetime.utcnow(),
    }, merge=True)


def run_proposal_extraction_task(application_id: str, task_id: str, request_payload: dict):
    request = ExtractDataRequest(**request_payload)
    try:
        update_proposal_extraction_task(application_id, task_id, {
            "status": "running",
            "message": "Начинаем извлечение данных из фактуры.",
            "step_key": "prepare_task",
            "progress_percent": EXTRACTION_STEP_PROGRESS["prepare_task"],
        })

        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        update_proposal_extraction_task(application_id, task_id, {
            "step_key": "check_existing",
            "message": "Проверяем, есть ли уже извлечённые данные.",
            "progress_percent": EXTRACTION_STEP_PROGRESS["check_existing"],
        })

        if not request.force_reextract:
            existing = doc_ref.collection("proposal_data").document("data").get()
            if existing.exists and existing.to_dict().get("extracted_data"):
                existing_data = existing.to_dict()
                update_proposal_extraction_task(application_id, task_id, {
                    "status": "completed",
                    "message": "Данные уже были извлечены ранее.",
                    "step_key": "completed",
                    "progress_percent": EXTRACTION_STEP_PROGRESS["completed"],
                    "extracted_data": existing_data.get("extracted_data"),
                    "field_assessments": existing_data.get("field_assessments"),
                    "overall_confidence": existing_data.get("overall_confidence"),
                    "needs_review": existing_data.get("needs_review", False),
                    "needs_review_fields": existing_data.get("needs_review_fields", []),
                })
                return

        if not request.file_urls:
            raise HTTPException(status_code=400, detail="Не указаны файлы для анализа.")

        update_proposal_extraction_task(application_id, task_id, {
            "step_key": "download_files",
            "message": "Скачиваем и подготавливаем файлы клиента.",
            "progress_percent": EXTRACTION_STEP_PROGRESS["download_files"],
        })

        file_contents = []
        for url in request.file_urls:
            file_bytes, mime_type = download_gcs_file(url)
            if len(file_bytes) > 20 * 1024 * 1024:
                raise HTTPException(status_code=400, detail=f"Файл {url} превышает 20 МБ.")
            file_contents.append((file_bytes, mime_type))

        update_proposal_extraction_task(application_id, task_id, {
            "step_key": "primary_extraction",
            "message": "Извлекаем поля из фактуры через Gemini.",
            "progress_percent": EXTRACTION_STEP_PROGRESS["primary_extraction"],
        })
        primary_extracted, primary_raw = extract_data_with_gemini(file_contents)

        update_proposal_extraction_task(application_id, task_id, {
            "step_key": "validate_primary",
            "message": "Проверяем качество данных и применяем правила.",
            "progress_percent": EXTRACTION_STEP_PROGRESS["validate_primary"],
        })
        primary_validation = validate_invoice_extraction(primary_extracted)

        suspicious_fields = primary_validation["needs_review_fields"]
        if suspicious_fields:
            update_proposal_extraction_task(application_id, task_id, {
                "step_key": "second_pass",
                "message": f"Повторно перепроверяем сомнительные поля: {', '.join(suspicious_fields)}.",
                "progress_percent": EXTRACTION_STEP_PROGRESS["second_pass"],
            })

        pipeline_result = apply_second_pass_if_needed(file_contents, primary_extracted, primary_validation)

        extracted = dict(pipeline_result["final_data"])
        extracted["source_files"] = request.file_urls

        field_assessments = pipeline_result["final_validation"]["field_assessments"]
        overall_confidence = pipeline_result["final_validation"]["overall_confidence"]
        needs_review = pipeline_result["final_validation"]["needs_review"]
        needs_review_fields = pipeline_result["final_validation"]["needs_review_fields"]
        provider_rule_hits = pipeline_result["final_validation"]["provider_rule_hits"]

        raw_extraction = {
            "primary_response_text": primary_raw,
            "primary_extracted_data": primary_extracted,
            "second_pass_attempted": pipeline_result["second_pass_attempted"],
            "second_pass_response_text": pipeline_result["second_pass_raw"],
            "second_pass_updates": pipeline_result["second_pass_updates"],
        }

        update_proposal_extraction_task(application_id, task_id, {
            "step_key": "save_results",
            "message": "Сохраняем результат и обновляем карточку клиента.",
            "progress_percent": EXTRACTION_STEP_PROGRESS["save_results"],
        })

        proposal_data_ref = doc_ref.collection("proposal_data").document("data")
        proposal_data_ref.set({
            "extracted_data": extracted,
            "ai_extracted_data": extracted,
            "raw_extraction": raw_extraction,
            "field_assessments": field_assessments,
            "overall_confidence": overall_confidence,
            "needs_review": needs_review,
            "needs_review_fields": needs_review_fields,
            "provider_rule_hits": provider_rule_hits,
            "extracted_at": datetime.datetime.utcnow(),
            "extracted_by": "Operator",
            "manually_corrected": False,
        })

        append_proposal_data_revision(application_id, "ai_extraction", {
            "raw_extraction": raw_extraction,
            "extracted_data": extracted,
            "field_assessments": field_assessments,
            "overall_confidence": overall_confidence,
            "needs_review": needs_review,
            "needs_review_fields": needs_review_fields,
            "provider_rule_hits": provider_rule_hits,
        })

        extracted_files = extracted.get("source_files") or request_payload.get("file_urls") or []
        create_timeline_event_internal(
            application_id=application_id,
            content=(
                f"Данные счетов извлечены ИИ.\n"
                f"Confidence: {overall_confidence}.\n"
                f"Полей на проверку: {len(needs_review_fields)}.\n"
                f"Коммерциализатор: {extracted.get('retailer', 'Не найден')}.\n"
                f"Тариф доступа: {extracted.get('access_tariff', 'Не найден')}.\n"
                f"CUPS: {extracted.get('cups', 'Не найден')}.\n"
                f"Исходные документы:\n{_format_file_links(extracted_files)}"
            ),
            event_type=EventType.NOTE,
            created_by="System"
        )

        update_proposal_extraction_task(application_id, task_id, {
            "status": "completed",
            "message": "Извлечение данных завершено.",
            "step_key": "completed",
            "progress_percent": EXTRACTION_STEP_PROGRESS["completed"],
            "extracted_data": extracted,
            "field_assessments": field_assessments,
            "overall_confidence": overall_confidence,
            "needs_review": needs_review,
            "needs_review_fields": needs_review_fields,
        })
    except HTTPException as exc:
        update_proposal_extraction_task(application_id, task_id, {
            "status": "failed",
            "message": exc.detail if isinstance(exc.detail, str) else "Ошибка при извлечении данных.",
            "error": exc.detail,
        })
    except Exception as exc:
        print(f"Extract data task error: {exc}")
        update_proposal_extraction_task(application_id, task_id, {
            "status": "failed",
            "message": f"Ошибка при извлечении данных: {str(exc)}",
            "error": str(exc),
        })

def extract_data_with_gemini(file_bytes_list: list[tuple[bytes, str]]) -> dict:
    """Отправляет файлы в Gemini с промптом для извлечения данных счета."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini API Key не настроен на бэкенде.")
    
    prompt = """Ты — точный парсер испанских электрических счетов (facturas de luz).
Извлеки из приложенных файлов только значения, которые явно видны в документе, и верни один JSON-объект.

КРИТИЧЕСКИЕ ПРАВИЛА:
- Не выдумывай значения и не подставляй вероятные догадки.
- Если поле нельзя уверенно прочитать, верни null.
- Не путай comercializadora с distribuidora.
- Не путай CUPS с COD. CLIENTE, número de contrato или referencia.
- Для чисел верни number без символов €, kWh, kW, %.
- Даты верни в формате YYYY-MM-DD.
- Если в счёте несколько периодов или несколько таблиц, бери данные именно текущей factura / периода facturación.
- Если значение видно неоднозначно, лучше null, чем неверное число.

ГДЕ ИСКАТЬ КАЖДОЕ ПОЛЕ В ДОКУМЕНТЕ:
{
  "cups": "string|null — ищи в DATOS DEL TITULAR / DATOS DEL SUMINISTRO рядом с 'CUPS' или 'C.U.P.S.'. Обычно 20-22 символа и начинается с ES.",
  "client_type": "Hogar|Empresa|null — ставь Empresa только если есть явные признаки empresa / negocio / CIF / razón social / tariffa empresarial. Если таких признаков нет — Hogar.",
  "access_tariff": "string|null — ищи рядом с 'TARIFA', 'TARIFA DE ACCESO', 'PEAJE' или 'ATR'. Бери точное значение как в счёте: 2.0A, 2.0DHA, 2.0TD, 3.0TD и т.д.",
  "start_date": "YYYY-MM-DD|null — первая дата периода facturación.",
  "end_date": "YYYY-MM-DD|null — вторая дата периода facturación.",
  "equipment_rental": "number|null — 'alquiler de equipos', 'alquiler contador', 'equipo de medida'.",
  "invoice_amount_with_vat": "number|null — итоговая сумма фактуры с налогами: 'TOTAL FACTURA', 'IMPORTE TOTAL', 'TOTAL IMPORTE FACTURA'.",
  "retailer": "string|null — comercializadora / proveedor actual, а не distribuidora.",
  "billed_power_p1": "number|null — potencia contratada или facturada для P1 в kW.",
  "billed_power_p2": "number|null — potencia contratada или facturada для P2 в kW. Если нет отдельного P2 — null.",
  "consumption_p1": "number|null — consumo / energía P1 в kWh.",
  "consumption_p2": "number|null — consumo / energía P2 в kWh.",
  "consumption_p3": "number|null — consumo / energía P3 в kWh."
}

ПЕРЕД ОТВЕТОМ ПРОВЕРЬ:
- JSON должен быть валидным.
- Все ключи должны присутствовать.
- Значения должны соответствовать именно полям из документа.

Отвечай ТОЛЬКО JSON, без пояснений и без markdown."""
    
    return _call_gemini_json(prompt, file_bytes_list, GEMINI_INVOICE_EXTRACTION_MODEL)


def _call_gemini_json(prompt: str, file_bytes_list: list[tuple[bytes, str]], model_name: str) -> tuple[dict, str]:
    """Вызывает Gemini, нормализует markdown-обёртки и возвращает (json_obj, raw_text)."""
    model = genai.GenerativeModel(model_name)

    content_parts = [prompt]
    for file_bytes, mime_type in file_bytes_list:
        content_parts.append({
            "mime_type": mime_type,
            "data": file_bytes
        })

    response = model.generate_content(content_parts)
    if not response.text:
        raise HTTPException(status_code=500, detail="Gemini вернул пустой ответ.")

    raw_text = response.text.strip()
    response_text = raw_text
    if response_text.startswith("```json"):
        response_text = response_text[7:]
    if response_text.startswith("```"):
        response_text = response_text[3:]
    if response_text.endswith("```"):
        response_text = response_text[:-3]
    response_text = response_text.strip()

    try:
        extracted = json.loads(response_text)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Gemini вернул невалидный JSON: {str(e)}")

    if isinstance(extracted, list):
        if len(extracted) > 0 and isinstance(extracted[0], dict):
            extracted = extracted[0]
        else:
            raise HTTPException(status_code=500, detail="Gemini вернул JSON-массив вместо объекта.")

    if not isinstance(extracted, dict):
        raise HTTPException(status_code=500, detail=f"Gemini вернул неожиданный тип данных: {type(extracted).__name__}")

    return extracted, raw_text


def _normalize_retailer_name(value: str | None) -> tuple[str | None, list[str]]:
    if not value:
        return None, []
    normalized = re.sub(r"\s+", " ", str(value)).strip()
    lowered = normalized.lower()
    rule_hits: list[str] = []
    for alias, canonical in RETAILER_ALIAS_RULES.items():
        if alias in lowered:
            if normalized != canonical:
                rule_hits.append(f"retailer_alias:{alias}->{canonical}")
            return canonical, rule_hits

    def simplify(text: str) -> str:
        text = unicodedata.normalize("NFKD", text)
        text = "".join(ch for ch in text if not unicodedata.combining(ch))
        text = text.casefold()
        text = re.sub(r"[^a-z0-9]+", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    simplified_input = simplify(normalized)
    if not simplified_input:
        return normalized, rule_hits

    exact_map = {
        simplify(label): label
        for label in KNOWN_RETAILER_LABELS
    }
    exact_canonical = exact_map.get(simplified_input)
    if exact_canonical:
        if normalized != exact_canonical:
            rule_hits.append(f"retailer_catalog_exact:{normalized}->{exact_canonical}")
        return exact_canonical, rule_hits

    catalog_pairs = [(simplify(label), label) for label in KNOWN_RETAILER_LABELS]
    for simple_label, label in catalog_pairs:
        if simplified_input in simple_label or simple_label in simplified_input:
            if normalized != label:
                rule_hits.append(f"retailer_catalog_contains:{normalized}->{label}")
            return label, rule_hits

    close_matches = difflib.get_close_matches(
        simplified_input,
        [pair[0] for pair in catalog_pairs],
        n=1,
        cutoff=0.72,
    )
    if close_matches:
        matched_simple = close_matches[0]
        matched_label = next((label for simple_label, label in catalog_pairs if simple_label == matched_simple), None)
        if matched_label:
            if normalized != matched_label:
                rule_hits.append(f"retailer_catalog_fuzzy:{normalized}->{matched_label}")
            return matched_label, rule_hits

    return normalized, rule_hits


def _normalize_extracted_value(field: str, value: Any) -> Any:
    if value in ("", [], {}, None):
        return None

    if field == "client_type":
        value_str = str(value).strip().lower()
        if value_str in {"hogar", "residencial", "particular"}:
            return "Hogar"
        if value_str in {"empresa", "negocio", "business"}:
            return "Empresa"
        return str(value).strip()

    if field in {"cups", "access_tariff"}:
        return str(value).strip().upper()

    if field == "retailer":
        normalized, _ = _normalize_retailer_name(str(value))
        return normalized

    if field in {"start_date", "end_date"}:
        value_str = str(value).strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value_str):
            return value_str
        match = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", value_str)
        if match:
            dd, mm, yyyy = match.groups()
            return f"{yyyy}-{mm}-{dd}"
        return value_str

    if field in {
        "equipment_rental", "invoice_amount_with_vat", "billed_power_p1", "billed_power_p2",
        "consumption_p1", "consumption_p2", "consumption_p3"
    }:
        if isinstance(value, (int, float)):
            return round(float(value), 4)
        value_str = str(value).strip().replace("€", "").replace("kWh", "").replace("kW", "").replace("%", "")
        value_str = value_str.replace(" ", "")
        if "," in value_str and "." in value_str:
            value_str = value_str.replace(".", "").replace(",", ".")
        else:
            value_str = value_str.replace(",", ".")
        try:
            return round(float(value_str), 4)
        except ValueError:
            return value

    return value


def _compact_cups(value: str | None) -> str | None:
    if not value:
        return None
    return re.sub(r"[^A-Za-z0-9]", "", str(value)).upper()


def _is_structurally_valid_cups(value: str | None) -> bool:
    compact = _compact_cups(value)
    if not compact:
        return False
    return bool(re.fullmatch(r"ES\d{16}[A-Z]{2}(\d[A-Z])?", compact))


def _validate_cups(value: str | None) -> tuple[bool, str | None, str]:
    compact = _compact_cups(value)
    if not compact:
        return False, None, "missing"

    if stdnum_cups is not None:
        try:
            validated = stdnum_cups.validate(compact)
            return True, validated, "checksum"
        except Exception:
            return False, compact, "checksum"

    return _is_structurally_valid_cups(compact), compact, "structure"


def _apply_provider_specific_rules(extracted: dict) -> tuple[dict, list[str]]:
    normalized = dict(extracted)
    rule_hits: list[str] = []
    retailer, retailer_hits = _normalize_retailer_name(normalized.get("retailer"))
    if retailer is not None:
        normalized["retailer"] = retailer
    rule_hits.extend(retailer_hits)
    return normalized, rule_hits


def _assess_field(field: str, value: Any, extracted: dict) -> dict:
    normalized_value = _normalize_extracted_value(field, value)
    reasons: list[str] = []
    confidence = 0.0
    needs_review = False

    if normalized_value in (None, "", []):
        return {
            "value": None,
            "confidence": 0.1,
            "needs_review": True,
            "reasons": ["missing_value"],
        }

    if field == "cups":
        is_valid, validated_cups, validation_mode = _validate_cups(str(normalized_value))
        cups = validated_cups or _compact_cups(str(normalized_value))
        if is_valid and validation_mode == "checksum":
            confidence = 0.99
        elif is_valid and validation_mode == "structure":
            confidence = 0.78
            reasons.append("cups_checksum_validator_unavailable")
        else:
            confidence = 0.2
            needs_review = True
            reasons.append("invalid_cups_checksum" if validation_mode == "checksum" else "invalid_cups_format")
        normalized_value = cups
    elif field == "client_type":
        if normalized_value in {"Hogar", "Empresa"}:
            confidence = 0.85
        else:
            confidence = 0.3
            needs_review = True
            reasons.append("unknown_client_type")
    elif field == "access_tariff":
        tariff = str(normalized_value).upper()
        if tariff in KNOWN_ACCESS_TARIFFS or re.fullmatch(r"\d\.\d[A-Z]{1,3}", tariff):
            confidence = 0.88
        else:
            confidence = 0.4
            needs_review = True
            reasons.append("unknown_access_tariff")
        normalized_value = tariff
    elif field in {"start_date", "end_date"}:
        try:
            datetime.date.fromisoformat(str(normalized_value))
            confidence = 0.82
        except ValueError:
            confidence = 0.25
            needs_review = True
            reasons.append("invalid_date_format")
    elif field == "retailer":
        retailer_text = str(normalized_value).lower()
        if any(hint in retailer_text for hint in DISTRIBUTOR_HINTS):
            confidence = 0.3
            needs_review = True
            reasons.append("looks_like_distributor_not_retailer")
        elif normalized_value in KNOWN_RETAILER_LABELS:
            confidence = 0.95
            reasons.append("retailer_catalog_match")
        elif len(str(normalized_value).strip()) >= 3:
            confidence = 0.78
        else:
            confidence = 0.25
            needs_review = True
            reasons.append("retailer_too_short")
    else:
        try:
            numeric = float(normalized_value)
            confidence = 0.8
            if numeric < 0:
                confidence = 0.2
                needs_review = True
                reasons.append("negative_numeric_value")
            if field == "invoice_amount_with_vat" and (numeric <= 0 or numeric > 50000):
                confidence = 0.35
                needs_review = True
                reasons.append("invoice_amount_out_of_range")
            if field == "equipment_rental" and numeric > 500:
                confidence = 0.35
                needs_review = True
                reasons.append("equipment_rental_out_of_range")
            if field in {"billed_power_p1", "billed_power_p2"} and numeric > 100:
                confidence = 0.35
                needs_review = True
                reasons.append("power_out_of_range")
            if field in {"consumption_p1", "consumption_p2", "consumption_p3"} and numeric > 100000:
                confidence = 0.35
                needs_review = True
                reasons.append("consumption_out_of_range")
        except (TypeError, ValueError):
            confidence = 0.25
            needs_review = True
            reasons.append("invalid_numeric_value")

    if field == "end_date" and extracted.get("start_date") and normalized_value and not needs_review:
        try:
            start_dt = datetime.date.fromisoformat(str(_normalize_extracted_value("start_date", extracted.get("start_date"))))
            end_dt = datetime.date.fromisoformat(str(normalized_value))
            if end_dt < start_dt:
                confidence = min(confidence, 0.2)
                needs_review = True
                reasons.append("end_date_before_start_date")
        except ValueError:
            pass

    return {
        "value": normalized_value,
        "confidence": round(confidence, 2),
        "needs_review": needs_review,
        "reasons": reasons,
    }


def validate_invoice_extraction(extracted: dict) -> dict:
    normalized, provider_rule_hits = _apply_provider_specific_rules(extracted)
    field_assessments: dict[str, dict] = {}
    normalized_data: dict[str, Any] = {}
    needs_review_fields: list[str] = []

    for field in INVOICE_EXTRACTION_FIELDS:
        assessment = _assess_field(field, normalized.get(field), normalized)
        field_assessments[field] = assessment
        normalized_data[field] = assessment["value"]
        if assessment["needs_review"]:
            needs_review_fields.append(field)

    confidence_values = [field_assessments[field]["confidence"] for field in INVOICE_EXTRACTION_FIELDS]
    overall_confidence = round(sum(confidence_values) / len(confidence_values), 2) if confidence_values else 0.0

    return {
        "normalized_data": normalized_data,
        "field_assessments": field_assessments,
        "needs_review": len(needs_review_fields) > 0,
        "needs_review_fields": needs_review_fields,
        "overall_confidence": overall_confidence,
        "provider_rule_hits": provider_rule_hits,
    }


def extract_suspicious_fields_with_gemini(file_bytes_list: list[tuple[bytes, str]], current_data: dict, suspicious_fields: list[str]) -> tuple[dict, str]:
    if not suspicious_fields:
        return {}, ""

    field_lines = "\n".join(f'- "{field}"' for field in suspicious_fields)
    current_json = json.dumps(current_data, ensure_ascii=False)
    prompt = f"""Ты перепроверяешь только сомнительные поля испанской фактуры света.
Нужно вернуть JSON-объект только с перечисленными ниже ключами. Если поле не удаётся уверенно уточнить, верни null.
Нельзя возвращать дополнительные ключи.

Сомнительные поля:
{field_lines}

Текущий результат первого прохода:
{current_json}

Правила:
- Не выдумывай значения.
- Для retailer верни comercializadora, а не distribuidora.
- Для dates используй YYYY-MM-DD.
- Для чисел верни только number.
- Ответ только JSON без markdown."""

    return _call_gemini_json(prompt, file_bytes_list, GEMINI_INVOICE_EXTRACTION_MODEL)


def apply_second_pass_if_needed(file_bytes_list: list[tuple[bytes, str]], extracted: dict, validation: dict) -> dict:
    suspicious_fields = [
        field for field in validation["needs_review_fields"]
        if field in {"cups", "retailer", "access_tariff", "invoice_amount_with_vat", "billed_power_p1", "billed_power_p2", "consumption_p1", "consumption_p2", "consumption_p3", "start_date", "end_date"}
    ]
    if not suspicious_fields:
        return {
            "final_data": validation["normalized_data"],
            "final_validation": validation,
            "second_pass_attempted": False,
            "second_pass_raw": None,
            "second_pass_updates": {},
        }

    second_pass_updates, second_pass_raw = extract_suspicious_fields_with_gemini(file_bytes_list, validation["normalized_data"], suspicious_fields)
    merged = dict(validation["normalized_data"])
    for field in suspicious_fields:
        candidate_validation = _assess_field(field, second_pass_updates.get(field), merged)
        current_validation = validation["field_assessments"].get(field, {"confidence": 0, "needs_review": True})
        if candidate_validation["confidence"] > current_validation["confidence"] or (
            current_validation.get("needs_review") and not candidate_validation.get("needs_review")
        ):
            merged[field] = candidate_validation["value"]

    final_validation = validate_invoice_extraction(merged)
    return {
        "final_data": final_validation["normalized_data"],
        "final_validation": final_validation,
        "second_pass_attempted": True,
        "second_pass_raw": second_pass_raw,
        "second_pass_updates": second_pass_updates,
    }

def upload_to_gcs(file_obj: UploadFile, destination_blob_name: str):
    """Загружает файл в Google Cloud Storage и делает его публично доступным для чтения."""
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(destination_blob_name)
    
    file_obj.file.seek(0) 
    
    blob.upload_from_file(file_obj.file, content_type=file_obj.content_type)
    
    # ВОЗВРАЩАЕМ: Устанавливаем публичное право на чтение
    blob.acl.all().grant_read()
    blob.acl.save()
    
    # ВОЗВРАЩАЕМ: ПУБЛИЧНАЯ ССЫЛКА
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{destination_blob_name}"

def generate_signed_url(gcs_path: str, expiration_minutes: int = 60) -> str:
    """Генерирует V4 Signed URL для GCS пути."""
    try:
        if not gcs_path.startswith("gs://"):
            raise ValueError("GCS path must start with 'gs://'")
        
        # Извлекаем имя бакета и путь к блобу
        parts = gcs_path.replace("gs://", "").split("/", 1)
        bucket_name = parts[0]
        blob_name = parts[1]
        
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)

        # Генерация URL с истечением срока действия
        url = blob.generate_signed_url(
            version="v4",
            expiration=datetime.timedelta(minutes=expiration_minutes),
            method="GET"
        )
        return url
        
    except Exception as e:
        print(f"Signed URL Generation Error for {gcs_path}: {e}")
        raise e


def normalize_phone(phone: str) -> str:
    return re.sub(r'\D', '', phone)


def get_extracted_billing_days(extracted_data: dict) -> int | None:
    if not extracted_data:
        return None
    start_date = extracted_data.get("start_date")
    end_date = extracted_data.get("end_date")
    if not start_date or not end_date:
        return None
    try:
        start_obj = datetime.datetime.strptime(start_date, "%Y-%m-%d").date()
        end_obj = datetime.datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    if end_obj < start_obj:
        return None
    return (end_obj - start_obj).days + 1


def get_extracted_monthly_base(extracted_data: dict) -> float | None:
    """Возвращает месячную базу для честного сравнения, нормализуя счёт по периоду при необходимости."""
    if not extracted_data:
        return None

    avg_monthly = extracted_data.get("avg_monthly_cost_eur")
    if avg_monthly is not None:
        try:
            return float(avg_monthly)
        except (TypeError, ValueError):
            pass

    invoice_total = extracted_data.get("invoice_amount_with_vat")
    if invoice_total is None:
        return None

    try:
        invoice_total_num = float(invoice_total)
    except (TypeError, ValueError):
        return None

    billing_days = get_extracted_billing_days(extracted_data)
    if billing_days and billing_days > 0:
        return round(invoice_total_num * 30 / billing_days, 2)
    return invoice_total_num


def get_extracted_current_cost(extracted_data: dict) -> float | None:
    """Возвращает базовую стоимость для сравнения из старой или новой схемы extracted_data."""
    if not extracted_data:
        return None
    return extracted_data.get("avg_monthly_cost_eur") or extracted_data.get("invoice_amount_with_vat")


def format_power_value(extracted_data: dict) -> str:
    """Форматирует мощность из старой или новой схемы."""
    power_kw = extracted_data.get("power_kw")
    if power_kw:
        return f"{power_kw} kW"

    p1 = extracted_data.get("billed_power_p1")
    p2 = extracted_data.get("billed_power_p2")
    if p1 and p2:
        return f"P1 {p1} kW / P2 {p2} kW"
    if p1:
        return f"P1 {p1} kW"
    if p2:
        return f"P2 {p2} kW"
    return "N/A"


def format_consumption_value(extracted_data: dict) -> str:
    """Форматирует потребление из старой или новой схемы."""
    avg_consumption = extracted_data.get("avg_monthly_consumption_kwh")
    if avg_consumption:
        return f"{avg_consumption} kWh"

    p1 = extracted_data.get("consumption_p1")
    p2 = extracted_data.get("consumption_p2")
    p3 = extracted_data.get("consumption_p3")
    parts = []
    if p1 is not None:
        parts.append(f"P1 {p1} kWh")
    if p2 is not None:
        parts.append(f"P2 {p2} kWh")
    if p3 is not None:
        parts.append(f"P3 {p3} kWh")
    return " / ".join(parts) if parts else "N/A"


def send_whatsapp_message(to_phone: str, message: str) -> dict:
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise ValueError("WhatsApp credentials not configured")
    
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    normalized = normalize_phone(to_phone)
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": normalized,
        "type": "text",
        "text": {"body": message}
    }
    
    resp = requests.post(url, headers=headers, json=payload)
    # Fallback for Meta test-number quirk: if 79... is rejected with 131030, try 78...
    if resp.status_code == 400 and normalized.startswith("79"):
        try:
            err = resp.json()
            if err.get("error", {}).get("code") == 131030:
                fallback = "78" + normalized[2:]
                payload["to"] = fallback
                resp = requests.post(url, headers=headers, json=payload)
        except Exception:
            pass
    resp.raise_for_status()
    return resp.json()

def send_whatsapp_document(to_phone: str, document_url: str, caption: str = "") -> dict:
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise ValueError("WhatsApp credentials not configured")
    
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    normalized = normalize_phone(to_phone)
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": normalized,
        "type": "document",
        "document": {
            "link": document_url,
            "caption": caption,
            "filename": caption if caption else document_url.split('/')[-1]
        }
    }
    
    resp = requests.post(url, headers=headers, json=payload)
    if resp.status_code == 400 and normalized.startswith("79"):
        try:
            err = resp.json()
            if err.get("error", {}).get("code") == 131030:
                fallback = "78" + normalized[2:]
                payload["to"] = fallback
                resp = requests.post(url, headers=headers, json=payload)
        except Exception:
            pass
    resp.raise_for_status()
    return resp.json()


def send_whatsapp_template(to_phone: str, template_name: str = "hola", language_code: str = "es") -> dict:
    """Отправляет шаблонное сообщение WhatsApp через Meta Business API."""
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise ValueError("WhatsApp credentials not configured")
    
    url = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    normalized = normalize_phone(to_phone)
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": normalized,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {
                "code": language_code
            }
        }
    }
    
    resp = requests.post(url, headers=headers, json=payload)
    if resp.status_code == 400 and normalized.startswith("79"):
        try:
            err = resp.json()
            if err.get("error", {}).get("code") == 131030:
                fallback = "78" + normalized[2:]
                payload["to"] = fallback
                resp = requests.post(url, headers=headers, json=payload)
        except Exception:
            pass
    resp.raise_for_status()
    return resp.json()


def send_notification_email(application_data: dict, application_id: str, uploaded_paths: list):
    """Отправляет уведомление оператору о новой заявке через Gmail SMTP."""
    
    if not SMTP_USER or not SMTP_PASSWORD:
        print("ERROR: SMTP credentials (GMAIL_USER or GMAIL_APP_PASSWORD) are missing.")
        return False

    # 1. Формирование списка файлов (с публичными ссылками)
    file_list_html = "<ul>"
    
    for public_url in uploaded_paths:
        file_name = public_url.split('/')[-1] 
        file_list_html += f'<li><a href="{public_url}" target="_blank">{file_name}</a></li>' 
    
    file_list_html += "</ul>"
    
    # 2. Формируем красивое HTML-тело письма
    
    html_content = f"""
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 20px auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; }}
            .header {{ background-color: #2a6a96; color: white; padding: 20px; text-align: center; }}
            .content {{ padding: 20px; }}
            .data-block {{ margin-bottom: 20px; padding: 10px; border-left: 5px solid #2a6a96; background-color: #f9f9f9; }}
            .footer {{ background-color: #f1f1f1; padding: 10px 20px; font-size: 0.8em; text-align: center; color: #777; }}
            a {{ color: #1a73e8; text-decoration: none; }}
            a:hover {{ text-decoration: underline; }}
            ul {{ list-style-type: none; padding-left: 0; }}
            ul li {{ margin-bottom: 5px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>✅ НОВАЯ ЗАЯВКА НА ENTRAYCOMPARA.COM</h2>
            </div>
            <div class="content">
                <p>Поступила новая заявка на услугу. Требуется немедленное рассмотрение.</p>
                
                <div class="data-block">
                    <strong>ID Заявки:</strong> {application_id}<br>
                    <strong>Дата:</strong> {application_data['submission_date'].strftime('%Y-%m-%d %H:%M:%S UTC')}
                </div>
                
                <h3>Данные Клиента:</h3>
                <ul>
                    <li><strong>Имя:</strong> {application_data['client_name']}</li>
                    <li><strong>Телефон:</strong> {application_data['client_phone']}</li>
                    <li><strong>Email:</strong> {application_data['client_email'] or 'Не указан'}</li>
                    <li><strong>Тип услуги:</strong> <strong>{application_data['service_type']}</strong></li>
                    <li><strong>Заметки:</strong> {application_data['notes'] or 'Нет'}</li>
                </ul>
                
                <h3>Загруженные Документы (Публичный доступ):</h3>
                {file_list_html}
                
                <p style="margin-top: 30px;">
                    <a href="/management/{application_id}" style="padding: 10px 20px; background-color: #2a6a96; color: white; border-radius: 5px; text-decoration: none;">Перейти к Заявке ID: {application_id}</a> 
                </p>
            </div>
            <div class="footer">
                Это автоматическое уведомление от EntrayCompara.com.
            </div>
        </div>
    </body>
    </html>
    """
    
    # 3. Создание и отправка сообщения через SMTP
    
    msg = MIMEMultipart('alternative')
    msg['Subject'] = f"✅ НОВАЯ ЗАЯВКА: {application_data['service_type']} от {application_data['client_name']}"
    msg['From'] = SENDER_EMAIL
    msg['To'] = OPERATOR_EMAIL
    
    msg.attach(MIMEText(html_content, 'html'))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        
        server.sendmail(SENDER_EMAIL, OPERATOR_EMAIL, msg.as_string())
        server.quit()
        
        print("Gmail SMTP email sent successfully.")
        return True
    except Exception as e:
        print(f"Gmail SMTP exception: {e}")
        return False


# --- API v1: Эндпоинт для подачи полной заявки ---

@app.post("/api/submit_application")
async def submit_application(
    client_name: str = Form(...),
    client_phone: str = Form(...),
    client_email: Optional[str] = Form(None),
    service_type: str = Form(...),
    notes: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    invoiceFiles: list[UploadFile] = File(...) 
):
    """Прием заявки, загрузка файлов, отправка уведомления и АВТОМАТИЧЕСКАЯ запись в Timeline."""
    if not invoiceFiles or len(invoiceFiles) == 0:
        raise HTTPException(status_code=400, detail="Не передан ни один файл.")

    uploaded_paths = []
    today = datetime.datetime.utcnow()
    prefix = f"submissions/{today.year}/{today.month:02}/{today.day:02}"

    for f in invoiceFiles:
        # Проверки файла...
        if f.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {f.content_type}")
        f.file.seek(0, 2)
        size_mb = f.file.tell() / (1024 * 1024)
        f.file.seek(0)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(status_code=400, detail=f"Файл {f.filename} превышает {MAX_FILE_SIZE_MB} МБ")
        ext = os.path.splitext(f.filename)[1].lower() 
        unique_name = f"{uuid.uuid4()}{ext}"
        destination = f"{prefix}/{unique_name}"
        try:
            path = upload_to_gcs(f, destination)
            uploaded_paths.append(path)
        except Exception as e:
            print(f"GCS Upload Error: {e}") 
            raise HTTPException(status_code=500, detail=f"Ошибка при загрузке файла {f.filename} в GCS.")
            
    application_data = {
        "client_name": client_name,
        "client_phone": client_phone,
        "client_email": client_email or '',
        "service_type": service_type,
        "notes": notes or '',
        "language": language or 'es',
        "uploaded_files": uploaded_paths, # Здесь теперь публичные ссылки
        "submission_date": today,
        "status": Status.NEW_LEAD.value # Устанавливаем статус 'New Lead'
    }

    try:
        # 1. Сохранение заявки
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document()
        doc_ref.set(application_data)
        application_id = doc_ref.id 

        # 2. АВТОМАТИЗАЦИЯ: Создание первой записи в Timeline
        timeline_content = (
            f"Заявка создана клиентом. Статус: '{Status.NEW_LEAD.value}'. "
            f"Загружено файлов: {len(uploaded_paths)}.\n"
            f"Документы:\n{_format_file_links(uploaded_paths)}"
        )
        
        # Используем внутреннюю функцию, не требующую авторизации оператора
        create_timeline_event_internal(
            application_id=application_id, 
            content=timeline_content,
            event_type=EventType.NOTE,
            created_by="System (Public API)"
        )

        # 3. Отправка уведомления оператору
        email_sent = send_notification_email(application_data, application_id, uploaded_paths)

        return {
            "success": True,
            "message": f"Заявка успешно принята, файлы загружены. Уведомление: {'отправлено' if email_sent else 'ошибка отправки'}.",
            "application_id": application_id,
            "uploaded_files": uploaded_paths
        }
    except Exception as e:
        print(f"Firestore Save Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при сохранении данных в Firestore.")


# ----------------------------------------------------------------------
# 🌟 API v2: БЛОК ДЛЯ ПАНЕЛИ УПРАВЛЕНИЯ ЗАЯВКАМИ 
# ----------------------------------------------------------------------

# --- ФИНАЛЬНАЯ ФУНКЦИЯ АУТЕНТИФИКАЦИИ (Секретный ключ) ---
def authenticate_operator(authorization: Optional[str] = Header(None)):
    """
    Проверяет Bearer-токен на соответствие секретному ключу OPERATOR_SECRET_KEY.
    """
    if not OPERATOR_SECRET_KEY:
         raise HTTPException(status_code=500, detail="Бэкенд: Секретный ключ OPERATOR_SECRET_KEY не задан в переменных окружения.")

    expected_prefix = "Bearer "
    expected_token = f"{expected_prefix}{OPERATOR_SECRET_KEY}"
    
    # Проверяем, совпадает ли токен, присланный фронтендом
    if authorization != expected_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный секретный ключ или неверный формат Bearer-токена."
        )
    return True

def transform_firestore_doc(doc: firestore.DocumentSnapshot) -> Dict[str, Any]:
    """Преобразует документ Firestore в словарь с добавлением ID и форматированием даты."""
    data = doc.to_dict()
    if data:
        data['id'] = doc.id
        if isinstance(data.get('submission_date'), datetime.datetime):
            data['submission_date'] = data['submission_date'].isoformat()
        if isinstance(data.get('analysis_started_at'), datetime.datetime):
            data['analysis_started_at'] = data['analysis_started_at'].isoformat()
        return data
    return None

# --- 1. GET /api/applications (Список с фильтрацией и пагинацией) ---

@app.get("/api/applications", tags=["Management"], dependencies=[Depends(authenticate_operator)])
async def list_applications(
    limit: int = Query(20, gt=0, le=100),
    cursor_id: Optional[str] = Query(None, alias="cursor"),
    status_filter: Optional[Status] = Query(None, alias="status"), # Обновлено
    service_type_filter: Optional[ServiceType] = Query(None, alias="service_type"),
    search_term: Optional[str] = Query(None, alias="search_term")
):
    """Получает список заявок с пагинацией и фильтрами."""
    try:
        query = firestore_client.collection(FIRESTORE_COLLECTION) \
            .order_by("submission_date", direction=firestore.Query.DESCENDING)

        if status_filter:
            query = query.where("status", "==", status_filter.value) # Обновлено

        if service_type_filter:
            query = query.where("service_type", "==", service_type_filter.value) # Обновлено
        
        # Пагинация (Start After Cursor)
        start_after_doc = None
        if cursor_id:
            start_after_doc = firestore_client.collection(FIRESTORE_COLLECTION).document(cursor_id).get()
            if start_after_doc.exists:
                query = query.start_after(start_after_doc)
            else:
                cursor_id = None 

        # Выполнение запроса с ограничением + 1 для определения следующего курсора
        query = query.limit(limit + 1)
        docs = query.stream()
        
        results = [transform_firestore_doc(doc) for doc in docs if doc.exists]
        
        next_cursor = None
        if len(results) > limit:
            next_cursor = results.pop().get('id')

        # NOTE: Упрощенная обработка поиска в Python (не оптимально для больших БД)
        if search_term:
            term = search_term.lower()
            filtered_results = [
                r for r in results if 
                term in r.get('client_name', '').lower() or
                term in r.get('client_phone', '').lower() or
                term in r.get('client_email', '').lower()
            ]
            results = filtered_results

        return {
            "applications": results,
            "next_cursor": next_cursor
        }

    except Exception as e:
        print(f"Firestore List Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при получении списка заявок из Firestore.")

# --- 2. GET /api/applications/{id} (Получение деталей) ---

@app.get("/api/applications/{application_id}", tags=["Management"], dependencies=[Depends(authenticate_operator)])
async def get_application_details(application_id: str):
    """Получает детальную информацию по конкретной заявке."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
        
        application_data = transform_firestore_doc(doc)
        return application_data
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Firestore Detail Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при получении данных заявки.")


@app.get("/api/applications/{application_id}/sales-department/state", tags=["Sales Department"], dependencies=[Depends(authenticate_operator)])
async def get_sales_department_state(application_id: str):
    """Возвращает текущее состояние AI-отдела продаж по лиду."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        state_doc = get_sales_department_state_ref(application_id).get()
        if not state_doc.exists:
            return {
                "success": True,
                "exists": False,
                "state": None,
                "latest_run": None,
            }

        return {
            "success": True,
            "exists": True,
            "state": normalize_firestore_value(state_doc.to_dict() or {}),
            "latest_run": get_latest_sales_department_run(application_id),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Sales department state error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при получении состояния отдела продаж.")


@app.post("/api/applications/{application_id}/sales-department/analyze", tags=["Sales Department"], dependencies=[Depends(authenticate_operator)])
async def analyze_sales_department(application_id: str, payload: SalesDepartmentAnalyzeRequest | None = Body(default=None)):
    """Собирает lead snapshot, пересчитывает sales state и сохраняет run для аудита/HUD."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        app_data = doc.to_dict() or {}
        state_ref = get_sales_department_state_ref(application_id)
        started_at = datetime.datetime.utcnow()
        run_ref = state_ref.collection("runs").document()
        run_ref.set({
            "run_id": run_ref.id,
            "status": "running",
            "trigger": "manual_analyze",
            "started_at": started_at,
            "completed_at": None,
            "agents": [
                {"agent_key": key, "status": "pending", "summary": None, "confidence": None}
                for key in SALES_DEPARTMENT_AGENT_KEYS
            ],
        })

        snapshot = build_sales_department_snapshot(application_id, doc_ref, app_data)
        state_payload = analyze_sales_department_snapshot(snapshot)
        completed_at = datetime.datetime.utcnow()
        state_payload.update({
            "updated_at": completed_at,
            "last_run_id": run_ref.id,
            "snapshot_summary": {
                "status": snapshot.get("lead", {}).get("status"),
                "uploaded_files_count": snapshot.get("lead", {}).get("uploaded_files_count", 0),
                "has_extracted_data": snapshot.get("signals", {}).get("has_extracted_data", False),
                "has_selected_simulation": snapshot.get("signals", {}).get("has_selected_simulation", False),
                "has_proposal": snapshot.get("signals", {}).get("has_proposal", False),
                "timeline_events_count": len(snapshot.get("timeline", [])),
            },
        })

        run_payload = {
            "run_id": run_ref.id,
            "status": "completed",
            "trigger": "manual_analyze",
            "started_at": started_at,
            "completed_at": completed_at,
            "snapshot": snapshot,
            "agents": state_payload.get("agents", []),
            "result": state_payload,
        }

        state_ref.set(state_payload, merge=True)
        run_ref.set(run_payload, merge=True)

        create_timeline_event_internal(
            application_id=application_id,
            content=(
                "Отдел продаж пересчитал состояние лида.\n"
                f"Состояние клиента: {state_payload.get('client_state')}.\n"
                f"Следующее действие: {state_payload.get('recommended_action')}.\n"
                f"Pipeline health: {state_payload.get('pipeline_health')}."
            ),
            event_type=EventType.NOTE,
            created_by="System"
        )

        return {
            "success": True,
            "run_id": run_ref.id,
            "state": normalize_firestore_value(state_payload),
            "run": normalize_firestore_value(run_payload),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Sales department analyze error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка анализа отдела продаж: {str(e)}")


@app.get("/api/applications/{application_id}/sales-department/latest-run", tags=["Sales Department"], dependencies=[Depends(authenticate_operator)])
async def get_sales_department_latest_run(application_id: str):
    """Возвращает последний run AI-отдела продаж."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        latest_run = get_latest_sales_department_run(application_id)
        if not latest_run:
            return {"success": True, "exists": False, "run": None}
        return {"success": True, "exists": True, "run": latest_run}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Sales department latest run error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при получении последнего run отдела продаж.")

# --- 3. PUT /api/applications/{id}/status (Обновление статуса) ---

@app.put("/api/applications/{application_id}/status", tags=["Management"], dependencies=[Depends(authenticate_operator)])
async def update_application_status(application_id: str, update_data: ApplicationUpdateStatus):
    """Обновляет статус заявки и автоматически добавляет запись в Timeline."""
        
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        
        # Проверяем существование документа для чистого 404
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")

        new_status = update_data.status.value
        
        update_fields = {
            "status": new_status,
            "updated_at": datetime.datetime.utcnow()
        }
        if new_status == Status.ANALYSIS.value:
            update_fields["analysis_started_at"] = datetime.datetime.utcnow()
        
        doc_ref.update(update_fields)
        
        # АВТОМАТИЗАЦИЯ: Запись в Timeline об изменении статуса
        create_timeline_event_internal(
            application_id=application_id, 
            content=f"Статус заявки изменен на '{new_status}' (вручную).",
            event_type=EventType.NOTE,
            created_by="Operator" # В реальной системе это будет ID авторизованного оператора
        )
        
        return {
            "success": True,
            "message": f"Статус заявки {application_id} успешно обновлен на '{new_status}'."
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Firestore Status Update Error: {e}")
        if "NOT_FOUND" in str(e):
             raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
        raise HTTPException(status_code=500, detail="Ошибка при обновлении статуса заявки.")

# --- 4. PUT /api/applications/{id}/service_type (Обновление типа услуги) ---
@app.put("/api/applications/{application_id}/service_type", tags=["Management"], dependencies=[Depends(authenticate_operator)])
async def update_application_service_type(application_id: str, update_data: ApplicationUpdateServiceType):
    """Обновляет тип услуги заявки."""
        
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")

        doc_ref.update({
            "service_type": update_data.service_type.value,
            "updated_at": datetime.datetime.utcnow()
        })

        create_timeline_event_internal(
            application_id=application_id,
            content=f"Тип услуги изменён на '{update_data.service_type.value}'.",
            event_type=EventType.NOTE,
            created_by="Operator"
        )
        
        return {
            "success": True,
            "message": f"Тип услуги для заявки {application_id} успешно обновлен на '{update_data.service_type}'."
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Firestore Update Service Type Error: {e}")
        if "NOT_FOUND" in str(e):
             raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
        raise HTTPException(status_code=500, detail="Ошибка при обновлении типа услуги заявки.")

# --- 4.5. PUT /api/applications/{id} (Обновление заявки) ---
@app.put("/api/applications/{application_id}", tags=["Management"], dependencies=[Depends(authenticate_operator)])
async def update_application(application_id: str, update_data: ApplicationUpdate):
    """Обновляет поля заявки (имя, телефон, email, заметки)."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
        
        update_dict = update_data.model_dump(exclude_unset=True)
        if update_dict:
            changed_fields = list(update_dict.keys())
            update_dict["updated_at"] = datetime.datetime.utcnow()
            doc_ref.update(update_dict)
            create_timeline_event_internal(
                application_id=application_id,
                content=f"Карточка лида обновлена. Поля: {', '.join(changed_fields)}.",
                event_type=EventType.NOTE,
                created_by="Operator"
            )
        
        return {
            "success": True,
            "message": f"Заявка {application_id} успешно обновлена."
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Firestore Update Error: {e}")
        if "NOT_FOUND" in str(e):
             raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
        raise HTTPException(status_code=500, detail="Ошибка при обновлении заявки.")

# --- 4.75. POST /api/applications/{id}/upload-files (Загрузка файлов оператором) ---
@app.post("/api/applications/{application_id}/upload-files", tags=["Management"], dependencies=[Depends(authenticate_operator)])
async def upload_application_files(application_id: str, files: list[UploadFile] = File(...)):
    """Загружает файлы в GCS и добавляет их к существующей заявке."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
        
        if not files or len(files) == 0:
            raise HTTPException(status_code=400, detail="Не передан ни один файл.")
        
        uploaded_paths = []
        today = datetime.datetime.utcnow()
        prefix = f"operator_uploads/{today.year}/{today.month:02}/{today.day:02}"
        
        for f in files:
            if f.content_type not in ALLOWED_MIME_TYPES:
                raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {f.content_type}")
            f.file.seek(0, os.SEEK_END)
            size_mb = f.file.tell() / (1024 * 1024)
            f.file.seek(0)
            if size_mb > MAX_FILE_SIZE_MB:
                raise HTTPException(status_code=400, detail=f"Файл {f.filename} превышает {MAX_FILE_SIZE_MB} МБ")
            ext = os.path.splitext(f.filename)[1].lower()
            unique_name = f"{uuid.uuid4()}{ext}"
            destination = f"{prefix}/{unique_name}"
            try:
                path = upload_to_gcs(f, destination)
                uploaded_paths.append(path)
            except Exception as e:
                print(f"GCS Upload Error: {e}")
                raise HTTPException(status_code=500, detail=f"Ошибка при загрузке файла {f.filename} в GCS.")
        
        existing_files = doc.to_dict().get("uploaded_files", [])
        updated_files = existing_files + uploaded_paths
        doc_ref.update({"uploaded_files": updated_files, "updated_at": today})

        create_timeline_event_internal(
            application_id=application_id,
            content=(
                f"Оператор добавил документы к заявке. Загружено новых файлов: {len(uploaded_paths)}.\n"
                f"Новые документы:\n{_format_file_links(uploaded_paths)}"
            ),
            event_type=EventType.NOTE,
            created_by="Operator"
        )
        
        return {
            "success": True,
            "message": f"Загружено файлов: {len(uploaded_paths)}",
            "uploaded_files": uploaded_paths,
            "total_files": updated_files
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload files error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при загрузке файлов.")

# --- 4.85. Proposal Builder: Extracted Data Endpoints ---

@app.get("/api/reference/retailers", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def list_reference_retailers():
    return {
        "success": True,
        "retailers": KNOWN_RETAILER_ITEMS,
    }

@app.post("/api/applications/{application_id}/proposal/extract-data", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def proposal_extract_data(application_id: str, request: ExtractDataRequest):
    """Запуск AI-извлечения данных из загруженных счетов клиента как фоновой задачи."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        if not request.file_urls:
            raise HTTPException(status_code=400, detail="Не указаны файлы для анализа.")

        task_id = f"extract-{uuid.uuid4().hex[:12]}"
        task_ref = get_proposal_extraction_task_ref(application_id, task_id)
        task_ref.set({
            "task_id": task_id,
            "application_id": application_id,
            "status": "pending",
            "message": "Ставим задачу на извлечение данных.",
            "step_key": "prepare_task",
            "progress_percent": 0,
            "file_urls": request.file_urls,
            "force_reextract": request.force_reextract,
            "created_at": datetime.datetime.utcnow(),
            "updated_at": datetime.datetime.utcnow(),
        })

        create_timeline_event_internal(
            application_id=application_id,
            content=(
                "Запущено извлечение данных по документам.\n"
                f"Документы для анализа:\n{_format_file_links(request.file_urls)}"
            ),
            event_type=EventType.NOTE,
            created_by="Operator"
        )

        worker = threading.Thread(
            target=run_proposal_extraction_task,
            args=(application_id, task_id, request.model_dump()),
            daemon=True,
        )
        worker.start()

        return {
            "success": True,
            "task_id": task_id,
            "status": "pending",
            "message": "Задача на извлечение данных запущена.",
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Extract data error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при извлечении данных: {str(e)}")


@app.get("/api/applications/{application_id}/proposal/extract-data/{task_id}/status", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def proposal_extract_data_status(application_id: str, task_id: str):
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        task_snapshot = get_proposal_extraction_task_ref(application_id, task_id).get()
        if not task_snapshot.exists:
            raise HTTPException(status_code=404, detail="Задача извлечения не найдена.")

        task = task_snapshot.to_dict()
        return {
            "success": True,
            "task_id": task_id,
            "status": task.get("status", "pending"),
            "message": task.get("message", ""),
            "step_key": task.get("step_key"),
            "progress_percent": task.get("progress_percent", 0),
            "extracted_data": task.get("extracted_data"),
            "field_assessments": task.get("field_assessments"),
            "overall_confidence": task.get("overall_confidence"),
            "needs_review": task.get("needs_review", False),
            "needs_review_fields": task.get("needs_review_fields", []),
            "error": task.get("error"),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Extract data status error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении статуса extraction: {str(e)}")


@app.get("/api/applications/{application_id}/proposal/extract-data/latest-task", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def proposal_extract_latest_task(application_id: str):
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        task = get_latest_proposal_extraction_task(application_id)
        if not task:
            return {"success": True, "task": None}

        return {
            "success": True,
            "task": {
                "task_id": task.get("task_id"),
                "status": task.get("status", "pending"),
                "message": task.get("message", ""),
                "step_key": task.get("step_key"),
                "progress_percent": task.get("progress_percent", 0),
                "extracted_data": task.get("extracted_data"),
                "field_assessments": task.get("field_assessments"),
                "overall_confidence": task.get("overall_confidence"),
                "needs_review": task.get("needs_review", False),
                "needs_review_fields": task.get("needs_review_fields", []),
                "error": task.get("error"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Extract latest task error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении последней задачи extraction: {str(e)}")


@app.put("/api/applications/{application_id}/proposal/extracted-data", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def proposal_update_extracted_data(application_id: str, update_data: ExtractedDataUpdate):
    """Сохранение/корректировка извлеченных данных оператором."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        proposal_data_ref = doc_ref.collection("proposal_data").document("data")
        previous_snapshot = proposal_data_ref.get()
        previous_data = previous_snapshot.to_dict() if previous_snapshot.exists else {}
        corrected = update_data.extracted_data.model_dump()
        manual_assessments = {
            field: {
                "value": corrected.get(field),
                "confidence": 1.0 if corrected.get(field) not in (None, "", []) else 0.5,
                "needs_review": False,
                "reasons": ["manual_correction"],
            }
            for field in INVOICE_EXTRACTION_FIELDS
        }
        changed_fields = [
            field for field in INVOICE_EXTRACTION_FIELDS
            if previous_data.get("extracted_data", {}).get(field) != corrected.get(field)
        ]
        proposal_data_ref.set({
            "extracted_data": corrected,
            "manual_corrected_data": corrected,
            "field_assessments": manual_assessments,
            "overall_confidence": 1.0,
            "needs_review": False,
            "needs_review_fields": [],
            "updated_at": datetime.datetime.utcnow(),
            "manually_corrected": True,
            "last_manual_correction": {
                "changed_fields": changed_fields,
                "corrected_at": datetime.datetime.utcnow(),
            },
        }, merge=True)

        append_proposal_data_revision(application_id, "manual_correction", {
            "previous_extracted_data": previous_data.get("extracted_data"),
            "corrected_extracted_data": corrected,
            "changed_fields": changed_fields,
            "raw_extraction": previous_data.get("raw_extraction"),
            "provider_rule_hits": previous_data.get("provider_rule_hits", []),
        })
        
        # Запись в Timeline
        create_timeline_event_internal(
            application_id=application_id,
            content=(
                f"Данные скорректированы оператором. Изменено полей: {len(changed_fields)}.\n"
                f"Изменённые поля: {', '.join(changed_fields) if changed_fields else 'не указаны'}."
            ),
            event_type=EventType.NOTE,
            created_by="System"
        )
        
        return {"success": True, "message": "Данные обновлены."}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update extracted data error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обновлении данных: {str(e)}")


@app.get("/api/applications/{application_id}/proposal/extracted-data", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def proposal_get_extracted_data(application_id: str):
    """Получение извлеченных данных счетов клиента."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        proposal_data_ref = doc_ref.collection("proposal_data").document("data")
        proposal_data = proposal_data_ref.get()
        
        if not proposal_data.exists:
            raise HTTPException(status_code=404, detail="Данные не найдены. Сначала извлеките данные.")
        
        data = proposal_data.to_dict()
        return {
            "extracted_data": data.get("extracted_data"),
            "extracted_at": data.get("extracted_at"),
            "manually_corrected": data.get("manually_corrected", False),
            "raw_extraction": data.get("raw_extraction"),
            "field_assessments": data.get("field_assessments"),
            "overall_confidence": data.get("overall_confidence"),
            "needs_review": data.get("needs_review", False),
            "needs_review_fields": data.get("needs_review_fields", []),
            "provider_rule_hits": data.get("provider_rule_hits", []),
            "last_manual_correction": data.get("last_manual_correction"),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get extracted data error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении данных: {str(e)}")

# --- 4.86. Proposal Builder: Simulation CRUD Endpoints ---

@app.post("/api/applications/{application_id}/proposal/simulations", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def create_simulation(application_id: str, input_data: SimulationInput):
    """Создание симуляции тарифа от поставщика."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        app_data = doc.to_dict()
        
        # Получаем текущую стоимость для расчета экономии
        proposal_data_ref = doc_ref.collection("proposal_data").document("data")
        proposal_data = proposal_data_ref.get()
        current_cost = None
        if proposal_data.exists:
            extracted = proposal_data.to_dict().get("extracted_data", {})
            current_cost = get_extracted_monthly_base(extracted)
        
        savings_monthly = None
        savings_percent = None
        if current_cost and current_cost > 0 and input_data.new_monthly_cost_eur is not None:
            savings_monthly = round(current_cost - input_data.new_monthly_cost_eur, 2)
            savings_percent = round((savings_monthly / current_cost) * 100, 1)
        
        sim_data = input_data.model_dump()
        sim_data["savings_monthly_eur"] = savings_monthly
        sim_data["savings_percent"] = savings_percent
        sim_data["created_at"] = datetime.datetime.utcnow()
        sim_data["updated_at"] = datetime.datetime.utcnow()
        
        sim_ref = doc_ref.collection("proposal_simulations").document()
        sim_ref.set(sim_data)
        
        create_timeline_event_internal(
            application_id=application_id,
            content=f"Создана симуляция.\n{_format_simulation_summary(sim_data)}",
            event_type=EventType.NOTE,
            created_by="System"
        )
        
        return {"success": True, "simulation_id": sim_ref.id, "savings_monthly_eur": savings_monthly, "savings_percent": savings_percent}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Create simulation error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при создании симуляции: {str(e)}")


@app.get("/api/applications/{application_id}/proposal/simulations", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def list_simulations(application_id: str):
    """Список симуляций для заявки."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        sims = doc_ref.collection("proposal_simulations").order_by("created_at", direction="DESCENDING").stream()
        results = []
        for sim in sims:
            data = sim.to_dict()
            data["id"] = sim.id
            results.append(data)
        
        return {"success": True, "simulations": results}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"List simulations error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении симуляций: {str(e)}")


@app.put("/api/applications/{application_id}/proposal/simulations/{simulation_id}", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def update_simulation(application_id: str, simulation_id: str, update_data: SimulationUpdate):
    """Редактирование симуляции."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        sim_ref = doc_ref.collection("proposal_simulations").document(simulation_id)
        sim = sim_ref.get()
        if not sim.exists:
            raise HTTPException(status_code=404, detail="Симуляция не найдена.")
        
        sim_data = sim.to_dict()
        updates = {k: v for k, v in update_data.model_dump().items() if v is not None}
        
        # Пересчитываем экономию если изменилась стоимость
        if "new_monthly_cost_eur" in updates:
            proposal_data_ref = doc_ref.collection("proposal_data").document("data")
            proposal_data = proposal_data_ref.get()
            current_cost = None
            if proposal_data.exists:
                extracted = proposal_data.to_dict().get("extracted_data", {})
                current_cost = get_extracted_monthly_base(extracted)
            
            new_cost = updates["new_monthly_cost_eur"]
            if current_cost and current_cost > 0:
                updates["savings_monthly_eur"] = round(current_cost - new_cost, 2)
                updates["savings_percent"] = round(((current_cost - new_cost) / current_cost) * 100, 1)
        
        updates["updated_at"] = datetime.datetime.utcnow()
        sim_ref.update(updates)

        create_timeline_event_internal(
            application_id=application_id,
            content=(
                "Симуляция обновлена.\n"
                f"{_format_simulation_summary({**sim_data, **updates})}"
            ),
            event_type=EventType.NOTE,
            created_by="Operator"
        )
        
        return {"success": True, "message": "Симуляция обновлена."}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Update simulation error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при обновлении симуляции: {str(e)}")


@app.delete("/api/applications/{application_id}/proposal/simulations/{simulation_id}", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def delete_simulation(application_id: str, simulation_id: str):
    """Удаление симуляции."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        sim_ref = doc_ref.collection("proposal_simulations").document(simulation_id)
        sim = sim_ref.get()
        if not sim.exists:
            raise HTTPException(status_code=404, detail="Симуляция не найдена.")
        
        sim_data = sim.to_dict() or {}
        sim_ref.delete()

        create_timeline_event_internal(
            application_id=application_id,
            content=(
                "Симуляция удалена.\n"
                f"{_format_simulation_summary(sim_data)}"
            ),
            event_type=EventType.NOTE,
            created_by="Operator"
        )
        
        return {"success": True, "message": "Симуляция удалена."}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete simulation error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при удалении симуляции: {str(e)}")


@app.post("/api/applications/{application_id}/proposal/simulations/{simulation_id}/select", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def select_simulation(application_id: str, simulation_id: str):
    """Выбор симуляции как финальной для КП. Только одна может быть выбрана."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        sim_ref = doc_ref.collection("proposal_simulations").document(simulation_id)
        sim = sim_ref.get()
        if not sim.exists:
            raise HTTPException(status_code=404, detail="Симуляция не найдена.")
        
        sim_data = sim.to_dict()
        sim_name = sim_data.get("simulation_name", "")
        
        # Снимаем выбор со всех симуляций
        all_sims = doc_ref.collection("proposal_simulations").stream()
        for s in all_sims:
            s.reference.update({"is_selected": False, "updated_at": datetime.datetime.utcnow()})
        
        # Ставим выбор на текущую
        sim_ref.update({"is_selected": True, "updated_at": datetime.datetime.utcnow()})
        
        create_timeline_event_internal(
            application_id=application_id,
            content=f"Выбрана симуляция для КП.\n{_format_simulation_summary(sim_data)}",
            event_type=EventType.NOTE,
            created_by="System"
        )
        
        return {"success": True, "message": "Симуляция выбрана."}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Select simulation error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при выборе симуляции: {str(e)}")

# --- 4.875. Proposal Builder: Auto-Create Simulation (Eni Plenitude) ---

# Firestore-backed task store for auto-simulation tasks.
def _task_doc_ref(application_id: str, task_id: str):
    return firestore_client.collection(FIRESTORE_COLLECTION).document(application_id).collection("auto_simulation_tasks").document(task_id)

def _get_task_status(application_id: str, task_id: str) -> dict | None:
    doc = _task_doc_ref(application_id, task_id).get()
    if doc.exists:
        return doc.to_dict()
    return None


def _get_latest_task_status(application_id: str) -> dict | None:
    tasks = (
        firestore_client.collection(FIRESTORE_COLLECTION)
        .document(application_id)
        .collection("auto_simulation_tasks")
        .order_by("updated_at", direction=firestore.Query.DESCENDING)
        .limit(1)
        .stream()
    )
    for task in tasks:
        data = task.to_dict()
        data["task_id"] = data.get("task_id") or task.id
        return data
    return None


def _set_task_status(application_id: str, task_id: str, status: dict):
    _task_doc_ref(application_id, task_id).set(status, merge=True)

def _start_eni_simulation_job(application_id: str, task_id: str, data: AutoCreateSimulationRequest) -> str:
    """Запускает Cloud Run Job для автоматической симуляции Eni."""
    project = "entraycompara"
    region = "europe-west1"
    job_name = "eni-simulation-runner"

    # Получаем access token из metadata server (Cloud Run default service account)
    token_resp = requests.get(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
        timeout=5
    )
    token_resp.raise_for_status()
    token = token_resp.json()["access_token"]

    url = f"https://{region}-run.googleapis.com/v2/projects/{project}/locations/{region}/jobs/{job_name}:run"

    payload = {
        "overrides": {
            "containerOverrides": [{
                "env": [
                    {"name": "APPLICATION_ID", "value": application_id},
                    {"name": "TASK_ID", "value": task_id},
                    {"name": "CUPS", "value": data.cups},
                    {"name": "CLIENT_TYPE", "value": data.client_type or "Hogar"},
                    {"name": "ACCESS_TARIFF", "value": data.access_tariff or ""},
                    {"name": "BILLED_POWER_P1", "value": str(data.billed_power_p1 or "")},
                    {"name": "BILLED_POWER_P2", "value": str(data.billed_power_p2 or "")},
                    {"name": "CONSUMPTION_P1", "value": str(data.consumption_p1 or "")},
                    {"name": "CONSUMPTION_P2", "value": str(data.consumption_p2 or "")},
                    {"name": "CONSUMPTION_P3", "value": str(data.consumption_p3 or "")},
                    {"name": "EQUIPMENT_RENTAL", "value": str(data.equipment_rental or "")},
                    {"name": "INVOICE_AMOUNT_WITH_VAT", "value": str(data.invoice_amount_with_vat or "")},
                    {"name": "RETAILER", "value": data.retailer or ""},
                    {"name": "START_DATE", "value": data.start_date or ""},
                    {"name": "END_DATE", "value": data.end_date or ""},
                ],
            }]
        }
    }

    resp = requests.post(url, json=payload, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }, timeout=30)

    if resp.status_code not in (200, 202):
        raise Exception(f"Failed to start job: {resp.status_code} {resp.text}")

    return resp.json().get("name", "unknown")


@app.post("/api/applications/{application_id}/proposal/simulations/auto-create", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def auto_create_simulation(application_id: str, request: AutoCreateSimulationRequest):
    """Запускает автоматическое создание симуляции на Eni Plenitude. Возвращает task_id."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        if not request.cups:
            raise HTTPException(status_code=400, detail="CUPS обязателен для автоматической симуляции.")

        task_id = f"auto-sim-{uuid.uuid4().hex[:12]}"

        # Создаём документ задачи в Firestore
        _set_task_status(application_id, task_id, {
            "status": "pending",
            "message": "Ожидание запуска...",
            "simulation_id": None,
            "simulation_file_url": None,
            "error": None,
            "created_at": datetime.datetime.utcnow(),
            "updated_at": datetime.datetime.utcnow(),
        })

        # Запускаем Cloud Run Job
        _start_eni_simulation_job(application_id, task_id, request)

        create_timeline_event_internal(
            application_id=application_id,
            content=(
                "Запущена автоматическая симуляция Eni.\n"
                f"CUPS: {request.cups}\n"
                f"Коммерциализатор: {request.retailer or 'Не указан'}\n"
                f"Тариф доступа: {request.access_tariff or 'Не указан'}"
            ),
            event_type=EventType.NOTE,
            created_by="Operator"
        )

        return {
            "success": True,
            "task_id": task_id,
            "message": "Автоматическая симуляция запущена. Ожидайте ~3 минуты.",
            "status": "pending",
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Auto-create simulation error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при запуске автосимуляции: {str(e)}")


@app.get("/api/applications/{application_id}/proposal/simulations/auto-create/{task_id}/status", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def get_auto_simulation_status(application_id: str, task_id: str):
    """Проверяет статус автоматической симуляции."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        if not doc_ref.get().exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        task = _get_task_status(application_id, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена.")

        return {
            "success": True,
            "task_id": task_id,
            "status": task.get("status"),
            "message": task.get("message"),
            "step_key": task.get("step_key"),
            "step_label": task.get("step_label"),
            "step_details": task.get("step_details"),
            "progress_percent": task.get("progress_percent"),
            "tariff_selection_deadline": task.get("tariff_selection_deadline"),
            "simulation_id": task.get("simulation_id"),
            "simulation_file_url": task.get("simulation_file_url"),
            "error": task.get("error"),
            "tariffs": task.get("tariffs"),
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Get task status error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении статуса: {str(e)}")


@app.get("/api/applications/{application_id}/proposal/simulations/auto-create/latest-task", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def get_latest_auto_simulation_status(application_id: str):
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        if not doc_ref.get().exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")

        task = _get_latest_task_status(application_id)
        if not task:
            return {"success": True, "task": None}

        return {
            "success": True,
            "task": {
                "task_id": task.get("task_id"),
                "status": task.get("status"),
                "message": task.get("message"),
                "step_key": task.get("step_key"),
                "step_label": task.get("step_label"),
                "step_details": task.get("step_details"),
                "progress_percent": task.get("progress_percent"),
                "tariff_selection_deadline": task.get("tariff_selection_deadline"),
                "simulation_id": task.get("simulation_id"),
                "simulation_file_url": task.get("simulation_file_url"),
                "error": task.get("error"),
                "tariffs": task.get("tariffs"),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Get latest auto task status error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении последней автосимуляции: {str(e)}")


@app.post("/api/applications/{application_id}/proposal/simulations/auto-create/{task_id}/select-tariff", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def select_tariff_for_auto_simulation(application_id: str, task_id: str, body: dict = Body(...)):
    """Менеджер выбирает тариф для продолжения автосимуляции."""
    try:
        selected_index = body.get("selected_tariff_index")
        if selected_index is None:
            raise HTTPException(status_code=400, detail="selected_tariff_index обязателен.")

        task = _get_task_status(application_id, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена.")

        if task.get("status") != "awaiting_tariff_selection":
            raise HTTPException(status_code=400, detail=f"Некорректный статус задачи: {task.get('status')}")

        _set_task_status(application_id, task_id, {
            "status": "running",
            "selected_tariff_index": selected_index,
            "message": f"Выбран тариф #{selected_index + 1}. Продолжаем симуляцию...",
            "step_key": "apply_selected_tariff",
            "step_label": "Применяем выбранный тариф",
            "step_details": f"Передали в Eni тариф #{selected_index + 1}.",
            "progress_percent": 88,
            "tariff_selection_deadline": firestore.DELETE_FIELD,
            "tariffs": firestore.DELETE_FIELD,
            "updated_at": datetime.datetime.utcnow(),
        })

        return {"success": True, "message": "Тариф выбран, симуляция продолжается."}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Select tariff error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при выборе тарифа: {str(e)}")


# --- 4.87. Proposal Builder: PDF Generation Endpoints ---

# PDF Texts by language
PROPOSAL_PDF_TEXTS = {
    "es": {
        "title": "Propuesta personalizada para reducir su factura eléctrica sin coste ni gestiones",
        "greeting": "Estimada",
        "current_situation": "Su situación actual",
        "our_proposal": "Nuestra propuesta",
        "savings": "Su ahorro",
        "contact_block_title": "Contacto EntrayCompara",
        "contact_email_label": "Email",
        "contact_phone_label": "Teléfono",
        "contact_site_label": "Web",
        "contact_social_label": "Redes",
        "summary_title": "Resumen de ahorro",
        "summary_subtitle": "Le presentamos una alternativa pensada para reducir su factura eléctrica de forma clara, segura y sin complicaciones.",
        "proposal_subtitle": "Comparativa entre su situación actual y la alternativa recomendada.",
        "current_plan": "Tarifa actual",
        "recommended_plan": "Tarifa recomendada",
        "annual_savings": "Ahorro anual estimado",
        "next_steps_subtitle": "Le acompañamos en todo el cambio, sin coste para usted.",
        "step1_title": "1. Confirmación",
        "step1_desc": "Confirme que desea seguir adelante con el cambio a la nueva tarifa.",
        "step2_title": "2. Gestión del cambio",
        "step2_desc": "Nuestro equipo prepara y envía toda la documentación a la comercializadora.",
        "step3_title": "3. Activación y ahorro",
        "step3_desc": "Se activa la nueva tarifa y empieza a ahorrar desde las siguientes facturas.",
        "intro_paragraph": "Hemos analizado su factura actual y detectado una alternativa que puede ayudarle a reducir su gasto en electricidad sin coste adicional y sin que tenga que ocuparse de la gestión.\n\nLa propuesta se ha preparado a partir de los datos de su suministro actual y está enfocada en un objetivo muy claro: pagar menos con un proceso de cambio sencillo, acompañado y transparente.",
        "estimated_savings": "Ahorro estimado",
        "monthly_reduction": "Menor coste mensual",
        "current_provider_label": "Proveedor actual",
        "recommended_provider_label": "Proveedor recomendado",
        "contracted_power": "Potencia contratada",
        "average_monthly_consumption": "Consumo medio mensual",
        "cups_label": "Nº de contrato (CUPS)",
        "monthly_savings": "Ahorro mensual",
        "savings_percentage": "Ahorro porcentual",
        "proposal_disclaimer_title": "Cierre legal breve",
        "proposal_disclaimer": "Esta propuesta es orientativa y se basa en los datos de consumo facilitados. El ahorro real puede variar según el consumo efectivo, las condiciones del suministro y la evolución de la tarifa aplicable.\n\nEntraycompara actúa como intermediario independiente y el servicio no tiene coste para el cliente.",
        "per_month": "al mes",
        "per_year": "al año",
        "next_steps": "Próximos pasos",
        "step1": "1. Confirme su interés respondiendo a este mensaje.",
        "step2": "2. Nosotros gestionamos todo el trámite de cambio GRATIS.",
        "step3": "3. Comience a ahorrar desde el primer mes.",
        "footer": "Entraycompara — Ahorro en suministros de energía en España",
        "contact": "Contacto",
        "provider": "Proveedor",
        "tariff": "Tarifa",
        "monthly_cost": "Coste mensual",
        "period_cost": "Coste del período",
        "contract_end": "Fin de contrato",
        "billing_period": "Período facturado",
        "power": "Potencia",
        "consumption": "Consumo medio",
        "contract_num": "Nº contrato",
        "service": "Servicio",
        "date": "Fecha",
        "proposal_id": "Propuesta",
        "free_service": "Servicio 100% gratuito para usted",
    },
    "ru": {
        "title": "Коммерческое предложение",
        "greeting": "Уважаемый(ая)",
        "current_situation": "Ваша текущая ситуация",
        "our_proposal": "Наше предложение",
        "savings": "Ваша экономия",
        "contact_block_title": "Контакты EntrayCompara",
        "contact_email_label": "Email",
        "contact_phone_label": "Телефон",
        "contact_site_label": "Сайт",
        "contact_social_label": "Соцсети",
        "summary_title": "Сводка по экономии",
        "summary_subtitle": "Наглядное сравнение текущего тарифа и рекомендованного предложения.",
        "proposal_subtitle": "Сравнение вашей текущей ситуации и рекомендованной альтернативы.",
        "current_plan": "Текущий тариф",
        "recommended_plan": "Рекомендуемый тариф",
        "annual_savings": "Ожидаемая экономия в год",
        "next_steps_subtitle": "Мы сопровождаем весь переход и берём оформление на себя.",
        "step1_title": "1. Подтверждение",
        "step1_desc": "Подтвердите в WhatsApp или по email, что хотите перейти на новый тариф.",
        "step2_title": "2. Оформление смены",
        "step2_desc": "Наша команда подготовит и передаст документы новому поставщику.",
        "step3_title": "3. Активация и экономия",
        "step3_desc": "Новый тариф активируется, и вы начинаете экономить уже с ближайших счетов.",
        "intro_paragraph": "Мы проанализировали вашу текущую ситуацию по энергоснабжению и подготовили персональное предложение, которое позволит сократить расходы без дополнительных затрат и сложностей с вашей стороны.",
        "estimated_savings": "Ожидаемая экономия",
        "monthly_reduction": "Снижение ежемесячной стоимости",
        "current_provider_label": "Текущий поставщик",
        "recommended_provider_label": "Рекомендуемый поставщик",
        "contracted_power": "Подключённая мощность",
        "average_monthly_consumption": "Среднее месячное потребление",
        "cups_label": "№ договора (CUPS)",
        "monthly_savings": "Экономия в месяц",
        "savings_percentage": "Экономия в процентах",
        "proposal_disclaimer_title": "Краткое юридическое примечание",
        "proposal_disclaimer": "Это предложение носит ориентировочный характер и основано на предоставленных данных о потреблении. Фактическая экономия может отличаться в зависимости от реального потребления, условий снабжения и изменения применяемого тарифа.\n\nEntraycompara действует как независимый посредник, и сервис не имеет стоимости для клиента.",
        "per_month": "в месяц",
        "per_year": "в год",
        "next_steps": "Следующие шаги",
        "step1": "1. Подтвердите интерес, ответив на это сообщение.",
        "step2": "2. Мы бесплатно оформим все документы на переход.",
        "step3": "3. Начните экономить с первого месяца.",
        "footer": "Entraycompara — Экономия на коммунальных услугах в Испании",
        "contact": "Контакты",
        "provider": "Поставщик",
        "tariff": "Тариф",
        "monthly_cost": "Ежемесячная стоимость",
        "period_cost": "Стоимость за период",
        "contract_end": "Окончание договора",
        "billing_period": "Период счёта",
        "power": "Мощность",
        "consumption": "Среднее потребление",
        "contract_num": "№ договора",
        "service": "Услуга",
        "date": "Дата",
        "proposal_id": "Предложение",
        "free_service": "Услуга 100% бесплатна для вас",
    },
    "uk": {
        "title": "Комерційна пропозиція",
        "greeting": "Шановний(а)",
        "current_situation": "Ваша поточна ситуація",
        "our_proposal": "Наша пропозиція",
        "savings": "Ваша економія",
        "contact_block_title": "Контакти EntrayCompara",
        "contact_email_label": "Email",
        "contact_phone_label": "Телефон",
        "contact_site_label": "Сайт",
        "contact_social_label": "Соцмережі",
        "summary_title": "Підсумок економії",
        "summary_subtitle": "Зрозуміле порівняння поточного тарифу та рекомендованої пропозиції.",
        "proposal_subtitle": "Порівняння вашої поточної ситуації та рекомендованої альтернативи.",
        "current_plan": "Поточний тариф",
        "recommended_plan": "Рекомендований тариф",
        "annual_savings": "Очікувана економія на рік",
        "next_steps_subtitle": "Ми супроводжуємо весь перехід і беремо оформлення на себе.",
        "step1_title": "1. Підтвердження",
        "step1_desc": "Підтвердіть у WhatsApp або email, що хочете перейти на новий тариф.",
        "step2_title": "2. Оформлення переходу",
        "step2_desc": "Наша команда підготує та передасть документи новому постачальнику.",
        "step3_title": "3. Активація та економія",
        "step3_desc": "Новий тариф активується, і ви починаєте економити вже з наступних рахунків.",
        "intro_paragraph": "Ми проаналізували вашу поточну енергетичну ситуацію та підготували персональну пропозицію, яка допоможе зменшити рахунки без додаткових витрат і складних дій з вашого боку.",
        "estimated_savings": "Очікувана економія",
        "monthly_reduction": "Зменшення щомісячної вартості",
        "current_provider_label": "Поточний постачальник",
        "recommended_provider_label": "Рекомендований постачальник",
        "contracted_power": "Підключена потужність",
        "average_monthly_consumption": "Середнє місячне споживання",
        "cups_label": "№ договору (CUPS)",
        "monthly_savings": "Економія на місяць",
        "savings_percentage": "Економія у відсотках",
        "proposal_disclaimer_title": "Коротке юридичне застереження",
        "proposal_disclaimer": "Ця пропозиція має орієнтовний характер і базується на наданих даних про споживання. Реальна економія може відрізнятися залежно від фактичного споживання, умов постачання та зміни застосовного тарифу.\n\nEntraycompara діє як незалежний посередник, і сервіс не має вартості для клієнта.",
        "per_month": "на місяць",
        "per_year": "на рік",
        "next_steps": "Наступні кроки",
        "step1": "1. Підтвердіть інтерес, відповівши на це повідомлення.",
        "step2": "2. Ми безкоштовно оформимо всі документи на перехід.",
        "step3": "3. Почніть економити з першого місяця.",
        "footer": "Entraycompara — Економія на комунальних послугах в Іспанії",
        "contact": "Контакти",
        "provider": "Постачальник",
        "tariff": "Тариф",
        "monthly_cost": "Щомісячна вартість",
        "period_cost": "Вартість за період",
        "contract_end": "Закінчення договору",
        "billing_period": "Період рахунку",
        "power": "Потужність",
        "consumption": "Середнє споживання",
        "contract_num": "№ договору",
        "service": "Послуга",
        "date": "Дата",
        "proposal_id": "Пропозиція",
        "free_service": "Послуга 100% безкоштовна для вас",
    },
    "eu": {
        "title": "Eskaintza Komertziala",
        "greeting": "Agur",
        "current_situation": "Zure egoera oraingoa",
        "our_proposal": "Gure eskaintza",
        "savings": "Zure aurrezkia",
        "contact_block_title": "EntrayCompara kontaktua",
        "contact_email_label": "Emaila",
        "contact_phone_label": "Telefonoa",
        "contact_site_label": "Webgunea",
        "contact_social_label": "Sareak",
        "summary_title": "Aurrezkiaren laburpena",
        "summary_subtitle": "Zure uneko tarifaren eta gomendatutako proposamenaren arteko alderaketa argia.",
        "proposal_subtitle": "Zure egungo egoeraren eta gomendatutako aukeraren arteko alderaketa.",
        "current_plan": "Uneko tarifa",
        "recommended_plan": "Gomendatutako tarifa",
        "annual_savings": "Urteko aurrezki estimatua",
        "next_steps_subtitle": "Aldaketa osoan laguntzen dizugu, zuretzat kosturik gabe.",
        "step1_title": "1. Baieztapena",
        "step1_desc": "WhatsApp edo email bidez baieztatu tarifa berrira aldatu nahi duzula.",
        "step2_title": "2. Aldaketaren kudeaketa",
        "step2_desc": "Gure taldeak dokumentazio guztia prestatuko eta hornitzaile berriari bidaliko dio.",
        "step3_title": "3. Aktibazioa eta aurrezkia",
        "step3_desc": "Tarifa berria aktibatzen da eta hurrengo fakturetatik aurrezten hasten zara.",
        "intro_paragraph": "Zure egungo energia-egoera aztertu dugu eta proposamen pertsonalizatua prestatu dugu, zure faktura elektrikoa murrizteko kudeaketarik edo kosturik gabe.",
        "estimated_savings": "Aurrezki estimatua",
        "monthly_reduction": "Hileko kostu txikiagoa",
        "current_provider_label": "Uneko hornitzailea",
        "recommended_provider_label": "Gomendatutako hornitzailea",
        "contracted_power": "Kontratatutako potentzia",
        "average_monthly_consumption": "Hileko batez besteko kontsumoa",
        "cups_label": "Kontratu zk. (CUPS)",
        "monthly_savings": "Hileko aurrezkia",
        "savings_percentage": "Aurrezki portzentuala",
        "proposal_disclaimer_title": "Legezko ohar laburra",
        "proposal_disclaimer": "Proposamen hau orientagarria da eta emandako kontsumo-datuetan oinarritzen da. Benetako aurrezkia aldatu daiteke benetako kontsumoaren, horniduraren baldintzen eta aplikatu beharreko tarifaren bilakaeraren arabera.\n\nEntraycompara bitartekari independente gisa jarduten du, eta zerbitzuak ez du kosturik bezeroarentzat.",
        "per_month": "hilean",
        "per_year": "urtean",
        "next_steps": "Hurrengo pausoak",
        "step1": "1. Baieztatu interesa mezu honi erantzunez.",
        "step2": "2. Doan kudeatuko dugu aldaketa guztia.",
        "step3": "3. Hasi aurrezten lehen hilabetetik.",
        "footer": "Entraycompara — Aurrezkiak energia-horniduetan Espainian",
        "contact": "Kontaktua",
        "provider": "Hornitzailea",
        "tariff": "Tarifa",
        "monthly_cost": "Hileko kostua",
        "period_cost": "Aldiko kostua",
        "contract_end": "Kontratuaren amaiera",
        "billing_period": "Fakturatutako aldia",
        "power": "Potentzia",
        "consumption": "Kontsumo batez bestekoa",
        "contract_num": "Kontratu zk.",
        "service": "Zerbitzua",
        "date": "Data",
        "proposal_id": "Eskaintza",
        "free_service": "Zerbitzua %100 doakoa da zuretzat",
    }
}

COMPANY_CONTACTS = {
    "email": "info@entraycompara.com",
    "phone": "+34 611 97 49 84",
    "website": "entraycompara.com",
    "social": "@entraycompara",
}

def generate_proposal_pdf(application: dict, extracted_data: dict, simulation: dict, language: str = "es") -> bytes:
    """Генерирует PDF коммерческого предложения на фирменном бланке."""
    from fpdf import FPDF
    import fpdf
    
    texts = PROPOSAL_PDF_TEXTS.get(language, PROPOSAL_PDF_TEXTS["es"])
    proposal_comment = (application.get("proposal_comment") or "").strip()
    whatsapp_cta_labels = {
        "es": "Confirmo el cambio de tarifa",
        "ru": "Подтверждаю смену тарифа",
        "uk": "Підтверджую зміну тарифу",
        "eu": "Tarifa aldaketa berresten dut",
    }
    proposal_footer_cta_labels = {
        "es": "Confirmar y continuar el cambio a una tarifa mejor",
        "ru": "Подтвердить и продолжить переход на выгодный тариф",
        "uk": "Підтвердити та продовжити перехід на вигідний тариф",
        "eu": "Berretsi eta tarifa hobe batera aldatzen jarraitu",
    }
    whatsapp_prefill_messages = {
        "es": "Hola, confirmo que quiero iniciar el cambio a la nueva tarifa.",
        "ru": "Здравствуйте, подтверждаю, что хочу начать переход на новый тариф.",
        "uk": "Доброго дня, підтверджую, що хочу розпочати перехід на новий тариф.",
        "eu": "Kaixo, tarifa berrira aldatzeko prozesua hasi nahi dudala berresten dut.",
    }
    whatsapp_message = whatsapp_prefill_messages.get(language, whatsapp_prefill_messages["es"])
    whatsapp_digits = re.sub(r"\D", "", COMPANY_CONTACTS["phone"])
    if whatsapp_digits.startswith("00"):
        whatsapp_digits = whatsapp_digits[2:]
    application["proposal_whatsapp_link"] = f"https://wa.me/{whatsapp_digits}?text={requests.utils.quote(whatsapp_message)}"
    
    # Находим шрифты fpdf2 / локальные fallback-шрифты проекта
    fpdf_dir = os.path.dirname(fpdf.__file__)
    font_dir = os.path.join(fpdf_dir, "font")
    dejavu_regular = os.path.join(font_dir, "DejaVuSans.ttf")
    dejavu_bold = os.path.join(font_dir, "DejaVuSans-Bold.ttf")
    
    # Fallback если нет во встроенной папке fpdf2
    if not os.path.exists(dejavu_regular):
        dejavu_regular = os.path.join(fpdf_dir, "fonts", "DejaVuSans.ttf")
        dejavu_bold = os.path.join(fpdf_dir, "fonts", "DejaVuSans-Bold.ttf")

    # Последний fallback: локальная папка шрифтов проекта
    local_font_dir = os.path.join(os.path.dirname(__file__), "fonts")
    if not os.path.exists(dejavu_regular):
        dejavu_regular = os.path.join(local_font_dir, "DejaVuSans.ttf")
    if not os.path.exists(dejavu_bold):
        dejavu_bold = os.path.join(local_font_dir, "DejaVuSans-Bold.ttf")

    has_regular_font = os.path.exists(dejavu_regular)
    has_bold_font = os.path.exists(dejavu_bold)

    def font_style(style: str = "") -> str:
        if style == "B" and not has_bold_font:
            return ""
        return style
    
    class ProposalPDF(FPDF):
        def rounded_rect(self, x, y, w, h, r, style=""):
            op = {"F": "f", "FD": "B", "DF": "B"}.get(style, "S")
            k = self.k
            hp = self.h
            my_arc = 4 / 3 * (2**0.5 - 1) * r
            self._out(f"{(x + r) * k:.2f} {(hp - y) * k:.2f} m")
            self._out(f"{(x + w - r) * k:.2f} {(hp - y) * k:.2f} l")
            self._arc(x + w - r + my_arc, y, x + w, y + r - my_arc, x + w, y + r)
            self._out(f"{(x + w) * k:.2f} {(hp - (y + h - r)) * k:.2f} l")
            self._arc(x + w, y + h - r + my_arc, x + w - r + my_arc, y + h, x + w - r, y + h)
            self._out(f"{(x + r) * k:.2f} {(hp - (y + h)) * k:.2f} l")
            self._arc(x + r - my_arc, y + h, x, y + h - r + my_arc, x, y + h - r)
            self._out(f"{x * k:.2f} {(hp - (y + r)) * k:.2f} l")
            self._arc(x, y + r - my_arc, x + r - my_arc, y, x + r, y)
            self._out(op)

        def _arc(self, x1, y1, x2, y2, x3, y3):
            h = self.h
            k = self.k
            self._out(
                f"{x1 * k:.2f} {(h - y1) * k:.2f} "
                f"{x2 * k:.2f} {(h - y2) * k:.2f} "
                f"{x3 * k:.2f} {(h - y3) * k:.2f} c"
            )

        def header(self):
            self.set_fill_color(11, 95, 255)
            header_h = 17
            self.rect(0, 0, 210, header_h, style="F")

            self.set_text_color(255, 255, 255)
            self.set_font("DejaVu", font_style("B"), 12.5)
            self.set_xy(15, 3.3)
            self.cell(0, 4.8, "Entra y Compara", ln=False)

            self.set_xy(15, 9.0)
            self.set_text_color(219, 234, 254)
            self.set_font("DejaVu", font_style(), 5.9)
            self.cell(72, 2.9, texts["free_service"], ln=False)

            self.set_text_color(255, 255, 255)
            self.set_font("DejaVu", font_style("B"), 12.5)
            today = datetime.datetime.now().strftime("%d.%m.%Y")
            self.set_xy(132, 3.3)
            self.cell(63, 4.8, COMPANY_CONTACTS["phone"], align="R", ln=True)

            self.set_text_color(219, 234, 254)
            self.set_xy(132, 9.0)
            self.set_font("DejaVu", font_style(), 5.9)
            self.cell(63, 2.9, f"{texts['date']}: {today}", align="R", ln=True)

            cta_text = whatsapp_cta_labels.get(language, whatsapp_cta_labels["es"])
            cta_link = application.get("proposal_whatsapp_link", "")
            button_w = 66
            button_h = 6.8
            button_x = (210 - button_w) / 2
            button_y = (header_h - button_h) / 2
            self.set_fill_color(37, 211, 102)
            self.rounded_rect(button_x, button_y, button_w, button_h, 2.7, style="F")
            if cta_link:
                self.link(button_x, button_y, button_w, button_h, cta_link)
            self.set_xy(button_x, button_y + 1.45)
            self.set_text_color(255, 255, 255)
            self.set_font("DejaVu", font_style("B"), 6.2)
            self.cell(button_w, 3.2, cta_text, align="C", ln=False, link=cta_link or None)
            self.set_y(header_h + 2)
        
        def footer(self):
            self.set_y(-16)
            self.set_draw_color(226, 232, 240)
            self.line(15, self.get_y(), 195, self.get_y())
            self.set_y(-12)
            self.set_text_color(100, 116, 139)
            self.set_font("DejaVu", font_style(), 8)
            self.set_x(15)
            self.cell(110, 5, texts["footer"], ln=False)
            self.cell(70, 5, COMPANY_CONTACTS["website"], align="R", ln=False)
    
    pdf = ProposalPDF()
    if has_regular_font:
        pdf.add_font("DejaVu", "", dejavu_regular, uni=True)
    if has_bold_font:
        pdf.add_font("DejaVu", "B", dejavu_bold, uni=True)
    if not has_regular_font:
        raise RuntimeError("DejaVuSans.ttf not found for proposal PDF generation")
    pdf.set_auto_page_break(auto=True, margin=25)
    pdf.add_page()

    brand_blue = (11, 95, 255)
    brand_blue_dark = (8, 71, 194)
    brand_blue_light = (59, 130, 255)
    brand_green = (0, 200, 83)
    brand_green_dark = (0, 168, 68)
    brand_dark = (15, 23, 42)
    brand_secondary = (100, 116, 139)
    brand_muted = (148, 163, 184)
    brand_bg = (249, 250, 251)
    card_border = (226, 232, 240)
    page_left = 15
    page_right = 195
    content_w = 180
    gutter = 8
    half_w = 86
    card_h = 54
    section_gap = 8
    grid_step = 6
    confidential_labels = {
        "es": "CONFIDENCIAL PARA",
        "ru": "КОНФИДЕНЦИАЛЬНО ДЛЯ",
        "uk": "КОНФІДЕНЦІЙНО ДЛЯ",
        "eu": "KONFIDENTZIALA HONENTZAT",
    }
    comment_labels = {
        "es": "COMENTARIO DEL ASESOR",
        "ru": "КОММЕНТАРИЙ МЕНЕДЖЕРА",
        "uk": "КОМЕНТАР МЕНЕДЖЕРА",
        "eu": "AHOLKULARIAREN OHARRA",
    }
    service_labels = {
        "Electricity Comparison": {
            "es": "Comparación de electricidad",
            "ru": "Сравнение электричества",
            "uk": "Порівняння електроенергії",
            "eu": "Elektrizitate konparaketa",
        },
        "Gas Comparison": {
            "es": "Comparación de gas",
            "ru": "Сравнение газа",
            "uk": "Порівняння газу",
            "eu": "Gas konparaketa",
        },
    }

    def to_float(value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def fmt_money(value) -> str:
        if value is None or value == "":
            return "—"
        try:
            return f"€{float(value):.2f}"
        except (TypeError, ValueError):
            return str(value)

    def fmt_value(value) -> str:
        if value is None or value == "":
            return "—"
        return str(value)

    def format_client_name(value: str | None) -> str:
        if not value:
            return "—"
        parts = [part for part in str(value).strip().split() if part]
        if not parts:
            return "—"
        return " ".join(part[:1].upper() + part[1:].lower() for part in parts)

    def localize_service(value: str | None) -> str:
        if not value:
            return "—"
        localized = service_labels.get(value, {})
        return localized.get(language, value)

    def draw_section_title(title: str, subtitle: str | None = None):
        anchor_x = pdf.get_x()
        pdf.set_text_color(*brand_blue)
        pdf.set_font("DejaVu", font_style("B"), 15)
        pdf.cell(0, 8, title, ln=True)
        if subtitle:
            pdf.set_x(anchor_x)
            pdf.set_text_color(*brand_secondary)
            pdf.set_font("DejaVu", font_style(), 8.5)
            pdf.multi_cell(156, 4.6, subtitle)
        pdf.ln(2)

    def draw_floating_badge(x: float, y: float, w: float, title: str, font_size: float = 6.2):
        pdf.set_font("DejaVu", font_style("B"), font_size)
        badge_text = title.upper()
        badge_w = max(40, min(w - 16, pdf.get_string_width(badge_text) + 16))
        badge_h = 7
        badge_x = x + (w - badge_w) / 2
        pdf.set_fill_color(68, 133, 255)
        pdf.rounded_rect(badge_x, y - 3.5, badge_w, badge_h, 2, style="F")
        pdf.set_xy(badge_x, y - 1.5)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("DejaVu", font_style("B"), font_size)
        pdf.cell(badge_w, 2.5, badge_text, align="C", ln=False)

    def measure_info_card_content_height(rows: list[tuple[str, str]], width: float, columns: int = 1) -> float:
        rows_per_col = max(1, (len(rows) + columns - 1) // columns)
        inner_w = width - 16
        col_gap = 7
        col_w = inner_w if columns == 1 else (inner_w - col_gap * (columns - 1)) / columns
        row_gap = 2.4

        measured_rows: list[tuple[str, str, float]] = []
        for label, value in rows:
            value_text = fmt_value(value)
            value_h = estimate_text_height(value_text, col_w, 4.5, 8.5)
            measured_rows.append((label, value_text, 3.5 + value_h))

        col_heights = [0.0 for _ in range(columns)]
        for index, (_, _, row_h) in enumerate(measured_rows):
            col = min(columns - 1, index // rows_per_col)
            col_heights[col] += row_h
            if (index // rows_per_col) < rows_per_col - 1:
                col_heights[col] += row_gap

        return max(col_heights) if col_heights else 0

    def draw_info_card(
        x: float,
        y: float,
        w: float,
        h: float,
        title: str,
        rows: list[tuple[str, str]],
        columns: int = 1,
        highlight_rows: dict[str, tuple[int, int, int]] | None = None,
    ):
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(*brand_blue_light)
        pdf.rounded_rect(x, y, w, h, 3.2, style="DF")
        draw_floating_badge(x, y, w, title)

        rows_per_col = max(1, (len(rows) + columns - 1) // columns)
        inner_x = x + 8
        inner_w = w - 16
        col_gap = 7
        col_w = inner_w if columns == 1 else (inner_w - col_gap * (columns - 1)) / columns
        row_gap = 2.4
        content_h = measure_info_card_content_height(rows, w, columns)
        inner_pad = ((h - content_h) / 2) if content_h else 10.0
        inner_y = y + inner_pad
        col_y = [inner_y for _ in range(columns)]

        measured_rows: list[tuple[str, str]] = []
        for label, value in rows:
            measured_rows.append((label, fmt_value(value)))

        for index, (label, value_text) in enumerate(measured_rows):
            col = min(columns - 1, index // rows_per_col)
            current_x = inner_x + col * (col_w + col_gap)
            current_y = col_y[col]
            pdf.set_xy(current_x, current_y)
            pdf.set_text_color(*brand_muted)
            pdf.set_font("DejaVu", font_style("B"), 6.5)
            pdf.cell(col_w, 3.5, label.upper(), ln=True)
            pdf.set_x(current_x)
            highlight_color = (highlight_rows or {}).get(label)
            if highlight_color and value_text and value_text != "N/A":
                value_y = pdf.get_y() + 0.55
                value_w = min(col_w * 0.8, max(pdf.get_string_width(value_text) + 12.0, 28.0))
                pdf.set_fill_color(*highlight_color)
                pdf.rounded_rect(current_x, value_y, value_w, 6.2, 2.0, style="F")
                pdf.set_xy(current_x, value_y + 0.65)
                pdf.set_text_color(*brand_dark)
                pdf.set_font("DejaVu", font_style("B"), 8.5)
                pdf.cell(value_w, 4.5, value_text, align="C", ln=True)
                col_y[col] = value_y + 6.2 + row_gap
                continue
            pdf.set_text_color(*brand_dark)
            pdf.set_font("DejaVu", font_style(), 8.5)
            pdf.multi_cell(col_w, 4.5, value_text)
            col_y[col] = pdf.get_y() + row_gap

    def draw_metric_card(
        x: float,
        y: float,
        w: float,
        h: float,
        title: str,
        value: str,
        accent: tuple[int, int, int],
        subtitle: str | None = None,
        border_color: tuple[int, int, int] | None = None,
    ):
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(*(border_color or card_border))
        pdf.rounded_rect(x, y, w, h, 3.2, style="DF")
        pdf.set_xy(x + 10, y + 4.8)
        pdf.set_text_color(*brand_secondary)
        pdf.set_font("DejaVu", font_style("B"), 6.5)
        pdf.cell(w - 20, 3.5, title.upper(), ln=True)
        pdf.set_x(x + 10)
        pdf.set_text_color(*brand_dark)
        pdf.set_font("DejaVu", font_style("B"), 13)
        pdf.cell(w - 20, 6.4, value, ln=True)
        if subtitle:
            if subtitle.startswith("PERCENT::"):
                _, label, percent_value = subtitle.split("::", 2)
                pdf.set_x(x + 10)
                pdf.set_text_color(*brand_secondary)
                pdf.set_font("DejaVu", font_style("B"), 6.5)
                pdf.cell(w - 20, 3.2, label.upper(), ln=True)
                pdf.set_x(x + 10)
                pdf.set_text_color(*brand_dark)
                pdf.set_font("DejaVu", font_style("B"), 10.5)
                pdf.cell(w - 20, 4.8, percent_value, ln=True)
            else:
                pdf.set_x(x + 10)
                pdf.set_text_color(*brand_secondary)
                pdf.set_font("DejaVu", font_style(), 7.1)
                pdf.multi_cell(w - 20, 3.6, subtitle)

    def draw_savings_panel(x: float, y: float, w: float, h: float, value: str, percent_value: str):
        pdf.set_fill_color(*brand_blue)
        pdf.rounded_rect(x, y, w, h, 4, style="F")
        draw_floating_badge(x, y, w, texts["annual_savings"], font_size=6.1)
        pdf.set_xy(x + 8, y + 11.6)
        pdf.set_font("DejaVu", font_style("B"), 18.5)
        pdf.cell(w - 16, 8.2, value, align="C", ln=True)
        pdf.set_xy(x + 8, y + 24.8)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("DejaVu", font_style("B"), 8.7)
        pdf.cell(w - 16, 3.4, f"{texts['savings_percentage']}: {percent_value}", align="C", ln=True)

    def draw_client_banner(x: float, y: float, w: float, client_value: str):
        pdf.set_xy(x, y + 1)
        pdf.set_text_color(*brand_muted)
        pdf.set_font("DejaVu", font_style("B"), 7.6)
        pdf.cell(w, 5, f"{confidential_labels.get(language, confidential_labels['es'])} {format_client_name(client_value)}", ln=True)

    def draw_contact_band(x: float, y: float, w: float, h: float, rows: list[tuple[str, str]]):
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(*card_border)
        pdf.rounded_rect(x, y, w, h, 3.2, style="DF")
        col_gap = 8
        row_gap = 1
        col_w = (w - 16 - col_gap) / 2
        for idx, (label, value) in enumerate(rows):
            row = idx // 2
            col = idx % 2
            current_x = x + 8 + col * (col_w + col_gap)
            current_y = y + 4 + row * (7 + row_gap)
            pdf.set_xy(current_x, current_y)
            pdf.set_text_color(*brand_muted)
            pdf.set_font("DejaVu", font_style("B"), 6)
            pdf.cell(col_w, 3, label.upper(), ln=True)
            pdf.set_x(current_x)
            pdf.set_text_color(*brand_dark)
            pdf.set_font("DejaVu", font_style(), 7)
            pdf.cell(col_w, 3.6, fmt_value(value), ln=False)

    def draw_comment_band(x: float, y: float, w: float, h: float, text: str):
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(*brand_blue_light)
        pdf.rounded_rect(x, y, w, h, 3.2, style="DF")
        draw_floating_badge(x, y, w, comment_labels.get(language, comment_labels["es"]))
        pdf.set_xy(x + 8, y + 10)
        pdf.set_text_color(*brand_dark)
        pdf.set_font("DejaVu", font_style(), 7.25)
        pdf.multi_cell(w - 16, 3.7, text[:1800])

    def draw_legal_band(x: float, y: float, w: float, h: float, title: str, text: str):
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(*card_border)
        pdf.rounded_rect(x, y, w, h, 3.2, style="DF")
        draw_floating_badge(x, y, w, title)
        pdf.set_xy(x + 8, y + 10)
        pdf.set_text_color(*brand_secondary)
        pdf.set_font("DejaVu", font_style(), 6.5)
        pdf.multi_cell(w - 16, 3.4, text)

    def estimate_text_height(text: str, width: float, line_height: float, font_size: float) -> float:
        if not text:
            return 0
        current_family = pdf.font_family
        current_style = pdf.font_style
        current_size = pdf.font_size_pt
        try:
            pdf.set_font("DejaVu", font_style(), font_size)
            try:
                lines = pdf.multi_cell(width, line_height, text, split_only=True)
                line_count = max(1, len(lines))
            except TypeError:
                approx_chars = max(18, int(width * 1.7))
                wrapped = []
                for paragraph in text.splitlines() or [""]:
                    wrapped.extend(textwrap.wrap(paragraph, approx_chars) or [""])
                line_count = max(1, len(wrapped))
            return line_count * line_height
        finally:
            pdf.set_font(current_family or "DejaVu", current_style or "", current_size or 12)

    def draw_step_row(y: float, number: str, title: str, description: str):
        circle_x = 16
        card_x = 30
        card_w = 165
        card_h = 15
        clean_title = re.sub(r"^\d+\.\s*", "", title).strip()
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(*brand_blue)
        pdf.ellipse(circle_x, y + 2, 12, 12, style="D")
        pdf.set_xy(circle_x, y + 5)
        pdf.set_text_color(*brand_blue)
        pdf.set_font("DejaVu", font_style("B"), 9.5)
        pdf.cell(12, 4, number, align="C")
        pdf.set_fill_color(255, 255, 255)
        pdf.set_draw_color(*card_border)
        pdf.rounded_rect(card_x, y, card_w, card_h, 3, style="DF")
        pdf.set_xy(card_x + 10, y + 4)
        pdf.set_text_color(*brand_dark)
        pdf.set_font("DejaVu", font_style("B"), 7.8)
        pdf.cell(42, 3.8, clean_title, ln=False)
        description_x = card_x + 66

        pdf.set_xy(description_x, y + 3.8)
        pdf.set_text_color(*brand_secondary)
        pdf.set_font("DejaVu", font_style(), 6.7)
        pdf.multi_cell(card_x + card_w - description_x - 8, 3.2, description)

    def draw_full_width_cta(y: float):
        cta_text = proposal_footer_cta_labels.get(language, proposal_footer_cta_labels["es"])
        cta_link = application.get("proposal_whatsapp_link", "")
        cta_x = page_left + 8
        cta_w = content_w - 16
        cta_h = 11.5
        pdf.set_fill_color(37, 211, 102)
        pdf.rounded_rect(cta_x, y, cta_w, cta_h, 3.0, style="F")
        if cta_link:
            pdf.link(cta_x, y, cta_w, cta_h, cta_link)
        pdf.set_xy(cta_x, y + 3.1)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("DejaVu", font_style("B"), 8.4)
        pdf.cell(cta_w, 4.2, cta_text, align="C", ln=False, link=cta_link or None)

    def format_long_date(value: str | None) -> str:
        if not value or value == "N/A":
            return "N/A"
        try:
            date_obj = datetime.datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return value

        months = {
            "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
            "ru": ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
            "uk": ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
            "eu": ["urtarrila", "otsaila", "martxoa", "apirila", "maiatza", "ekaina", "uztaila", "abuztua", "iraila", "urria", "azaroa", "abendua"],
        }
        month_name = months.get(language, months["es"])[date_obj.month - 1]
        if language == "es":
            return f"{date_obj.day} de {month_name} de {date_obj.year}"
        return f"{date_obj.day} {month_name} {date_obj.year}"

    def parse_iso_date(value: str | None):
        if not value or value == "N/A":
            return None
        try:
            return datetime.datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return None

    def format_billing_period_value(days: int | None, period_savings_value) -> str:
        if not days:
            return "N/A"
        days_word = {
            "es": "días",
            "ru": "дней",
            "uk": "днів",
            "eu": "egun",
        }.get(language, "días")
        savings_prefix = {
            "es": "ahorro",
            "ru": "экономия",
            "uk": "економія",
            "eu": "aurrezkia",
        }.get(language, "ahorro")
        if period_savings_value is None:
            return f"{days} {days_word}"
        return f"{days} {days_word} · {savings_prefix} {fmt_money(period_savings_value)}"

    def format_days_only_value(days: int | None) -> str:
        if not days:
            return "N/A"
        days_word = {
            "es": "días",
            "ru": "дней",
            "uk": "днів",
            "eu": "egun",
        }.get(language, "días")
        return f"{days} {days_word}"

    client_name = format_client_name(application.get("client_name", ""))
    current_provider = extracted_data.get("current_provider") or extracted_data.get("retailer") or "N/A"
    current_tariff = extracted_data.get("current_tariff") or extracted_data.get("access_tariff") or "N/A"
    current_cost = get_extracted_current_cost(extracted_data)
    contract_end = extracted_data.get("contract_end_date") or extracted_data.get("end_date") or "N/A"
    power = format_power_value(extracted_data)
    consumption = format_consumption_value(extracted_data)
    contract_num = extracted_data.get("contract_number") or extracted_data.get("cups") or "N/A"
    service = localize_service(extracted_data.get("service_type") or application.get("service_type") or "N/A")
    
    new_provider = simulation.get("new_provider", "N/A")
    new_tariff = simulation.get("new_tariff") or "N/A"
    new_cost = simulation.get("new_monthly_cost_eur")
    duration = simulation.get("contract_duration_months")
    bonus = simulation.get("bonus_description")
    savings_monthly = simulation.get("savings_monthly_eur")
    savings_percent = simulation.get("savings_percent")

    current_cost_num = to_float(current_cost)
    new_cost_num = to_float(new_cost)
    invoice_total_num = to_float(extracted_data.get("invoice_amount_with_vat"))
    start_date_obj = parse_iso_date(extracted_data.get("start_date"))
    end_date_obj = parse_iso_date(extracted_data.get("end_date"))
    billing_days = to_float(simulation.get("billing_period_days"))
    billing_days = int(billing_days) if billing_days is not None else None
    if billing_days is None and start_date_obj and end_date_obj and end_date_obj >= start_date_obj:
        billing_days = (end_date_obj - start_date_obj).days + 1
    period_current_cost = invoice_total_num if invoice_total_num is not None else current_cost_num
    period_new_cost = new_cost_num
    period_savings = to_float(savings_monthly)

    if period_savings is None and period_current_cost is not None and period_new_cost is not None:
        period_savings = round(period_current_cost - period_new_cost, 2)

    if billing_days and billing_days > 0 and period_new_cost is not None:
        normalized_new_cost = round(period_new_cost * 30 / billing_days, 2)
    else:
        normalized_new_cost = period_new_cost

    if billing_days and billing_days > 0 and period_savings is not None:
        savings_monthly = round(period_savings * 30 / billing_days, 2)
        yearly_savings = round(period_savings * 365 / billing_days, 2)
    else:
        savings_monthly = period_savings
        yearly_savings = round(period_savings * 12, 2) if period_savings is not None else None

    if period_current_cost not in (None, 0) and period_savings is not None:
        savings_percent = round((float(period_savings) / period_current_cost) * 100, 2)
    elif savings_percent is not None:
        savings_percent = round(float(savings_percent), 2)

    if normalized_new_cost is not None:
        new_cost = normalized_new_cost

    # Page 1: cover + summary
    title_y = 28
    banner_y = 41
    intro_y = 51
    savings_x = 127
    savings_y = 58
    summary_y = 0
    metrics_y = 0
    current_card_y = 0

    pdf.set_xy(page_left, title_y)
    pdf.set_text_color(*brand_dark)
    pdf.set_font("DejaVu", font_style("B"), 13.2)
    pdf.multi_cell(122, 5.9, texts["title"])

    draw_client_banner(page_left, banner_y, content_w, client_name)

    pdf.set_xy(page_left, intro_y)
    pdf.set_text_color(*brand_secondary)
    pdf.set_font("DejaVu", font_style("B"), 9.6)
    pdf.cell(100, 5.4, f"{texts['greeting']} {client_name},", ln=True)
    pdf.set_x(page_left)
    pdf.set_font("DejaVu", font_style(), 8.35)
    pdf.set_text_color(*brand_dark)
    pdf.multi_cell(100, 4.15, texts["intro_paragraph"])

    draw_savings_panel(
        savings_x,
        savings_y,
        68,
        38,
        fmt_money(yearly_savings) if yearly_savings is not None else "—",
        f"{savings_percent}%" if savings_percent is not None else "—",
    )

    summary_y = max(pdf.get_y() + 8, savings_y + 42)
    pdf.set_xy(page_left, summary_y)
    draw_section_title(texts["summary_title"], texts["summary_subtitle"])
    metrics_y = pdf.get_y() + 4
    current_card_y = metrics_y + 33
    draw_metric_card(page_left, metrics_y, 56, 21, texts["current_plan"], fmt_money(current_cost), brand_blue, border_color=(239, 68, 68))
    draw_metric_card(
        page_left + 62,
        metrics_y,
        56,
        21,
        texts["recommended_plan"],
        fmt_money(period_new_cost if period_new_cost is not None else new_cost),
        brand_green,
        border_color=(245, 158, 11),
    )
    draw_metric_card(page_left + 124, metrics_y, 56, 21, texts["monthly_savings"], fmt_money(savings_monthly), brand_blue_light, border_color=(0, 200, 83))

    current_rows = [
        (texts["current_provider_label"], current_provider),
        (texts["tariff"], current_tariff),
        (texts.get("period_cost", texts["monthly_cost"]), fmt_money(period_current_cost)),
        (texts.get("billing_period", texts["contract_end"]), format_days_only_value(billing_days)),
        (texts["service"], service),
        (texts["contracted_power"], power),
        (texts["average_monthly_consumption"], consumption),
        (texts["cups_label"], contract_num),
    ]
    current_card_h = max(44, measure_info_card_content_height(current_rows, content_w, 2) + 16)
    draw_info_card(
        page_left,
        current_card_y,
        content_w,
        current_card_h,
        texts["current_situation"],
        current_rows,
        columns=2,
        highlight_rows={texts.get("period_cost", texts["monthly_cost"]): (255, 226, 236)},
    )

    proposal_title_y_page1 = current_card_y + current_card_h + 8
    proposal_cards_y_page1 = proposal_title_y_page1 + 9
    pdf.set_xy(page_left, proposal_title_y_page1)
    draw_section_title(texts["our_proposal"], None)
    proposal_rows_merged = [
        (texts["recommended_provider_label"], new_provider),
        (texts["tariff"], new_tariff),
        (texts.get("period_cost", texts["monthly_cost"]), fmt_money(period_new_cost)),
        (texts.get("billing_period", texts["contract_end"]), format_billing_period_value(billing_days, period_savings)),
        (texts["monthly_savings"], fmt_money(savings_monthly)),
        (texts["savings_percentage"], f"{savings_percent}%" if savings_percent is not None else "—"),
    ]
    proposal_card_h = max(30, measure_info_card_content_height(proposal_rows_merged, content_w, 2) + 16)
    draw_info_card(
        page_left,
        proposal_cards_y_page1,
        content_w,
        proposal_card_h,
        texts["recommended_plan"],
        proposal_rows_merged,
        columns=2,
        highlight_rows={texts.get("period_cost", texts["monthly_cost"]): (223, 255, 225)},
    )

    # Page 2: next steps + legal
    pdf.add_page()
    steps_title_y = 28
    steps_y = 52
    cta_gap = 5
    cta_h = 11.5
    steps_cta_y = steps_y + 54
    legal_h = 30
    legal_y = 257 - legal_h
    comment_y = steps_cta_y + cta_h + cta_gap
    available_comment_h = max(28, legal_y - comment_y - 8)
    comment_h = 0

    if proposal_comment:
        comment_text_h = estimate_text_height(proposal_comment[:1800], content_w - 16, 3.7, 7.25)
        comment_h = min(max(28, comment_text_h + 16), available_comment_h)

    pdf.set_xy(page_left, steps_title_y)
    draw_section_title(texts["next_steps"], texts["next_steps_subtitle"])
    draw_step_row(steps_y, "1", texts["step1_title"], texts["step1_desc"])
    draw_step_row(steps_y + 17, "2", texts["step2_title"], texts["step2_desc"])
    draw_step_row(steps_y + 34, "3", texts["step3_title"], texts["step3_desc"])
    draw_full_width_cta(steps_cta_y)
    if proposal_comment:
        draw_comment_band(page_left, comment_y, content_w, comment_h, proposal_comment)
    draw_legal_band(page_left, legal_y, content_w, legal_h, texts.get("proposal_disclaimer_title", ""), texts["proposal_disclaimer"])
    
    return bytes(pdf.output(dest="S"))


@app.post("/api/applications/{application_id}/proposal/generate", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def generate_proposal(application_id: str, payload: ProposalGenerateRequest | None = Body(default=None)):
    """Генерация PDF коммерческого предложения на фирменном бланке."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        app_data = doc.to_dict()
        app_data["id"] = application_id
        app_data["proposal_comment"] = (payload.comment.strip() if payload and payload.comment else "")
        
        # Проверяем extracted_data
        proposal_data_ref = doc_ref.collection("proposal_data").document("data")
        proposal_data = proposal_data_ref.get()
        if not proposal_data.exists or not proposal_data.to_dict().get("extracted_data"):
            raise HTTPException(status_code=400, detail="Сначала извлеките данные счетов.")
        
        extracted = proposal_data.to_dict()["extracted_data"]
        
        # Проверяем выбранную симуляцию
        sims_query = doc_ref.collection("proposal_simulations").where("is_selected", "==", True).limit(1).stream()
        selected_sim = None
        for sim in sims_query:
            selected_sim = sim.to_dict()
            selected_sim["id"] = sim.id
        
        if not selected_sim:
            raise HTTPException(status_code=400, detail="Сначала выберите симуляцию для КП.")
        
        language = app_data.get("language", "es")
        
        # Генерируем PDF
        pdf_bytes = generate_proposal_pdf(app_data, extracted, selected_sim, language)
        
        # Сохраняем в GCS
        today = datetime.datetime.utcnow()
        prefix = f"proposals/{today.year}/{today.month:02}/{today.day:02}"
        unique_name = f"{uuid.uuid4()}.pdf"
        blob_name = f"{prefix}/{unique_name}"
        
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(pdf_bytes, content_type="application/pdf")
        blob.acl.all().grant_read()
        blob.acl.save()
        
        proposal_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{blob_name}"
        
        # Обновляем заявку
        doc_ref.update({
            "proposal_file_url": proposal_url,
            "proposal_uploaded": True,
            "updated_at": today,
        })
        
        # Timeline
        create_timeline_event_internal(
            application_id=application_id,
            content=(
                "Коммерческое предложение сгенерировано.\n"
                f"Ссылка на КП: {proposal_url}\n"
                f"Выбранная симуляция:\n{_format_simulation_summary(selected_sim)}"
            ),
            event_type=EventType.NOTE,
            created_by="System"
        )
        
        return {"success": True, "proposal_file_url": proposal_url, "message": "КП сгенерировано."}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Generate proposal error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при генерации КП: {str(e)}")


@app.get("/api/applications/{application_id}/proposal/preview", tags=["Proposal Builder"], dependencies=[Depends(authenticate_operator)])
async def preview_proposal(application_id: str):
    """Возвращает Signed URL для предпросмотра текущего КП."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        app_data = doc.to_dict()
        proposal_url = app_data.get("proposal_file_url")
        
        if not proposal_url:
            raise HTTPException(status_code=404, detail="КП не найдено. Сначала сгенерируйте или загрузите КП.")
        
        return {"success": True, "proposal_file_url": proposal_url}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Preview proposal error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка при получении превью: {str(e)}")

# --- 4.8. POST /api/applications/{id}/upload-proposal (Загрузка КП) ---
@app.post("/api/applications/{application_id}/upload-proposal", tags=["Management"], dependencies=[Depends(authenticate_operator)])
async def upload_proposal(application_id: str, file: UploadFile = File(...)):
    """Загружает PDF коммерческого предложения в GCS и сохраняет URL в заявке."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
        
        if not file or file.filename == '':
            raise HTTPException(status_code=400, detail="Не передан файл.")
        
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {file.content_type}")
        
        file.file.seek(0, os.SEEK_END)
        size_mb = file.file.tell() / (1024 * 1024)
        file.file.seek(0)
        if size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(status_code=400, detail=f"Файл превышает {MAX_FILE_SIZE_MB} МБ")
        
        ext = os.path.splitext(file.filename)[1].lower()
        today = datetime.datetime.utcnow()
        prefix = f"proposals/{today.year}/{today.month:02}/{today.day:02}"
        unique_name = f"{uuid.uuid4()}{ext}"
        destination = f"{prefix}/{unique_name}"
        
        path = upload_to_gcs(file, destination)
        
        doc_ref.update({
            "proposal_file_url": path,
            "proposal_uploaded": True,
            "updated_at": today
        })

        create_timeline_event_internal(
            application_id=application_id,
            content=(
                "Коммерческое предложение загружено оператором.\n"
                f"Файл: {_extract_filename_from_url(path)}\n"
                f"Ссылка на КП: {path}"
            ),
            event_type=EventType.NOTE,
            created_by="Operator"
        )
        
        return {
            "success": True,
            "proposal_file_url": path,
            "message": "КП успешно загружено."
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload proposal error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при загрузке КП.")

# --- 5. DELETE /api/applications/{id} (Удаление заявки) ---
@app.delete("/api/applications/{application_id}", tags=["Management"], dependencies=[Depends(authenticate_operator)], status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(application_id: str):
    """Удаляет заявку из Firestore по ID. Возвращает 204 No Content."""
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")

        doc_ref.delete()
        
        # Возвращаем пустой ответ 204 No Content
        return None 
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Firestore Delete Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при удалении заявки из Firestore.")

# --- API: Безопасные файлы (Signed URLs) ---

@app.post("/api/generate-signed-url", tags=["Files"], response_model=SignedUrlResponse, dependencies=[Depends(authenticate_operator)])
async def generate_file_signed_url(request_data: SignedUrlRequest):
    """Генерирует временный Signed URL для безопасного доступа к файлу GCS. (Роут сохранен, но не используется для публичных файлов)"""
    
    gcs_path = request_data.gcs_path
    
    if not gcs_path:
        raise HTTPException(status_code=400, detail="Необходимо передать gcs_path.")

    try:
        signed_url = generate_signed_url(gcs_path)
        return {"url": signed_url}
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Signed URL endpoint error: {e}")
        if "No such object" in str(e) or "Not Found" in str(e):
             raise HTTPException(status_code=404, detail=f"Файл по пути {gcs_path} не найден.")
        raise HTTPException(status_code=500, detail="Ошибка при генерации Signed URL.")

# --- 6. GET /api/applications/{id}/timeline (Список событий) ---

@app.get("/api/applications/{application_id}/timeline", tags=["Management"], dependencies=[Depends(authenticate_operator)], response_model=List[TimelineResponse])
async def list_timeline_events(application_id: str):
    """Возвращает список событий (заметок, звонков, WhatsApp) по заявке."""
    try:
        # Проверка существования родительского документа
        app_doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        if not app_doc_ref.get().exists:
             raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")

        # Запрос под-коллекции
        query = app_doc_ref.collection("timeline") \
            .order_by("created_at", direction=firestore.Query.DESCENDING)
        
        events = []
        for doc in query.stream():
            data = doc.to_dict()
            if data and data.get('created_at'):
                events.append({
                    "id": doc.id,
                    "application_id": application_id,
                    "type": data.get('type', EventType.NOTE.value),
                    "content": data.get('content', ''),
                    "created_by": data.get('created_by', 'Operator'),
                    "created_at": data['created_at'].isoformat(),
                    "direction": data.get('direction'),
                    "wa_message_id": data.get('wa_message_id'),
                    "wa_status": data.get('wa_status'),
                })

        return events
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Firestore Timeline List Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при получении ленты событий.")

# --- 7. POST /api/applications/{id}/timeline (Создание записи) ---

@app.post("/api/applications/{application_id}/timeline", tags=["Management"], dependencies=[Depends(authenticate_operator)], status_code=status.HTTP_201_CREATED)
async def create_timeline_event(application_id: str, event_data: TimelineCreate, operator_info: bool = Depends(authenticate_operator)):
    """Создает новую запись в ленте событий заявки."""
    
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id)
        if not doc_ref.get().exists:
             raise HTTPException(status_code=404, detail=f"Заявка с ID {application_id} не найдена.")
             
        new_event_data = event_data.model_dump()
        new_event_data.update({
            "application_id": application_id,
            "created_by": "Operator", # Заглушка, пока нет системы пользователей
            "created_at": datetime.datetime.utcnow(),
        })

        # Добавление документа в под-коллекцию
        _, doc_ref = doc_ref.collection("timeline").add(new_event_data)
        
        return {
            "success": True,
            "message": "Запись в ленте успешно создана.",
            "event_id": doc_ref.id
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Firestore Timeline Create Error: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при создании записи в ленте.")

# --- 8. DELETE /api/applications/{id}/timeline/{note_id} (Удаление записи) ---

@app.delete("/api/applications/{application_id}/timeline/{event_id}", tags=["Management"], dependencies=[Depends(authenticate_operator)], status_code=status.HTTP_204_NO_CONTENT)
async def delete_timeline_event(application_id: str, event_id: str):
    """Удаляет запись из ленты событий заявки."""
    try:
        # Прямая ссылка на документ в под-коллекции
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id).collection("timeline").document(event_id)
        
        doc = doc_ref.get()
        if not doc.exists:
            pass # Если не существует, возвращаем 204
            
        doc_ref.delete()
        
        return None # 204 No Content
        
    except Exception as e:
        print(f"Firestore Timeline Delete Error: {e}")
        if "NOT_FOUND" in str(e):
             raise HTTPException(status_code=404, detail=f"Заявка или событие не найдены.")
        raise HTTPException(status_code=500, detail="Ошибка при удалении записи из ленты.")


# --- WhatsApp Business API Endpoints ---

@app.post("/api/whatsapp/send", tags=["WhatsApp"], dependencies=[Depends(authenticate_operator)])
async def api_send_whatsapp(data: WhatsAppSendRequest):
    """Отправляет текстовое сообщение клиенту через WhatsApp Business API и сохраняет его в Timeline."""
    # Проверяем credentials до любых других действий
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp credentials not configured on backend. Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN environment variables."
        )
    
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        phone = doc.to_dict().get("client_phone")
        if not phone:
            raise HTTPException(status_code=400, detail="У заявки отсутствует телефон клиента.")
        
        result = send_whatsapp_message(phone, data.message)
        wa_message_id = result.get("messages", [{}])[0].get("id")
        
        # Сохраняем в Timeline как исходящее сообщение
        event_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id).collection("timeline").document()
        event_ref.set({
            "application_id": data.application_id,
            "content": data.message,
            "type": EventType.WHATSAPP.value,
            "created_by": "Operator",
            "created_at": datetime.datetime.utcnow(),
            "direction": "outgoing",
            "wa_message_id": wa_message_id,
            "wa_status": "sent",
        })
        
        return {"success": True, "wa_message_id": wa_message_id}
        
    except HTTPException:
        raise
    except requests.exceptions.HTTPError as e:
        meta_error = e.response.text if hasattr(e, 'response') else str(e)
        print(f"WhatsApp Meta API Error: {meta_error}")
        try:
            error_json = json.loads(meta_error)
            meta_code = error_json.get("error", {}).get("code")
            if meta_code == 131030:
                raise HTTPException(
                    status_code=400,
                    detail="Номер телефона получателя не авторизован в Meta. Добавьте номер в список тестовых получателей WhatsApp API."
                )
        except json.JSONDecodeError:
            pass
        raise HTTPException(status_code=502, detail=f"Meta API Error: {meta_error}")
    except Exception as e:
        print(f"WhatsApp Send Error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка отправки WhatsApp: {str(e)}")

@app.post("/api/whatsapp/send-media", tags=["WhatsApp"], dependencies=[Depends(authenticate_operator)])
async def api_send_whatsapp_media(
    application_id: str = Form(...),
    caption: str = Form(""),
    file: UploadFile = File(...)
):
    """Отправляет документ (файл) клиенту через WhatsApp Business API и сохраняет его в Timeline."""
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp credentials not configured on backend."
        )
    
    try:
        doc = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        phone = doc.to_dict().get("client_phone")
        if not phone:
            raise HTTPException(status_code=400, detail="У заявки отсутствует телефон клиента.")
        
        # Validate mime type
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"Неподдерживаемый тип файла: {file.content_type}")
        
        # Check file size
        file.file.seek(0, os.SEEK_END)
        file_size_mb = file.file.tell() / (1024 * 1024)
        file.file.seek(0)
        if file_size_mb > MAX_FILE_SIZE_MB:
            raise HTTPException(status_code=400, detail=f"Файл слишком большой. Максимум {MAX_FILE_SIZE_MB} MB.")
        
        destination = f"whatsapp/{datetime.datetime.utcnow().strftime('%Y/%m/%d')}/{uuid.uuid4()}_{file.filename}"
        public_url = upload_to_gcs(file, destination)
        
        result = send_whatsapp_document(phone, public_url, caption)
        wa_message_id = result.get("messages", [{}])[0].get("id")
        
        content = caption.strip() if caption.strip() else f"📎 {file.filename}"
        event_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(application_id).collection("timeline").document()
        event_ref.set({
            "application_id": application_id,
            "content": content,
            "type": EventType.WHATSAPP.value,
            "created_by": "Operator",
            "created_at": datetime.datetime.utcnow(),
            "direction": "outgoing",
            "wa_message_id": wa_message_id,
            "wa_status": "sent",
        })
        
        return {"success": True, "wa_message_id": wa_message_id, "file_url": public_url}
        
    except HTTPException:
        raise
    except requests.exceptions.HTTPError as e:
        meta_error = e.response.text if hasattr(e, 'response') else str(e)
        print(f"WhatsApp Meta API Error (media): {meta_error}")
        raise HTTPException(status_code=502, detail=f"Meta API Error: {meta_error}")
    except Exception as e:
        print(f"WhatsApp Send Media Error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка отправки файла WhatsApp: {str(e)}")

class WhatsAppDocumentRequest(BaseModel):
    application_id: str
    document_url: str
    caption: str = ""

@app.post("/api/ai/generate-response", tags=["AI"], dependencies=[Depends(authenticate_operator)])
async def api_generate_ai_response(data: AIGenerateRequest):
    """Генерирует ответ менеджера с помощью Gemini AI на основе истории переписки и данных заявки."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini API Key не настроен на бэкенде.")
    
    try:
        # 1. Получаем заявку
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        app_data = doc.to_dict()
        
        # 2. Получаем историю WhatsApp-переписки и полную историю взаимодействия
        timeline_docs = doc_ref.collection("timeline") \
            .order_by("created_at", direction=firestore.Query.ASCENDING) \
            .stream()
        
        chat_lines = []
        client_messages = []
        for tdoc in timeline_docs:
            tdata = tdoc.to_dict()
            if tdata.get("type") == EventType.WHATSAPP.value:
                is_client_message = tdata.get("direction") == "incoming" or tdata.get("created_by") == "Client"
                sender = "Клиент" if is_client_message else "Менеджер"
                chat_lines.append(f"{sender}: {tdata.get('content', '')}")
                if is_client_message and tdata.get("content"):
                    client_messages.append(str(tdata.get("content")))
        
        chat_history = "\n".join(chat_lines) if chat_lines else "Переписка только началась."
        interaction_history = _build_interaction_history_context(doc_ref, app_data)
        live_lead_snapshot = _build_live_lead_snapshot(doc_ref, app_data)
        
        # 3. Формируем промпт
        uploaded_files = app_data.get("uploaded_files", [])
        files = ", ".join([url.split('/')[-1] for url in uploaded_files]) or "Нет загруженных файлов"
        status = app_data.get('status', 'New Lead')
        service_type = app_data.get('service_type', 'Не указан')
        lead_language = app_data.get('language', 'es')
        effective_language = _detect_client_language_from_messages(client_messages, fallback=lead_language)
        language_labels = {
            'es': 'Español',
            'ru': 'Русский',
            'uk': 'Українська',
            'eu': 'Euskara',
        }
        language_name = language_labels.get(lead_language, lead_language)
        effective_language_name = language_labels.get(effective_language, effective_language)
        
        prompt = f"""Ты — Entraycompara WhatsApp Sales Agent Elite v3, эталонный AI-менеджер по продажам и клиентской коммуникации для компании Entraycompara.

Твоя роль:
Ты работаешь как лучший живой sales manager высокого уровня: спокойно, точно, стабильно, человечно и безошибочно.
Ты не просто отвечаешь клиенту — ты выбираешь лучшее следующее сообщение, которое:
- повышает шанс ответа;
- двигает диалог к следующему этапу;
- снижает трение;
- усиливает доверие;
- поддерживает репутацию бренда;
- не выглядит как спам, шаблон или бот.

Твоя единственная задача:
Написать только следующее сообщение клиенту в WhatsApp.

========================
1. КОНТЕКСТ КОМПАНИИ
========================

Entraycompara — независимый сервис анализа и оптимизации счетов в Испании.

Компания помогает клиентам понять текущие условия и найти более выгодные варианты по:
- electricidad
- gas
- móvil
- internet

Что реально предлагает Entraycompara:
- análisis personalizado 100% gratuito;
- клиент может отправить factura как foto, PDF, JPG или PNG;
- команда анализирует consumo и условия текущей tarifa;
- сравнение ведётся с ofertas de más de 40 compañías en España;
- клиент получает понятное объяснение счёта и estimación de ahorro;
- если клиент хочет сменить plan o compañía, команда помогает с gestión y trámites sin coste;
- обычно смена не требует obra, замены счётчика или визита техника;
- обычно при смене compañía no se corta la luz;
- сервис работает en toda España;
- данные клиента должны обрабатываться безопасно, с соблюдением RGPD;
- анализ бесплатный; если клиент выбирает новый plan, comercializadora может выплатить comisión, не увеличивая цену для клиента.

Разрешённые безопасные формулировки ценности:
- análisis gratuito
- revisión personalizada
- explicación clara
- estimación de ahorro
- proceso sencillo
- acompañamiento completo
- sin compromiso
- gestión sin coste para el cliente
- sus datos se tratan de forma segura
- trabajamos en toda España

Разрешённые формулировки из оффера:
- comparamos con ofertas de más de 40 compañías en España
- le enviamos una estimación de ahorro
- si quiere cambiar, le ayudamos con la gestión
- muchos usuarios reducen costes hasta un 50%
- nuestros usuarios pueden ahorrar de media hasta 300 €/año al optimizar su tarifa

Критически важное ограничение:
Никогда не превращай маркетинговые формулировки в личную гарантию клиенту.
Нельзя обещать конкретную экономию без анализа именно его данных.
Нельзя утверждать, что предложение точно лучше текущего, пока анализ не завершён.
Нельзя заявлять, что клиент точно сэкономит.

========================
2. ВХОДНЫЕ ДАННЫЕ
========================

[БАЗА ЗНАНИЙ КОМПАНИИ]
{KNOWLEDGE_BASE}

[ДАННЫЕ ТЕКУЩЕЙ ЗАЯВКИ]
Имя клиента: {app_data.get('client_name', 'Не указано')}
Телефон: {app_data.get('client_phone', 'Не указан')}
Email: {app_data.get('client_email', 'Не указан')}
Тип услуги: {service_type}
Статус заявки: {status}
Заметки: {app_data.get('notes', 'Нет заметок')}
Количество загруженных файлов: {len(uploaded_files)}
Загруженные файлы: {files}
Язык клиента на сайте: {language_name}
Актуальный язык по последним сообщениям клиента: {effective_language_name}

[АКТУАЛЬНЫЙ SNAPSHOT ЛИДА]
{live_lead_snapshot}

[ИСТОРИЯ ВЗАИМОДЕЙСТВИЯ ПО ЛИДУ]
{interaction_history}

[ИСТОРИЯ ПЕРЕПИСКИ В WHATSAPP]
{chat_history}

========================
3. ПРИОРИТЕТ ИСТОЧНИКОВ
========================

Если данные конфликтуют, соблюдай этот порядок приоритета:
1. Последние явные сообщения клиента в chat_history.
2. Факт наличия файлов: uploaded_files_count и files.
3. Статус заявки.
4. Notes.
5. KNOWLEDGE_BASE.

Историю взаимодействия по лиду используй как вспомогательный factual context для понимания этапа работы, документов, симуляций, КП и обещанных следующих шагов, но не нарушай указанный выше порядок приоритета.
Актуальный snapshot лида используй как обязательную проверку фактов перед ответом: язык, файлы, статус, документы, симуляции, КП и уже извлечённые данные должны считаться текущим состоянием системы.

Никогда не нарушай более высокий приоритет ради более низкого.

========================
4. ОСНОВНАЯ ЦЕЛЬ КАЖДОГО СООБЩЕНИЯ
========================

Твоя задача в каждом кейсе:
1. Понять текущее состояние клиента.
2. Понять главное препятствие.
3. Снять одно главное препятствие.
4. Выбрать один лучший следующий микро-шаг.
5. Написать короткое, естественное и уместное сообщение.

Ты не должен:
- писать “вообще обо всём”;
- перегружать;
- перечислять лишнее;
- делать длинный “идеальный” ответ;
- писать как шаблон CRM.

========================
5. ПОВЕДЕНЧЕСКАЯ МОДЕЛЬ
========================

Ты продаёшь не через давление, а через:
- ясность;
- простоту;
- спокойствие;
- ощущение контроля;
- минимальное усилие со стороны клиента;
- понятный следующий шаг;
- уместное человеческое сопровождение.

Ты не толкаешь.
Ты ведёшь.
Ты не давишь.
Ты упрощаешь.
Ты не споришь.
Ты не манипулируешь грубо.
Ты не вызываешь чувство вины.
Ты не создаёшь ложную срочность.
Ты не пишешь сухо и роботизированно.

========================
6. ТОН И СТИЛЬ
========================

Тон:
- дружелюбный;
- профессиональный;
- спокойный;
- уверенный;
- человечный;
- короткий;
- тактичный;
- без лишнего пафоса;
- без канцелярита;
- без навязчивости.

Клиент после сообщения должен чувствовать:
- им занимаются;
- всё под контролем;
- процесс понятный;
- сервис простой;
- ему помогают;
- лишнего от него не требуют;
- следующий шаг лёгкий.

========================
7. ПРАВИЛА ЯЗЫКА
========================

1. Отвечай строго на языке клиента.
2. По умолчанию используй актуальный язык по последним сообщениям клиента: {effective_language_name}.
3. Если в последних входящих сообщениях клиента язык изменился, немедленно переключись на новый язык ответа.
4. Не смешивай языки без причины.
5. Подстраивайся под уровень формальности клиента:
   - если клиент пишет просто — отвечай просто;
   - если клиент пишет формально — отвечай вежливо и формально.
6. Не используй внутренние англицизмы CRM и sales jargon.
7. Язык в карточке лида используй как fallback, но последние явные сообщения клиента важнее.
8. Перед финальным ответом ещё раз проверь, что язык ответа совпадает с актуальным языком клиента, а не с языком предыдущего сообщения менеджера.

========================
8. ПРАВИЛА ФОРМАТА
========================

1. Только plain text.
2. Не используй markdown.
3. Не используй списки.
4. Не используй эмодзи.
5. Не используй подпись.
6. Обычно ответ должен быть 1–3 предложения.
7. Если клиент задал конкретный вопрос, можно написать чуть подробнее, но всё равно кратко.
8. Не пиши тяжёлые длинные абзацы.
9. Не повторяй уже сказанное без причины.
10. Пиши так, будто это сообщение реально отправит сильный менеджер в WhatsApp.

========================
9. ЖЁСТКИЕ ПРАВИЛА ПО ФАЙЛАМ
========================

Если uploaded_files_count > 0:
- никогда не проси клиента загрузить документы повторно;
- никогда не спрашивай, может ли он отправить factura, если она уже есть;
- никогда не пиши так, будто документы ещё не получены;
- исходи из того, что документы уже в системе;
- подтверждай получение;
- сообщай, что caso / análisis / revisión / propuesta уже в работе или будет отправлена;
- при необходимости обозначай следующий шаг без повторного запроса файлов.

Если uploaded_files_count = 0:
- можно мягко предложить отправить factura только если это уместно по статусу и переписке;
- формулируй это просто;
- можно напомнить, что достаточно foto o PDF;
- не усложняй инструкцию.

========================
9.5. ПРАВИЛА АКТУАЛЬНОСТИ ДАННЫХ ЛИДА
========================

Ты всегда обязан опираться на актуальные данные внутри лида.

Это значит:
- если в lead snapshot есть документы, считай их уже полученными;
- если в lead snapshot есть КП, не пиши так, будто предложение ещё не подготовлено;
- если в lead snapshot есть выбранная симуляция, считай, что расчёт уже существует;
- если в lead snapshot есть extracted data, можешь опираться на факт завершённого анализа этапа, но не придумывай то, чего там нет;
- если в истории видно, что менеджер уже обещал следующий шаг, не противоречь этому шагу;
- если клиент спрашивает о текущем этапе, отвечай исходя из реального состояния лида, а не абстрактного сценария.

Никогда не игнорируй актуальные данные лида.
Никогда не отвечай устаревшим контекстом, если в lead snapshot или истории есть более свежая информация.

========================
10. MINI PLAYBOOK ПО СТАТУСАМ
========================

Статус: New Lead
Если файлов нет:
- цель: мягко конвертировать в отправку factura;
- лучший ход: показать простоту и отсутствие обязательств;
- допустимый смысл: анализ бесплатный, можно отправить factura сюда, достаточно foto o PDF.

Если файлы есть:
- цель: снизить тревогу ожидания;
- лучший ход: подтвердить получение и показать, что кейс уже рассматривается.

Статус: Analysis
- цель: удержать доверие и снизить ожидание;
- лучший ход: сообщить, что анализ уже идёт;
- можно мягко сказать, что свяжемся, как только будет готов результат;
- нельзя просить повторно файлы, если они уже есть.

Статус: Proposal
- цель: перевести клиента к ознакомлению и ответу;
- лучший ход: напомнить, что предложение уже подготовлено или отправлено, и предложить задать вопросы;
- нельзя давить на решение;
- нельзя звучать как “ну что, будете брать?”.

Статус: Contract Won
- цель: укрепить доверие и уверенность;
- лучший ход: поблагодарить и подтвердить следующий этап;
- клиент должен чувствовать сопровождение, а не “продали и забыли”.

Статус: Deal Lost
- цель: сохранить лицо бренда и оставить дверь открытой;
- лучший ход: быть уважительным, не спорить, не дожимать агрессивно;
- допустимый смысл: если когда-нибудь захотите вернуться, будем рады помочь.

========================
11. РАБОТА С СОСТОЯНИЕМ КЛИЕНТА
========================

Определи текущее состояние клиента по последним сообщениям. Возможные состояния:
- заинтересован;
- сомневается;
- ждёт ответа;
- ждёт результат;
- не понимает следующий шаг;
- молчит;
- уже отправил документы;
- рассматривает предложение;
- задаёт конкретный вопрос;
- раздражён;
- откладывает решение;
- готов продолжать;
- отказывается.

Далее определи главное препятствие. Примеры:
- клиенту непонятно, что делать дальше;
- клиент боится сложности;
- клиент не уверен, что кейс в работе;
- клиент сомневается, есть ли смысл;
- клиент ждёт результат;
- клиенту нужен короткий прямой ответ;
- клиент не хочет лишних действий;
- клиенту нужно успокоение;
- клиент не увидел ценность.

Выбери только один главный микро-шаг:
- подтвердить получение;
- успокоить;
- ответить на вопрос;
- предложить отправить factura;
- напомнить о propuesta;
- предложить задать вопрос;
- подтвердить текущий этап;
- поблагодарить;
- мягко реактивировать диалог;
- корректно завершить без давления.

========================
12. СТРУКТУРА СИЛЬНОГО СООБЩЕНИЯ
========================

Предпочтительная логика:
- первая часть: внимание / подтверждение / контроль;
- вторая часть: полезная суть;
- третья часть: мягкий следующий шаг, если нужен.

Идеальное сообщение обычно:
- короткое;
- ясное;
- без лишних деталей;
- без двух разных CTA сразу;
- без “продажного запаха”.

========================
13. FOLLOW-UP ЛОГИКА
========================

Если клиент молчит:
- не обвиняй;
- не создавай чувство вины;
- не используй пассивную агрессию;
- не пиши “ждём вашего ответа” в тяжёлом продавливании;
- не используй искусственную срочность.

Хороший follow-up:
- короткий;
- естественный;
- уважительный;
- напоминает о пользе;
- предлагает простой следующий шаг;
- не требует большого усилия от клиента.

========================
14. РАБОТА С ВОЗРАЖЕНИЯМИ И ВОПРОСАМИ
========================

Если клиент сомневается:
- не спорь;
- не дави;
- не пытайся “закрыть любой ценой”;
- внеси ясность;
- снизь ощущение сложности;
- напомни, что анализ бесплатный и без обязательств, если это уместно;
- предложи безопасный следующий шаг.

Если клиент раздражён:
- не отражай раздражение;
- не оправдывайся длинно;
- сначала снизь напряжение;
- потом дай короткую суть;
- сохраняй уважение.

Если клиент опасается смены компании:
Можно мягко пояснить, если это уместно:
- normalmente no hace falta cambiar contador;
- no suele haber corte de luz;
- es un trámite administrativo.

Если клиент переживает за данные:
Можно мягко пояснить:
- sus datos se tratan de forma segura;
- cumplimos el RGPD;
- no se venden ni se comparten sin consentimiento.

Если клиент спрашивает “¿Y si no acepto la propuesta?”:
Допустимый смысл ответа:
- no pasa nada;
- el análisis sigue siendo gratuito;
- no hay compromiso.

Если клиент спрашивает “¿Por qué es gratis?”:
Допустимый смысл ответа:
- el análisis es gratuito para usted;
- si decide cambiar, la comercializadora puede pagar una comisión;
- eso no incrementa su precio.

Если клиент задаёт конкретный вопрос:
- сначала ответь по существу;
- потом, если уместно, предложи следующий шаг;
- не игнорируй вопрос ради продажи.

========================
15. АНТИБОТ-ПРАВИЛО
========================

Сообщение должно звучать как сильный живой менеджер, а не как автоматизация.

Избегай:
- чрезмерно идеального шаблонного тона;
- канцелярита;
- одинаковых пустых фраз;
- излишне “гладких” маркетинговых оборотов;
- слишком полного пересказа условий;
- ощущения, что сообщение сгенерировано CRM-шаблоном.

Нужен стиль:
- простой;
- точный;
- уместный;
- живой;
- уверенный;
- тёплый, но не липкий.

========================
16. WHAT NOT TO DO
========================

Запрещено:
- повторно просить уже загруженные документы;
- обещать гарантированную экономию;
- обещать лучший тариф без анализа;
- утверждать, что клиент точно сэкономит;
- писать длинно без необходимости;
- давить;
- стыдить за молчание;
- использовать грубые манипуляции;
- создавать ложную срочность;
- выдумывать факты;
- раскрывать внутренние notes или CRM-логику;
- подписываться именем;
- ставить больше одного лишнего вопроса, если можно обойтись без этого;
- делать два конкурирующих CTA в одном сообщении.

========================
17. FEW-SHOT ПРИМЕРЫ
========================

Пример 1
Условие:
status = New Lead
uploaded_files_count = 0
клиент ещё ничего не прислал
Хороший ответ:
Hola. Si le parece, puede enviarnos su factura por aquí y la revisamos sin coste. Con una foto o PDF es suficiente.

Пример 2
Условие:
status = New Lead
uploaded_files_count > 0
клиент уже отправил документы
Хороший ответ:
Hola. Ya hemos recibido la documentación y nuestro equipo está revisando su caso. En cuanto tengamos el análisis, le escribimos.

Пример 3
Условие:
status = Analysis
клиент спрашивает, идёт ли работа
Хороший ответ:
Hola. Sí, ya estamos revisando su factura. En cuanto tengamos el análisis preparado, le contactamos.

Пример 4
Условие:
status = Proposal
клиент молчит после отправки предложения
Хороший ответ:
Hola. Le escribo por si ha podido ver la propuesta que le enviamos. Si quiere, le aclaramos cualquier duda sin compromiso.

Пример 5
Условие:
status = Proposal
клиент сомневается
Хороший ответ:
Hola. Si le parece, podemos explicarle la propuesta de forma muy simple y resolver cualquier duda. La idea es que vea con claridad si realmente le compensa.

Пример 6
Условие:
клиент боится, что отключат свет
Хороший ответ:
No se preocupe, normalmente el cambio es solo un trámite administrativo y no suele haber corte de luz. Si quiere, revisamos su caso y se lo explicamos de forma clara.

Пример 7
Условие:
клиент спрашивает, почему сервис бесплатный
Хороший ответ:
El análisis es gratuito para usted. Si decide cambiar a una nueva tarifa, la comercializadora puede pagar una comisión, pero eso no aumenta su precio.

Пример 8
Условие:
клиент спрашивает, что будет, если не примет предложение
Хороший ответ:
No pasa nada. El análisis sigue siendo gratuito y no tiene ningún compromiso.

Пример 9
Условие:
status = Deal Lost
Хороший ответ:
Entendido, muchas gracias por su tiempo. Si más adelante quiere que revisemos su factura, estaremos encantados de ayudarle.

Пример 10
Условие:
status = Contract Won
Хороший ответ:
Muchas gracias por la confianza. Seguimos con la gestión y le iremos informando de los siguientes pasos.

========================
18. ВНУТРЕННИЙ QUALITY GATE
========================

Перед тем как выдать финальный текст, проверь:
1. Ответ точно на языке клиента?
2. Он опирается на последние сообщения клиента?
3. Он не противоречит uploaded_files_count?
4. Он соответствует status?
5. Он не просит то, что уже отправлено?
6. В нём нет выдуманных фактов?
7. Он звучит естественно и по-человечески?
8. Он короткий?
9. Он внушает доверие?
10. Он ведёт к одному логичному следующему шагу?
11. Он не звучит как спам или бот?
12. Он не содержит лишнего давления?

Если ответ не проходит хотя бы один пункт — перепиши его лучше перед выводом.

========================
19. ЕСЛИ ИНФОРМАЦИИ МАЛО
========================

Если данных недостаточно:
- не выдумывай;
- не обещай лишнего;
- сделай нейтральное, безопасное, человечное сообщение;
- коротко подтверди внимание;
- не противоречь имеющимся данным;
- удержи контакт;
- предложи следующий шаг только если он действительно уместен.

========================
20. ФОРМАТ ВЫВОДА
========================

Выведи только одно готовое следующее сообщение клиенту.
Без пояснений.
Без анализа.
Без комментариев.
Без вариантов.
Без заголовков.
Только финальный текст сообщения для отправки клиенту."""
        
        # 4. Вызываем Gemini
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content(prompt)
        
        if not response.text:
            raise HTTPException(status_code=500, detail="Gemini вернул пустой ответ.")
        
        return {"success": True, "response": response.text.strip()}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"AI Generation Error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка генерации ответа ИИ: {str(e)}")

@app.post("/api/whatsapp/send-document", tags=["WhatsApp"], dependencies=[Depends(authenticate_operator)])
async def api_send_whatsapp_document(data: WhatsAppDocumentRequest):
    """Отправляет уже загруженный документ клиенту через WhatsApp Business API."""
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp credentials not configured on backend."
        )
    
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        phone = doc.to_dict().get("client_phone")
        if not phone:
            raise HTTPException(status_code=400, detail="У заявки отсутствует телефон клиента.")
        
        result = send_whatsapp_document(phone, data.document_url, data.caption)
        wa_message_id = result.get("messages", [{}])[0].get("id")
        
        content = data.caption.strip() if data.caption.strip() else f"📎 Документ"
        event_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id).collection("timeline").document()
        event_ref.set({
            "application_id": data.application_id,
            "content": content,
            "type": EventType.WHATSAPP.value,
            "created_by": "Operator",
            "created_at": datetime.datetime.utcnow(),
            "direction": "outgoing",
            "wa_message_id": wa_message_id,
            "wa_status": "sent",
        })
        
        return {"success": True, "wa_message_id": wa_message_id}
        
    except HTTPException:
        raise
    except requests.exceptions.HTTPError as e:
        meta_error = e.response.text if hasattr(e, 'response') else str(e)
        print(f"WhatsApp Meta API Error (document): {meta_error}")
        raise HTTPException(status_code=502, detail=f"Meta API Error: {meta_error}")
    except Exception as e:
        print(f"WhatsApp Send Document Error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка отправки документа WhatsApp: {str(e)}")

@app.post("/api/whatsapp/send-proposal", tags=["WhatsApp"], dependencies=[Depends(authenticate_operator)])
async def api_send_whatsapp_proposal(data: WhatsAppProposalRequest):
    """Отправляет загруженное КП клиенту через WhatsApp Business API."""
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp credentials not configured on backend."
        )
    
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        app_data = doc.to_dict()
        phone = app_data.get("client_phone")
        proposal_url = app_data.get("proposal_file_url")
        
        if not phone:
            raise HTTPException(status_code=400, detail="У заявки отсутствует телефон клиента.")
        if not proposal_url:
            raise HTTPException(status_code=400, detail="КП не загружено. Сначала загрузите файл КП.")
        
        result = send_whatsapp_document(phone, proposal_url, "Коммерческое предложение")
        wa_message_id = result.get("messages", [{}])[0].get("id")
        if not wa_message_id:
            raise HTTPException(status_code=502, detail="Meta API не вернул идентификатор сообщения для КП.")
        
        event_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id).collection("timeline").document()
        event_ref.set({
            "application_id": data.application_id,
            "content": f"📎 Коммерческое предложение\nСсылка: {proposal_url}",
            "type": EventType.WHATSAPP.value,
            "created_by": "Operator",
            "created_at": datetime.datetime.utcnow(),
            "direction": "outgoing",
            "wa_message_id": wa_message_id,
            "wa_status": "submitted",
        })
        
        # Автоматически переводим заявку в статус Proposal
        doc_ref.update({
            "status": Status.PROPOSAL.value,
            "updated_at": datetime.datetime.utcnow(),
        })
        
        return {
            "success": True,
            "wa_message_id": wa_message_id,
            "message": "КП передано в WhatsApp API. Ожидаем подтверждение доставки.",
        }
        
    except HTTPException:
        raise
    except requests.exceptions.HTTPError as e:
        meta_error = e.response.text if hasattr(e, 'response') else str(e)
        print(f"WhatsApp Meta API Error (proposal): {meta_error}")
        raise HTTPException(status_code=502, detail=f"Meta API Error: {meta_error}")
    except Exception as e:
        print(f"WhatsApp Send Proposal Error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка отправки КП: {str(e)}")

@app.post("/api/whatsapp/send-first-message", tags=["WhatsApp"], dependencies=[Depends(authenticate_operator)])
async def api_send_whatsapp_first_message(data: WhatsAppFirstMessageRequest):
    """Отправляет первое шаблонное сообщение (hola) клиенту через WhatsApp Business API.
    
    Проверяет, что сообщение ещё не отправлялось, отправляет template,
    сохраняет статус в заявке и создаёт запись в Timeline.
    """
    if not WHATSAPP_PHONE_NUMBER_ID or not WHATSAPP_ACCESS_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="WhatsApp credentials not configured on backend."
        )
    
    try:
        doc_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Заявка не найдена.")
        
        app_data = doc.to_dict()
        phone = app_data.get("client_phone")
        
        if not phone:
            raise HTTPException(status_code=400, detail="У заявки отсутствует телефон клиента.")
        
        # Проверяем, не отправлялось ли уже первое сообщение
        if app_data.get("whatsapp_first_message_sent"):
            return {"status": "already_sent", "message": "Первое сообщение уже отправлялось."}
        
        # Определяем язык шаблона из заявки (fallback: es)
        client_lang = app_data.get("language", "es")
        # Поддерживаемые языки шаблона Meta — обычно es, en. Для остальных fallback на es.
        template_lang = client_lang if client_lang in ("es", "en") else "es"
        
        result = send_whatsapp_template(phone, template_name="hola", language_code=template_lang)
        wa_message_id = result.get("messages", [{}])[0].get("id")
        
        # Сохраняем статус в заявке и переводим в Analysis
        doc_ref.update({
            "whatsapp_first_message_sent": True,
            "whatsapp_first_message_sent_at": datetime.datetime.utcnow(),
            "whatsapp_first_message_id": wa_message_id,
            "status": Status.ANALYSIS.value,
            "analysis_started_at": datetime.datetime.utcnow(),
            "updated_at": datetime.datetime.utcnow(),
        })
        
        # Создаём запись в Timeline
        event_ref = doc_ref.collection("timeline").document()
        event_ref.set({
            "application_id": data.application_id,
            "content": "Шаблонное приветственное сообщение отправлено (hola).",
            "type": EventType.WHATSAPP.value,
            "created_by": "Operator",
            "created_at": datetime.datetime.utcnow(),
            "direction": "outgoing",
            "wa_message_id": wa_message_id,
            "wa_status": "sent",
        })
        
        return {"status": "success", "wa_message_id": wa_message_id}
        
    except HTTPException:
        raise
    except requests.exceptions.HTTPError as e:
        meta_error = e.response.text if hasattr(e, 'response') else str(e)
        print(f"WhatsApp Meta API Error (first message): {meta_error}")
        raise HTTPException(status_code=502, detail=f"Meta API Error: {meta_error}")
    except Exception as e:
        print(f"WhatsApp Send First Message Error: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка отправки первого сообщения: {str(e)}")

@app.get("/api/whatsapp/webhook", tags=["WhatsApp"])
async def whatsapp_webhook_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge")
):
    """Верификация webhook от Meta."""
    if hub_mode == "subscribe" and hub_verify_token == WHATSAPP_VERIFY_TOKEN:
        return int(hub_challenge) if hub_challenge else "OK"
    raise HTTPException(status_code=403, detail="Verification failed")


@app.post("/api/whatsapp/webhook", tags=["WhatsApp"])
async def whatsapp_webhook_receive(payload: dict = Body(...)):
    """Получение входящих сообщений и статусов доставки от Meta."""
    try:
        entries = payload.get("entry", [])
        for entry in entries:
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])
                
                for msg in messages:
                    if msg.get("type") == "text":
                        from_phone_raw = msg.get("from", "")
                        text_body = msg.get("text", {}).get("body", "")
                        wa_message_id = msg.get("id", "")
                        
                        from_phone = normalize_phone(from_phone_raw)
                        fallback_phone = None
                        if from_phone.startswith("79"):
                            fallback_phone = "78" + from_phone[2:]
                        
                        # Ищем заявку по телефону среди последних 100
                        apps_query = firestore_client.collection(FIRESTORE_COLLECTION) \
                            .order_by("submission_date", direction=firestore.Query.DESCENDING) \
                            .limit(100) \
                            .stream()
                        
                        matched_app_id = None
                        for app_doc in apps_query:
                            app_data = app_doc.to_dict()
                            app_phone = normalize_phone(app_data.get("client_phone", ""))
                            if app_phone == from_phone or (fallback_phone and app_phone == fallback_phone):
                                matched_app_id = app_doc.id
                                break
                        
                        if matched_app_id:
                            event_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(matched_app_id).collection("timeline").document()
                            event_ref.set({
                                "application_id": matched_app_id,
                                "content": text_body,
                                "type": EventType.WHATSAPP.value,
                                "created_by": "Client",
                                "created_at": datetime.datetime.utcnow(),
                                "direction": "incoming",
                                "wa_message_id": wa_message_id,
                            })
                        else:
                            print(f"WhatsApp webhook: no application found for phone {from_phone_raw}")
                
                # Обработка статусов доставки (sent / delivered / read)
                statuses = value.get("statuses", [])
                for status_obj in statuses:
                    recipient_phone_raw = status_obj.get("recipient_id", "")
                    wa_message_id = status_obj.get("id", "")
                    status_value = status_obj.get("status", "")
                    
                    if not wa_message_id or not status_value:
                        continue
                    
                    recipient_phone = normalize_phone(recipient_phone_raw)
                    fallback_phone = None
                    if recipient_phone.startswith("79"):
                        fallback_phone = "78" + recipient_phone[2:]
                    
                    # Ищем заявку по телефону получателя
                    apps_query = firestore_client.collection(FIRESTORE_COLLECTION) \
                        .order_by("submission_date", direction=firestore.Query.DESCENDING) \
                        .limit(100) \
                        .stream()
                    
                    matched_app_id = None
                    for app_doc in apps_query:
                        app_data = app_doc.to_dict()
                        app_phone = normalize_phone(app_data.get("client_phone", ""))
                        if app_phone == recipient_phone or (fallback_phone and app_phone == fallback_phone):
                            matched_app_id = app_doc.id
                            break
                    
                    if matched_app_id:
                        # Ищем запись в Timeline по wa_message_id
                        timeline_query = firestore_client.collection(FIRESTORE_COLLECTION) \
                            .document(matched_app_id) \
                            .collection("timeline") \
                            .where("wa_message_id", "==", wa_message_id) \
                            .limit(1) \
                            .stream()
                        
                        for timeline_doc in timeline_query:
                            timeline_doc.reference.update({
                                "wa_status": status_value,
                                "wa_status_updated_at": datetime.datetime.utcnow(),
                            })
                            print(f"WhatsApp status updated: {wa_message_id} -> {status_value}")
                            break
                        else:
                            print(f"WhatsApp status: timeline entry not found for message {wa_message_id}")
                    else:
                        print(f"WhatsApp status: no application found for phone {recipient_phone_raw}")
                            
    except Exception as e:
        print(f"WhatsApp Webhook Error: {e}")
    
    return {"status": "ok"}
