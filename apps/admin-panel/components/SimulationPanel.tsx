import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSimulations, createSimulation, updateSimulation, deleteSimulation, selectSimulation,
  autoCreateEniSimulation, getAutoSimulationStatus, getLatestAutoSimulationTask, selectAutoSimulationTariff, getExtractedData
} from '../services/api';
import { Simulation } from '../types';
import Spinner from './Spinner';
import { ProcessMotionStyles, WorkingDots } from './ProcessMotion';
import { useTranslation } from '../i18n';

interface SimulationPanelProps {
  appId: string;
}

const EMPTY_SIMULATION = {
  simulation_name: '',
  new_provider: '',
  new_tariff: '',
  new_monthly_cost_eur: 0,
  contract_duration_months: undefined as number | undefined,
  bonus_description: '',
  simulation_file_url: '',
  is_selected: false,
};

type AutoTaskStatus = 'idle' | 'pending' | 'running' | 'awaiting_tariff_selection' | 'completed' | 'failed';
const MANAGER_SELECTION_TIMEOUT_SECONDS = 180;

const AUTO_SIMULATION_STEPS = [
  { key: 'job_started' },
  { key: 'open_referral' },
  { key: 'open_simulator' },
  { key: 'select_client_type' },
  { key: 'select_supply_type' },
  { key: 'validate_cups' },
  { key: 'retry_cups' },
  { key: 'start_simulation' },
  { key: 'fill_form' },
  { key: 'submit_form' },
  { key: 'parse_tariffs' },
  { key: 'await_manager_choice' },
  { key: 'apply_selected_tariff' },
  { key: 'auto_select_tariff' },
  { key: 'download_pdf' },
  { key: 'completed' },
] as const;

const SimulationPanel: React.FC<SimulationPanelProps> = ({ appId }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_SIMULATION);

  // Auto-simulation state
  const [autoTaskId, setAutoTaskId] = useState<string | null>(null);
  const [autoStatus, setAutoStatus] = useState<AutoTaskStatus>('idle');
  const [autoMessage, setAutoMessage] = useState<string>('');
  const [autoStepKey, setAutoStepKey] = useState<string | null>(null);
  const [autoStepLabel, setAutoStepLabel] = useState<string>('');
  const [autoStepDetails, setAutoStepDetails] = useState<string>('');
  const [autoProgressPercent, setAutoProgressPercent] = useState<number>(0);
  const [tariffSelectionDeadline, setTariffSelectionDeadline] = useState<string | null>(null);
  const [tariffSecondsLeft, setTariffSecondsLeft] = useState<number | null>(null);
  const [autoTariffs, setAutoTariffs] = useState<Array<{ index: number | string; name: string; current_price: string; plenitude_price: string }> | null>(null);
  const [selectedTariffIndex, setSelectedTariffIndex] = useState<number | null>(null);
  const [isSelectingTariff, setIsSelectingTariff] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['simulations', appId],
    queryFn: () => listSimulations(appId),
  });

  const { data: proposalData } = useQuery({
    queryKey: ['proposal-data', appId],
    queryFn: () => getExtractedData(appId),
    retry: false,
  });

  const simulations = data?.simulations || [];
  const extracted = proposalData?.extracted_data;
  const hasCups = !!extracted?.cups;

  useEffect(() => {
    if (autoTaskId) return;

    let isCancelled = false;
    const hydrateLatestTask = async () => {
      try {
        const result = await getLatestAutoSimulationTask(appId);
        if (isCancelled || !result.task) return;

        setAutoTaskId(result.task.task_id);
        setAutoStatus(result.task.status as AutoTaskStatus);
        setAutoMessage(result.task.message || '');
        setAutoStepKey(result.task.step_key || null);
        setAutoStepLabel(result.task.step_label || '');
        setAutoStepDetails(result.task.step_details || '');
        setAutoProgressPercent(result.task.progress_percent || 0);
        setTariffSelectionDeadline(result.task.tariff_selection_deadline || null);
        setAutoTariffs(result.task.status === 'awaiting_tariff_selection' ? result.task.tariffs || null : null);
      } catch (error) {
        console.error('Latest auto-simulation task hydration error:', error);
      }
    };

    hydrateLatestTask();
    return () => {
      isCancelled = true;
    };
  }, [appId, autoTaskId]);

  // Polling auto-simulation status
  useEffect(() => {
    if (!autoTaskId || autoStatus === 'completed' || autoStatus === 'failed') return;

    const interval = setInterval(async () => {
      try {
      const result = await getAutoSimulationStatus(appId, autoTaskId);
      setAutoStatus(result.status as AutoTaskStatus);
      setAutoMessage(result.message || '');
      setAutoStepKey(result.step_key || null);
      setAutoStepLabel(result.step_label || '');
      setAutoStepDetails(result.step_details || '');
      setAutoProgressPercent(result.progress_percent || 0);
      setTariffSelectionDeadline(result.tariff_selection_deadline || null);
      if (result.status === 'awaiting_tariff_selection' && result.tariffs && result.tariffs.length > 0) {
        setAutoTariffs(result.tariffs);
      } else {
        setAutoTariffs(null);
      }
      if (result.status === 'completed' || result.status === 'failed') {
        clearInterval(interval);
        queryClient.invalidateQueries({ queryKey: ['simulations', appId] });
      }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [autoTaskId, autoStatus, appId, queryClient]);

  useEffect(() => {
    if (autoStatus !== 'awaiting_tariff_selection' || !tariffSelectionDeadline) {
      setTariffSecondsLeft(null);
      return;
    }

    const updateRemaining = () => {
      const deadlineMs = new Date(tariffSelectionDeadline).getTime();
      const seconds = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
      setTariffSecondsLeft(seconds);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [autoStatus, tariffSelectionDeadline]);

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_SIMULATION) => createSimulation(appId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', appId] });
      setIsFormOpen(false);
      setFormData(EMPTY_SIMULATION);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof EMPTY_SIMULATION> }) => updateSimulation(appId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', appId] });
      setEditingId(null);
      setFormData(EMPTY_SIMULATION);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSimulation(appId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', appId] });
    },
  });

  const selectMutation = useMutation({
    mutationFn: (id: string) => selectSimulation(appId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulations', appId] });
    },
  });

  const handleSubmit = () => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const startEdit = (sim: Simulation) => {
    setFormData({
      simulation_name: sim.simulation_name,
      new_provider: sim.new_provider,
      new_tariff: sim.new_tariff || '',
      new_monthly_cost_eur: sim.new_monthly_cost_eur,
      contract_duration_months: sim.contract_duration_months,
      bonus_description: sim.bonus_description || '',
      simulation_file_url: sim.simulation_file_url || '',
      is_selected: sim.is_selected,
    });
    setEditingId(sim.id);
    setIsFormOpen(true);
  };

  const cancelForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(EMPTY_SIMULATION);
  };

  const handleAutoCreate = async () => {
    if (!extracted || !extracted.cups) {
      setAutoStatus('failed');
      setAutoMessage(t('proposalBuilder.simulation.cupsRequired'));
      return;
    }
      setAutoStatus('pending');
      setAutoMessage(t('proposalBuilder.simulation.autoCreatePending'));
      setAutoStepKey('job_started');
      setAutoStepLabel(t('proposalBuilder.simulation.step.job_started'));
      setAutoStepDetails(t('proposalBuilder.simulation.stepDetails.jobStarted'));
      setAutoProgressPercent(3);
      setTariffSelectionDeadline(null);
      setTariffSecondsLeft(null);
      try {
      const result = await autoCreateEniSimulation(appId, {
        cups: extracted.cups,
        client_type: extracted.client_type,
        access_tariff: extracted.access_tariff,
        start_date: extracted.start_date,
        end_date: extracted.end_date,
        equipment_rental: extracted.equipment_rental,
        invoice_amount_with_vat: extracted.invoice_amount_with_vat,
        retailer: extracted.retailer,
        billed_power_p1: extracted.billed_power_p1,
        billed_power_p2: extracted.billed_power_p2,
        consumption_p1: extracted.consumption_p1,
        consumption_p2: extracted.consumption_p2,
        consumption_p3: extracted.consumption_p3,
      });
      setAutoTaskId(result.task_id);
      setAutoStatus(result.status as AutoTaskStatus);
      setAutoMessage(result.message);
    } catch (e: any) {
      setAutoStatus('failed');
      setAutoMessage(e.message || t('proposalBuilder.simulation.autoCreateFailed'));
    }
  };

  const handleSelectTariff = async () => {
    if (selectedTariffIndex === null || !autoTaskId) return;
    setIsSelectingTariff(true);
    try {
      const normalizedIndex = Number(selectedTariffIndex);
      if (!Number.isFinite(normalizedIndex) || normalizedIndex < 0) {
        throw new Error(t('proposalBuilder.simulation.tariffSelectionError'));
      }
      await selectAutoSimulationTariff(appId, autoTaskId, normalizedIndex);
      setAutoStatus('running');
      setAutoMessage(t('proposalBuilder.simulation.tariffSelected'));
      setAutoStepKey('apply_selected_tariff');
      setAutoStepLabel(t('proposalBuilder.simulation.step.apply_selected_tariff'));
      setAutoStepDetails(t('proposalBuilder.simulation.stepDetails.tariffApplied', { number: normalizedIndex + 1 }));
      setAutoProgressPercent(88);
      setTariffSelectionDeadline(null);
      setTariffSecondsLeft(null);
      setAutoTariffs(null);
      setSelectedTariffIndex(null);
    } catch (e: any) {
      setAutoMessage(e.message || t('proposalBuilder.simulation.tariffSelectionError'));
    } finally {
      setIsSelectingTariff(false);
    }
  };

  const getAutoStatusColor = () => {
    switch (autoStatus) {
      case 'completed': return 'bg-green-50 text-green-600 border-green-200';
      case 'failed': return 'bg-red-50 text-red-600 border-red-200';
      case 'running': return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'awaiting_tariff_selection': return 'bg-purple-50 text-purple-600 border-purple-200';
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-200';
      default: return '';
    }
  };

  const currentStepIndex = autoStepKey
    ? AUTO_SIMULATION_STEPS.findIndex((step) => step.key === autoStepKey)
    : -1;
  const formattedTariffCountdown = tariffSecondsLeft !== null
    ? `${Math.floor(tariffSecondsLeft / 60).toString().padStart(2, '0')}:${(tariffSecondsLeft % 60).toString().padStart(2, '0')}`
    : null;

  return (
    <div className="space-y-4">
      <ProcessMotionStyles />
      {/* Auto-create Eni Simulation */}
      {!isFormOpen && (
        <button
          onClick={handleAutoCreate}
          disabled={autoStatus === 'pending' || autoStatus === 'running' || autoStatus === 'awaiting_tariff_selection' || !hasCups}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all disabled:opacity-50 ${
            hasCups
              ? (autoStatus === 'pending' || autoStatus === 'running' || autoStatus === 'awaiting_tariff_selection'
                  ? 'bg-gradient-to-r from-secondary via-emerald-500 to-teal-500 text-white entray-process-live shadow-[0_14px_34px_rgba(0,200,83,0.22)]'
                  : 'bg-secondary text-white hover:bg-secondary/90 entray-action-idle')
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {(autoStatus === 'pending' || autoStatus === 'running' || autoStatus === 'awaiting_tariff_selection') ? (
            <>
              <Spinner size="h-4 w-4" />
              <WorkingDots className="opacity-80" />
            </>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
          )}
          {autoStatus === 'pending' || autoStatus === 'running' || autoStatus === 'awaiting_tariff_selection'
            ? t('proposalBuilder.simulation.autoCreating')
            : t('proposalBuilder.simulation.autoCreateEni')
          }
        </button>
      )}

      {/* Auto-simulation status */}
      {autoStatus !== 'idle' && (
        <div className={`p-3 rounded-xl text-sm border ${getAutoStatusColor()} ${autoStatus === 'completed' ? 'entray-success-card' : ''}`}>
          <div className="flex items-center gap-2">
            {(autoStatus === 'pending' || autoStatus === 'running') && <Spinner size="h-3 w-3" />}
            {(autoStatus === 'pending' || autoStatus === 'running' || autoStatus === 'awaiting_tariff_selection') && <WorkingDots className="opacity-80" />}
            {autoStatus === 'completed' && (
              <span className="entray-success-check inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">✓</span>
            )}
            <span className="font-medium">{autoMessage}</span>
          </div>

          {(autoStatus === 'pending' || autoStatus === 'running' || autoStatus === 'awaiting_tariff_selection' || autoStatus === 'completed') && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-center justify-between text-[11px] text-secondary-light mb-1">
                  <span>{autoStepLabel || t('proposalBuilder.simulation.step.default')}</span>
                  <span>{autoProgressPercent}%</span>
                </div>
                <div className="entray-progress-track h-2 rounded-full bg-white/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-current transition-all duration-500 shadow-[0_0_24px_rgba(16,185,129,0.26)]"
                    style={{ width: `${Math.max(4, autoProgressPercent)}%` }}
                  />
                </div>
                {autoStepDetails && (
                  <p className="mt-2 text-xs opacity-90">{autoStepDetails}</p>
                )}
              </div>

              <div className="space-y-1.5">
                {AUTO_SIMULATION_STEPS.map((step, index) => {
                  const isDone = currentStepIndex > index || autoStatus === 'completed';
                  const isCurrent = autoStepKey === step.key;
                  const showLine = index < AUTO_SIMULATION_STEPS.length - 1;
                  return (
                    <div key={step.key} className="relative">
                      <div
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all ${
                          isCurrent ? 'bg-white/70 shadow-[0_10px_25px_rgba(16,185,129,0.08)] entray-step-enter' : ''
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold ${
                            isDone
                              ? 'bg-current text-white border-current'
                              : isCurrent
                                ? 'border-current entray-step-current'
                                : 'border-current/40 opacity-60'
                          }`}
                        >
                          {isDone ? '✓' : index + 1}
                        </div>
                        <span className={`text-xs ${isCurrent ? 'font-semibold' : ''}`}>{t(`proposalBuilder.simulation.step.${step.key}`)}</span>
                      </div>
                      {showLine && (isDone || isCurrent) && (
                        <div className={`ml-4 mt-1 h-3 w-[2px] ${isCurrent ? 'entray-progress-line text-emerald-400' : 'bg-current/25'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tariff selection UI */}
          {autoStatus === 'awaiting_tariff_selection' && autoTariffs && autoTariffs.length > 0 && (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl bg-white/60 border border-white/70 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-secondary">{t('proposalBuilder.simulation.selectTariffManually')}</p>
                  {formattedTariffCountdown && (
                    <span className={`text-xs font-bold tabular-nums px-2 py-1 rounded-lg bg-white/80 ${tariffSecondsLeft !== null && tariffSecondsLeft <= 30 ? 'text-red-600 entray-countdown-urgent' : 'text-primary'}`}>
                      {formattedTariffCountdown}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-secondary-light">
                  {t('proposalBuilder.simulation.autoTariffHint', { minutes: MANAGER_SELECTION_TIMEOUT_SECONDS / 60 })}
                </p>
              </div>
              <p className="text-xs font-semibold text-secondary-light uppercase tracking-wide">{t('proposalBuilder.simulation.availableTariffs')}</p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {autoTariffs.map((tariff) => (
                  <label
                    key={tariff.index}
                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                      selectedTariffIndex === tariff.index
                        ? 'bg-primary/10 border border-primary/30'
                        : 'bg-white/50 border border-transparent hover:bg-white/80'
                    }`}
                  >
                    <input
                      type="radio"
                      name="tariff-selection"
                      value={tariff.index}
                      checked={selectedTariffIndex === tariff.index}
                      onChange={() => setSelectedTariffIndex(Number(tariff.index))}
                      className="w-4 h-4 text-primary focus:ring-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-secondary truncate">{tariff.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-slate-400">{t('proposalBuilder.simulation.currentPrice', { price: tariff.current_price })}</span>
                        <span className="text-[10px] text-green-600 font-semibold">Plenitude: {tariff.plenitude_price}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button
                onClick={handleSelectTariff}
                disabled={selectedTariffIndex === null || isSelectingTariff}
                className="w-full mt-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isSelectingTariff && <Spinner size="h-3 w-3" />}
                {isSelectingTariff ? t('proposalBuilder.simulation.submitting') : t('proposalBuilder.simulation.submitSelection')}
              </button>
            </div>
          )}

          {autoStatus === 'completed' && (
            <button
              onClick={() => { setAutoStatus('idle'); setAutoTaskId(null); setAutoTariffs(null); setSelectedTariffIndex(null); setAutoStepKey(null); setAutoStepLabel(''); setAutoStepDetails(''); setAutoProgressPercent(0); setTariffSelectionDeadline(null); setTariffSecondsLeft(null); }}
              className="mt-2 text-xs underline"
            >
              {t('common.clear')}
            </button>
          )}
          {autoStatus === 'failed' && (
            <button
              onClick={() => { setAutoStatus('idle'); setAutoTaskId(null); setAutoStepKey(null); setAutoStepLabel(''); setAutoStepDetails(''); setAutoProgressPercent(0); setTariffSelectionDeadline(null); setTariffSecondsLeft(null); }}
              className="mt-2 text-xs underline"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      )}

      {/* Form */}
      {isFormOpen && (
        <div className="bg-slate-50/80 rounded-2xl p-4 space-y-3 border border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.simulation.name')}</label>
              <input
                type="text"
                value={formData.simulation_name}
                onChange={e => setFormData(p => ({ ...p, simulation_name: e.target.value }))}
                className="w-full bg-white border-none rounded-xl text-secondary py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-sm"
                placeholder={t('proposalBuilder.simulation.namePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.simulation.provider')}</label>
              <input
                type="text"
                value={formData.new_provider}
                onChange={e => setFormData(p => ({ ...p, new_provider: e.target.value }))}
                className="w-full bg-white border-none rounded-xl text-secondary py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.simulation.tariff')}</label>
              <input
                type="text"
                value={formData.new_tariff}
                onChange={e => setFormData(p => ({ ...p, new_tariff: e.target.value }))}
                className="w-full bg-white border-none rounded-xl text-secondary py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.simulation.monthlyCost')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.new_monthly_cost_eur}
                onChange={e => setFormData(p => ({ ...p, new_monthly_cost_eur: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-white border-none rounded-xl text-secondary py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.simulation.duration')}</label>
              <input
                type="number"
                value={formData.contract_duration_months ?? ''}
                onChange={e => setFormData(p => ({ ...p, contract_duration_months: e.target.value ? parseInt(e.target.value) : undefined }))}
                className="w-full bg-white border-none rounded-xl text-secondary py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.simulation.bonus')}</label>
              <input
                type="text"
                value={formData.bonus_description}
                onChange={e => setFormData(p => ({ ...p, bonus_description: e.target.value }))}
                className="w-full bg-white border-none rounded-xl text-secondary py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-all"
            >
              {(createMutation.isPending || updateMutation.isPending) && <Spinner size="h-3 w-3" />}
              {t('proposalBuilder.simulation.saveBtn')}
            </button>
            <button
              onClick={cancelForm}
              className="px-4 py-2.5 bg-white text-secondary-light rounded-xl text-sm font-medium hover:bg-slate-100 border border-slate-200 transition-all"
            >
              {t('proposalBuilder.simulation.cancelBtn')}
            </button>
          </div>
        </div>
      )}

      {/* Simulations List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="h-6 w-6" /></div>
      ) : simulations.length === 0 ? (
        <div className="text-sm text-slate-400 italic text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          {t('proposalBuilder.simulation.noSimulations')}
        </div>
      ) : (
        <div className="space-y-3">
          {simulations.map((sim) => (
            <div
              key={sim.id}
              className={`relative p-4 rounded-2xl border transition-all ${
                sim.is_selected
                  ? 'bg-primary/5 border-primary/30 shadow-sm'
                  : 'bg-white/60 border-slate-100 hover:border-slate-200'
              }`}
            >
              {sim.is_selected && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-primary text-white text-[10px] font-bold">
                  {t('proposalBuilder.simulation.selected')}
                </span>
              )}
              <div className="flex items-start justify-between gap-2 pr-20">
                <div>
                  <h5 className="text-sm font-bold text-secondary">{sim.simulation_name}</h5>
                  <p className="text-xs text-secondary-light">{sim.new_provider} {sim.new_tariff ? `· ${sim.new_tariff}` : ''}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 mt-3">
                <div className="text-center">
                  <p className="text-[10px] text-secondary-light uppercase">{t('proposalBuilder.simulation.monthlyCost')}</p>
                  <p className="text-sm font-bold text-secondary">€{sim.new_monthly_cost_eur}</p>
                </div>
                {sim.savings_monthly_eur !== undefined && sim.savings_monthly_eur > 0 && (
                  <div className="text-center px-3 py-1 rounded-lg bg-green-50">
                    <p className="text-[10px] text-green-600 uppercase">{t('proposalBuilder.simulation.savings')}</p>
                    <p className="text-sm font-bold text-green-600">
                      €{sim.savings_monthly_eur} <span className="text-[10px]">({sim.savings_percent}%)</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-3">
                {!sim.is_selected && (
                  <button
                    onClick={() => selectMutation.mutate(sim.id)}
                    disabled={selectMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-600 disabled:opacity-50 transition-all"
                  >
                    {t('proposalBuilder.simulation.selectBtn')}
                  </button>
                )}
                {sim.simulation_file_url && (
                  <button
                    onClick={() => window.open(sim.simulation_file_url, '_blank')}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all flex items-center gap-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                    </svg>
                    PDF
                  </button>
                )}
                <button
                  onClick={() => startEdit(sim)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-secondary-light hover:bg-slate-200 transition-all"
                >
                  {t('proposalBuilder.simulation.editBtn')}
                </button>
                <button
                  onClick={() => deleteMutation.mutate(sim.id)}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50 transition-all"
                >
                  {t('proposalBuilder.simulation.deleteBtn')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SimulationPanel;
