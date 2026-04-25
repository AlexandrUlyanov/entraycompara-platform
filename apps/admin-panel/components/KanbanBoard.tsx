
import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Application, Status, NoteType } from '../types';
import { useTranslation } from '../i18n';
import { updateApplicationStatus, deleteApplicationById, createTimelineNote } from '../services/api';
import ConfirmModal from './ConfirmModal';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface KanbanBoardProps {
  applications: Application[];
  onSelectApplication: (app: Application) => void;
}

// Limit applies to the 'Analysis' phase to prevent bottlenecking the analysts
const WIP_LIMIT_ANALYSIS = 10;

const STATUS_COLUMNS: Status[] = [
  Status.NewLead,
  Status.Analysis,
  Status.Proposal,
  Status.Negotiation,
  Status.ContractWon,
  Status.DealLost
];

const COLUMN_COLORS: Record<Status, { header: string, accent: string }> = {
  [Status.NewLead]: { header: 'bg-blue-50/90 border-blue-100', accent: 'bg-blue-500' },
  [Status.Analysis]: { header: 'bg-indigo-50/90 border-indigo-100', accent: 'bg-indigo-500' },
  [Status.Proposal]: { header: 'bg-amber-50/90 border-amber-100', accent: 'bg-amber-500' },
  [Status.Negotiation]: { header: 'bg-rose-50/90 border-rose-100', accent: 'bg-rose-500' },
  [Status.ContractWon]: { header: 'bg-emerald-50/90 border-emerald-100', accent: 'bg-emerald-500' },
  [Status.DealLost]: { header: 'bg-slate-100/90 border-slate-200', accent: 'bg-slate-400' },
};

const getAnalysisHours = (startedAt?: string): string | null => {
  if (!startedAt) return null;
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return '<1h';
  return `${diffHours}h`;
};

const KanbanBoard: React.FC<KanbanBoardProps> = ({ applications, onSelectApplication }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [columns, setColumns] = useState<Record<Status, Application[]>>({} as any);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [appToDelete, setAppToDelete] = useState<Application | null>(null);

  useEffect(() => {
    const newColumns: Record<Status, Application[]> = {
        [Status.NewLead]: [],
        [Status.Analysis]: [],
        [Status.Proposal]: [],
        [Status.Negotiation]: [],
        [Status.ContractWon]: [],
        [Status.DealLost]: [],
    };
    
    applications.forEach(app => {
        if (newColumns[app.status]) {
            newColumns[app.status].push(app);
        }
    });

    setColumns(newColumns);
  }, [applications]);

  const showToast = (msg: string) => {
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 3000);
  };

  const updateStatusMutation = useMutation({
      mutationFn: ({ id, newStatus }: { id: string, newStatus: Status }) => updateApplicationStatus(id, newStatus),
      onSuccess: (_, variables) => {
          // Auto-create system note
          const systemMessage = `SYSTEM_STATUS_CHANGE:${variables.newStatus}`;
          createTimelineNote(variables.id, systemMessage, NoteType.System);
          showToast(t('kanban.statusChanged'));

          queryClient.invalidateQueries({ queryKey: ['applications'] });
      },
      onError: (error) => {
          showToast(t('kanban.statusUpdateError'));
          console.error(error);
          queryClient.invalidateQueries({ queryKey: ['applications'] });
      }
  });

  const deleteMutation = useMutation({
      mutationFn: (id: string) => deleteApplicationById(id),
      onSuccess: () => {
          setAppToDelete(null);
          queryClient.invalidateQueries({ queryKey: ['applications'] });
      },
      onError: (error) => {
          console.error(error);
      }
  });

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceStatus = source.droppableId as Status;
    const destStatus = destination.droppableId as Status;

    // WIP Limit Check for Analysis phase
    if (destStatus === Status.Analysis && columns[Status.Analysis].length >= WIP_LIMIT_ANALYSIS && sourceStatus !== Status.Analysis) {
        showToast(t('kanban.wipLimitReached'));
        return;
    }

    // Optimistic Update
    const sourceColumn = [...columns[sourceStatus]];
    const destColumn = sourceStatus === destStatus ? sourceColumn : [...columns[destStatus]];
    
    const [movedApp] = sourceColumn.splice(source.index, 1);
    const updatedApp = { ...movedApp, status: destStatus };
    
    destColumn.splice(destination.index, 0, updatedApp);

    const newColumns = {
        ...columns,
        [sourceStatus]: sourceColumn,
        [destStatus]: destColumn
    };

    setColumns(newColumns);

    updateStatusMutation.mutate({ id: draggableId, newStatus: destStatus });
  };

  const handleDeleteClick = (e: React.MouseEvent, app: Application) => {
      e.stopPropagation();
      setAppToDelete(app);
  }

  // Helper to generate styles for the dragging item to ensure it stays on top
  const getDraggableStyle = (style: any, snapshot: any) => {
    if (!snapshot.isDragging) return style;
    return {
      ...style,
      // Force cursor to grabbing
      cursor: 'grabbing',
    };
  };

  return (
    <div className="h-[calc(100vh-220px)] overflow-x-auto pb-4">
        {toastMessage && (
            <div className="fixed bottom-4 right-4 bg-white text-slate-700 px-4 py-2.5 rounded-xl shadow-lg border border-slate-100 z-[100] text-sm font-medium animate-fade-in-up">
                {toastMessage}
            </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-6 h-full min-w-max px-2">
                {STATUS_COLUMNS.map(status => (
                    <div key={status} className="w-80 flex flex-col relative rounded-[24px] border border-white/40 shadow-sm max-h-full">
                        {/* 
                           CRITICAL FIX: 
                           Backdrop blur is applied to this separate ABSOLUTE layer.
                           The parent container must NOT have 'backdrop-filter' or 'transform'.
                           This allows the Draggable (position: fixed) to escape the column's stacking context.
                        */}
                        <div className="absolute inset-0 bg-white/40 backdrop-blur-md rounded-[24px] -z-10 pointer-events-none"></div>

                        {/* Column Header */}
                        <div className={`p-4 rounded-t-[24px] border-b ${COLUMN_COLORS[status].header} backdrop-blur-sm flex items-center justify-between`}>
                            <div className="flex items-center gap-2.5">
                                <div className={`w-2.5 h-2.5 rounded-full ${COLUMN_COLORS[status].accent} shadow-sm`}></div>
                                <h3 className="font-bold text-secondary text-xs uppercase tracking-wider truncate max-w-[160px]">
                                    {t(`kanban.column.${status.replace(' ', '')}`)}
                                </h3>
                            </div>
                            <span className="px-2.5 py-1 bg-white/80 rounded-lg text-xs font-bold text-slate-500 border border-white shadow-sm">
                                {columns[status]?.length || 0}
                            </span>
                        </div>

                        {/* Drop Zone */}
                        <Droppable droppableId={status}>
                            {(provided, snapshot) => (
                                <div
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                    className={`flex-1 overflow-y-auto p-3 space-y-3 transition-colors scrollbar-hide rounded-b-[24px] ${
                                        snapshot.isDraggingOver ? 'bg-white/20' : ''
                                    }`}
                                >
                                    {columns[status]?.map((app, index) => (
                                        <Draggable key={app.id} draggableId={app.id} index={index}>
                                            {(provided, snapshot) => (
                                                <div
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    style={getDraggableStyle(provided.draggableProps.style, snapshot)}
                                                    className="outline-none group"
                                                >
                                                    <div 
                                                        onClick={() => onSelectApplication(app)}
                                                        className={`bg-white/90 backdrop-blur-sm p-4 rounded-2xl border border-white/60 shadow-sm transition-all duration-200 cursor-grab active:cursor-grabbing relative
                                                        ${snapshot.isDragging ? 'rotate-2 scale-105 shadow-apple-hover z-50 ring-2 ring-primary-100 opacity-95' : 'hover:shadow-apple hover:-translate-y-0.5'}`}
                                                    >
                                                        <div className="flex justify-between items-start mb-2.5">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[10px] font-mono text-slate-400 uppercase bg-slate-50/80 px-2 py-1 rounded-md">
                                                                    #{app.id.slice(0,6)}
                                                                </span>
                                                                {app.status === Status.Analysis && app.analysis_started_at && (
                                                                    <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                                                        {getAnalysisHours(app.analysis_started_at)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button 
                                                                    onClick={(e) => handleDeleteClick(e, app)}
                                                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                                                    title={t('kanban.delete.tooltip')}
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        
                                                        <h4 className="font-bold text-secondary mb-1 text-sm truncate" title={app.client_name}>{app.client_name}</h4>
                                                        <p className="text-xs text-secondary-light mb-3.5 truncate font-medium">{app.client_phone}</p>
                                                        
                                                        <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                                            <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600">
                                                                {t(`serviceType.${app.service_type.replace(' ', '')}`)}
                                                            </span>
                                                            <div className="flex items-center gap-1.5">
                                                                {app.proposal_uploaded && (
                                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${
                                                                        app.status === Status.Proposal || app.status === Status.Negotiation || app.status === Status.ContractWon
                                                                            ? 'bg-amber-500'
                                                                            : 'bg-emerald-500'
                                                                    }`}>
                                                                        {t('proposalBuilder.step.proposal')}
                                                                    </span>
                                                                )}
                                                                <span className="text-[10px] font-medium text-slate-400">
                                                                    {new Date(app.submission_date).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                    {columns[status]?.length === 0 && !snapshot.isDraggingOver && (
                                        <div className="h-24 border-2 border-dashed border-slate-300/30 rounded-2xl flex items-center justify-center">
                                            <p className="text-xs text-slate-400 text-center px-4 font-medium opacity-60">{t('kanban.noItems')}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Droppable>
                    </div>
                ))}
            </div>
        </DragDropContext>

        <ConfirmModal
            isOpen={!!appToDelete}
            onClose={() => setAppToDelete(null)}
            onConfirm={() => appToDelete && deleteMutation.mutate(appToDelete.id)}
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

export default KanbanBoard;
