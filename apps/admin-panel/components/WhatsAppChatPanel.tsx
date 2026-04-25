import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApplicationTimeline, sendWhatsAppMessage, sendWhatsAppMedia, deleteTimelineNote, generateAIResponse, sendWhatsAppFirstMessage } from '../services/api';
import { ApplicationNote, NoteType } from '../types';
import { useTranslation } from '../i18n';
import Spinner from './Spinner';

interface WhatsAppChatPanelProps {
  appId: string;
  clientName: string;
  clientPhone: string;
  firstMessageSent?: boolean;
  draftMessage?: string | null;
  draftSource?: string | null;
}

const WhatsAppChatPanel: React.FC<WhatsAppChatPanelProps> = ({
  appId,
  clientName,
  clientPhone,
  firstMessageSent = false,
  draftMessage,
  draftSource,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [firstMessageStatus, setFirstMessageStatus] = useState<'idle' | 'loading' | 'sent'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFirstMessageStatus(firstMessageSent ? 'sent' : 'idle');
  }, [firstMessageSent]);

  useEffect(() => {
    if (draftMessage) {
      setNewMessage(draftMessage);
      setAiError(null);
    }
  }, [draftMessage, draftSource]);

  const { data: allNotes, isLoading, isError } = useQuery({
    queryKey: ['timeline', appId],
    queryFn: () => fetchApplicationTimeline(appId),
    refetchInterval: 10000, // Poll every 10s
  });

  const whatsAppNotes = React.useMemo(() => {
    if (!allNotes) return [];
    return allNotes
      .filter((note) => note.type === NoteType.WhatsApp || (note.type === NoteType.Note && note.content.startsWith('SYSTEM_STATUS_CHANGE:')))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [allNotes]);

  const sendMutation = useMutation({
    mutationFn: ({ message, file }: { message: string; file?: File | null }) => {
      if (file) {
        return sendWhatsAppMedia(appId, file, message);
      }
      return sendWhatsAppMessage(appId, message);
    },
    onSuccess: () => {
      setNewMessage('');
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteTimelineNote(appId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const aiMutation = useMutation({
    mutationFn: () => generateAIResponse(appId),
    onSuccess: (data) => {
      setAiError(null);
      setNewMessage(data.response);
    },
    onError: (error: Error) => {
      setAiError(error.message || 'Ошибка генерации ответа');
    },
  });

  const firstMessageMutation = useMutation({
    mutationFn: () => sendWhatsAppFirstMessage(appId),
    onSuccess: (data) => {
      if (data.status === 'success' || data.status === 'already_sent') {
        setFirstMessageStatus('sent');
        queryClient.invalidateQueries({ queryKey: ['application', appId] });
        queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
      }
    },
  });

  useEffect(() => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [whatsAppNotes]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedFile) return;
    sendMutation.mutate({ message: newMessage.trim(), file: selectedFile });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('default', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('default', {
      day: 'numeric',
      month: 'short',
    });
  };

  const isSameDay = (a: string, b: string) => {
    return new Date(a).toDateString() === new Date(b).toDateString();
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zM12.05 20.21c-1.5 0-2.97-.4-4.26-1.16l-.3-.18-3.11.82.83-3.03-.19-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 012.41 5.83c.02 4.54-3.68 8.23-8.18 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.21.88 2.37 1 2.7.12.33 3.46 5.27 8.38 7.41 2.85 1.24 3.97 1.02 4.72.95.83-.07 1.87-.76 2.13-1.5.27-.74.27-1.37.19-1.5-.08-.13-.29-.21-.54-.33z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-base">{clientName}</h3>
            <p className="text-xs text-slate-500">{clientPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {firstMessageStatus === 'sent' ? (
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-full opacity-80 cursor-default border border-green-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {t('whatsappChat.firstMessageSent')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => firstMessageMutation.mutate()}
              disabled={firstMessageMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {firstMessageMutation.isPending ? (
                <Spinner size="h-3.5 w-3.5" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              )}
              {firstMessageMutation.isPending ? t('whatsappChat.sendingFirstMessage') : t('whatsappChat.sendFirstMessage')}
            </button>
          )}
          <button
            type="button"
            onClick={() => aiMutation.mutate()}
            disabled={aiMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary-50 hover:bg-primary-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-primary-100"
            title="Сгенерировать ответ ИИ"
          >
            {aiMutation.isPending ? (
              <Spinner size="h-3.5 w-3.5" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            )}
            {aiMutation.isPending ? 'Думаю...' : 'ИИ ответ'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-[500px] overflow-y-auto p-4 space-y-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZjNmMGU2Ii8+CjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWRkZDUiLz4KPC9zdmc+')] bg-repeat">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spinner size="h-10 w-10" />
          </div>
        ) : isError ? (
          <div className="text-center text-red-500 py-8">{t('dashboard.error.generic', { message: 'Failed to load chat' })}</div>
        ) : whatsAppNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <div className="h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm">{t('whatsappChat.empty')}</p>
          </div>
        ) : (
          <>
            {whatsAppNotes.map((note, index) => {
              const isIncoming = note.direction === 'incoming' || note.created_by === 'Client';
              const showDate = index === 0 || !isSameDay(whatsAppNotes[index - 1].created_at, note.created_at);
              const isSystem = note.content.startsWith('SYSTEM_STATUS_CHANGE:');

              if (isSystem) {
                const statusKey = note.content.split(':')[1];
                const translatedStatus = t(`status.${statusKey.replace(' ', '')}`);
                return (
                  <React.Fragment key={note.id}>
                    {showDate && (
                      <div className="flex justify-center my-4">
                        <span className="bg-[#e1f2fb] text-slate-600 text-xs px-3 py-1 rounded-lg shadow-sm">
                          {formatDate(note.created_at)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-center my-2">
                      <div className="bg-white/80 text-slate-500 text-xs px-4 py-2 rounded-lg shadow-sm max-w-[80%] text-center italic">
                        {t('timeline.system.statusChange', { status: translatedStatus })}
                      </div>
                    </div>
                  </React.Fragment>
                );
              }

              return (
                <React.Fragment key={note.id}>
                  {showDate && (
                    <div className="flex justify-center my-4">
                      <span className="bg-[#e1f2fb] text-slate-600 text-xs px-3 py-1 rounded-lg shadow-sm">
                        {formatDate(note.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${isIncoming ? 'justify-start' : 'justify-end'} mb-2 group`}>
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg text-sm shadow-sm relative ${
                        isIncoming
                          ? 'bg-white text-slate-800 rounded-tl-none'
                          : 'bg-[#d9fdd3] text-slate-800 rounded-tr-none'
                      }`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed pr-16">
                        {note.content}
                      </div>
                      <div className="absolute bottom-1 right-2 flex items-center gap-1">
                        <span className="text-[10px] text-slate-400">
                          {formatTime(note.created_at)}
                        </span>
                        {!isIncoming && note.wa_status && (
                          <span className="flex" title={note.wa_status}>
                            {note.wa_status === 'submitted' && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                                <path fillRule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5a1 1 0 10-2 0v5c0 .266.105.52.293.707l3 3a1 1 0 101.414-1.414L13 11.586V7z" clipRule="evenodd" />
                              </svg>
                            )}
                            {note.wa_status === 'sent' && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                            )}
                            {note.wa_status === 'delivered' && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                              </svg>
                            )}
                            {note.wa_status === 'read' && (
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                              </svg>
                            )}
                          </span>
                        )}
                      </div>
                      {!isIncoming && (
                        <button
                          onClick={() => {
                            if (window.confirm(t('timeline.deleteConfirm'))) {
                              deleteMutation.mutate(note.id);
                            }
                          }}
                          className="absolute -top-2 -right-2 p-1 bg-white rounded-full text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50">
        {(sendMutation.isError || aiError) && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {(sendMutation.error as Error)?.message || aiError || 'Ошибка'}
          </div>
        )}
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendMutation.isPending}
            className="p-2.5 bg-white text-slate-500 rounded-full hover:bg-slate-100 disabled:opacity-50 transition-colors border border-slate-200"
            title="Прикрепить файл"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <div className="flex-1 bg-white rounded-xl px-4 py-3 max-h-[280px] overflow-y-auto border border-slate-200">
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 text-xs text-slate-600">
                <span className="bg-slate-100 px-2 py-0.5 rounded truncate max-w-[200px]">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-slate-400 hover:text-red-500"
                >
                  ×
                </button>
              </div>
            )}
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('whatsappChat.placeholder')}
              className="w-full resize-none outline-none text-base text-slate-700 bg-transparent min-h-[44px] leading-relaxed"
              rows={2}
              disabled={sendMutation.isPending}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 240) + 'px';
              }}
            />
          </div>
          <button
            type="submit"
            disabled={(!newMessage.trim() && !selectedFile) || sendMutation.isPending}
            className="p-2.5 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {sendMutation.isPending ? (
              <Spinner size="h-5 w-5" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 rotate-90" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default WhatsAppChatPanel;
