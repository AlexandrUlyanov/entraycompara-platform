import React, { useState } from 'react';
import { fetchApplicationById, updateApplicationStatus, deleteApplicationById, updateApplicationServiceType, createTimelineNote } from '../services/api';
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

  const statusUpdateMutation = useMutation({
    mutationFn: ({ newStatus }: { newStatus: Status }) => updateApplicationStatus(appId, newStatus),
    onSuccess: (_, variables) => {
      // Auto-create system note
      const systemMessage = `SYSTEM_STATUS_CHANGE:${variables.newStatus}`;
      createTimelineNote(appId, systemMessage, NoteType.System);
      
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
      // We also invalidate timeline to show the new system note immediately
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
                <div>
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
                <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30">
                    <h3 className="text-xs font-bold text-secondary-light uppercase tracking-widest">{t('detail.clientInfo.title')}</h3>
                </div>
                <div className="p-8">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
                        <div>
                            <dt className="text-xs font-semibold text-secondary-light uppercase tracking-wide mb-1.5">{t('detail.clientInfo.email')}</dt>
                            <dd className="text-sm font-medium text-secondary flex items-center">
                                {application.client_email ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <a href={`mailto:${application.client_email}`} className="hover:text-primary transition-colors hover:underline">{application.client_email}</a>
                                    </>
                                ) : <span className="text-slate-400 italic">{t('common.notAvailable')}</span>}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold text-secondary-light uppercase tracking-wide mb-1.5">{t('detail.clientInfo.phone')}</dt>
                            <dd className="text-sm font-medium text-secondary flex items-center">
                                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                {application.client_phone}
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
                    </dl>
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
        <div className="space-y-8 lg:pt-[88px]"> {/* Added padding top to align with content below button */}
            
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

            {/* Documents Card */}
             <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/30">
                    <h3 className="text-xs font-bold text-secondary-light uppercase tracking-widest">{t('detail.documents.title')}</h3>
                </div>
                <div className="p-6">
                    <ul className="space-y-3">
                        {application.uploaded_files && application.uploaded_files.length > 0 ? (
                        application.uploaded_files.map((fileUri, index) => (
                            <li key={index}>
                                <FileLink uri={fileUri} />
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