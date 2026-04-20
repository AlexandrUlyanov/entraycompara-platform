
import { Application, CursorPaginatedApplications, Status, ServiceType, ApplicationNote, NoteType } from '../types';

const API_BASE_URL = 'https://backend-upload-service-staging-bfuq4rsamq-ew.a.run.app/api';

const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

const getHeaders = (): HeadersInit => {
    const token = getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

const handleApiError = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
        const errorBody = await response.json();
        if (errorBody.detail) {
            if (Array.isArray(errorBody.detail)) {
                // Handle FastAPI validation errors (array of objects)
                errorMessage = errorBody.detail
                    .map((err: any) => {
                        const loc = Array.isArray(err.loc) ? err.loc.join('.') : 'Field';
                        return `${loc}: ${err.msg}`;
                    })
                    .join(' | ');
            } else if (typeof errorBody.detail === 'string') {
                errorMessage = errorBody.detail;
            } else {
                errorMessage = JSON.stringify(errorBody.detail);
            }
        }
    } catch (e) {
        // If parsing JSON fails, fallback to statusText
    }
    
    throw new Error(`API Error: ${response.status} - ${errorMessage}`);
  }
  
  // Handle 204 No Content
  if (response.status === 204) {
      return { success: true };
  }
  
  return response.json();
};

const correctServiceTypeFormatting = (serviceType: string): ServiceType => {
    if (!serviceType) return serviceType as ServiceType;
    const corrected = serviceType
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    if (Object.values(ServiceType).includes(corrected as ServiceType)) {
      return corrected as ServiceType;
    }
    return serviceType as ServiceType;
}

export const fetchApplications = async (
  limit: number,
  cursor: string | null,
  searchTerm: string,
  status: Status | 'all',
  serviceType: ServiceType | 'all'
): Promise<CursorPaginatedApplications> => {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (cursor) {
    params.append('cursor', cursor);
  }
  if (searchTerm) {
    params.append('search_term', searchTerm);
  }
  if (status !== 'all') {
    params.append('status', status);
  }
  if (serviceType !== 'all') {
    params.append('service_type', serviceType);
  }

  const response = await fetch(`${API_BASE_URL}/applications?${params.toString()}`, {
      headers: getHeaders(),
  });
  const data = await handleApiError(response);
  
  const correctedApplications = data.applications.map((app: Application) => ({
    ...app,
    service_type: correctServiceTypeFormatting(app.service_type),
  }));

  return {
      applications: correctedApplications,
      next_cursor: data.next_cursor || null,
  };
};

export const fetchApplicationById = async (id: string): Promise<Application | undefined> => {
  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
      headers: getHeaders(),
  });
   if (response.status === 404) {
    return undefined;
  }
  const application = await handleApiError(response) as Application | undefined;
  
  if (application && application.service_type) {
    application.service_type = correctServiceTypeFormatting(application.service_type);
  }

  return application;
};

export const updateApplicationStatus = async (id: string, newStatus: Status): Promise<{ success: boolean, message: string }> => {
  const response = await fetch(`${API_BASE_URL}/applications/${id}/status`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ status: newStatus }),
  });
  return handleApiError(response);
};

export const updateApplicationServiceType = async (id: string, newServiceType: ServiceType): Promise<{ success: boolean, message: string }> => {
  const response = await fetch(`${API_BASE_URL}/applications/${id}/service_type`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ service_type: newServiceType }),
  });
  return handleApiError(response);
}

export const deleteApplicationById = async (id: string): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  return handleApiError(response);
};

export const updateApplication = async (
  id: string,
  updates: Partial<Pick<Application, 'client_name' | 'client_phone' | 'client_email' | 'notes'>>
): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_BASE_URL}/applications/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  return handleApiError(response);
};

export const uploadApplicationFiles = async (id: string, files: FileList): Promise<{ success: boolean; uploaded_files: string[] }> => {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  const token = getAuthToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE_URL}/applications/${id}/upload-files`, {
    method: 'POST',
    headers,
    body: formData,
  });
  return handleApiError(response);
};

// --- Timeline / Notes API ---

export const fetchApplicationTimeline = async (appId: string): Promise<ApplicationNote[]> => {
  const response = await fetch(`${API_BASE_URL}/applications/${appId}/timeline`, {
    headers: getHeaders(),
  });
  return handleApiError(response);
};

export const createTimelineNote = async (appId: string, content: string, type: NoteType): Promise<ApplicationNote> => {
  // Map System type to Note for backend compatibility as backend only accepts NOTE, WHATSAPP, CALL, EMAIL
  const apiType = type === NoteType.System ? NoteType.Note : type;

  const response = await fetch(`${API_BASE_URL}/applications/${appId}/timeline`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ content, type: apiType }),
  });
  return handleApiError(response);
};

export const deleteTimelineNote = async (appId: string, noteId: string): Promise<{ success: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/applications/${appId}/timeline/${noteId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  return handleApiError(response);
};

// --- File Security API ---

export const generateSignedUrl = async (gcsPath: string): Promise<{ url: string }> => {
  const response = await fetch(`${API_BASE_URL}/generate-signed-url`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ gcs_path: gcsPath }),
  });
  return handleApiError(response);
};

// --- WhatsApp API ---

export const sendWhatsAppMessage = async (applicationId: string, message: string): Promise<{ success: boolean; wa_message_id?: string }> => {
  const response = await fetch(`${API_BASE_URL}/whatsapp/send`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ application_id: applicationId, message }),
  });
  return handleApiError(response);
};

export const sendWhatsAppMedia = async (applicationId: string, file: File, caption: string = ""): Promise<{ success: boolean; wa_message_id?: string; file_url?: string }> => {
  const formData = new FormData();
  formData.append('application_id', applicationId);
  formData.append('caption', caption);
  formData.append('file', file);

  const token = getAuthToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Do NOT set Content-Type — browser will set the multipart boundary automatically

  const response = await fetch(`${API_BASE_URL}/whatsapp/send-media`, {
    method: 'POST',
    headers,
    body: formData,
  });
  return handleApiError(response);
};

export const sendWhatsAppDocument = async (applicationId: string, documentUrl: string, caption: string = ""): Promise<{ success: boolean; wa_message_id?: string }> => {
  const response = await fetch(`${API_BASE_URL}/whatsapp/send-document`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ application_id: applicationId, document_url: documentUrl, caption }),
  });
  return handleApiError(response);
};

// --- AI Assistant API ---

export const generateAIResponse = async (applicationId: string): Promise<{ success: boolean; response: string }> => {
  const response = await fetch(`${API_BASE_URL}/ai/generate-response`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ application_id: applicationId }),
  });
  return handleApiError(response);
};


