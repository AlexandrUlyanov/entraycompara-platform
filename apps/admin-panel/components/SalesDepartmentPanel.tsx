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
import { NoteType, SalesDepartmentAgentStep, SalesDepartmentAutopilotMode, SalesDepartmentAutopilotState, SalesDepartmentState } from '../types';
import Spinner from './Spinner';

interface SalesDepartmentPanelProps {
  appId: string;
  onInsertMessage?: (message: string) => void;
}

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

const getAgentLabel = (agentKey: string): string => {
  const labels: Record<string, string> = {
    intake_analyst: 'Intake Analyst',
    context_builder: 'Context Builder',
    sales_strategist: 'Sales Strategist',
    message_coach: 'Message Coach',
    safety_guard: 'Safety Guard',
  };
  return labels[agentKey] || agentKey.replace(/_/g, ' ');
};

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

const RadarTile: React.FC<{ label: string; value?: string | number | null; tone?: string }> = ({ label, value, tone = 'slate' }) => {
  const toneClasses: Record<string, string> = {
    blue: 'from-blue-50 to-white border-blue-100',
    green: 'from-emerald-50 to-white border-emerald-100',
    amber: 'from-amber-50 to-white border-amber-100',
    slate: 'from-slate-50 to-white border-slate-100',
  };

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${toneClasses[tone]} p-4`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{value || 'n/a'}</div>
    </div>
  );
};

const AgentStep: React.FC<{ agent: SalesDepartmentAgentStep }> = ({ agent }) => {
  const statusTone = getStatusTone(agent.status);

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/70 p-3">
      <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border ${statusTone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{getAgentLabel(agent.agent_key)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone}`}>
            {agent.status}
          </span>
          {typeof agent.confidence === 'number' && (
            <span className="text-[11px] font-medium text-slate-400">confidence {formatPercent(agent.confidence)}</span>
          )}
        </div>
        {agent.summary && <p className="mt-1 text-xs leading-relaxed text-slate-500">{agent.summary}</p>}
      </div>
    </div>
  );
};

const ActionPanel: React.FC<{ state: SalesDepartmentState }> = ({ state }) => (
  <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-blue-500">Лучший следующий шаг</div>
        <h4 className="mt-1 text-lg font-bold text-slate-900">{state.recommended_action || 'Нужно обновить анализ'}</h4>
      </div>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(state.action_priority)}`}>
        {state.action_priority || 'normal'}
      </span>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <RadarTile label="Цель" value={state.goal} tone="blue" />
      <RadarTile label="Почему сейчас" value={state.why_now} tone="amber" />
      <RadarTile label="Ожидаемый эффект" value={state.expected_outcome} tone="green" />
    </div>
    {state.suggested_cta && (
      <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-3 text-sm font-medium text-slate-700">
        CTA: {state.suggested_cta}
      </div>
    )}
  </div>
);

const MessageStudio: React.FC<{
  message?: string | null;
  isBusy: boolean;
  onInsert: () => void;
}> = ({ message, isBusy, onInsert }) => (
  <div className="rounded-[24px] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Message Studio</div>
        <h4 className="mt-1 text-lg font-bold text-slate-900">Черновик следующего сообщения</h4>
        <p className="mt-1 text-sm text-slate-500">
          AI готовит текст, оператор проверяет и отправляет вручную. Автоотправки здесь нет.
        </p>
      </div>
      <button
        type="button"
        onClick={onInsert}
        disabled={!message || isBusy}
        className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? <Spinner size="h-4 w-4" /> : 'Вставить в WhatsApp'}
      </button>
    </div>
    <div className="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 text-sm leading-relaxed text-slate-700">
      {message || 'Черновик появится после анализа отдела продаж.'}
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
}> = ({ autopilot, isLoading, onModeChange, onRecalculate, onHandoff, isBusy }) => {
  const currentMode = autopilot?.mode || 'manual';
  const modes: Array<{ mode: SalesDepartmentAutopilotMode; title: string; description: string }> = [
    { mode: 'manual', title: 'Manual', description: 'AI только анализирует, оператор решает всё сам.' },
    { mode: 'assisted_auto', title: 'Assisted Auto', description: 'AI готовит следующий шаг, отправка только после подтверждения.' },
    { mode: 'full_auto', title: 'Full Auto', description: 'Пилотный режим заблокирован до guardrails.' },
  ];

  return (
    <div className="rounded-[24px] border border-slate-100 bg-white/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Autopilot Control</div>
          <h4 className="mt-1 text-lg font-bold text-slate-900">Режим обработки лида</h4>
          <p className="mt-1 text-sm text-slate-500">
            Сейчас автопилот ничего не отправляет сам. Это безопасная панель управления режимами и handoff.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusTone(autopilot?.status)}`}>
          {isLoading ? 'loading' : autopilot?.status || 'manual_control'}
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
        <RadarTile label="Safe to send" value={autopilot?.safe_to_send ? 'yes' : 'no'} tone={autopilot?.safe_to_send ? 'green' : 'amber'} />
        <RadarTile label="Handoff" value={autopilot?.handoff_required ? 'required' : 'no'} tone={autopilot?.handoff_required ? 'amber' : 'green'} />
        <RadarTile label="Last update" value={formatDateTime(autopilot?.updated_at)} />
      </div>

      {autopilot?.last_decision && (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-sm leading-relaxed text-slate-600">
          {autopilot.last_decision}
        </div>
      )}

      {((autopilot?.blocked_reasons?.length || 0) > 0 || (autopilot?.warnings?.length || 0) > 0) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(autopilot?.blocked_reasons?.length || 0) > 0 && (
            <div className="rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-red-500">Guardrails blocked</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {autopilot?.blocked_reasons?.map((reason) => (
                  <span key={reason} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-red-700">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(autopilot?.warnings?.length || 0) > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Warnings</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {autopilot?.warnings?.map((warning) => (
                  <span key={warning} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                    {warning}
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
          Пересчитать режим
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={onHandoff}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Handoff оператору
        </button>
      </div>
    </div>
  );
};

const EmptyState: React.FC<{ onAnalyze: () => void; isPending: boolean }> = ({ onAnalyze, isPending }) => (
  <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
    <h4 className="text-base font-bold text-slate-800">AI-отдел продаж ещё не анализировал этот лид</h4>
    <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
      Запустим безопасный анализ: агент соберёт контекст лида, проверит документы, симуляции, историю и предложит следующий шаг без автоматической отправки сообщений.
    </p>
    <button
      onClick={onAnalyze}
      disabled={isPending}
      className="mt-5 inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? <Spinner size="h-4 w-4" /> : 'Запустить анализ'}
    </button>
  </div>
);

const SalesDepartmentPanel: React.FC<SalesDepartmentPanelProps> = ({ appId, onInsertMessage }) => {
  const queryClient = useQueryClient();
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
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">Sales Department AI</div>
            <h3 className="mt-1 text-2xl font-bold">Отдел продаж</h3>
            <p className="mt-1 max-w-2xl text-sm text-blue-100">
              Видимость работы AI-молекулы: контекст, риски, следующий шаг и контроль безопасности.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {state && (
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusTone(state.pipeline_health)}`}>
                {state.pipeline_health || state.status || 'ready'}
              </span>
            )}
            <button
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {analyzeMutation.isPending ? <Spinner size="h-4 w-4" /> : state ? 'Обновить анализ' : 'Запустить анализ'}
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
            Не удалось загрузить состояние отдела продаж: {(error as Error).message}
          </div>
        )}

        {!isLoading && !isError && !state && (
          <EmptyState onAnalyze={() => analyzeMutation.mutate()} isPending={analyzeMutation.isPending} />
        )}

        {state && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <RadarTile label="Состояние клиента" value={state.client_state} tone="blue" />
              <RadarTile label="Главное препятствие" value={state.friction_point} tone="amber" />
              <RadarTile label="Вероятность ответа" value={formatPercent(state.reply_probability)} tone="green" />
              <RadarTile label="Стадия сделки" value={state.deal_stage} tone="slate" />
            </div>

            <ActionPanel state={state} />

            <MessageStudio
              message={state.suggested_message}
              isBusy={logDraftInsertedMutation.isPending}
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
            />

            <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
              <div className="rounded-[24px] border border-slate-100 bg-white/70 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Pipeline активности</h4>
                  <span className="text-xs font-medium text-slate-400">Обновлено: {formatDateTime(state.updated_at)}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {agents.length > 0 ? (
                    agents.map((agent) => <AgentStep key={agent.agent_key} agent={agent} />)
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                      Агентские шаги появятся после следующего анализа.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-500">Контекст лида</h4>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <RadarTile label="Файлы" value={state.snapshot_summary?.uploaded_files_count ?? 0} />
                  <RadarTile label="События" value={state.snapshot_summary?.timeline_events_count ?? 0} />
                  <RadarTile label="Данные" value={state.snapshot_summary?.has_extracted_data ? 'есть' : 'нет'} />
                  <RadarTile label="КП" value={state.snapshot_summary?.has_proposal ? 'готово' : 'нет'} />
                  <RadarTile label="Симуляция" value={state.snapshot_summary?.has_selected_simulation ? 'выбрана' : 'нет'} />
                  <RadarTile label="Язык" value={state.language_used || 'auto'} />
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
