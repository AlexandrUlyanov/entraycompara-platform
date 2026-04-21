
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
  analysis_started_at?: string;
  proposal_uploaded?: boolean;
}

export interface ExtractedData {
  service_type?: 'electricity' | 'gas' | 'internet' | 'mobile';
  current_provider?: string;
  contract_number?: string;
  current_tariff?: string;
  power_kw?: number;
  avg_monthly_consumption_kwh?: number;
  avg_monthly_cost_eur?: number;
  contract_end_date?: string;
  source_files?: string[];
}

export interface ProposalData {
  extracted_data?: ExtractedData;
  extracted_at?: string;
  extracted_by?: string;
  manually_corrected?: boolean;
}

export interface Simulation {
  id: string;
  simulation_name: string;
  new_provider: string;
  new_tariff?: string;
  new_monthly_cost_eur: number;
  contract_duration_months?: number;
  bonus_description?: string;
  simulation_file_url?: string;
  is_selected: boolean;
  savings_monthly_eur?: number;
  savings_percent?: number;
  created_at: string;
}

export interface CursorPaginatedApplications {
  applications: Application[];
  next_cursor: string | null;
}