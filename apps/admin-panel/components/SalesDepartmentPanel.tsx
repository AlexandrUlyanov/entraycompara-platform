import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analyzeSalesDepartment,
  createTimelineNote,
  getSalesDepartmentAutopilot,
  getSalesDepartmentState,
  handoffSalesDepartment,
  recalculateSalesDepartmentAutopilot,
  updateSalesDepartmentAutopilot,
} from '../services/api';
import {
  NoteType,
  SalesDepartmentAgentStep,
  SalesDepartmentAutopilotMode,
  SalesDepartmentAutopilotState,
  SalesDepartmentMolecule,
  SalesDepartmentMoleculeRole,
  SalesDepartmentState,
} from '../types';
import Spinner from './Spinner';
import { useTranslation } from '../i18n';

interface SalesDepartmentPanelProps {
  appId: string;
  onInsertMessage?: (message: string) => void;
}

type TFunction = (key: string, values?: Record<string, string | number>) => string;

const translateIfExists = (t: TFunction, key: string, fallback: string, values?: Record<string, string | number>): string => {
  const translated = t(key, values);
  return translated === key ? fallback : translated;
};

const translateSalesValue = (value: string | number | null | undefined, t: TFunction): string => {
  if (value === null || value === undefined || value === '') return 'n/a';
  if (typeof value === 'number') return String(value);
  if (value === 'None') return 'n/a';

  const normalized = value.trim();
  const directKey = `sales.value.${normalized}`;
  const directTranslation = t(directKey);
  if (directTranslation !== directKey) return directTranslation;

  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const slugKey = `sales.value.${slug}`;
  return translateIfExists(t, slugKey, normalized.replace(/_/g, ' '));
};

const translateSalesText = (text: string | null | undefined, t: TFunction): string => {
  if (!text) return '';

  const trimmed = text.trim();
  const exactMatches: Record<string, string> = {
    'Based on current lead status, documents, proposal data and recent timeline.': 'sales.text.whyNow.default',
    'Client understands the next step and stays in the process.': 'sales.text.expectedOutcome.default',
    'No automatic send is allowed in the current safety phase.': 'sales.text.agent.noAutoSend',
    'Manual mode is active. No automatic actions are allowed.': 'sales.text.autopilot.manual',
    'Manual mode is active. AI can analyze, but cannot prepare or send actions automatically.': 'sales.text.autopilot.manualAnalyzeOnly',
  };

  if (exactMatches[trimmed]) {
    return translateIfExists(t, exactMatches[trimmed], trimmed);
  }

  const translatedValue = translateSalesValue(trimmed, t);
  if (translatedValue !== trimmed.replace(/_/g, ' ')) {
    return translatedValue;
  }

  const patternMatches: Array<{ regex: RegExp; key: string }> = [
    { regex: /^Friction point is (.+)$/i, key: 'sales.text.agent.frictionPoint' },
    { regex: /^Goal is (.+)$/i, key: 'sales.text.agent.goal' },
    { regex: /^CTA is (.+)$/i, key: 'sales.text.agent.cta' },
    { regex: /^ETA hours: (.+)$/i, key: 'sales.text.agent.eta' },
    { regex: /^Pipeline health is (.+)$/i, key: 'sales.text.agent.pipelineHealth' },
  ];

  for (const item of patternMatches) {
    const match = trimmed.match(item.regex);
    if (match) {
      return translateIfExists(t, item.key, trimmed, { value: translateSalesValue(match[1], t) });
    }
  }

  return trimmed;
};

const translateTraceStep = (step: string, t: TFunction): string =>
  translateIfExists(t, `sales.trace.step.${step}`, step.replace(/_/g, ' '));

const formatPercent = (value?: number): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
};

const formatDateTime = (value?: string): string => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getAgentLabel = (agentKey: string, t: TFunction): string =>
  translateIfExists(t, `sales.agent.${agentKey}`, agentKey.replace(/_/g, ' '));

const getStatusTone = (status?: string): string => {
  switch (status) {
    case 'completed':
    case 'ready':
    case 'healthy':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'needs_attention':
    case 'watch':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'failed':
    case 'blocked':
      return 'bg-red-50 text-red-700 border-red-100';
    case 'running':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-100';
  }
};

const SafetySignalList: React.FC<{
  title: string;
  items?: string[];
  tone: 'red' | 'amber';
  t: TFunction;
}> = ({ title, items = [], tone, t }) => {
  if (items.length === 0) return null;

  const toneClasses = tone === 'red'
    ? 'border-red-100 bg-red-50/70 text-red-700'
    : 'border-amber-100 bg-amber-50/70 text-amber-700';

  return (
    <div className={`rounded-2xl border p-3 ${toneClasses}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider">{title}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold">
            {translateSalesValue(item, t)}
          </span>
        ))}
      </div>
    </div>
  );
};

const RadarTile: React.FC<{ label: string; value?: string | number | null; tone?: string }> = ({ label, value, tone = 'slate' }) => {
  const toneClasses: Record<string, string> = {
    blue: 'from-blue-50 to-white border-blue-100',
    green: 'from-emerald-50 to-white border-emerald-100',
    amber: 'from-amber-50 to-white border-amber-100',
    indigo: 'from-indigo-50 to-white border-indigo-100',
    red: 'from-red-50 to-white border-red-100',
    slate: 'from-slate-50 to-white border-slate-100',
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneClasses[tone]} p-4`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value || 'n/a'}</div>
    </div>
  );
};

const SalesControlHud: React.FC<{
  state: SalesDepartmentState;
  autopilot?: SalesDepartmentAutopilotState;
  isAnalyzing: boolean;
  t: TFunction;
}> = ({ state, autopilot, isAnalyzing, t }) => {
  const pulseTone = isAnalyzing ? 'bg-blue-400 shadow-blue-400/50' : 'bg-emerald-400 shadow-emerald-400/40';

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.35),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.22),transparent_32%)]" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-blue-100">
            <span className={`h-2.5 w-2.5 rounded-full ${pulseTone} shadow-lg ${isAnalyzing ? 'animate-pulse' : ''}`} />
            {t('sales.hud.kicker')}
          </div>
          <h4 className="mt-2 text-xl font-bold">{t('sales.hud.title')}</h4>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-300">
            {t('sales.hud.description')}
          </p>
        </div>
        <div className="grid min-w-[260px] grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{t('sales.hud.autopilot')}</div>
            <div className="mt-1 font-semibold">{translateSalesValue(autopilot?.mode || 'manual', t)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{t('sales.hud.safeToSend')}</div>
            <div className="mt-1 font-semibold">{autopilot?.safe_to_send ? t('common.yes') : t('common.no')}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{t('sales.hud.pipeline')}</div>
            <div className="mt-1 font-semibold">{translateSalesValue(state.pipeline_health || 'ready', t)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{t('sales.hud.updated')}</div>
            <div className="mt-1 font-semibold">{formatDateTime(state.updated_at)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AgentStep: React.FC<{ agent: SalesDepartmentAgentStep; t: TFunction }> = ({ agent, t }) => {
  const statusTone = getStatusTone(agent.status);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/70 p-3">
      <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border ${statusTone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{getAgentLabel(agent.agent_key, t)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone}`}>
            {translateSalesValue(agent.status, t)}
          </span>
          {typeof agent.confidence === 'number' && (
            <span className="text-[11px] font-medium text-slate-400">{t('sales.agent.confidence', { value: formatPercent(agent.confidence) })}</span>
          )}
        </div>
        {agent.summary && <p className="mt-1 text-xs leading-relaxed text-slate-500">{translateSalesText(agent.summary, t)}</p>}
      </div>
    </div>
  );
};

const DecisionTracePanel: React.FC<{
  state: SalesDepartmentState;
  t: TFunction;
}> = ({ state, t }) => {
  const trace = state.decision_trace || state.molecule?.decision_trace || [];

  return (
    <div className="rounded-[24px] border border-slate-100 bg-white/80 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('sales.trace.kicker')}</div>
          <h4 className="mt-1 text-lg font-bold text-slate-900">{t('sales.trace.title')}</h4>
        </div>
        <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          {t('sales.trace.signals', { count: trace.length })}
        </span>
      </div>
      {trace.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {trace.map((item, index) => (
            <div key={`${item.step}-${index}`} className="relative rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{translateTraceStep(item.step, t)}</span>
              </div>
              <div className="mt-3 text-xs font-semibold leading-relaxed text-slate-700">{translateSalesValue(item.value, t)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
          {t('sales.trace.empty')}
        </div>
      )}
    </div>
  );
};

const FollowUpDealPanel: React.FC<{
  state: SalesDepartmentState;
  autopilot?: SalesDepartmentAutopilotState;
  t: TFunction;
}> = ({ state, autopilot, t }) => (
  <div className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('sales.followup.kicker')}</div>
        <h4 className="mt-1 text-lg font-bold text-slate-900">{t('sales.followup.title')}</h4>
      </div>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(autopilot?.handoff_required ? 'needs_attention' : state.pipeline_health)}`}>
        {translateSalesValue(autopilot?.handoff_required ? 'handoff_required' : state.pipeline_health || 'ready', t)}
      </span>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-4">
      <RadarTile label={t('sales.followup.needed')} value={state.followup_needed ? t('common.yes') : t('common.no')} tone={state.followup_needed ? 'amber' : 'green'} />
      <RadarTile label={t('sales.followup.eta')} value={state.followup_eta_hours ? t('sales.followup.hours', { hours: state.followup_eta_hours }) : 'n/a'} tone="blue" />
      <RadarTile label={t('sales.followup.dealTemperature')} value={translateSalesValue(state.deal_temperature, t)} tone="indigo" />
      <RadarTile label={t('sales.followup.trustLevel')} value={formatPercent(state.trust_level)} tone="green" />
    </div>
    {autopilot?.last_decision && (
      <div className="mt-4 rounded-2xl border border-white bg-white/80 p-3 text-sm leading-relaxed text-slate-600">
        {translateSalesText(autopilot.last_decision, t)}
      </div>
    )}
  </div>
);

const MoleculeRoleCard: React.FC<{ role: SalesDepartmentMoleculeRole; t: TFunction }> = ({ role, t }) => {
  const statusTone = getStatusTone(role.status);

  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{getAgentLabel(role.key, t)}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone}`}>
          {translateSalesValue(role.status || 'ready', t)}
        </span>
      </div>
      {role.decision && <p className="mt-2 text-xs leading-relaxed text-slate-600">{translateSalesText(role.decision, t)}</p>}
      {role.output && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
          {translateSalesValue(role.output, t)}
        </div>
      )}
    </div>
  );
};

const SalesMoleculePanel: React.FC<{
  molecule?: SalesDepartmentMolecule;
  t: TFunction;
}> = ({ molecule, t }) => {
  const roles = molecule?.roles || [];

  return (
    <div className="rounded-[24px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-blue-50 to-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-500">{t('sales.molecule.kicker')}</div>
          <h4 className="mt-1 text-lg font-bold text-slate-900">{t('sales.molecule.title')}</h4>
          <p className="mt-1 text-sm text-slate-500">
            {t('sales.molecule.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-emerald-700">
            {t('sales.molecule.humanApproval')}
          </span>
          <span className="rounded-full border border-red-100 bg-red-50 px-3 py-1 text-red-700">
            {t('sales.molecule.autoSendOff')}
          </span>
        </div>
      </div>

      {roles.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((role) => (
            <MoleculeRoleCard key={role.key} role={role} t={t} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-white/60 p-4 text-sm text-slate-500">
          {t('sales.molecule.empty')}
        </div>
      )}
    </div>
  );
};

const ActionPanel: React.FC<{
  state: SalesDepartmentState;
  t: TFunction;
}> = ({ state, t }) => {
  const nextAction = state.next_action;
  const guardrails = state.guardrail_result || nextAction?.guardrail_result;
  const blockedReasons = guardrails?.blocked_reasons || [];
  const warnings = guardrails?.warnings || [];
  const actionTitle = nextAction?.type || state.recommended_action;

  return (
    <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-500">{t('sales.action.title')}</div>
          <h4 className="mt-1 text-lg font-bold text-slate-900">
            {actionTitle ? translateSalesValue(actionTitle, t) : t('sales.action.needsRefresh')}
          </h4>
          {nextAction?.action_id && (
            <div className="mt-1 text-xs font-medium text-blue-500">
              {t('sales.action.id')}: {nextAction.action_id}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(nextAction?.status || state.action_priority)}`}>
            {translateSalesValue(nextAction?.status || state.action_priority || 'normal', t)}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${guardrails?.safe_to_execute ? getStatusTone('ready') : getStatusTone('needs_attention')}`}>
            {guardrails?.safe_to_execute ? t('sales.safety.safe') : t('sales.safety.needsReview')}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <RadarTile label={t('sales.action.goal')} value={translateSalesValue(state.goal, t)} tone="blue" />
        <RadarTile label={t('sales.action.whyNow')} value={translateSalesText(state.why_now, t)} tone="amber" />
        <RadarTile label={t('sales.action.expectedOutcome')} value={translateSalesText(state.expected_outcome, t)} tone="green" />
      </div>
      {state.suggested_cta && (
        <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-3 text-sm font-medium text-slate-700">
          CTA: {translateSalesValue(state.suggested_cta, t)}
        </div>
      )}
      {(blockedReasons.length > 0 || warnings.length > 0 || guardrails?.requires_operator_approval) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SafetySignalList title={t('sales.safety.blocked')} items={blockedReasons} tone="red" t={t} />
          <SafetySignalList title={t('sales.safety.warnings')} items={warnings} tone="amber" t={t} />
          {guardrails?.requires_operator_approval && (
            <div className="rounded-2xl border border-blue-100 bg-white/80 p-3 text-sm font-semibold text-blue-700 md:col-span-2">
              {t('sales.safety.operatorApprovalRequired')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MessageStudio: React.FC<{
  message?: string | null;
  isBusy: boolean;
  onInsert: () => void;
  t: TFunction;
}> = ({ message, isBusy, onInsert, t }) => (
  <div className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">{t('sales.messageStudio.kicker')}</div>
        <h4 className="mt-1 text-lg font-bold text-slate-900">{t('sales.messageStudio.title')}</h4>
        <p className="mt-1 text-sm text-slate-500">
          {t('sales.messageStudio.description')}
        </p>
      </div>
      <button
        type="button"
        onClick={onInsert}
        disabled={!message || isBusy}
        className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? <Spinner size="h-4 w-4" /> : t('sales.messageStudio.insert')}
      </button>
    </div>
    <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 text-sm leading-relaxed text-slate-700">
      {message || t('sales.messageStudio.empty')}
    </div>
  </div>
);

const AutopilotControl: React.FC<{
  autopilot?: SalesDepartmentAutopilotState;
  isLoading: boolean;
  onModeChange: (mode: SalesDepartmentAutopilotMode, enabled: boolean) => void;
  onRecalculate: () => void;
  onHandoff: () => void;
  isBusy: boolean;
  t: TFunction;
}> = ({ autopilot, isLoading, onModeChange, onRecalculate, onHandoff, isBusy, t }) => {
  const currentMode = autopilot?.mode || 'manual';
  const modes: Array<{ mode: SalesDepartmentAutopilotMode; title: string; description: string }> = [
    { mode: 'manual', title: t('sales.autopilot.mode.manual.title'), description: t('sales.autopilot.mode.manual.description') },
    { mode: 'assisted_auto', title: t('sales.autopilot.mode.assisted_auto.title'), description: t('sales.autopilot.mode.assisted_auto.description') },
    { mode: 'full_auto', title: t('sales.autopilot.mode.full_auto.title'), description: t('sales.autopilot.mode.full_auto.description') },
  ];

  return (
    <div className="rounded-[24px] border border-slate-100 bg-white/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('sales.autopilot.kicker')}</div>
          <h4 className="mt-1 text-lg font-bold text-slate-900">{t('sales.autopilot.title')}</h4>
          <p className="mt-1 text-sm text-slate-500">
            {t('sales.autopilot.description')}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(autopilot?.status)}`}>
          {translateSalesValue(isLoading ? 'loading' : autopilot?.status || 'manual_control', t)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {modes.map((item) => {
          const active = currentMode === item.mode;
          return (
            <button
              key={item.mode}
              type="button"
              disabled={isBusy}
              onClick={() => onModeChange(item.mode, item.mode !== 'manual')}
              className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? 'border-blue-200 bg-blue-50 shadow-sm'
                  : 'border-slate-100 bg-slate-50/70 hover:border-blue-100 hover:bg-white'
              }`}
            >
              <div className="text-sm font-bold text-slate-900">{item.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-slate-500">{item.description}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <RadarTile label={t('sales.autopilot.safeToSend')} value={autopilot?.safe_to_send ? t('common.yes') : t('common.no')} tone={autopilot?.safe_to_send ? 'green' : 'amber'} />
        <RadarTile label={t('sales.autopilot.handoff')} value={autopilot?.handoff_required ? translateSalesValue('required', t) : t('common.no')} tone={autopilot?.handoff_required ? 'amber' : 'green'} />
        <RadarTile label={t('sales.autopilot.lastUpdate')} value={formatDateTime(autopilot?.updated_at)} />
      </div>

      {autopilot?.last_decision && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-600">
          {translateSalesText(autopilot.last_decision, t)}
        </div>
      )}

      {((autopilot?.blocked_reasons?.length || 0) > 0 || (autopilot?.warnings?.length || 0) > 0) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(autopilot?.blocked_reasons?.length || 0) > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-red-500">{t('sales.autopilot.blocked')}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {autopilot?.blocked_reasons?.map((reason) => (
                  <span key={reason} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-red-700">
                    {translateSalesValue(reason, t)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(autopilot?.warnings?.length || 0) > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">{t('sales.autopilot.warnings')}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {autopilot?.warnings?.map((warning) => (
                  <span key={warning} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                    {translateSalesValue(warning, t)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isBusy}
          onClick={onRecalculate}
          className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('sales.autopilot.recalculate')}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onHandoff}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('sales.autopilot.handoffButton')}
        </button>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{
  onAnalyze: () => void;
  isPending: boolean;
  t: TFunction;
}> = ({ onAnalyze, isPending, t }) => (
  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
    <h4 className="text-base font-bold text-slate-800">{t('sales.empty.title')}</h4>
    <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
      {t('sales.empty.description')}
    </p>
    <button
      onClick={onAnalyze}
      disabled={isPending}
      className="mt-5 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Spinner size="h-4 w-4" /> : t('sales.launch')}
    </button>
  </div>
);

const SalesDepartmentPanel: React.FC<SalesDepartmentPanelProps> = ({ appId, onInsertMessage }) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['salesDepartment', appId],
    queryFn: () => getSalesDepartmentState(appId),
    enabled: !!appId,
  });
  const {
    data: autopilotData,
    isLoading: isAutopilotLoading,
  } = useQuery({
    queryKey: ['salesDepartmentAutopilot', appId],
    queryFn: () => getSalesDepartmentAutopilot(appId),
    enabled: !!appId,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeSalesDepartment(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesDepartment', appId] });
      queryClient.invalidateQueries({ queryKey: ['salesDepartmentAutopilot', appId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });
  const updateAutopilotMutation = useMutation({
    mutationFn: ({ mode, enabled }: { mode: SalesDepartmentAutopilotMode; enabled: boolean }) =>
      updateSalesDepartmentAutopilot(appId, mode, enabled, `Operator selected ${mode}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesDepartmentAutopilot', appId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });
  const recalculateAutopilotMutation = useMutation({
    mutationFn: () => recalculateSalesDepartmentAutopilot(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesDepartmentAutopilot', appId] });
    },
  });
  const handoffMutation = useMutation({
    mutationFn: () => handoffSalesDepartment(appId, 'Operator requested manual handoff from CRM'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salesDepartmentAutopilot', appId] });
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });
  const logDraftInsertedMutation = useMutation({
    mutationFn: (message: string) =>
      createTimelineNote(
        appId,
        `SALES_DEPARTMENT_DRAFT_INSERTED:${message.slice(0, 240)}`,
        NoteType.System,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const state = data?.state || null;
  const agents = state?.agents || data?.latest_run?.agents || [];
  const autopilot = autopilotData?.autopilot;
  const isAutopilotBusy = updateAutopilotMutation.isPending || recalculateAutopilotMutation.isPending || handoffMutation.isPending;

  return (
    <section className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden">
      <div className="border-b border-slate-100/80 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">{t('sales.kicker')}</div>
            <h3 className="mt-1 text-2xl font-bold">{t('sales.title')}</h3>
            <p className="mt-1 max-w-2xl text-sm text-blue-100">
              {t('sales.description')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {state && (
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusTone(state.pipeline_health)}`}>
                {translateSalesValue(state.pipeline_health || state.status || 'ready', t)}
              </span>
            )}
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {analyzeMutation.isPending ? <Spinner size="h-4 w-4" /> : state ? t('sales.refresh') : t('sales.launch')}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {isLoading && (
          <div className="flex items-center justify-center py-10">
            <Spinner size="h-8 w-8" />
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
            {t('sales.loadError', { message: (error as Error).message })}
          </div>
        )}

        {!isLoading && !isError && !state && (
          <EmptyState onAnalyze={() => analyzeMutation.mutate()} isPending={analyzeMutation.isPending} t={t} />
        )}

        {state && (
          <div className="space-y-5">
            <SalesControlHud state={state} autopilot={autopilot} isAnalyzing={analyzeMutation.isPending} t={t} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RadarTile label={t('sales.radar.clientState')} value={translateSalesValue(state.client_state, t)} tone="blue" />
              <RadarTile label={t('sales.radar.friction')} value={translateSalesValue(state.friction_point, t)} tone="amber" />
              <RadarTile label={t('sales.radar.replyProbability')} value={formatPercent(state.reply_probability)} tone="green" />
              <RadarTile label={t('sales.radar.dealStage')} value={translateSalesValue(state.deal_stage, t)} tone="slate" />
              <RadarTile label={t('sales.radar.engagement')} value={translateSalesValue(state.engagement_level, t)} tone="indigo" />
              <RadarTile label={t('sales.radar.trust')} value={formatPercent(state.trust_level)} tone="green" />
              <RadarTile label={t('sales.radar.dealTemperature')} value={translateSalesValue(state.deal_temperature, t)} tone="amber" />
              <RadarTile label={t('sales.radar.actionPriority')} value={translateSalesValue(state.action_priority, t)} tone="blue" />
            </div>

            <ActionPanel state={state} t={t} />

            <SalesMoleculePanel molecule={state.molecule} t={t} />

            <DecisionTracePanel state={state} t={t} />

            <MessageStudio
              message={state.suggested_message}
              isBusy={logDraftInsertedMutation.isPending}
              t={t}
              onInsert={() => {
                if (!state.suggested_message) return;
                onInsertMessage?.(state.suggested_message);
                logDraftInsertedMutation.mutate(state.suggested_message);
              }}
            />

            <AutopilotControl
              autopilot={autopilot}
              isLoading={isAutopilotLoading}
              isBusy={isAutopilotBusy}
              onModeChange={(mode, enabled) => updateAutopilotMutation.mutate({ mode, enabled })}
              onRecalculate={() => recalculateAutopilotMutation.mutate()}
              onHandoff={() => handoffMutation.mutate()}
              t={t}
            />

            <FollowUpDealPanel state={state} autopilot={autopilot} t={t} />

            <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[24px] border border-slate-100 bg-white/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">{t('sales.pipeline.title')}</h4>
                  <span className="text-xs font-medium text-slate-400">{t('sales.pipeline.updated', { time: formatDateTime(state.updated_at) })}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {agents.length > 0 ? (
                    agents.map((agent) => <AgentStep key={agent.agent_key} agent={agent} t={t} />)
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      {t('sales.pipeline.empty')}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">{t('sales.context.title')}</h4>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <RadarTile label={t('sales.context.files')} value={state.snapshot_summary?.uploaded_files_count ?? 0} />
                  <RadarTile label={t('sales.context.events')} value={state.snapshot_summary?.timeline_events_count ?? 0} />
                  <RadarTile label={t('sales.context.data')} value={state.snapshot_summary?.has_extracted_data ? t('sales.context.exists') : t('sales.context.none')} />
                  <RadarTile label={t('sales.context.proposal')} value={state.snapshot_summary?.has_proposal ? t('sales.context.ready') : t('sales.context.none')} />
                  <RadarTile label={t('sales.context.simulation')} value={state.snapshot_summary?.has_selected_simulation ? t('sales.context.selected') : t('sales.context.none')} />
                  <RadarTile label={t('sales.context.language')} value={state.language_used || 'auto'} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default SalesDepartmentPanel;
