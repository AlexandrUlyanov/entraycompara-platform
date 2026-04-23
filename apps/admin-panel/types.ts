
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
  // Поля для симуляции испанских электрических счетов (facturas de luz)
  cups?: string;                          // CUPS — уникальный номер счетчика
  client_type?: string;                   // Tipo de cliente: Hogar / Empresa
  access_tariff?: string;                 // Tarifa de Acceso: 2.0TD / 3.0TD / etc
  start_date?: string;                    // Fecha de Inicio
  end_date?: string;                      // Fecha de Fin
  equipment_rental?: number;              // Alquiler de equipos (€)
  invoice_amount_with_vat?: number;       // Importe Factura Actual con IVA (€)
  retailer?: string;                      // Comercializadora
  billed_power_p1?: number;               // Potencia Facturada P1 (kW)
  billed_power_p2?: number;               // Potencia Facturada P2 (kW)
  consumption_p1?: number;                // Consumo P1 (kWh)
  consumption_p2?: number;                // Consumo P2 (kWh)
  consumption_p3?: number;                // Consumo P3 (kWh)
  source_files?: string[];
}

export interface ProposalData {
  extracted_data?: ExtractedData;
  extracted_at?: string;
  extracted_by?: string;
  manually_corrected?: boolean;
  raw_extraction?: {
    primary_response_text?: string;
    primary_extracted_data?: ExtractedData;
    second_pass_attempted?: boolean;
    second_pass_response_text?: string | null;
    second_pass_updates?: Partial<ExtractedData>;
  };
  field_assessments?: Record<string, {
    value?: string | number | null;
    confidence?: number;
    needs_review?: boolean;
    reasons?: string[];
  }>;
  overall_confidence?: number;
  needs_review?: boolean;
  needs_review_fields?: string[];
  provider_rule_hits?: string[];
  last_manual_correction?: {
    changed_fields?: string[];
    corrected_at?: string;
  };
}

export interface ExtractionTaskStatus {
  success: boolean;
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
  step_key?: string;
  progress_percent?: number;
  extracted_data?: ExtractedData;
  field_assessments?: Record<string, {
    value?: string | number | null;
    confidence?: number;
    needs_review?: boolean;
    reasons?: string[];
  }>;
  overall_confidence?: number;
  needs_review?: boolean;
  needs_review_fields?: string[];
  error?: string;
}

export interface LatestExtractionTaskResponse {
  success: boolean;
  task: ExtractionTaskStatus | null;
}

export interface RetailerOption {
  value: string;
  label: string;
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

export interface AutoSimulationTaskStatus {
  success: boolean;
  task_id: string;
  status: 'pending' | 'running' | 'awaiting_tariff_selection' | 'completed' | 'failed';
  message: string;
  step_key?: string;
  step_label?: string;
  step_details?: string;
  progress_percent?: number;
  tariff_selection_deadline?: string;
  simulation_id?: string;
  simulation_file_url?: string;
  error?: string;
  tariffs?: Array<{ index: number; name: string; current_price: string; plenitude_price: string }>;
}

export interface LatestAutoSimulationTaskResponse {
  success: boolean;
  task: AutoSimulationTaskStatus | null;
}

export interface CursorPaginatedApplications {
  applications: Application[];
  next_cursor: string | null;
}
