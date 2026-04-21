import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractDataWithAI, updateExtractedData, getExtractedData } from '../services/api';
import { ExtractedData } from '../types';
import Spinner from './Spinner';
import { useTranslation } from '../i18n';

interface DataExtractionPanelProps {
  appId: string;
  uploadedFiles: string[];
}

const EMPTY_DATA: ExtractedData = {
  service_type: 'electricity',
  current_provider: '',
  contract_number: '',
  current_tariff: '',
  power_kw: undefined,
  avg_monthly_consumption_kwh: undefined,
  avg_monthly_cost_eur: undefined,
  contract_end_date: '',
  source_files: [],
};

const DataExtractionPanel: React.FC<DataExtractionPanelProps> = ({ appId, uploadedFiles }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [formData, setFormData] = useState<ExtractedData>(EMPTY_DATA);
  const [isEditing, setIsEditing] = useState(false);

  const { data: existingData, isLoading: isLoadingData } = useQuery({
    queryKey: ['proposal-data', appId],
    queryFn: () => getExtractedData(appId),
    retry: false,
  });

  useEffect(() => {
    if (existingData?.extracted_data) {
      setFormData(existingData.extracted_data);
      setIsEditing(true);
    }
  }, [existingData]);

  const extractMutation = useMutation({
    mutationFn: (urls: string[]) => extractDataWithAI(appId, urls, false),
    onSuccess: (data) => {
      if (data.extracted_data) {
        setFormData(data.extracted_data);
        setIsEditing(true);
      }
      queryClient.invalidateQueries({ queryKey: ['proposal-data', appId] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: ExtractedData) => updateExtractedData(appId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-data', appId] });
    },
  });

  const handleExtract = () => {
    const urls = selectedFiles.length > 0 ? selectedFiles : uploadedFiles;
    if (urls.length === 0) return;
    extractMutation.mutate(urls);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const toggleFile = (url: string) => {
    setSelectedFiles(prev =>
      prev.includes(url) ? prev.filter(f => f !== url) : [...prev, url]
    );
  };

  const updateField = <K extends keyof ExtractedData>(field: K, value: ExtractedData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-5">
      {/* Files Selection */}
      <div>
        <h4 className="text-xs font-bold text-secondary-light uppercase tracking-widest mb-3">{t('proposalBuilder.extractData.filesLabel')}</h4>
        {uploadedFiles.length === 0 ? (
          <div className="text-sm text-slate-400 italic text-center py-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            {t('proposalBuilder.extractData.noFiles')}
          </div>
        ) : (
          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {uploadedFiles.map((url, idx) => {
              const filename = url.split('/').pop() || url;
              const isSelected = selectedFiles.length === 0 ? true : selectedFiles.includes(url);
              return (
                <label key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/80 hover:bg-slate-100 cursor-pointer transition-all">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFile(url)}
                    className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
                  />
                  <span className="text-sm text-secondary truncate flex-1">{filename}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Extract Button */}
      {uploadedFiles.length > 0 && (
        <button
          onClick={handleExtract}
          disabled={extractMutation.isPending || uploadedFiles.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary-600 disabled:opacity-50 transition-all"
        >
          {extractMutation.isPending ? (
            <>
              <Spinner size="h-4 w-4" />
              {t('proposalBuilder.extractData.extracting')}
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              {t('proposalBuilder.extractData.extractBtn')}
            </>
          )}
        </button>
      )}

      {extractMutation.isError && (
        <p className="text-xs text-red-500">{(extractMutation.error as Error)?.message}</p>
      )}

      {/* Data Form */}
      {isEditing && (
        <div className="space-y-4 pt-2 border-t border-slate-100">
          {existingData?.manually_corrected && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-600 text-[10px] font-semibold">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              {t('proposalBuilder.extractData.manuallyCorrected')}
            </span>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.serviceType')}</label>
              <select
                value={formData.service_type || 'electricity'}
                onChange={e => updateField('service_type', e.target.value as ExtractedData['service_type'])}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              >
                <option value="electricity">Electricity</option>
                <option value="gas">Gas</option>
                <option value="internet">Internet</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.provider')}</label>
              <input
                type="text"
                value={formData.current_provider || ''}
                onChange={e => updateField('current_provider', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.contractNumber')}</label>
              <input
                type="text"
                value={formData.contract_number || ''}
                onChange={e => updateField('contract_number', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.tariff')}</label>
              <input
                type="text"
                value={formData.current_tariff || ''}
                onChange={e => updateField('current_tariff', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.power')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.power_kw ?? ''}
                onChange={e => updateField('power_kw', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.consumption')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.avg_monthly_consumption_kwh ?? ''}
                onChange={e => updateField('avg_monthly_consumption_kwh', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.cost')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.avg_monthly_cost_eur ?? ''}
                onChange={e => updateField('avg_monthly_cost_eur', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.contractEnd')}</label>
              <input
                type="date"
                value={formData.contract_end_date || ''}
                onChange={e => updateField('contract_end_date', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-secondary text-white rounded-xl font-medium hover:bg-secondary/90 disabled:opacity-50 transition-all"
          >
            {saveMutation.isPending ? <Spinner size="h-4 w-4" /> : null}
            {t('proposalBuilder.extractData.saveBtn')}
          </button>

          {saveMutation.isSuccess && (
            <p className="text-xs text-green-600 text-center">{t('proposalBuilder.extractData.saved')}</p>
          )}
          {saveMutation.isError && (
            <p className="text-xs text-red-500">{(saveMutation.error as Error)?.message}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default DataExtractionPanel;
