# main.py
import os
import uuid
import datetime
import smtplib
import re
import requests
import json
from typing import List, Optional, Dict, Any 
from enum import Enum 
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Depends, Query, status, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import storage, firestore 
from pydantic import BaseModel
import google.generativeai as genai


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
GEMINI_MODEL = "gemini-2.5-flash-lite"
# -------------------------

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
    Consulting = 'Consulting'
    Development = 'Development'
    Support = 'Support'
    Marketing = 'Marketing'
    GasComparison = 'Gas Comparison'

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
        file_names = ", ".join([path.split('/')[-1] for path in uploaded_paths])
        timeline_content = f"Заявка создана клиентом. Статус: '{Status.NEW_LEAD.value}'. Загружено файлов: {len(uploaded_paths)}. Файлы: {file_names}."
        
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
        
        doc_ref.update({
            "status": new_status,
            "updated_at": datetime.datetime.utcnow()
        })
        
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
            update_dict["updated_at"] = datetime.datetime.utcnow()
            doc_ref.update(update_dict)
        
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
            "updated_at": today
        })
        
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
        doc = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id).get()
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
        
        # 2. Получаем историю WhatsApp-переписки
        timeline_docs = doc_ref.collection("timeline") \
            .order_by("created_at", direction=firestore.Query.ASCENDING) \
            .stream()
        
        chat_lines = []
        for tdoc in timeline_docs:
            tdata = tdoc.to_dict()
            if tdata.get("type") == EventType.WHATSAPP.value:
                sender = "Клиент" if tdata.get("direction") == "incoming" or tdata.get("created_by") == "Client" else "Менеджер"
                chat_lines.append(f"{sender}: {tdata.get('content', '')}")
        
        chat_history = "\n".join(chat_lines) if chat_lines else "Переписка только началась."
        
        # 3. Формируем промпт
        uploaded_files = app_data.get("uploaded_files", [])
        files = ", ".join([url.split('/')[-1] for url in uploaded_files]) or "Нет загруженных файлов"
        has_files = len(uploaded_files) > 0
        status = app_data.get('status', 'New Lead')
        service_type = app_data.get('service_type', 'Не указан')
        client_language = app_data.get('language', 'es')
        language_names = {'es': 'испанском', 'ru': 'русском', 'uk': 'украинском', 'eu': 'баскском'}
        language_name = language_names.get(client_language, client_language)
        
        prompt = f"""Ты — профессиональный менеджер по продажам компании EntrayCompara. Компания помогает клиентам в Испании сэкономить на коммунальных услугах (электричество, газ, мобильная связь, интернет).

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

[ИСТОРИЯ ПЕРЕПИСКИ В WHATSAPP]
{chat_history}

Твоя задача — написать следующее сообщение клиенту.

КРИТИЧЕСКИ ВАЖНЫЕ ПРАВИЛА:
1. Отвечай строго на {language_name} языке. Если клиент явно пишет на другом языке в переписке — переключись на язык клиента.
2. Будь дружелюбным, профессиональным и лаконичным.
3. Не используй markdown, только plain text.
4. Максимум 2-3 предложения, если вопрос не требует развернутого ответа.
5. Не подписывайся именем — просто текст сообщения.

ПРАВИЛА ПРО ФАЙЛЫ И СТАТУСЫ (соблюдай строго):
- Если в заявке УЖЕ есть загруженные файлы (Количество загруженных файлов > 0), НИКОГДА не проси клиента загрузить их снова. Вместо этого скажи, что документы получены и мы скоро пришлём результаты анализа или предложение.
- Если статус заявки 'New Lead' и файлов НЕТ — можно мягко предложить загрузить счета для анализа.
- Если статус 'Analysis' — сообщи, что анализ уже в процессе.
- Если статус 'Proposal' — предложение уже готово или отправлено, мягко напомни клиенту ознакомиться с ним.
- Если статус 'Contract Won' — поблагодари клиента за доверие.
- Если статус 'Deal Lost' — не настаивай, будь вежливым.

Следующее сообщение:"""
        
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
        doc = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id).get()
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
        doc = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id).get()
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
        
        event_ref = firestore_client.collection(FIRESTORE_COLLECTION).document(data.application_id).collection("timeline").document()
        event_ref.set({
            "application_id": data.application_id,
            "content": "📎 Коммерческое предложение",
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
        
        # Сохраняем статус в заявке
        doc_ref.update({
            "whatsapp_first_message_sent": True,
            "whatsapp_first_message_sent_at": datetime.datetime.utcnow(),
            "whatsapp_first_message_id": wa_message_id,
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