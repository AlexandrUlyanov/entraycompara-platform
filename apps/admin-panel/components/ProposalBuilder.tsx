import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getExtractedData, listSimulations } from '../services/api';
import DataExtractionPanel from './DataExtractionPanel';
import SimulationPanel from './SimulationPanel';
import ProposalPreviewPanel from './ProposalPreviewPanel';
import { useTranslation } from '../i18n';

interface ProposalBuilderProps {
  appId: string;
  uploadedFiles: string[];
  proposalFileUrl?: string;
}

type Step = 'data' | 'simulation' | 'proposal';

const ProposalBuilder: React.FC<ProposalBuilderProps> = ({ appId, uploadedFiles, proposalFileUrl }) => {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState<Step>('data');

  const { data: proposalData } = useQuery({
    queryKey: ['proposal-data', appId],
    queryFn: () => getExtractedData(appId),
    retry: false,
  });

  const { data: simData } = useQuery({
    queryKey: ['simulations', appId],
    queryFn: () => listSimulations(appId),
  });

  const hasExtractedData = !!proposalData?.extracted_data;
  const hasSelectedSimulation = (simData?.simulations || []).some((s: any) => s.is_selected);

  const steps: { id: Step; label: string }[] = [
    { id: 'data', label: t('proposalBuilder.step.data') },
    { id: 'simulation', label: t('proposalBuilder.step.simulation') },
    { id: 'proposal', label: t('proposalBuilder.step.proposal') },
  ];

  const getStepStatus = (stepId: Step) => {
    if (stepId === 'data') return hasExtractedData ? 'complete' : activeStep === 'data' ? 'active' : 'pending';
    if (stepId === 'simulation') return hasSelectedSimulation ? 'complete' : activeStep === 'simulation' ? 'active' : 'pending';
    if (stepId === 'proposal') return proposalFileUrl ? 'complete' : activeStep === 'proposal' ? 'active' : 'pending';
    return 'pending';
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-[30px] shadow-apple border border-white/40 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/30">
        <h3 className="text-xs font-bold text-secondary-light uppercase tracking-widest">{t('proposalBuilder.title')}</h3>
      </div>

      {/* Stepper */}
      <div className="px-6 pt-5">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const status = getStepStatus(step.id);
            const isClickable = step.id === 'data' || (step.id === 'simulation' && hasExtractedData) || (step.id === 'proposal' && hasExtractedData);
            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => isClickable && setActiveStep(step.id)}
                  disabled={!isClickable}
                  className={`flex flex-col items-center gap-1.5 transition-all ${isClickable ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      status === 'complete'
                        ? 'bg-green-500 text-white'
                        : status === 'active'
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {status === 'complete' ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span className={`text-[10px] font-medium ${status === 'active' ? 'text-primary' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                </button>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 transition-all ${
                    status === 'complete' ? 'bg-green-500' : 'bg-slate-100'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeStep === 'data' && (
          <DataExtractionPanel appId={appId} uploadedFiles={uploadedFiles} />
        )}
        {activeStep === 'simulation' && (
          <SimulationPanel appId={appId} />
        )}
        {activeStep === 'proposal' && (
          <ProposalPreviewPanel
            appId={appId}
            proposalFileUrl={proposalFileUrl}
            hasExtractedData={hasExtractedData}
            hasSelectedSimulation={hasSelectedSimulation}
          />
        )}
      </div>
    </div>
  );
};

export default ProposalBuilder;
