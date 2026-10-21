import React from 'react';
import { X, HardDrive } from 'lucide-react';
import { OfflineTranscriberManager } from './OfflineTranscriberManager';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onModelChanged?: () => void;
}

export const OfflineTranscriberModal: React.FC<Props> = ({ isOpen, onClose, onModelChanged }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 my-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
          title="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <OfflineTranscriberManager onModelChanged={onModelChanged} />

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Done / Close
          </button>
        </div>
      </div>
    </div>
  );
};
