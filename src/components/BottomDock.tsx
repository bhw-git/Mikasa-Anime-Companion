import React, { useState } from 'react';
import {
  EmotionProfile,
  LoadedModelMeta,
  SpringBootConfig,
} from '../types/assistant';
import { SPRINGBOOT_CHATGPT_CODE, pingGeminiBackend } from '../services/springBootService';

interface BottomDockProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmotion: EmotionProfile;
  loadedModel: LoadedModelMeta | null;
  onSelectAnimation: (animName: string) => void;
  activeAnimationName: string;
  onOpenFilePicker: () => void;
  onResetCamera: () => void;
  onLoadCustomModelUrl?: (url: string) => void;
  onRestoreDefaultModel?: () => void;
  springBootConfig: SpringBootConfig;
  onUpdateSpringBootConfig: (cfg: Partial<SpringBootConfig>) => void;
  onPingSpringBoot: () => void;
  pingResult: { success: boolean; message: string } | null;
  isPinging: boolean;
  onTestGreeting: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  isOpen,
  onClose,
  currentEmotion,
  loadedModel,
  onSelectAnimation,
  activeAnimationName,
  onOpenFilePicker,
  onResetCamera,
  onLoadCustomModelUrl,
  onRestoreDefaultModel,
  springBootConfig,
  onUpdateSpringBootConfig,
  onPingSpringBoot,
  pingResult,
  isPinging,
  onTestGreeting,
  activeTab,
  setActiveTab,
}) => {
  const [activeCodeFile, setActiveCodeFile] = useState<
    'controller' | 'websocket' | 'app' | 'pom' | 'properties' | 'script'
  >('controller');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [geminiPingResult, setGeminiPingResult] = useState<{ success: boolean; message: string; latencyMs: number } | null>(null);
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [modelUrlInput, setModelUrlInput] = useState('');

  const handleTestGemini = async () => {
    setIsTestingGemini(true);
    setGeminiPingResult(null);
    const res = await pingGeminiBackend();
    setGeminiPingResult(res);
    setIsTestingGemini(false);
  };

  const handleCopyCode = (code: string, key: string) => {
    navigator.clipboard.writeText(code);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 flex flex-col items-center pointer-events-none pb-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      {/* Main Container Card */}
      <div className="pointer-events-auto w-full max-w-4xl mx-auto px-4">
        <div className="bg-[#10141f]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden">
          {/* Navigation Tabs Header with Close Button */}
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 bg-black/20">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('partner')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'partner' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Persona
              </button>
              <button
                onClick={() => setActiveTab('model')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'model' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                3D Model {loadedModel?.isCustom ? '(Custom Active)' : ''}
              </button>
              <button
                onClick={() => setActiveTab('springboot')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'springboot' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                AI Brain
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-rose-500/20 border border-white/10 hover:border-rose-400/40 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                title="Close Settings Panel"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Tab Content Panes */}
          <div className="p-4 max-h-72 overflow-y-auto">
            {/* 1. PERSONA TAB */}
            {activeTab === 'partner' && (
              <div className="space-y-3">
                <div className="p-3.5 bg-black/30 border border-white/5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        Current Emotional State: {currentEmotion.label}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: currentEmotion.accentTone }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {currentEmotion.tagline} · Emotion is automatically chosen in real-time from what you say!
                    </p>
                  </div>

                  <button
                    onClick={onTestGreeting}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Sweet Voice Sample
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 bg-black/20 border border-white/5 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Dynamic Lip Sync</span>
                    <span className="font-semibold text-slate-200 mt-0.5 block">
                      Real-time Amplitude & Phonemes
                    </span>
                  </div>
                  <div className="p-2.5 bg-black/20 border border-white/5 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Conversational Brain</span>
                    <span className="font-semibold text-slate-200 mt-0.5 block">
                      ChatGPT Full-Duplex / Spring Boot
                    </span>
                  </div>
                  <div className="p-2.5 bg-black/20 border border-white/5 rounded-lg">
                    <span className="text-slate-400 block text-[11px]">Gaze & Touch Reaction</span>
                    <span className="font-semibold text-slate-200 mt-0.5 block">
                      Eye Wink & Head Tracking
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. 3D MODEL TAB */}
            {activeTab === 'model' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-black/30 border border-white/5 rounded-xl">
                  <div>
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>Current Model: {loadedModel?.fileName || 'Default Anime Mikasa'}</span>
                      {loadedModel?.isCustom && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded">
                          Saved in IndexedDB
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {loadedModel?.isCustom
                        ? `Custom Model (${loadedModel.fileSize}) · ${loadedModel.meshCount} Meshes · ${loadedModel.boneCount} Bones · Saved as Default`
                        : 'Default Anime Partner (Procedural) · Twin buns, physics side-locks, glowing sapphire eyes, dynamic lip sync'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      onClick={onOpenFilePicker}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer"
                    >
                      Upload (.GLB / .VRM)
                    </button>
                    {loadedModel?.isCustom && onRestoreDefaultModel && (
                      <button
                        onClick={onRestoreDefaultModel}
                        className="px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                      >
                        Restore Mikasa
                      </button>
                    )}
                    <button
                      onClick={onResetCamera}
                      className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-white/5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                    >
                      Reset View
                    </button>
                  </div>
                </div>

                {/* Direct GLB / VRM URL loader form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (modelUrlInput.trim() && onLoadCustomModelUrl) {
                      onLoadCustomModelUrl(modelUrlInput.trim());
                      setModelUrlInput('');
                    }
                  }}
                  className="flex items-center gap-2 p-2.5 bg-black/20 border border-white/5 rounded-xl"
                >
                  <input
                    type="url"
                    value={modelUrlInput}
                    onChange={(e) => setModelUrlInput(e.target.value)}
                    placeholder="Or enter direct custom GLB / VRM URL from Sketchfab / CDN / Drive..."
                    className="flex-1 bg-transparent px-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!modelUrlInput.trim()}
                    className="px-3 py-1 text-xs font-medium text-white bg-rose-600/80 hover:bg-rose-600 disabled:opacity-30 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Load & Set as Default
                  </button>
                </form>

                {/* Animation Clip Selector if custom model has clips */}
                {loadedModel?.animationClips && loadedModel.animationClips.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Available Model Animations:</p>
                    <div className="flex flex-wrap gap-2">
                      {loadedModel.animationClips.map((clip) => (
                        <button
                          key={clip}
                          onClick={() => onSelectAnimation(clip)}
                          className={`px-3 py-1 text-xs rounded-lg border transition-colors cursor-pointer ${
                            activeAnimationName === clip
                              ? 'bg-rose-500/20 border-rose-500 text-white'
                              : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {clip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-slate-400 bg-black/20 p-2.5 rounded-lg border border-white/5 space-y-1">
                  <div className="font-medium text-slate-300">Persistence & Auto-framing:</div>
                  <p>
                    All uploaded models and custom URLs are automatically saved to your browser's persistent storage (IndexedDB), so your chosen anime character stays loaded whenever you open or refresh the application.
                  </p>
                </div>
              </div>
            )}

            {/* 3. AI BRAIN & SPRING BOOT TAB */}
            {activeTab === 'springboot' && (
              <div className="space-y-4">
                {/* Clear Architecture Guidance Box */}
                <div className="p-3 bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-semibold text-emerald-300">
                        Do I need to run Java Spring Boot on my PC?
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      <strong className="text-white">No!</strong> Mikasa's AI brain is already running live in the cloud via Google Gemini. You do <em>not</em> need to run Spring Boot or install Java on your machine to chat with her. Spring Boot is an optional local bridge only if you wish to run Windows system commands later.
                    </p>
                  </div>
                  <button
                    onClick={handleTestGemini}
                    disabled={isTestingGemini}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600/80 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer shrink-0 flex items-center gap-1.5 shadow"
                  >
                    {isTestingGemini ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Test Model Connection
                      </>
                    )}
                  </button>
                </div>

                {geminiPingResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-mono border flex items-center justify-between ${
                      geminiPingResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <span>{geminiPingResult.message}</span>
                    <span className="text-[10px] text-slate-400">{geminiPingResult.latencyMs}ms</span>
                  </div>
                )}

                {/* AI Brain Selection Cards */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-2 uppercase tracking-wider">
                    Select AI Brain:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Gemini Free Card */}
                    <div
                      onClick={() => onUpdateSpringBootConfig({ activeBrain: 'gemini_free' })}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        springBootConfig.activeBrain === 'gemini_free'
                          ? 'bg-rose-500/15 border-rose-500/50 shadow-md ring-1 ring-rose-500/30'
                          : 'bg-black/30 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Google Gemini AI (Cloud Hosted)</span>
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                            Online · Active
                          </span>
                        </span>
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            springBootConfig.activeBrain === 'gemini_free'
                              ? 'border-rose-400 bg-rose-500'
                              : 'border-slate-600'
                          }`}
                        >
                          {springBootConfig.activeBrain === 'gemini_free' && (
                            <span className="w-1.5 h-1.5 bg-white rounded-full" />
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Best free flagship model with high-speed generation, resilient fallback cascade, playful/flirty partner persona, and automatic emotional state synthesis. Zero installation needed!
                      </p>
                    </div>

                    {/* Spring Boot Desktop Backend Card */}
                    <div
                      onClick={() => onUpdateSpringBootConfig({ activeBrain: 'springboot' })}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        springBootConfig.activeBrain === 'springboot'
                          ? 'bg-rose-500/15 border-rose-500/50 shadow-md ring-1 ring-rose-500/30'
                          : 'bg-black/30 border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span>Local Java Spring Boot (Optional)</span>
                          <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                            Windows PC
                          </span>
                        </span>
                        <span
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                            springBootConfig.activeBrain === 'springboot'
                              ? 'border-rose-400 bg-rose-500'
                              : 'border-slate-600'
                          }`}
                        >
                          {springBootConfig.activeBrain === 'springboot' && (
                            <span className="w-1.5 h-1.5 bg-white rounded-full" />
                          )}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Routes requests to your standalone Spring Boot server running on your Windows machine at localhost:8080 (for local Windows system execution).
                      </p>
                    </div>
                  </div>
                </div>

                {/* Connection Status & Ping Bar (for Spring Boot mode) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-black/30 border border-white/5 rounded-xl">
                  <div className="flex-1">
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Spring Boot REST Endpoint (Windows localhost:8080):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={springBootConfig.endpoint}
                        onChange={(e) => onUpdateSpringBootConfig({ endpoint: e.target.value })}
                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-1 text-xs text-white font-mono flex-1 focus:outline-none focus:border-rose-400"
                      />
                      <button
                        onClick={onPingSpringBoot}
                        disabled={isPinging}
                        className="px-3 py-1 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        {isPinging ? 'Checking...' : 'Test Backend'}
                      </button>
                    </div>
                  </div>
                </div>

                {pingResult && (
                  <div
                    className={`p-2.5 rounded-lg text-xs font-mono border ${
                      pingResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {pingResult.message}
                  </div>
                )}

                {/* Java Spring Boot + ChatGPT Code Viewer */}
                <div>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setActiveCodeFile('controller')}
                        className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors cursor-pointer ${
                          activeCodeFile === 'controller' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        ChatGptController.java
                      </button>
                      <button
                        onClick={() => setActiveCodeFile('websocket')}
                        className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors cursor-pointer ${
                          activeCodeFile === 'websocket' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        RealtimeVoiceWebSocket.java
                      </button>
                      <button
                        onClick={() => setActiveCodeFile('app')}
                        className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors cursor-pointer ${
                          activeCodeFile === 'app' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        AssistantApplication.java
                      </button>
                      <button
                        onClick={() => setActiveCodeFile('properties')}
                        className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors cursor-pointer ${
                          activeCodeFile === 'properties' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        application.properties
                      </button>
                      <button
                        onClick={() => setActiveCodeFile('pom')}
                        className={`px-2.5 py-1 text-xs rounded-md font-mono transition-colors cursor-pointer ${
                          activeCodeFile === 'pom' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        pom.xml
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        const code =
                          activeCodeFile === 'controller'
                            ? SPRINGBOOT_CHATGPT_CODE.chatGptControllerJava
                            : activeCodeFile === 'websocket'
                            ? SPRINGBOOT_CHATGPT_CODE.realtimeWebSocketJava
                            : activeCodeFile === 'app'
                            ? SPRINGBOOT_CHATGPT_CODE.applicationJava
                            : activeCodeFile === 'properties'
                            ? SPRINGBOOT_CHATGPT_CODE.propertiesFile
                            : activeCodeFile === 'pom'
                            ? SPRINGBOOT_CHATGPT_CODE.pomXml
                            : SPRINGBOOT_CHATGPT_CODE.runScript;
                        handleCopyCode(code, activeCodeFile);
                      }}
                      className="px-2.5 py-1 text-xs text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-md transition-colors cursor-pointer"
                    >
                      {copiedKey === activeCodeFile ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>

                  <pre className="p-3 bg-black/60 border border-white/5 rounded-xl font-mono text-[11px] text-slate-300 max-h-44 overflow-y-auto overflow-x-auto">
                    {activeCodeFile === 'controller' && SPRINGBOOT_CHATGPT_CODE.chatGptControllerJava}
                    {activeCodeFile === 'websocket' && SPRINGBOOT_CHATGPT_CODE.realtimeWebSocketJava}
                    {activeCodeFile === 'app' && SPRINGBOOT_CHATGPT_CODE.applicationJava}
                    {activeCodeFile === 'properties' && SPRINGBOOT_CHATGPT_CODE.propertiesFile}
                    {activeCodeFile === 'pom' && SPRINGBOOT_CHATGPT_CODE.pomXml}
                    {activeCodeFile === 'script' && SPRINGBOOT_CHATGPT_CODE.runScript}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
