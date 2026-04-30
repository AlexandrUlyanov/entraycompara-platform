
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
  wa_status?: 'submitted' | 'sent' | 'delivered' | 'read';
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

export interface WhatsAppConnectionHealth {
  configured: boolean;
  ready_to_send: boolean;
  webhook_ready: boolean;
  api_version: string;
  phone_number_id_present: boolean;
  access_token_present: boolean;
  verify_token_present: boolean;
  meta_ok: boolean;
  meta_error?: string | null;
  phone_number?: string | null;
  verified_name?: string | null;
  quality_rating?: string | null;
  code_verification_status?: string | null;
  webhook_callback_url?: string | null;
  checked_at?: string | null;
}

export type SalesDepartmentAgentStatus = 'pending' | 'running' | 'completed' | 'needs_attention' | 'failed' | string;

export interface SalesDepartmentAgentStep {
  agent_key: string;
  status: SalesDepartmentAgentStatus;
  summary?: string | null;
  confidence?: number | null;
  group?: string | null;
  evidence?: string[];
  risk_flags?: string[];
}

export interface SalesDepartmentSnapshotSummary {
  status?: string;
  uploaded_files_count?: number;
  has_extracted_data?: boolean;
  has_selected_simulation?: boolean;
  has_proposal?: boolean;
  timeline_events_count?: number;
}

export interface SalesDepartmentFreshness {
  is_stale?: boolean;
  stale_reasons?: string[];
  events_after_last_run_count?: number;
  current_inputs_hash?: string;
  last_inputs_hash?: string;
  snapshot_summary?: SalesDepartmentSnapshotSummary;
}

export interface SalesDepartmentMetrics {
  files_count?: number;
  timeline_events_count?: number;
  whatsapp_incoming_count?: number;
  whatsapp_outgoing_count?: number;
  simulations_count?: number;
  has_selected_simulation?: boolean;
  has_proposal?: boolean;
  active_actions_count?: number;
  blocked_actions_count?: number;
  warning_actions_count?: number;
  time_to_first_operator_action_hours?: number | null;
  time_to_extraction_hours?: number | null;
  time_to_selected_simulation_hours?: number | null;
  time_to_proposal_hours?: number | null;
  last_client_message_age_hours?: number | null;
}

export interface SalesDepartmentDecisionTraceItem {
  step: string;
  value?: string | null;
}

export interface SalesDepartmentMoleculeRole {
  key: string;
  name?: string;
  group?: string;
  status?: SalesDepartmentAgentStatus;
  output?: string | null;
  decision?: string | null;
  confidence?: number | null;
  evidence?: string[];
  risk_flags?: string[];
}

export interface SalesDepartmentMolecule {
  mode?: string;
  roles?: SalesDepartmentMoleculeRole[];
  decision_trace?: SalesDepartmentDecisionTraceItem[];
  next_action?: string;
  human_approval_required?: boolean;
  auto_send_allowed?: boolean;
}

export interface SalesDepartmentGuardrailResult {
  safe_to_execute?: boolean;
  blocked_reasons?: string[];
  warnings?: string[];
  requires_operator_approval?: boolean;
  checked_at?: string;
}

export interface SalesDepartmentNextAction {
  action_id?: string;
  application_id?: string;
  type?: string;
  status?: string;
  priority?: string;
  reason?: string;
  requires_approval?: boolean;
  safe_to_execute?: boolean;
  payload?: {
    recommended_action?: string;
    suggested_cta?: string;
    suggested_message?: string | null;
    language?: string;
    goal?: string;
    [key: string]: unknown;
  };
  guardrail_result?: SalesDepartmentGuardrailResult;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalesDepartmentState {
  version?: number;
  status?: string;
  client_state?: string;
  friction_point?: string;
  reply_probability?: number;
  engagement_level?: string;
  trust_level?: number;
  deal_temperature?: string;
  recommended_action?: string;
  action_priority?: string;
  goal?: string;
  why_now?: string;
  expected_outcome?: string;
  suggested_cta?: string;
  suggested_message?: string | null;
  language_used?: string;
  followup_needed?: boolean;
  followup_eta_hours?: number | null;
  deal_stage?: string;
  pipeline_health?: string;
  agents?: SalesDepartmentAgentStep[];
  molecule?: SalesDepartmentMolecule;
  decision_trace?: SalesDepartmentDecisionTraceItem[];
  last_inputs_hash?: string;
  last_run_id?: string;
  last_reanalysis_at?: string;
  last_reanalysis_trigger?: string;
  last_reanalysis_reason?: string;
  last_event_id?: string | null;
  updated_at?: string;
  snapshot_summary?: SalesDepartmentSnapshotSummary;
  next_action?: SalesDepartmentNextAction;
  guardrail_result?: SalesDepartmentGuardrailResult;
  safe_to_send?: boolean;
  needs_operator_review?: boolean;
  freshness?: SalesDepartmentFreshness;
  is_stale?: boolean;
  stale_reasons?: string[];
  events_after_last_run_count?: number;
  metrics?: SalesDepartmentMetrics;
  followups?: SalesDepartmentFollowup[];
  next_followup?: SalesDepartmentFollowup;
}

export interface SalesDepartmentRun {
  run_id?: string;
  status?: string;
  trigger?: string;
  started_at?: string;
  completed_at?: string | null;
  agents?: SalesDepartmentAgentStep[];
  result?: SalesDepartmentState;
  snapshot?: unknown;
}

export interface SalesDepartmentStateResponse {
  success: boolean;
  exists: boolean;
  state: SalesDepartmentState | null;
  latest_run?: SalesDepartmentRun | null;
}

export interface SalesDepartmentAnalyzeResponse {
  success: boolean;
  run_id: string;
  state: SalesDepartmentState;
  run: SalesDepartmentRun;
}

export interface SalesDepartmentActionsResponse {
  success: boolean;
  actions: SalesDepartmentNextAction[];
}

export interface SalesDepartmentActionDecisionResponse {
  success: boolean;
  action: SalesDepartmentNextAction;
}

export interface SalesDepartmentAuditEvent {
  audit_id?: string;
  event_type?: string;
  source?: string;
  snapshot_hash?: string;
  action_id?: string;
  run_id?: string;
  actor?: string;
  decision?: string;
  guardrail_result?: SalesDepartmentGuardrailResult;
  before_state?: Record<string, unknown>;
  after_state?: Record<string, unknown>;
  created_at?: string;
  [key: string]: unknown;
}

export interface SalesDepartmentAuditResponse {
  success: boolean;
  audit: SalesDepartmentAuditEvent[];
}

export interface SalesDepartmentFollowup {
  followup_id?: string;
  application_id?: string;
  type?: string;
  status?: string;
  scheduled_at?: string;
  ready_at?: string;
  reason?: string;
  message_draft?: string;
  requires_approval?: boolean;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  executed_at?: string;
  result?: string;
  deal_stage?: string;
  recommended_action?: string;
  guardrail_result?: SalesDepartmentGuardrailResult;
  created_at?: string;
  updated_at?: string;
}

export interface SalesDepartmentFollowupsResponse {
  success: boolean;
  followups: SalesDepartmentFollowup[];
}

export interface SalesDepartmentFollowupDecisionResponse {
  success: boolean;
  followup: SalesDepartmentFollowup;
}

export type SalesDepartmentAutopilotMode = 'manual' | 'assisted_auto' | 'full_auto';

export interface SalesDepartmentAutopilotState {
  application_id?: string;
  mode: SalesDepartmentAutopilotMode;
  enabled: boolean;
  status?: string;
  safe_to_send?: boolean;
  allowed_actions?: string[];
  blocked_reasons?: string[];
  warnings?: string[];
  guardrail_result?: SalesDepartmentGuardrailResult;
  full_auto_enabled?: boolean;
  handoff_required?: boolean;
  handoff_reason?: string;
  assigned_to?: string | null;
  last_decision?: string;
  last_reason?: string | null;
  updated_at?: string;
  created_at?: string;
  last_evaluated_state?: {
    pipeline_health?: string;
    reply_probability?: number;
    recommended_action?: string;
    deal_stage?: string;
  };
}

export interface SalesDepartmentAutopilotResponse {
  success: boolean;
  autopilot: SalesDepartmentAutopilotState;
}

export interface CursorPaginatedApplications {
  applications: Application[];
  next_cursor: string | null;
}
