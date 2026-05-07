import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractDataWithAI, updateExtractedData, getExtractedData, getExtractionTaskStatus, getLatestExtractionTask, listRetailers } from '../services/api';
import { ExtractedData } from '../types';
import Spinner from './Spinner';
import { ProcessMotionStyles, WorkingDots } from './ProcessMotion';
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

const EXTRACTION_STEPS = [
  { key: 'prepare_task', progress: 3 },
  { key: 'check_existing', progress: 8 },
  { key: 'download_files', progress: 20 },
  { key: 'primary_extraction', progress: 45 },
  { key: 'validate_primary', progress: 62 },
  { key: 'second_pass', progress: 78 },
  { key: 'build_snippets', progress: 86 },
  { key: 'save_results', progress: 92 },
  { key: 'completed', progress: 100 },
] as const;

const normalizeRetailerText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeCUPSFromOCR = (input?: string | null): string => {
  if (!input) return '';

  const chars = input
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .split('');

  for (let index = 2; index <= 17 && index < chars.length; index += 1) {
    if (chars[index] === 'O') chars[index] = '0';
  }

  if (chars.length === 22 && chars[20] === 'O') {
    chars[20] = '0';
  }

  return chars.join('');
};

const validateCUPS = (input?: string | null): boolean => {
  const cups = normalizeCUPSFromOCR(input);
  const match = cups.match(/^ES(\d{16})([A-Z]{2})(\d[A-Z])?$/);
  if (!match || ![20, 22].includes(cups.length)) return false;

  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const remainder = Number(BigInt(match[1]) % 529n);
  const expectedControl = letters[Math.floor(remainder / 23)] + letters[remainder % 23];
  return match[2] === expectedControl;
};

const getCUPSErrorKey = (input?: string | null): string | null => {
  if (!input) return 'proposalBuilder.extractData.cupsError.required';

  const cups = normalizeCUPSFromOCR(input);
  if (!cups.startsWith('ES')) return 'proposalBuilder.extractData.cupsError.country';
  if (![20, 22].includes(cups.length)) return 'proposalBuilder.extractData.cupsError.length';
  if (!/^ES\d{16}[A-Z]{2}(\d[A-Z])?$/.test(cups)) return 'proposalBuilder.extractData.cupsError.format';
  if (!validateCUPS(cups)) return 'proposalBuilder.extractData.cupsError.checksum';

  return null;
};

const translateReason = (reason: string, t: (key: string) => string): string => {
  const key = `fieldReason.${reason}`;
  const translated = t(key);
  return translated === key ? reason.replace(/_/g, ' ') : translated;
};

const translateExtractionMessage = (message: string, status: string, t: (key: string) => string): string => {
  if (!message) return t('proposalBuilder.extractData.task.inProgress');
  if (status === 'completed' && message === 'Извлечение данных завершено.') {
    return t('proposalBuilder.extractData.step.completed');
  }
  return message;
};

const DataExtractionPanel: React.FC<DataExtractionPanelProps> = ({ appId, uploadedFiles }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [formData, setFormData] = useState<ExtractedData>(EMPTY_DATA);
  const [isEditing, setIsEditing] = useState(false);
  const [extractTaskId, setExtractTaskId] = useState<string | null>(null);
  const [extractStatus, setExtractStatus] = useState<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle');
  const [extractMessage, setExtractMessage] = useState('');
  const [extractStepKey, setExtractStepKey] = useState<string | null>(null);
  const [extractProgressPercent, setExtractProgressPercent] = useState(0);

  const { data: existingData, isLoading: isLoadingData } = useQuery({
    queryKey: ['proposal-data', appId],
    queryFn: () => getExtractedData(appId),
    retry: false,
  });

  const { data: retailerOptionsData } = useQuery({
    queryKey: ['reference-retailers'],
    queryFn: () => listRetailers(),
    staleTime: 1000 * 60 * 60,
  });

  useEffect(() => {
    if (existingData?.extracted_data) {
      setFormData(existingData.extracted_data);
      setIsEditing(true);
    }
  }, [existingData]);

  useEffect(() => {
    if (extractTaskId) return;

    let isCancelled = false;
    const hydrateLatestTask = async () => {
      try {
        const result = await getLatestExtractionTask(appId);
        if (isCancelled || !result.task) return;

        setExtractTaskId(result.task.task_id);
        setExtractStatus(result.task.status);
        setExtractMessage(result.task.message || '');
        setExtractStepKey(result.task.step_key || null);
        setExtractProgressPercent(result.task.progress_percent || 0);

        if (result.task.extracted_data) {
          setFormData(result.task.extracted_data);
          setIsEditing(true);
        }
      } catch (error) {
        console.error('Latest extraction task hydration error:', error);
      }
    };

    hydrateLatestTask();
    return () => {
      isCancelled = true;
    };
  }, [appId, extractTaskId]);

  useEffect(() => {
    if (!extractTaskId || extractStatus === 'completed' || extractStatus === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const result = await getExtractionTaskStatus(appId, extractTaskId);
        setExtractStatus(result.status);
        setExtractMessage(result.message || '');
        setExtractStepKey(result.step_key || null);
        setExtractProgressPercent(result.progress_percent || 0);

        if (result.status === 'completed') {
          if (result.extracted_data) {
            setFormData(result.extracted_data);
            setIsEditing(true);
          }
          queryClient.invalidateQueries({ queryKey: ['proposal-data', appId] });
          clearInterval(interval);
        }

        if (result.status === 'failed') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Extraction status polling error:', error);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [appId, extractTaskId, extractStatus, queryClient]);

  const extractMutation = useMutation({
    mutationFn: (urls: string[]) => extractDataWithAI(appId, urls, false),
    onSuccess: (data) => {
      setExtractTaskId(data.task_id);
      setExtractStatus((data.status as 'pending' | 'running' | 'completed' | 'failed') || 'pending');
      setExtractMessage(data.message || '');
      setExtractStepKey('prepare_task');
      setExtractProgressPercent(3);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: ExtractedData) => updateExtractedData(appId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposal-data', appId] });
    },
  });

  const getFieldAssessment = (field: string) => existingData?.field_assessments?.[field];
  const cupsAssessment = existingData?.field_assessments?.cups;
  const cupsErrorKey = formData.cups ? getCUPSErrorKey(formData.cups) : null;
  const cupsLooksValid = !cupsErrorKey && (
    !cupsAssessment || (!cupsAssessment.needs_review && (cupsAssessment.confidence || 0) >= 0.9)
  );
  const cupsNeedsReview = !!cupsErrorKey || !!cupsAssessment?.needs_review;

  const renderFieldStatus = (field: string) => {
    const assessment = getFieldAssessment(field);
    if (!assessment) return null;

    const confidence = assessment.confidence || 0;
    const looksValid = !assessment.needs_review && confidence >= 0.8;
    const needsReview = !!assessment.needs_review;

    return (
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${
            looksValid
              ? 'bg-emerald-50 text-emerald-700'
              : needsReview
                ? 'bg-red-50 text-red-600'
                : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {looksValid
            ? t('proposalBuilder.extractData.validation.valid')
            : needsReview
              ? t('proposalBuilder.extractData.validation.review')
              : t('proposalBuilder.extractData.validation.pending')}
        </span>
        <span className="text-[10px] text-slate-400">{Math.round(confidence * 100)}%</span>
      </div>
    );
  };

  const renderFieldReasons = (field: string) => {
    const reasons = getFieldAssessment(field)?.reasons;
    if (!reasons || reasons.length === 0) return null;
    return <p className="mt-1 text-[11px] text-slate-500">{reasons.map((reason) => translateReason(reason, t)).join(', ')}</p>;
  };

  const renderFieldEvidence = (field: string) => {
    const source = existingData?.source_snippets?.[field];
    if (!source) return null;
    const bbox = Array.isArray(source.bbox_norm) && source.bbox_norm.length === 4 ? source.bbox_norm : null;
    const focusX = bbox ? Math.max(0, Math.min(100, ((Number(bbox[0]) + Number(bbox[2])) / 2) * 100)) : 50;
    const focusY = bbox ? Math.max(0, Math.min(100, ((Number(bbox[1]) + Number(bbox[3])) / 2) * 100)) : 50;
    const previewUrl = source.overlay_page_url || source.snippet_url;

    return (
      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t('proposalBuilder.extractData.sourceEvidence')}
          </span>
          <span className="text-[10px] text-slate-400">
            {typeof source.page === 'number' ? `${t('proposalBuilder.extractData.pageShort')} ${source.page}` : '—'}
          </span>
        </div>
        {previewUrl ? (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="group block">
            <img
              src={previewUrl}
              alt="field-source-snippet"
              className="h-16 w-full rounded-lg border border-slate-200 object-cover transition-all group-hover:opacity-90"
              style={{
                objectPosition: `${focusX}% ${focusY}%`,
              }}
              loading="lazy"
            />
          </a>
        ) : null}
        {source.snippet_text ? (
          <p className="mt-1.5 text-[11px] text-slate-600">{source.snippet_text}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {source.file_url ? (
            <a
              href={source.file_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-[10px] font-medium text-primary hover:underline"
            >
              {t('proposalBuilder.extractData.openSourceFile')}
            </a>
          ) : null}
          {source.overlay_page_url ? (
            <a
              href={source.overlay_page_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-[10px] font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              {t('proposalBuilder.extractData.openAnnotatedPage')}
            </a>
          ) : null}
          {source.snippet_url_tight && source.snippet_url_context && source.snippet_url_tight !== source.snippet_url_context ? (
            <a
              href={source.snippet_url_tight}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-[10px] font-medium text-slate-500 hover:text-slate-700 hover:underline"
            >
              {t('proposalBuilder.extractData.openTightSnippet')}
            </a>
          ) : null}
        </div>
      </div>
    );
  };

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

  const currentStepIndex = extractStepKey
    ? EXTRACTION_STEPS.findIndex((step) => step.key === extractStepKey)
    : -1;
  const retailerOptions = retailerOptionsData?.retailers || [];
  const resolvedRetailerOption = (() => {
    const current = formData.retailer || '';
    if (!current) return '';
    const exact = retailerOptions.find((item) => item.label === current);
    if (exact) return exact.label;

    const normalizedCurrent = normalizeRetailerText(current);
    const startsWithMatch = retailerOptions.find((item) => normalizeRetailerText(item.label).startsWith(normalizedCurrent));
    if (startsWithMatch) return startsWithMatch.label;

    const containsMatch = retailerOptions.find((item) => normalizeRetailerText(item.label).includes(normalizedCurrent));
    if (containsMatch) return containsMatch.label;

    return '';
  })();
  const retailerInCatalog = !!resolvedRetailerOption;

  return (
    <div className="space-y-5">
      <ProcessMotionStyles />
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
          disabled={extractMutation.isPending || uploadedFiles.length === 0 || extractStatus === 'pending' || extractStatus === 'running'}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-medium transition-all disabled:opacity-50 ${
            extractMutation.isPending || extractStatus === 'pending' || extractStatus === 'running'
              ? 'bg-gradient-to-r from-primary via-blue-500 to-cyan-500 entray-process-live shadow-[0_14px_34px_rgba(11,95,255,0.28)]'
              : 'bg-primary hover:bg-primary-600 entray-action-idle'
          }`}
        >
          {extractMutation.isPending || extractStatus === 'pending' || extractStatus === 'running' ? (
            <>
              <Spinner size="h-4 w-4" />
              <WorkingDots className="opacity-80" />
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

      {extractStatus !== 'idle' && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${
          extractStatus === 'failed'
            ? 'bg-red-50 border-red-200 text-red-600'
            : extractStatus === 'completed'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 entray-success-card'
              : 'bg-blue-50 border-blue-200 text-blue-700'
        }`}>
          <div className="flex items-center gap-2">
            {(extractStatus === 'pending' || extractStatus === 'running') && <Spinner size="h-3 w-3" />}
            {(extractStatus === 'pending' || extractStatus === 'running') && <WorkingDots className="opacity-80" />}
            {extractStatus === 'completed' && (
              <span className="entray-success-check inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[11px] font-bold">✓</span>
            )}
            <span className="font-medium">{translateExtractionMessage(extractMessage, extractStatus, t)}</span>
          </div>

          {(extractStatus === 'pending' || extractStatus === 'running' || extractStatus === 'completed') && (
            <div className="mt-3 space-y-3">
              <div>
                <div className="flex items-center justify-between text-[11px] text-secondary-light mb-1">
                  <span>{extractStepKey ? t(`proposalBuilder.extractData.step.${extractStepKey}`) : t('proposalBuilder.extractData.task.inProgress')}</span>
                  <span>{extractProgressPercent}%</span>
                </div>
                <div className="entray-progress-track h-2 rounded-full bg-white/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-current transition-all duration-500 shadow-[0_0_24px_rgba(59,130,246,0.35)]"
                    style={{ width: `${Math.max(4, extractProgressPercent)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                {EXTRACTION_STEPS.map((step, index) => {
                  const isDone = currentStepIndex > index || extractStatus === 'completed';
                  const isCurrent = extractStepKey === step.key;
                  const showLine = index < EXTRACTION_STEPS.length - 1;
                  return (
                    <div key={step.key} className="relative">
                      <div
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all entray-step-enter ${isCurrent ? 'bg-white/70 shadow-[0_10px_25px_rgba(59,130,246,0.08)]' : ''}`}
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
                        <span className={`text-xs ${isCurrent ? 'font-semibold' : ''}`}>
                          {t(`proposalBuilder.extractData.step.${step.key}`)}
                        </span>
                      </div>
                      {showLine && (isDone || isCurrent) && (
                        <div className={`ml-4 mt-1 h-3 w-[2px] ${isCurrent ? 'entray-progress-line text-blue-400' : 'bg-current/25'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data Form */}
      {isEditing && (
        <div className="space-y-4 pt-2 border-t border-slate-100">
          {(existingData?.overall_confidence !== undefined || existingData?.needs_review) && (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${
              existingData?.needs_review
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t('proposalBuilder.extractData.aiConfidence')}</span>
                <span>{Math.round((existingData?.overall_confidence || 0) * 100)}%</span>
                {existingData?.raw_extraction?.second_pass_attempted && (
                  <span className="px-2 py-0.5 rounded-full bg-white/70 text-[10px] font-semibold uppercase tracking-wide">
                    {t('proposalBuilder.extractData.secondPassUsed')}
                  </span>
                )}
              </div>
              {existingData?.needs_review && existingData?.needs_review_fields && existingData.needs_review_fields.length > 0 && (
                <p className="mt-2 text-xs">
                  {t('proposalBuilder.extractData.reviewFields', { fields: existingData.needs_review_fields.join(', ') })}
                </p>
              )}
            </div>
          )}

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
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide">{t('proposalBuilder.extractData.cups')}</label>
                {cupsAssessment && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold ${
                      cupsLooksValid
                        ? 'bg-emerald-50 text-emerald-700'
                        : cupsNeedsReview
                          ? 'bg-red-50 text-red-600'
                          : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {cupsLooksValid
                      ? t('proposalBuilder.extractData.cupsStatus.valid')
                      : cupsNeedsReview
                        ? t('proposalBuilder.extractData.cupsStatus.review')
                        : t('proposalBuilder.extractData.cupsStatus.pending')}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={formData.cups || ''}
                onChange={e => updateField('cups', e.target.value)}
                onBlur={() => updateField('cups', normalizeCUPSFromOCR(formData.cups) as ExtractedData['cups'])}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
              {cupsErrorKey && (
                <p className="mt-1 text-[11px] font-medium text-red-600">
                  {t(cupsErrorKey)}
                </p>
              )}
              {cupsAssessment?.reasons && cupsAssessment.reasons.length > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {cupsAssessment.reasons.map((reason) => translateReason(reason, t)).join(', ')}
                </p>
              )}
              {renderFieldEvidence('cups')}
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
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide">{t('proposalBuilder.extractData.accessTariff')}</label>
                {renderFieldStatus('access_tariff')}
              </div>
              <input
                type="text"
                value={formData.access_tariff || ''}
                onChange={e => updateField('access_tariff', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
              {renderFieldReasons('access_tariff')}
              {renderFieldEvidence('access_tariff')}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.startDate')}</label>
              <input
                type="date"
                value={formData.start_date || ''}
                onChange={e => updateField('start_date', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
              {renderFieldEvidence('start_date')}
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide mb-1">{t('proposalBuilder.extractData.endDate')}</label>
              <input
                type="date"
                value={formData.end_date || ''}
                onChange={e => updateField('end_date', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
              {renderFieldEvidence('end_date')}
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
              {renderFieldEvidence('equipment_rental')}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide">{t('proposalBuilder.extractData.invoiceAmount')}</label>
                {renderFieldStatus('invoice_amount_with_vat')}
              </div>
              <input
                type="number"
                step="0.01"
                value={formData.invoice_amount_with_vat ?? ''}
                onChange={e => updateField('invoice_amount_with_vat', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              />
              {renderFieldReasons('invoice_amount_with_vat')}
              {renderFieldEvidence('invoice_amount_with_vat')}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[10px] font-semibold text-secondary-light uppercase tracking-wide">{t('proposalBuilder.extractData.retailer')}</label>
                {renderFieldStatus('retailer')}
              </div>
              <select
                value={retailerInCatalog ? resolvedRetailerOption : ''}
                onChange={e => updateField('retailer', e.target.value)}
                className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm text-sm font-medium"
              >
                {!retailerInCatalog && formData.retailer ? (
                  <option value={formData.retailer}>{formData.retailer}</option>
                ) : null}
                <option value="">—</option>
                {retailerOptions.map((item) => (
                  <option key={item.value || item.label} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
              {renderFieldReasons('retailer')}
              {renderFieldEvidence('retailer')}
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
              {renderFieldEvidence('billed_power_p1')}
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
              {renderFieldEvidence('billed_power_p2')}
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
              {renderFieldEvidence('consumption_p1')}
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
              {renderFieldEvidence('consumption_p2')}
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
              {renderFieldEvidence('consumption_p3')}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-medium disabled:opacity-50 transition-all ${
              saveMutation.isPending
                ? 'bg-gradient-to-r from-secondary via-emerald-500 to-teal-500 entray-process-live shadow-[0_14px_34px_rgba(0,200,83,0.22)]'
                : 'bg-secondary hover:bg-secondary/90 entray-action-idle'
            }`}
          >
            {saveMutation.isPending ? (
              <>
                <Spinner size="h-4 w-4" />
                <WorkingDots className="opacity-80" />
              </>
            ) : null}
            {t('proposalBuilder.extractData.saveBtn')}
          </button>

          {saveMutation.isSuccess && (
            <p className="entray-success-check text-xs text-green-600 text-center">{t('proposalBuilder.extractData.saved')}</p>
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
