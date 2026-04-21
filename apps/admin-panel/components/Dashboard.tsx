
import React, { useState, useEffect } from 'react';
import { fetchApplications } from '../services/api';
import { Application, Status, ServiceType } from '../types';
import Spinner from './Spinner';
import StatusBadge from './StatusBadge';
import Pagination from './Pagination';
import KanbanBoard from './KanbanBoard';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useTranslation } from '../i18n';

interface DashboardProps {
  onSelectApplication: (app: Application) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onSelectApplication }) => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [serviceTypeFilter, setServiceTypeFilter] = useState<ServiceType | 'all'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('kanban');
  const [tableLimit, setTableLimit] = useState(10);

  // Increase limit for Kanban to make it useful, though pagination still applies
  const limit = viewMode === 'kanban' ? 50 : tableLimit;
  const currentCursor = cursors[page - 1];

  const { data, isLoading, isError, error, isPlaceholderData } = useQuery({
    queryKey: ['applications', currentCursor, searchTerm, statusFilter, serviceTypeFilter, limit],
    queryFn: () => fetchApplications(limit, currentCursor, searchTerm, statusFilter, serviceTypeFilter),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
      // Update cursors list when new data arrives with a next_cursor,
      // but only if we are at the end of our known cursors list (to avoid duplicates)
      // and not showing placeholder data.
      if (!isPlaceholderData && data?.next_cursor && cursors.length === page) {
          setCursors(prev => [...prev, data.next_cursor]);
      }
  }, [data, isPlaceholderData, page, cursors.length]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
    setCursors([null]);
  };
  
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value as Status | 'all');
    setPage(1);
    setCursors([null]);
  };

  const handleServiceTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setServiceTypeFilter(e.target.value as ServiceType | 'all');
    setPage(1);
    setCursors([null]);
  };
  
  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTableLimit(Number(e.target.value));
    setPage(1);
    setCursors([null]);
  };

  const goToNextPage = () => {
      if (!isPlaceholderData && (data?.next_cursor || page < cursors.length)) {
          setPage(page + 1);
      }
  };

  const goToPrevPage = () => {
      if (page > 1) {
          setPage(page - 1);
      }
  };

  const renderErrorMessage = () => {
    const errorMessage = (error as Error).message;
    const isFilterActive = statusFilter !== 'all' || serviceTypeFilter !== 'all';

    if (errorMessage.includes('500') && isFilterActive) {
      return (
        <div className="p-8 text-center bg-red-50/50 backdrop-blur-md rounded-[30px] border border-red-100 shadow-apple">
            <div className="inline-flex p-3 bg-red-100 rounded-full text-red-600 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <p className="font-bold text-red-800 text-lg">{t('dashboard.error.filter.title')}</p>
            <p className="text-sm text-red-600 mt-2 max-w-md mx-auto">
                {t('dashboard.error.filter.description')}
            </p>
            <p className="text-sm text-slate-600 mt-4 font-medium">
                {t('dashboard.error.filter.action')}
            </p>
        </div>
      );
    }
    
    return <div className="text-red-500 bg-red-50/50 backdrop-blur p-6 rounded-[20px] border border-red-100 text-center">{t('dashboard.error.generic', { message: errorMessage })}</div>;
  };

  return (
    <div className="space-y-8 h-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-secondary tracking-tight">{t('dashboard.title')}</h2>
          <p className="text-secondary-light mt-2 text-base font-normal">{t('dashboard.description')}</p>
        </div>
      </div>
      
      <div className="bg-white/70 backdrop-blur-xl p-6 rounded-[30px] shadow-apple border border-white/40">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
             {/* Search and Filters */}
            <div className="md:col-span-4 relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
                <input
                    type="text"
                    placeholder={t('dashboard.searchPlaceholder')}
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="pl-11 w-full px-4 py-3 bg-slate-100/50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white text-secondary transition-all focus:outline-none placeholder-slate-400"
                />
            </div>
            <div className="md:col-span-2">
                <div className="relative">
                    <select 
                        value={statusFilter} 
                        onChange={handleStatusChange} 
                        className="w-full px-4 py-3 bg-slate-100/50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white text-secondary transition-all focus:outline-none cursor-pointer appearance-none"
                    >
                        <option value="all">{t('dashboard.allStatuses')}</option>
                        {Object.values(Status).map(s => <option key={s} value={s}>{t(`status.${s.replace(' ', '')}`)}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                         <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
            </div>
            <div className="md:col-span-2">
                <div className="relative">
                    <select 
                        value={serviceTypeFilter} 
                        onChange={handleServiceTypeChange} 
                        className="w-full px-4 py-3 bg-slate-100/50 border-none rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white text-secondary transition-all focus:outline-none cursor-pointer appearance-none"
                    >
                        <option value="all">{t('dashboard.allServiceTypes')}</option>
                        {Object.values(ServiceType).map(s => <option key={s} value={s}>{t(`serviceType.${s.replace(' ', '')}`)}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                         <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                </div>
            </div>

             {/* View Toggle */}
            <div className="md:col-span-4 flex justify-end">
                 <div className="bg-slate-100/80 p-1.5 rounded-xl inline-flex border border-white/50 backdrop-blur-sm">
                    <button
                        onClick={() => setViewMode('table')}
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                            viewMode === 'table'
                                ? 'bg-white text-secondary shadow-apple'
                                : 'text-secondary-light hover:text-secondary'
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        {t('dashboard.view.table')}
                    </button>
                    <button
                        onClick={() => setViewMode('kanban')}
                        className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                            viewMode === 'kanban'
                                ? 'bg-white text-secondary shadow-apple'
                                : 'text-secondary-light hover:text-secondary'
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                        </svg>
                        {t('dashboard.view.kanban')}
                    </button>
                </div>
            </div>
        </div>
      </div>

      {isLoading ? (
         <div className="flex justify-center py-32"><Spinner size="h-12 w-12" /></div>
      ) : isError ? (
         renderErrorMessage()
      ) : (
          <>
            {viewMode === 'table' ? (
                <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden animate-fade-in">
                    <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                    <span className="text-xs font-bold uppercase tracking-widest text-secondary-light">All Applications</span>
                    <span className="text-xs font-medium text-secondary-light/80 bg-white px-2 py-1 rounded-md shadow-sm">
                        {data && t('dashboard.showingCount', { count: data.applications.length })}
                    </span>
                    </div>
                    
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-secondary">
                        <thead className="text-xs text-secondary-light uppercase bg-slate-50/50 border-b border-slate-100">
                        <tr>
                            <th scope="col" className="px-8 py-5 font-semibold tracking-wide">{t('dashboard.tableId')}</th>
                            <th scope="col" className="px-6 py-5 font-semibold tracking-wide">{t('dashboard.tableClient')}</th>
                            <th scope="col" className="px-6 py-5 font-semibold tracking-wide">{t('dashboard.tableServiceType')}</th>
                            <th scope="col" className="px-6 py-5 font-semibold tracking-wide">{t('dashboard.tableLanguage')}</th>
                            <th scope="col" className="px-6 py-5 font-semibold tracking-wide">{t('dashboard.tableDate')}</th>
                            <th scope="col" className="px-8 py-5 font-semibold text-right tracking-wide">{t('dashboard.tableStatus')}</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {data?.applications.map(app => (
                            <tr 
                                key={app.id} 
                                className="hover:bg-white transition-all duration-200 cursor-pointer group" 
                                onClick={() => onSelectApplication(app)}
                            >
                                <td className="px-8 py-5 font-mono text-xs text-slate-400 group-hover:text-primary-500 transition-colors">
                                    #{app.id.substring(0, 8)}...
                                </td>
                                <td className="px-6 py-5">
                                <div className="flex flex-col">
                                    <span className="font-semibold text-secondary text-base mb-0.5">{app.client_name}</span>
                                    <span className="text-xs text-secondary-light">{app.client_phone}</span>
                                </div>
                                </td>
                                <td className="px-6 py-5">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-transparent group-hover:border-slate-200 transition-all">
                                    {t(`serviceType.${app.service_type.replace(' ', '')}`)}
                                    </span>
                                </td>
                                <td className="px-6 py-5">
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-600 border border-transparent group-hover:border-blue-200 transition-all uppercase">
                                    {app.language || '—'}
                                    </span>
                                </td>
                                <td className="px-6 py-5 text-secondary-light">
                                    {new Date(app.submission_date).toLocaleDateString()}
                                </td>
                                <td className="px-8 py-5 text-right">
                                    <StatusBadge status={app.status} />
                                </td>
                            </tr>
                            ))}
                            {data?.applications.length === 0 && (
                                <tr><td colSpan={6} className="text-center py-20 text-slate-400">No applications found.</td></tr>
                            )}
                        </tbody>
                    </table>
                    </div>
                </div>
            ) : (
                <div className="animate-fade-in">
                     <KanbanBoard 
                        applications={data?.applications || []} 
                        onSelectApplication={onSelectApplication} 
                     />
                </div>
            )}
            
            {/* Pagination and Rows Per Page controls */}
            {data && (viewMode === 'table' || data.next_cursor) && (
                <div className="px-6 py-4 mt-4 bg-white/60 backdrop-blur-md rounded-2xl shadow-sm border border-white/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Rows per page selector (only for table view) */}
                    {viewMode === 'table' && (
                        <div className="flex items-center text-sm text-slate-500">
                            <span className="mr-2">{t('dashboard.rowsPerPage')}</span>
                            <select 
                                value={tableLimit}
                                onChange={handleLimitChange}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-primary-500 focus:outline-none text-secondary shadow-sm"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    )}
                    
                    <div className={viewMode === 'kanban' ? 'w-full flex justify-center' : ''}>
                        <Pagination
                            currentPage={page}
                            onPrev={goToPrevPage}
                            onNext={goToNextPage}
                            hasPrev={page > 1}
                            hasNext={!!data.next_cursor && !isPlaceholderData}
                        />
                    </div>
                </div>
            )}
          </>
      )}
    </div>
  );
};

export default Dashboard;
