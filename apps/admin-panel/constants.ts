
import { Status } from './types';

export const STATUS_COLORS: Record<Status, string> = {
  [Status.NewLead]: 'bg-blue-50 text-blue-700 border border-blue-100', // Fresh Lead
  [Status.Analysis]: 'bg-indigo-50 text-indigo-700 border border-indigo-100', // Processing
  [Status.Proposal]: 'bg-amber-50 text-amber-700 border border-amber-100', // Action Required
  [Status.Negotiation]: 'bg-rose-50 text-rose-700 border border-rose-100', // High Stakes
  [Status.ContractWon]: 'bg-emerald-50 text-emerald-700 border border-emerald-100', // Success
  [Status.DealLost]: 'bg-slate-100 text-slate-500 border border-slate-200', // Inactive
};
