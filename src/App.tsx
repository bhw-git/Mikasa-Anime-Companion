import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ThreeViewport } from './components/ThreeViewport';
import { TopBar } from './components/TopBar';
import { VoiceController } from './components/VoiceController';
import { BottomDock } from './components/BottomDock';
import { ChatPanel } from './components/ChatPanel';
import {
  ChatMessage,
  EmotionProfile,
  EmotionState,
  LoadedModelMeta,
  SpringBootConfig,
} from './types/assistant';
import {
  EMOTION_PROFILES,
  getRandomPartnerGreeting,
} from './services/emotions';
import {
  getSpringBootConfig,
  pingSpringBootBackend,
  saveSpringBootConfig,
} from './services/springBootService';
import { audioEngine } from './services/audioEngine';

export default function App() {
  // Baseline emotion is playful & flirty (virtual female partner)
  const [currentEmotionState, setCurrentEmotionState] = useState<EmotionState>('playful_flirty');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [loadedModel, setLoadedModel] = useState<LoadedModelMeta | null>(null);
  const [activeAnimationName, setActiveAnimationName] = useState<string>('');
  const [springBootConfig, setSpringBootConfig] = useState<SpringBootConfig>(getSpringBootConfig());
  const [pingResult, setPingResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('partner');
  const [isBottomDockOpen, setIsBottomDockOpen] = useState(false);
  const [customModelUrl, setCustomModelUrl] = useState<string | null>(null);
  const [restoreDefaultTrigger, setRestoreDefaultTrigger] = useState(0);

  // Scrollable Chat Panel state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'partner',
      text: "Hey handsome~ I'm Mikasa, your virtual partner! I'm ready to keep you company and chat whenever you want.",
      emotion: 'playful_flirty',
      timestamp: Date.now(),
    },
  ]);

  const currentEmotion: EmotionProfile = EMOTION_PROFILES[currentEmotionState];

  // Trigger file picker for 3D Sketchfab model
  const handleOpenModelPicker = () => {
    const fileInput = document.getElementById('model-file-input') as HTMLInputElement | null;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleLoadCustomModelUrl = useCallback((url: string) => {
    setCustomModelUrl(url);
  }, []);

  const handleRestoreDefaultModel = useCallback(() => {
    setRestoreDefaultTrigger((prev) => prev + 1);
  }, []);

  // Model loaded callback
  const handleModelLoaded = useCallback((meta: LoadedModelMeta) => {
    setLoadedModel(meta);
    if (meta.animationClips.length > 0) {
      setActiveAnimationName(meta.animationClips[0]);
    }
  }, []);

  // Character clicked in 3D viewport
  const handleCharacterClicked = useCallback(() => {
    const greeting = getRandomPartnerGreeting(currentEmotionState);
    setIsSpeaking(true);
    audioEngine.speakAnimeVoice(greeting, {
      pitch: currentEmotion.voicePitch,
      rate: currentEmotion.voiceRate,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    });

    setChatMessages((prev) => [
      ...prev,
      {
        id: `click-${Date.now()}`,
        sender: 'partner',
        text: greeting,
        emotion: currentEmotionState,
        timestamp: Date.now(),
      },
    ]);
  }, [currentEmotionState, currentEmotion]);

  // Append new chat message
  const handleNewMessage = useCallback((msg: ChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
  }, []);

  const handleClearHistory = useCallback(() => {
    setChatMessages([]);
  }, []);

  // Update Spring Boot configuration
  const handleUpdateSpringBootConfig = useCallback((cfg: Partial<SpringBootConfig>) => {
    const updated = saveSpringBootConfig(cfg);
    setSpringBootConfig(updated);
  }, []);

  // Ping Spring Boot backend
  const handlePingSpringBoot = useCallback(async () => {
    setIsPinging(true);
    setPingResult(null);
    const result = await pingSpringBootBackend(springBootConfig.endpoint);
    setPingResult(result);
    setIsPinging(false);
    handleUpdateSpringBootConfig({ isConnected: result.success, lastTested: Date.now() });
  }, [springBootConfig.endpoint, handleUpdateSpringBootConfig]);

  // Initial silent ping to check if user already runs Spring Boot
  const hasPingedRef = useRef(false);
  useEffect(() => {
    if (!hasPingedRef.current) {
      hasPingedRef.current = true;
      pingSpringBootBackend(springBootConfig.endpoint).then((res) => {
        handleUpdateSpringBootConfig({ isConnected: res.success, lastTested: Date.now() });
      });
    }
  }, [springBootConfig.endpoint, handleUpdateSpringBootConfig]);

  return (
    <div className="relative w-screen h-screen bg-[#0b0d13] overflow-hidden select-none">
      {/* 1. Top Bar */}
      <TopBar
        currentEmotion={currentEmotion}
        loadedModel={loadedModel}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setIsBottomDockOpen(true);
        }}
        onOpenModelPicker={handleOpenModelPicker}
        isSpringBootConnected={springBootConfig.isConnected}
        activeBrain={springBootConfig.activeBrain}
      />

      {/* 2. 3D WebGL Viewport (Head-and-Shoulder Portrait) */}
      <div className="absolute inset-0 z-0">
        <ThreeViewport
          currentEmotion={currentEmotion}
          isSpeaking={isSpeaking}
          onModelLoaded={handleModelLoaded}
          activeAnimationName={activeAnimationName}
          onCharacterClicked={handleCharacterClicked}
          customModelUrlToLoad={customModelUrl}
          restoreDefaultTrigger={restoreDefaultTrigger}
        />
      </div>

      {/* 3. Dedicated Scrollable Chat History Panel */}
      <ChatPanel
        messages={chatMessages}
        currentEmotion={currentEmotion}
        assistantName="Mikasa"
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onClearHistory={handleClearHistory}
      />

      {/* 4. Floating Full-Duplex Live Voice Bar (Docked to left for clear 3D view) */}
      <div className="absolute bottom-6 left-6 z-20 w-84 sm:w-[420px] max-w-[calc(100vw-3rem)] pointer-events-auto">
        <VoiceController
          currentEmotion={currentEmotion}
          onEmotionChange={setCurrentEmotionState}
          onSpeechStart={() => setIsSpeaking(true)}
          onSpeechEnd={() => setIsSpeaking(false)}
          springBootEndpoint={springBootConfig.endpoint}
          activeBrain={springBootConfig.activeBrain}
          assistantName="Mikasa"
          onNewMessage={handleNewMessage}
          onToggleChatPanel={() => setIsChatOpen(!isChatOpen)}
          isChatOpen={isChatOpen}
          messageCount={chatMessages.length}
          onOpenSettingsTab={(tab) => {
            setActiveTab(tab);
            setIsBottomDockOpen(true);
          }}
        />
      </div>

      {/* 5. Sleek Collapsible Bottom Dock (Visible only when header option clicked) */}
      <BottomDock
        isOpen={isBottomDockOpen}
        onClose={() => setIsBottomDockOpen(false)}
        currentEmotion={currentEmotion}
        loadedModel={loadedModel}
        onSelectAnimation={setActiveAnimationName}
        activeAnimationName={activeAnimationName}
        onOpenFilePicker={handleOpenModelPicker}
        onResetCamera={() => {
          setActiveTab('model');
        }}
        onLoadCustomModelUrl={handleLoadCustomModelUrl}
        onRestoreDefaultModel={handleRestoreDefaultModel}
        springBootConfig={springBootConfig}
        onUpdateSpringBootConfig={handleUpdateSpringBootConfig}
        onPingSpringBoot={handlePingSpringBoot}
        pingResult={pingResult}
        isPinging={isPinging}
        onTestGreeting={handleCharacterClicked}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}
