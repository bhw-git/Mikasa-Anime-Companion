import React from 'react';
import { EmotionProfile, LoadedModelMeta } from '../types/assistant';

interface TopBarProps {
  currentEmotion: EmotionProfile;
  loadedModel: LoadedModelMeta | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenModelPicker: () => void;
  isSpringBootConnected: boolean;
  activeBrain?: 'gemini_free' | 'springboot';
}

export const TopBar: React.FC<TopBarProps> = ({
  currentEmotion,
  loadedModel,
  activeTab,
  onTabChange,
  onOpenModelPicker,
  isSpringBootConnected,
  activeBrain = 'gemini_free',
}) => {
  return (
    <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-8 px-6 py-4 border-b border-white/5 bg-[#0b0d13]/85 backdrop-blur-md">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <span className="text-base font-bold tracking-tight text-white">
          Mikasa · Virtual Partner
        </span>
        <span className="text-xs text-rose-300 font-mono">
          · {currentEmotion.label}
        </span>
        <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded font-mono hidden sm:inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {activeBrain === 'gemini_free' ? 'Online' : 'Spring Boot'}
        </span>
      </div>

      {/* Zone 2: 3 clean single-line nav links */}
      <nav className="hidden md:flex items-center gap-8 text-xs font-medium text-slate-300">
        <button
          onClick={() => onTabChange('partner')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'partner' ? 'text-white font-semibold' : ''
          }`}
        >
          Persona
        </button>
        <button
          onClick={() => onTabChange('model')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'model' ? 'text-white font-semibold' : ''
          }`}
        >
          3D Model {loadedModel?.isCustom ? '(Custom)' : ''}
        </button>
        <button
          onClick={() => onTabChange('springboot')}
          className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'springboot' ? 'text-white font-semibold' : ''
          }`}
        >
          AI Brain {activeBrain === 'gemini_free' ? '' : isSpringBootConnected ? '(Connected)' : ''}
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenModelPicker}
          className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/70 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
        >
          <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Load 3D Model
        </button>
      </div>
    </header>
  );
};
