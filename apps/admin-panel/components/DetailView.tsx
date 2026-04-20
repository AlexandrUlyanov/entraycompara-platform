import React, { useState, useEffect, useRef } from 'react';
import { fetchApplicationById, updateApplicationStatus, deleteApplicationById, updateApplicationServiceType, createTimelineNote, updateApplication, uploadApplicationFiles, sendWhatsAppDocument, uploadProposal, sendProposalViaWhatsApp } from '../services/api';
import { Status, Application, ServiceType, NoteType } from '../types';
import Spinner from './Spinner';
import StatusBadge from './StatusBadge';
import ConfirmModal from './ConfirmModal';
import Timeline from './Timeline';
import FileLink from './FileLink';
import WhatsAppChatPanel from './WhatsAppChatPanel';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../i18n';

interface DetailViewProps {
  appId: string;
  appDataFromList?: Application;
  onBack: () => void;
}

const DetailView: React.FC<DetailViewProps> = ({ appId, appDataFromList, onBack }) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proposalFileRef = useRef<HTMLInputElement>(null);
  const [editValues, setEditValues] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    notes: '',
  });

  const { data: application, isLoading, isError, error } = useQuery<Application | undefined, Error>({
    queryKey: ['application', appId],
    queryFn: async () => {
      const detailedApp = await fetchApplicationById(appId);
      if (detailedApp && !detailedApp.service_type && appDataFromList?.service_type) {
          detailedApp.service_type = appDataFromList.service_type;
      }
      return detailedApp;
    },
  });

  useEffect(() => {
    if (application) {
      setEditValues({
        client_name: application.client_name || '',
        client_phone: application.client_phone || '',
        client_email: application.client_email || '',
        notes: application.notes || '',
      });
    }
  }, [application]);

  const statusUpdateMutation = useMutation({
    mutationFn: ({ newStatus }: { newStatus: Status }) => updateApplicationStatus(appId, newStatus),
    onSuccess: (_, variables) => {
      const systemMessage = `SYSTEM_STATUS_CHANGE:${variables.newStatus}`;
      createTimelineNote(appId, systemMessage, NoteType.System);
      
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['timeline', appId] }), 500);
    },
  });

  const serviceTypeUpdateMutation = useMutation({
    mutationFn: ({ newServiceType }: { newServiceType: ServiceType }) => updateApplicationServiceType(appId, newServiceType),
    onSuccess: (data) => {
        console.log(data.message);
        queryClient.invalidateQueries({ queryKey: ['application', appId] });
        queryClient.invalidateQueries({ queryKey: ['applications'] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (updates: Partial<typeof editValues>) => updateApplication(appId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const uploadFilesMutation = useMutation({
    mutationFn: (files: File[]) => uploadApplicationFiles(appId, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const sendDocMutation = useMutation({
    mutationFn: ({ url, caption }: { url: string; caption: string }) => sendWhatsAppDocument(appId, url, caption),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const proposalUploadMutation = useMutation({
    mutationFn: (file: File) => uploadProposal(appId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });

  const proposalSendMutation = useMutation({
    mutationFn: () => sendProposalViaWhatsApp(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteApplicationById(appId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      onBack(); 
    },
  });

  const handleStatusChange = (newStatus: Status) => {
    if (application && application.status !== newStatus) {
      statusUpdateMutation.mutate({ newStatus });
    }
  };

  const handleServiceTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newServiceType = event.target.value as ServiceType;
    if(application && application.service_type !== newServiceType) {
        serviceTypeUpdateMutation.mutate({ newServiceType });
    }
  }

  const handleFieldBlur = (field: keyof typeof editValues) => {
    if (!application) return;
    const newValue = editValues[field];
    const oldValue = (application[field] as string) ?? '';
    if (newValue !== oldValue) {
      updateMutation.mutate({ [field]: newValue } as Partial<typeof editValues>);
    }
  };

  const handleFieldKeyDown = (e: React.KeyboardEvent, field: keyof typeof editValues) => {
    if (e.key === 'Enter' && field !== 'notes') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleDeleteConfirm = () => {
    deleteMutation.mutate();
  }

  if (isLoading) {
    return <div className="flex justify-center items-center h-96"><Spinner size="h-12 w-12" /></div>;
  }

  if (isError) {
    return <div className="text-center p-8 bg-red-50/60 backdrop-blur rounded-3xl border border-red-100 shadow-apple text-red-700">{t('detail.error.generic', { message: error.message })}</div>;
  }

  if (!application) {
    return <div className="text-center p-8 bg-amber-50/60 backdrop-blur rounded-3xl border border-amber-100 shadow-apple text-amber-700">{t('detail.error.notFound')}</div>;
  }

  return (
    <div className="max-w-7xl mx-auto animate-fade-in pb-10">
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Main Info */}
        <div className="lg:col-span-2 space-y-8">
            
            {/* Back Button */}
            <div>
                <button 
                    onClick={onBack} 
                    className="w-full py-4 px-6 bg-white/60 backdrop-blur-xl border border-white/40 text-primary font-bold rounded-2xl shadow-apple hover:shadow-apple-hover hover:bg-white/80 transition-all duration-300 flex justify-center items-center gap-2 group transform active:scale-[0.98]"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    {t('detail.backToList')}
                </button>
            </div>

            {/* Header Card */}
            <div className="bg-white/80 backdrop-blur-xl p-8 rounded-[30px] shadow-apple border border-white/40 flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-3xl font-bold text-secondary">{application.client_name}</h2>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-100 text-slate-500 tracking-wide">#{application.id.slice(0,6)}</span>
                    </div>
                    <p className="text-secondary-light flex items-center text-sm font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {new Date(application.submission_date).toLocaleString()}
                    </p>
                </div>
                <div className="flex-shrink-0">
                    <div className="scale-110 origin-top-right">
                         <StatusBadge status={application.status} />
                    </div>
                </div>
            </div>

            {/* Client Details Card */}
            <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden">
                <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-secondary-light uppercase tracking-widest">{t('detail.clientInfo.title')}</h3>
                    {updateMutation.isPending && <Spinner size="h-4 w-4" />}
                </div>
                <div className="p-8">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
                        <div className="sm:col-span-2">
                            <dt className="text-xs font-semibold text-secondary-light uppercase tracking-wide mb-1.5">{t('detail.clientInfo.fullName')}</dt>
                            <dd className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-3 text-primary-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                <input
                                    type="text"
                                    value={editValues.client_name}
                                    onChange={(e) => setEditValues(v => ({ ...v, client_name: e.target.value }))}
                                    onBlur={() => handleFieldBlur('client_name')}
                                    onKeyDown={(e) => handleFieldKeyDown(e, 'client_name')}
                                    className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm font-medium"
                                />
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold text-secondary-light uppercase tracking-wide mb-1.5">{t('detail.clientInfo.email')}</dt>
                            <dd className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-3 text-primary-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <input
                                    type="email"
                                    value={editValues.client_email}
                                    onChange={(e) => setEditValues(v => ({ ...v, client_email: e.target.value }))}
                                    onBlur={() => handleFieldBlur('client_email')}
                                    onKeyDown={(e) => handleFieldKeyDown(e, 'client_email')}
                                    className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm font-medium"
                                />
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold text-secondary-light uppercase tracking-wide mb-1.5">{t('detail.clientInfo.phone')}</dt>
                            <dd className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3.5 top-3 text-primary-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <input
                                    type="tel"
                                    value={editValues.client_phone}
                                    onChange={(e) => setEditValues(v => ({ ...v, client_phone: e.target.value }))}
                                    onBlur={() => handleFieldBlur('client_phone')}
                                    onKeyDown={(e) => handleFieldKeyDown(e, 'client_phone')}
                                    className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm font-medium"
                                />
                            </dd>
                        </div>
                        <div className="sm:col-span-2">
                            <dt className="text-xs font-semibold text-secondary-light uppercase tracking-wide mb-1.5">{t('detail.clientInfo.serviceType')}</dt>
                            <dd className="text-sm text-secondary relative max-w-xs">
                                <div className="relative">
                                    <select
                                        value={application.service_type}
                                        onChange={handleServiceTypeChange}
                                        disabled={serviceTypeUpdateMutation.isPending}
                                        className="appearance-none w-full bg-slate-50 border-none rounded-xl text-secondary py-3 px-4 pr-8 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white disabled:opacity-60 transition-all shadow-sm font-medium cursor-pointer"
                                    >
                                        {Object.values(ServiceType).map(s => <option key={s} value={s}>{t(`serviceType.${s.replace(' ', '')}`)}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                    </div>
                                     {serviceTypeUpdateMutation.isPending && <div className="absolute right-10 top-3"><Spinner size="h-4 w-4" /></div>}
                                </div>
                                {serviceTypeUpdateMutation.isError && <p className="text-xs text-red-500 mt-1">{t('dashboard.error.generic', { message: (serviceTypeUpdateMutation.error as Error).message })}</p>}
                            </dd>
                        </div>
                        <div className="sm:col-span-2">
                            <dt className="text-xs font-semibold text-secondary-light uppercase tracking-wide mb-1.5">{t('detail.clientInfo.notes')}</dt>
                            <dd className="relative">
                                <textarea
                                    rows={3}
                                    value={editValues.notes}
                                    onChange={(e) => setEditValues(v => ({ ...v, notes: e.target.value }))}
                                    onBlur={() => handleFieldBlur('notes')}
                                    className="w-full bg-slate-50 border-none rounded-xl text-secondary py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all shadow-sm font-medium resize-y"
                                    placeholder={t('detail.clientInfo.notesPlaceholder')}
                                />
                            </dd>
                        </div>
                    </dl>
                    {updateMutation.isError && <p className="text-xs text-red-500 mt-4">{t('detail.error.generic', { message: (updateMutation.error as Error).message })}</p>}
                </div>
            </div>
            
            {/* Timeline Component */}
            <Timeline appId={appId} />

            {/* WhatsApp Chat Panel */}
            <WhatsAppChatPanel
              appId={appId}
              clientName={application.client_name}
              clientPhone={application.client_phone}
            />

        </div>

        {/* Right Column: Actions & Documents */}
        <div className="space-y-8 lg:pt-[88px]">
            
            {/* Status Card */}
            <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/30">
                    <h3 className="text-xs font-bold text-secondary-light uppercase tracking-widest">{t('detail.updateStatus.title')}</h3>
                </div>
                <div className="p-5 space-y-3">
                     {Object.values(Status).map(status => (
                        <button
                            key={status}
                            onClick={() => handleStatusChange(status)}
                            disabled={application.status === status || statusUpdateMutation.isPending}
                            className={`w-full text-left px-5 py-3.5 text-sm font-medium rounded-2xl transition-all duration-200 flex items-center justify-between group transform active:scale-[0.98] ${
                            application.status === status
                                ? 'bg-secondary text-white shadow-lg shadow-secondary/30'
                                : 'bg-white text-secondary-light hover:bg-slate-50 hover:text-secondary shadow-sm border border-slate-100'
                            } disabled:opacity-50 disabled:cursor-wait`}
                        >
                            <span>{t(`status.${status.replace(' ', '')}`)}</span>
                            {application.status === status && (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>
                    ))}
                     {statusUpdateMutation.isError && <p className="text-xs text-red-500 px-2">{t('dashboard.error.generic', { message: (statusUpdateMutation.error as Error).message })}</p>}
                </div>
            </div>

            {/* Proposal / КП Card */}
            <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-secondary-light uppercase tracking-widest">Коммерческое предложение</h3>
                    <input
                        type="file"
                        accept=".pdf"
                        ref={proposalFileRef}
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                proposalUploadMutation.mutate(e.target.files[0]);
                                e.target.value = '';
                            }
                        }}
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => proposalFileRef.current?.click()}
                        disabled={proposalUploadMutation.isPending}
                        className="text-xs font-medium text-primary hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
                    >
                        {proposalUploadMutation.isPending ? (
                            <Spinner size="h-3 w-3" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                        )}
                        {proposalUploadMutation.isPending ? 'Загрузка...' : 'Загрузить КП'}
                    </button>
                </div>
                <div className="p-5">
                    {proposalUploadMutation.isError && (
                        <p className="text-xs text-red-500 mb-3">
                            {t('detail.error.generic', { message: (proposalUploadMutation.error as Error).message })}
                        </p>
                    )}
                    {proposalSendMutation.isError && (
                        <p className="text-xs text-red-500 mb-3">
                            {t('detail.error.generic', { message: (proposalSendMutation.error as Error).message })}
                        </p>
                    )}
                    {application.proposal_file_url ? (
                        <div className="flex items-center justify-between group bg-slate-50 rounded-xl p-2">
                            <div className="flex-1 min-w-0 mr-2">
                                <FileLink uri={application.proposal_file_url} />
                            </div>
                            <button
                                type="button"
                                onClick={() => proposalSendMutation.mutate()}
                                disabled={proposalSendMutation.isPending}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50 transition-all whitespace-nowrap"
                                title="Отправить КП в WhatsApp"
                            >
                                {proposalSendMutation.isPending ? (
                                    <Spinner size="h-3 w-3" />
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zM12.05 20.21c-1.5 0-2.97-.4-4.26-1.16l-.3-.18-3.11.82.83-3.03-.19-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 012.41 5.83c.02 4.54-3.68 8.23-8.18 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.21.88 2.37 1 2.7.12.33 3.46 5.27 8.38 7.41 2.85 1.24 3.97 1.02 4.72.95.83-.07 1.87-.76 2.13-1.5.27-.74.27-1.37.19-1.5-.08-.13-.29-.21-.54-.33z" />
                                    </svg>
                                )}
                                Отправить КП
                            </button>
                        </div>
                    ) : (
                        <div className="text-sm text-slate-400 italic text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                            КП не загружено. Загрузите PDF, чтобы отправить клиенту.
                        </div>
                    )}
                </div>
            </div>

            {/* Documents Card */}
             <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-secondary-light uppercase tracking-widest">{t('detail.documents.title')}</h3>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                                uploadFilesMutation.mutate(Array.from(e.target.files));
                                e.target.value = '';
                            }
                        }}
                        className="hidden"
                        multiple
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadFilesMutation.isPending}
                        className="text-xs font-medium text-primary hover:text-primary-700 flex items-center gap-1 disabled:opacity-50"
                    >
                        {uploadFilesMutation.isPending ? (
                            <Spinner size="h-3 w-3" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                        )}
                        {uploadFilesMutation.isPending ? 'Загрузка...' : 'Загрузить'}
                    </button>
                </div>
                <div className="p-6">
                    {uploadFilesMutation.isError && (
                        <p className="text-xs text-red-500 mb-3">
                            {t('detail.error.generic', { message: (uploadFilesMutation.error as Error).message })}
                        </p>
                    )}
                    {sendDocMutation.isError && (
                        <p className="text-xs text-red-500 mb-3">
                            {t('detail.error.generic', { message: (sendDocMutation.error as Error).message })}
                        </p>
                    )}
                    <ul className="space-y-3">
                        {application.uploaded_files && application.uploaded_files.length > 0 ? (
                        application.uploaded_files.map((fileUri, index) => (
                            <li key={index} className="flex items-center justify-between group">
                                <FileLink uri={fileUri} />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const filename = fileUri.split('/').pop() || '';
                                        sendDocMutation.mutate({ url: fileUri, caption: filename });
                                    }}
                                    disabled={sendDocMutation.isPending}
                                    className="ml-2 p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-all"
                                    title="Отправить в WhatsApp"
                                >
                                    {sendDocMutation.isPending ? (
                                        <Spinner size="h-3.5 w-3.5" />
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zM12.05 20.21c-1.5 0-2.97-.4-4.26-1.16l-.3-.18-3.11.82.83-3.03-.19-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 012.41 5.83c.02 4.54-3.68 8.23-8.18 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.21.88 2.37 1 2.7.12.33 3.46 5.27 8.38 7.41 2.85 1.24 3.97 1.02 4.72.95.83-.07 1.87-.76 2.13-1.5.27-.74.27-1.37.19-1.5-.08-.13-.29-.21-.54-.33z" />
                                        </svg>
                                    )}
                                </button>
                            </li>
                        ))
                        ) : (
                            <li className="text-sm text-slate-400 italic text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">{t('detail.documents.none')}</li>
                        )}
                    </ul>
                </div>
             </div>

            {/* Delete Zone */}
            <div className="pt-4">
                <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="w-full inline-flex justify-center items-center px-4 py-4 border border-red-100 text-sm font-medium rounded-2xl text-red-600 bg-red-50/80 hover:bg-red-100 hover:shadow-lg hover:shadow-red-100/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-300"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {t('detail.delete.button')}
                </button>
            </div>
        </div>
      </div>
      
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('detail.delete.confirmTitle')}
        message={t('detail.delete.confirmText')}
        confirmText={t('detail.delete.confirmButton')}
        cancelText={t('detail.delete.cancelButton')}
        isLoading={deleteMutation.isPending}
        error={deleteMutation.isError ? (deleteMutation.error as Error).message : undefined}
      />


    </div>
  );
};

export default DetailView;
