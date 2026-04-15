
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { generateSignedUrl } from '../services/api';
import Spinner from './Spinner';
import { useTranslation } from '../i18n';

interface FileLinkProps {
  uri: string;
}

const FileLink: React.FC<FileLinkProps> = ({ uri }) => {
  const { t } = useTranslation();
  const isGcs = uri.startsWith('gs://');

  // Helper to get filename
  const getFilename = (path: string) => {
    try {
        // Handle both gs://bucket/path and http://.../path
        const cleanPath = path.replace('gs://', '');
        return cleanPath.split('/').pop() || 'document';
    } catch (e) {
        return 'document';
    }
  };

  const filename = getFilename(uri);

  // Only fetch if it is a GCS URI
  const { data, isLoading, isError } = useQuery({
    queryKey: ['signedUrl', uri],
    queryFn: () => generateSignedUrl(uri),
    enabled: isGcs,
    staleTime: 1000 * 60 * 45, // Cache for 45 mins (assuming URL lasts 60)
  });

  const finalUrl = isGcs ? data?.url : uri;

  if (isGcs && isLoading) {
    return (
      <div className="flex items-center p-3 rounded-lg border border-slate-100 bg-slate-50">
        <Spinner size="h-5 w-5" />
        <span className="ml-3 text-sm text-slate-400">Generating secure link...</span>
      </div>
    );
  }

  if (isGcs && isError) {
    return (
      <div className="flex items-center p-3 rounded-lg border border-red-100 bg-red-50 text-red-500 text-sm">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>Error loading link</span>
      </div>
    );
  }

  return (
    <a
      href={finalUrl}
      download={filename} // 'download' attribute works best for direct downloads
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center p-3 rounded-lg border border-slate-100 hover:border-primary-200 hover:bg-primary-50/50 transition-all"
    >
      <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center mr-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate group-hover:text-primary-700 transition-colors">{filename}</p>
        <p className="text-xs text-slate-500 flex items-center gap-1">
            {isGcs ? (
                <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Secure Link
                </>
            ) : 'Click to download'}
        </p>
      </div>
    </a>
  );
};

export default FileLink;
