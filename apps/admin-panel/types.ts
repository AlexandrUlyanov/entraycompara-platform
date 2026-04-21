
export enum Status {
  NewLead = 'New Lead',
  Analysis = 'Analysis',
  Proposal = 'Proposal',
  Negotiation = 'Negotiation',
  ContractWon = 'Contract Won',
  DealLost = 'Deal Lost',
}

export enum ServiceType {
  GasComparison = 'Gas Comparison',
  ElectricityComparison = 'Electricity Comparison',
}

export enum NoteType {
  Note = 'NOTE',
  WhatsApp = 'WHATSAPP',
  Call = 'CALL',
  Email = 'EMAIL',
  System = 'SYSTEM', // Internal use only, maps to NOTE on backend
}

export interface ApplicationNote {
  id: string;
  application_id: string;
  content: string;
  type: NoteType;
  created_at: string;
  created_by?: string;
  direction?: 'incoming' | 'outgoing';
  wa_message_id?: string;
  wa_status?: 'sent' | 'delivered' | 'read';
}

export interface Application {
  id: string;
  submission_date: string;
  client_name: string;
  client_phone: string;
  service_type: ServiceType;
  status: Status;
  // Fields available in detail view
  client_email?: string;
  notes?: string; // Deprecated in favor of timeline, but kept for backward compatibility
  language?: string;
  uploaded_files?: string[];
  proposal_file_url?: string;
  whatsapp_first_message_sent?: boolean;
  whatsapp_first_message_sent_at?: string;
  whatsapp_first_message_id?: string;
}

export interface CursorPaginatedApplications {
  applications: Application[];
  next_cursor: string | null;
}