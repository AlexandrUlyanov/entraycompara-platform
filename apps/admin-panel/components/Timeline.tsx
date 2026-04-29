
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApplicationTimeline, createTimelineNote, deleteTimelineNote } from '../services/api';
import { ApplicationNote, NoteType, Status } from '../types';
import { useTranslation } from '../i18n';
import Spinner from './Spinner';

interface TimelineProps {
  appId: string;
}

const Timeline: React.FC<TimelineProps> = ({ appId }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newNoteContent, setNewNoteContent] = useState('');
  const [activeType, setActiveType] = useState<NoteType>(NoteType.Note);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: notes, isLoading, isError } = useQuery({
    queryKey: ['timeline', appId],
    queryFn: () => fetchApplicationTimeline(appId),
  });

  const createMutation = useMutation({
    mutationFn: () => createTimelineNote(appId, newNoteContent, activeType),
    onSuccess: () => {
      setNewNoteContent('');
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteTimelineNote(appId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteContent.trim()) return;
    createMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
        handleSubmit(e);
    }
  };

  // Helper to determine visual type
  const getDisplayType = (note: ApplicationNote): NoteType => {
      if (note.type === NoteType.System) return NoteType.System;
      // Detect system messages that were saved as 'NOTE'
      if (note.type === NoteType.Note && note.content.startsWith('SYSTEM_STATUS_CHANGE:')) {
          return NoteType.System;
      }
      return note.type;
  };

  const getIconForType = (type: NoteType) => {
    switch (type) {
      case NoteType.WhatsApp:
        return (
          <div className="h-8 w-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center ring-4 ring-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zM12.05 20.21c-1.5 0-2.97-.4-4.26-1.16l-.3-.18-3.11.82.83-3.03-.19-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 012.41 5.83c.02 4.54-3.68 8.23-8.18 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.21.88 2.37 1 2.7.12.33 3.46 5.27 8.38 7.41 2.85 1.24 3.97 1.02 4.72.95.83-.07 1.87-.76 2.13-1.5.27-.74.27-1.37.19-1.5-.08-.13-.29-.21-.54-.33z" />
            </svg>
          </div>
        );
      case NoteType.Call:
        return (
          <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center ring-4 ring-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        );
      case NoteType.Email:
          return (
            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center ring-4 ring-white">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
               </svg>
            </div>
          );
      case NoteType.System:
        return (
            <div className="h-8 w-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center ring-4 ring-white">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
        )
      default: // Note
        return (
          <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center ring-4 ring-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
        );
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('default', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const renderTextWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        return (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-primary-600 underline decoration-primary-300 underline-offset-2 break-all hover:text-primary-700"
          >
            {part}
          </a>
        );
      }
      return <React.Fragment key={`${index}-${part}`}>{part}</React.Fragment>;
    });
  };

  const translateSalesCode = (value: string) => {
    const legacyMatches: Record<string, string> = {
      'Operator approved action from CRM': 'operator_approved_action_from_crm',
      'Operator skipped action from CRM': 'operator_skipped_action_from_crm',
      'Operator requested manual handoff from CRM': 'operator_requested_manual_handoff',
      'Recalculated from current sales state': 'recalculated_from_current_sales_state',
    };
    const normalizedValue = legacyMatches[value.trim()] || value.trim();
    const key = `sales.value.${normalizedValue}`;
    const translated = t(key);
    return translated === key ? normalizedValue.replace(/_/g, ' ') : translated;
  };

  const localizeSystemNote = (content: string) => {
    if (content.startsWith('SALES_AUTOPILOT_UPDATED:')) {
      const [, mode = '', status = '', safeToSend = 'False'] = content.split(':');
      return [
        t('timeline.salesDepartment.autopilotUpdated'),
        t('timeline.salesDepartment.autopilotMode', { value: translateSalesCode(mode) }),
        t('timeline.salesDepartment.autopilotStatus', { value: translateSalesCode(status) }),
        t('timeline.salesDepartment.safeToSend', { value: safeToSend === 'True' ? t('common.yes') : t('common.no') }),
      ].join('\n');
    }

    if (content.startsWith('SALES_AUTOPILOT_HANDOFF:')) {
      const reason = content.replace('SALES_AUTOPILOT_HANDOFF:', '').trim();
      return [
        t('timeline.salesDepartment.handoff'),
        t('timeline.salesDepartment.handoffReason', { value: translateSalesCode(reason) }),
      ].join('\n');
    }

    if (content.startsWith('SALES_FOLLOWUP_')) {
      const [code = '', followupId = '', reason = ''] = content.split(':');
      const action = code.replace('SALES_FOLLOWUP_', '').toLowerCase();
      return [
        t(`timeline.salesDepartment.followup.${action}`),
        followupId ? t('timeline.salesDepartment.followupId', { value: followupId }) : '',
        reason ? t('timeline.salesDepartment.handoffReason', { value: translateSalesCode(reason) }) : '',
      ].filter(Boolean).join('\n');
    }

    if (content.startsWith('Autopilot mode changed to ')) {
      const mode = content.match(/Autopilot mode changed to ([^.]+)\./)?.[1] || '';
      const status = content.match(/Status: ([^.]+)\./)?.[1] || '';
      const safeToSend = content.match(/Safe to send: ([^.]+)\./)?.[1] || 'False';
      return [
        t('timeline.salesDepartment.autopilotUpdated'),
        mode ? t('timeline.salesDepartment.autopilotMode', { value: translateSalesCode(mode) }) : '',
        status ? t('timeline.salesDepartment.autopilotStatus', { value: translateSalesCode(status) }) : '',
        t('timeline.salesDepartment.safeToSend', { value: safeToSend === 'True' || safeToSend === 'true' ? t('common.yes') : t('common.no') }),
      ].filter(Boolean).join('\n');
    }

    if (content.startsWith('Autopilot handoff:')) {
      const reason = content.replace('Autopilot handoff:', '').trim();
      return [
        t('timeline.salesDepartment.handoff'),
        t('timeline.salesDepartment.handoffReason', { value: translateSalesCode(reason) }),
      ].join('\n');
    }

    if (content.startsWith('Отдел продаж пересчитал состояние лида.')) {
      const clientState = content.match(/Состояние клиента: ([^.]+)\./)?.[1] || '';
      const nextAction = content.match(/Следующее действие: ([^.]+)\./)?.[1] || '';
      const pipelineHealth = content.match(/Pipeline health: ([^.]+)\./)?.[1] || '';

      return [
        t('timeline.salesDepartment.recalculated'),
        clientState ? t('timeline.salesDepartment.clientState', { value: translateSalesCode(clientState) }) : '',
        nextAction ? t('timeline.salesDepartment.nextAction', { value: translateSalesCode(nextAction) }) : '',
        pipelineHealth ? t('timeline.salesDepartment.pipelineHealth', { value: translateSalesCode(pipelineHealth) }) : '',
      ].filter(Boolean).join('\n');
    }

    if (content.startsWith('Данные скорректированы оператором.')) {
      const count = content.match(/Изменено полей: (\d+)/)?.[1] || '0';
      const fields = content.match(/Изменённые поля: ([^.]+)\./)?.[1] || '';
      return [
        t('timeline.extraction.corrected', { count }),
        t('timeline.extraction.changedFields', { fields }),
      ].join('\n');
    }

    return content;
  };

  // Helper function to parse and render note content
  const renderNoteContent = (note: ApplicationNote) => {
    if (note.content.startsWith('SYSTEM_STATUS_CHANGE:')) {
        const statusKey = note.content.split(':')[1];
        // Translate the status key
        const translatedStatus = t(`status.${statusKey.replace(' ', '')}`);
        return renderTextWithLinks(t('timeline.system.statusChange', { status: translatedStatus }));
    }
    
    // Localize statuses in plain text notes
    let content = localizeSystemNote(note.content);
    Object.values(Status).forEach(statusEng => {
        if (content.includes(statusEng)) {
            const translated = t(`status.${statusEng.replace(' ', '')}`);
            content = content.split(statusEng).join(translated);
        }
    });
    return renderTextWithLinks(content);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">{t('detail.clientInfo.notes')}</h3>
      </div>

      <div className="p-6">
        {/* Input Area */}
        <div className="mb-8">
            <div className="flex gap-2 mb-3">
                <button
                    type="button"
                    onClick={() => setActiveType(NoteType.Note)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                        activeType === NoteType.Note ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    {t('timeline.type.NOTE')}
                </button>

                 <button
                    type="button"
                    onClick={() => setActiveType(NoteType.Call)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                        activeType === NoteType.Call ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                    }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    {t('timeline.type.CALL')}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveType(NoteType.Email)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1.5 ${
                        activeType === NoteType.Email ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {t('timeline.type.EMAIL')}
                </button>
            </div>
            
            <form onSubmit={handleSubmit} className="relative">
                <textarea
                    ref={textareaRef}
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('timeline.placeholder')}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all text-sm min-h-[80px] resize-y"
                />
                <div className="absolute bottom-2 right-2">
                    <button
                        type="submit"
                        disabled={!newNoteContent.trim() || createMutation.isPending}
                        className="p-1.5 bg-primary-600 text-white rounded-lg shadow-md hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {createMutation.isPending ? (
                            <Spinner size="h-4 w-4" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>
            </form>
        </div>

        {/* Timeline Feed */}
        <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-100" aria-hidden="true"></div>
            
            {isLoading ? (
                 <div className="flex justify-center py-8"><Spinner /></div>
            ) : isError ? (
                <div className="text-center text-red-500 py-4">{t('timeline.loadError')}</div>
            ) : !notes || notes.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm italic pl-8">
                    {t('timeline.empty')}
                </div>
            ) : (
                <ul className="space-y-6">
                    {notes.filter(n => n.type !== NoteType.WhatsApp).map((note) => {
                        const displayType = getDisplayType(note);
                        
                        return (
                            <li key={note.id} className="relative pl-12 group">
                                <div className="absolute left-0 top-1">
                                    {getIconForType(displayType)}
                                </div>
                                
                                <div className={`rounded-xl p-4 border text-sm shadow-sm relative ${
                                    displayType === NoteType.Call
                                        ? 'bg-purple-50 border-purple-100 text-slate-800'
                                        : displayType === NoteType.System
                                        ? 'bg-gray-50 border-gray-100 text-gray-600 italic'
                                        : displayType === NoteType.Email
                                        ? 'bg-blue-50 border-blue-100 text-slate-800'
                                        : 'bg-white border-slate-200 text-slate-700'
                                }`}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                            displayType === NoteType.Call ? 'bg-purple-100 text-purple-800' :
                                            displayType === NoteType.System ? 'bg-gray-200 text-gray-700' :
                                            displayType === NoteType.Email ? 'bg-blue-200 text-blue-800' :
                                            'bg-slate-100 text-slate-600'
                                        }`}>
                                            {t(`timeline.type.${displayType}`)}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            {formatDate(note.created_at)}
                                        </span>
                                    </div>
                                    <div className="whitespace-pre-wrap leading-relaxed">
                                        {renderNoteContent(note)}
                                    </div>

                                    <button 
                                        onClick={() => {
                                            if(window.confirm(t('timeline.deleteConfirm'))) {
                                                deleteMutation.mutate(note.id);
                                            }
                                        }}
                                        className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
      </div>
    </div>
  );
};

export default Timeline;
