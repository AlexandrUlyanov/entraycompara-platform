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
  cups: '',
  client_type: '',
  access_tariff: '',
  start_date: '',
  end_date: '',
  equipment_rental: undefined,
  invoice_amount_with_vat: undefined,
  retailer: '',
  billed_power_p1: undefined,
  billed_power_p2: undefined,
  consumption_p1: undefined,
  consumption_p2: undefined,
  consumption_p3: undefined,
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
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.cups')}</label>
              <input
                type="text"
                value={formData.cups || ''}
                onChange={e => updateField('cups', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.clientType')}</label>
              <select
                value={formData.client_type || ''}
                onChange={e => updateField('client_type', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              >
                <option value="">—</option>
                <option value="Hogar">Hogar</option>
                <option value="Empresa">Empresa</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.accessTariff')}</label>
              <input
                type="text"
                value={formData.access_tariff || ''}
                onChange={e => updateField('access_tariff', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.startDate')}</label>
              <input
                type="date"
                value={formData.start_date || ''}
                onChange={e => updateField('start_date', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.endDate')}</label>
              <input
                type="date"
                value={formData.end_date || ''}
                onChange={e => updateField('end_date', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.equipmentRental')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.equipment_rental ?? ''}
                onChange={e => updateField('equipment_rental', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.invoiceAmount')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.invoice_amount_with_vat ?? ''}
                onChange={e => updateField('invoice_amount_with_vat', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.retailer')}</label>
              <input
                type="text"
                value={formData.retailer || ''}
                onChange={e => updateField('retailer', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.billedPowerP1')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.billed_power_p1 ?? ''}
                onChange={e => updateField('billed_power_p1', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.billedPowerP2')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.billed_power_p2 ?? ''}
                onChange={e => updateField('billed_power_p2', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.consumptionP1')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.consumption_p1 ?? ''}
                onChange={e => updateField('consumption_p1', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.consumptionP2')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.consumption_p2 ?? ''}
                onChange={e => updateField('consumption_p2', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.consumptionP3')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.consumption_p3 ?? ''}
                onChange={e => updateField('consumption_p3', e.target.value ? parseFloat(e.target.value) : undefined)}
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
