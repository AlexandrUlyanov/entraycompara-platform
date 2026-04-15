import React from 'react';
import { useTranslation } from '../i18n';

interface PaginationProps {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentPage: number;
}

const Pagination: React.FC<PaginationProps> = ({ onPrev, onNext, hasPrev, hasNext, currentPage }) => {
  const { t } = useTranslation();
  if (!hasPrev && !hasNext) return null;

  return (
    <div className="flex items-center justify-between mt-4">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {t('pagination.previous')}
      </button>
      <span className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-md">
        {t('pagination.page', { page: currentPage })}
      </span>
      <button
        onClick={onNext}
        disabled={!hasNext}
        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {t('pagination.next')}
      </button>
    </div>
  );
};

export default Pagination;