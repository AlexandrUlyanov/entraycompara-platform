import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApplicationTimeline, sendWhatsAppMessage, deleteTimelineNote } from '../services/api';
import { ApplicationNote, NoteType } from '../types';
import { useTranslation } from '../i18n';
import Spinner from './Spinner';

interface WhatsAppChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  appId: string;
  clientName: string;
  clientPhone: string;
}

const WhatsAppChatModal: React.FC<WhatsAppChatModalProps> = ({
  isOpen,
  onClose,
  appId,
  clientName,
  clientPhone,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: allNotes, isLoading, isError } = useQuery({
    queryKey: ['timeline', appId],
    queryFn: () => fetchApplicationTimeline(appId),
    refetchInterval: isOpen ? 10000 : false, // Poll every 10s when open
  });

  const whatsAppNotes = React.useMemo(() => {
    if (!allNotes) return [];
    return allNotes
      .filter((note) => note.type === NoteType.WhatsApp || (note.type === NoteType.Note && note.content.startsWith('SYSTEM_STATUS_CHANGE:')))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [allNotes]);

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendWhatsAppMessage(appId, message),
    onSuccess: () => {
      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => deleteTimelineNote(appId, noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
    },
  });

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [whatsAppNotes, isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    sendMutation.mutate(newMessage.trim());
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl h-[85vh] max-h-[800px] bg-[#e5ddd5] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in-up">
        {/* Header */}
        <div className="bg-[#f0f2f5] px-4 py-3 flex items-center justify-between border-b border-[#d1d7db]">
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
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSIjZjNmMGU2Ii8+CjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNlNWRkZDUiLz4KPC9zdmc+')] bg-repeat">
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
                        <div className="whitespace-pre-wrap leading-relaxed pr-14">
                          {note.content}
                        </div>
                        <span className="absolute bottom-1 right-2 text-[10px] text-slate-400">
                          {formatTime(note.created_at)}
                        </span>
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
        <div className="bg-[#f0f2f5] px-4 py-3 border-t border-[#d1d7db]">
          <form onSubmit={handleSend} className="flex items-end gap-2">
            <div className="flex-1 bg-white rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('whatsappChat.placeholder')}
                className="w-full resize-none outline-none text-sm text-slate-700 bg-transparent min-h-[20px] max-h-24"
                rows={1}
                disabled={sendMutation.isPending}
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 96) + 'px';
                }}
              />
            </div>
            <button
              type="submit"
              disabled={!newMessage.trim() || sendMutation.isPending}
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
    </div>
  );
};

export default WhatsAppChatModal;
