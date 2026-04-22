import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSimulations, createSimulation, updateSimulation, deleteSimulation, selectSimulation,
  autoCreateEniSimulation, getAutoSimulationStatus, getExtractedData
} from '../services/api';
import { Simulation } from '../types';
import Spinner from './Spinner';
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

type AutoTaskStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

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

  // Polling auto-simulation status
  useEffect(() => {
    if (!autoTaskId || autoStatus === 'completed' || autoStatus === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const result = await getAutoSimulationStatus(appId, autoTaskId);
        setAutoStatus(result.status as AutoTaskStatus);
        setAutoMessage(result.message || '');
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

  const getAutoStatusColor = () => {
    switch (autoStatus) {
      case 'completed': return 'bg-green-50 text-green-600 border-green-200';
      case 'failed': return 'bg-red-50 text-red-600 border-red-200';
      case 'running': return 'bg-blue-50 text-blue-600 border-blue-200';
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-200';
      default: return '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Auto-create Eni Simulation */}
      {!isFormOpen && (
        <button
          onClick={handleAutoCreate}
          disabled={autoStatus === 'pending' || autoStatus === 'running' || !hasCups}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all disabled:opacity-50 ${
            hasCups
              ? 'bg-secondary text-white hover:bg-secondary/90'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          {(autoStatus === 'pending' || autoStatus === 'running') ? (
            <Spinner size="h-4 w-4" />
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
          )}
          {autoStatus === 'pending' || autoStatus === 'running'
            ? t('proposalBuilder.simulation.autoCreating')
            : t('proposalBuilder.simulation.autoCreateEni')
          }
        </button>
      )}

      {/* Auto-simulation status */}
      {autoStatus !== 'idle' && (
        <div className={`p-3 rounded-xl text-sm border ${getAutoStatusColor()}`}>
          <div className="flex items-center gap-2">
            {(autoStatus === 'pending' || autoStatus === 'running') && <Spinner size="h-3 w-3" />}
            <span className="font-medium">{autoMessage}</span>
          </div>
          {autoStatus === 'completed' && (
            <button
              onClick={() => { setAutoStatus('idle'); setAutoTaskId(null); }}
              className="mt-2 text-xs underline"
            >
              Очистить
            </button>
          )}
          {autoStatus === 'failed' && (
            <button
              onClick={() => { setAutoStatus('idle'); setAutoTaskId(null); }}
              className="mt-2 text-xs underline"
            >
              Закрыть
            </button>
          )}
        </div>
      )}

      {/* Add Button */}
      {!isFormOpen && (
        <button
          onClick={() => setIsFormOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-primary/30 text-primary rounded-xl font-medium hover:bg-primary/5 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          {t('proposalBuilder.simulation.addBtn')}
        </button>
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
                placeholder="Ej: Tarifa Light"
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
