import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { generateProposal, getProposalPreview, sendProposalViaWhatsApp } from '../services/api';
import Spinner from './Spinner';
import { useTranslation } from '../i18n';

interface ProposalPreviewPanelProps {
  appId: string;
  proposalFileUrl?: string;
  hasExtractedData: boolean;
  hasSelectedSimulation: boolean;
}

const ProposalPreviewPanel: React.FC<ProposalPreviewPanelProps> = ({
  appId,
  proposalFileUrl,
  hasExtractedData,
  hasSelectedSimulation,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);
  const [showCommentField, setShowCommentField] = useState(false);
  const [proposalComment, setProposalComment] = useState('');
  const [sendSuccessMessage, setSendSuccessMessage] = useState('');

  const { data: previewData } = useQuery({
    queryKey: ['proposal-preview', appId],
    queryFn: () => getProposalPreview(appId),
    enabled: showPreview && !!proposalFileUrl,
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateProposal(appId, proposalComment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-preview', appId] });
      setShowPreview(true);
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => sendProposalViaWhatsApp(appId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['timeline', appId] });
      queryClient.invalidateQueries({ queryKey: ['application', appId] });
      setSendSuccessMessage(data.message || t('proposalBuilder.proposal.submitted'));
    },
  });

  const canGenerate = hasExtractedData && hasSelectedSimulation;
  const currentUrl = proposalFileUrl || previewData?.proposal_file_url;

  return (
    <div className="space-y-4">
      {!canGenerate && (
        <div className="text-sm text-amber-600 bg-amber-50 rounded-xl p-3 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          {t('proposalBuilder.proposal.noData')}
        </div>
      )}

      {/* Generate / Regenerate */}
      <button
        type="button"
        onClick={() => setShowCommentField(prev => !prev)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-secondary rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.496 12.804 2 11.45 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" />
        </svg>
        {t('proposalBuilder.proposal.addComment')}
      </button>

      {showCommentField && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            {t('proposalBuilder.proposal.commentLabel')}
          </label>
          <textarea
            value={proposalComment}
            onChange={(e) => setProposalComment(e.target.value)}
            rows={4}
            placeholder={t('proposalBuilder.proposal.commentPlaceholder')}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary resize-y"
          />
        </div>
      )}

      <button
        onClick={() => generateMutation.mutate()}
        disabled={generateMutation.isPending || !canGenerate}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-secondary text-white rounded-xl font-medium hover:bg-secondary/90 disabled:opacity-50 transition-all"
      >
        {generateMutation.isPending ? (
          <>
            <Spinner size="h-4 w-4" />
            {t('proposalBuilder.proposal.generating')}
          </>
        ) : currentUrl ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            {t('proposalBuilder.proposal.regenerateBtn')}
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
            {t('proposalBuilder.proposal.generateBtn')}
          </>
        )}
      </button>

      {generateMutation.isError && (
        <p className="text-xs text-red-500">{(generateMutation.error as Error)?.message}</p>
      )}
      {generateMutation.isSuccess && (
        <p className="text-xs text-green-600 text-center">{t('proposalBuilder.proposal.generated')}</p>
      )}

      {/* Preview */}
      {currentUrl && (
        <div className="space-y-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-secondary rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
            </svg>
            {showPreview ? 'Скрыть превью' : t('proposalBuilder.proposal.preview')}
          </button>

          {showPreview && (
            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
              <iframe
                src={currentUrl}
                className="w-full h-96"
                title="Proposal Preview"
              />
            </div>
          )}

          {/* Send via WhatsApp */}
          <button
            onClick={() => {
              setSendSuccessMessage('');
              sendMutation.mutate();
            }}
            disabled={sendMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 disabled:opacity-50 transition-all"
          >
            {sendMutation.isPending ? (
              <Spinner size="h-4 w-4" />
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zM12.05 20.21c-1.5 0-2.97-.4-4.26-1.16l-.3-.18-3.11.82.83-3.03-.19-.31a8.19 8.19 0 01-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.183 8.183 0 012.41 5.83c.02 4.54-3.68 8.23-8.18 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.21.88 2.37 1 2.7.12.33 3.46 5.27 8.38 7.41 2.85 1.24 3.97 1.02 4.72.95.83-.07 1.87-.76 2.13-1.5.27-.74.27-1.37.19-1.5-.08-.13-.29-.21-.54-.33z" />
              </svg>
            )}
            {t('proposalBuilder.proposal.sendWhatsApp')}
          </button>

          {sendMutation.isError && (
            <p className="text-xs text-red-500">{(sendMutation.error as Error)?.message}</p>
          )}
          {sendMutation.isSuccess && (
            <p className="text-xs text-green-600 text-center">{sendSuccessMessage || t('proposalBuilder.proposal.submitted')}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ProposalPreviewPanel;
