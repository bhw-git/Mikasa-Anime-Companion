import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, EmotionProfile, EmotionState, FullDuplexStatus } from '../types/assistant';
import { audioEngine } from '../services/audioEngine';
import { detectEmotionFromContext, EMOTION_PROFILES } from '../services/emotions';
import { sendChatToBrain } from '../services/springBootService';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface VoiceControllerProps {
  currentEmotion: EmotionProfile;
  onEmotionChange: (emotion: EmotionState) => void;
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  springBootEndpoint: string;
  activeBrain?: 'gemini_free' | 'springboot';
  assistantName?: string;
  onNewMessage: (msg: ChatMessage) => void;
  onToggleChatPanel: () => void;
  isChatOpen: boolean;
  messageCount: number;
  onOpenSettingsTab?: (tab: string) => void;
}

export const VoiceController: React.FC<VoiceControllerProps> = ({
  currentEmotion,
  onEmotionChange,
  onSpeechStart,
  onSpeechEnd,
  springBootEndpoint,
  activeBrain = 'gemini_free',
  assistantName = 'Mikasa',
  onNewMessage,
  onToggleChatPanel,
  isChatOpen,
  messageCount,
  onOpenSettingsTab,
}) => {
  const [isFullDuplexLive, setIsFullDuplexLive] = useState(false);
  const [duplexStatus, setDuplexStatus] = useState<FullDuplexStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micVolume, setMicVolume] = useState<number>(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [latestDialog, setLatestDialog] = useState<{
    user?: string;
    partner?: string;
    sources?: Array<{ uri: string; title: string }>;
  }>({
    partner: "Hey baby, I'm dying for your voice.. ",
  });

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isRecognitionActiveRef = useRef(false);
  const isFullDuplexLiveRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const micAnimRef = useRef<number | null>(null);
  const chatHistoryRef = useRef<Array<{ sender: 'user' | 'partner'; text: string }>>([]);

  // Acoustic Anti-Echo Lock refs to completely prevent speech self-trigger loops
  const isMutedDueToSpeechRef = useRef(false);
  const speechSettlingTimerRef = useRef<number | null>(null);

  isFullDuplexLiveRef.current = isFullDuplexLive;

  /**
   * Safe restart helper for SpeechRecognition
   */
  const restartRecognitionSafely = useCallback(() => {
    if (!isFullDuplexLiveRef.current) return;
    if (isRecognitionActiveRef.current) return;
    if (isMutedDueToSpeechRef.current) return; // Do not restart while speech or acoustic settling is active

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
    }

    restartTimerRef.current = window.setTimeout(() => {
      if (
        isFullDuplexLiveRef.current &&
        recognitionRef.current &&
        !isRecognitionActiveRef.current &&
        !isMutedDueToSpeechRef.current
      ) {
        try {
          recognitionRef.current.start();
          isRecognitionActiveRef.current = true;
          setDuplexStatus('listening');
        } catch {
          // If already active, ignore
        }
      }
    }, 150);
  }, []);

  /**
   * Manual barge-in interrupt: allows the user to immediately interrupt Mikasa
   */
  const handleManualInterrupt = useCallback(() => {
    if (audioEngine.getIsSpeaking() || isMutedDueToSpeechRef.current) {
      if (speechSettlingTimerRef.current) {
        clearTimeout(speechSettlingTimerRef.current);
        speechSettlingTimerRef.current = null;
      }
      audioEngine.interruptSpeech();
      onSpeechEnd();
      isMutedDueToSpeechRef.current = false;

      if (isFullDuplexLiveRef.current) {
        setDuplexStatus('listening');
        restartRecognitionSafely();
      } else {
        setDuplexStatus('idle');
      }
    }
  }, [onSpeechEnd, restartRecognitionSafely]);

  // Keyboard shortcut: Spacebar to interrupt speech when input is not focused
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';
      if (e.code === 'Space' && !isInput && audioEngine.getIsSpeaking()) {
        e.preventDefault();
        handleManualInterrupt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualInterrupt]);

  /**
   * Speak reply with sweet anime voice and acoustic anti-echo lock
   */
  const speakPartnerReply = useCallback(
    (replyText: string, emotion: EmotionProfile = currentEmotion) => {
      // 1. Activate acoustic anti-echo lock immediately
      isMutedDueToSpeechRef.current = true;
      setDuplexStatus('speaking');
      onSpeechStart();

      // Temporarily abort recognition so it won't buffer speaker audio
      if (recognitionRef.current && isRecognitionActiveRef.current) {
        try {
          recognitionRef.current.abort();
          isRecognitionActiveRef.current = false;
        } catch {}
      }

      audioEngine.speakAnimeVoice(replyText, {
        pitch: emotion.voicePitch,
        rate: emotion.voiceRate,
        onStart: () => {
          isMutedDueToSpeechRef.current = true;
          onSpeechStart();
        },
        onEnd: () => {
          onSpeechEnd();
          // Acoustic Settling Window: wait 500ms for residual room reverberation to dissipate
          if (speechSettlingTimerRef.current) clearTimeout(speechSettlingTimerRef.current);
          speechSettlingTimerRef.current = window.setTimeout(() => {
            isMutedDueToSpeechRef.current = false;
            if (isFullDuplexLiveRef.current) {
              setDuplexStatus('listening');
              restartRecognitionSafely();
            } else {
              setDuplexStatus('idle');
            }
          }, 500);
        },
      });
    },
    [currentEmotion, onSpeechStart, onSpeechEnd, restartRecognitionSafely]
  );

  /**
   * Handle user speech / message dispatch
   */
  const handleUserMessage = useCallback(
    async (messageText: string) => {
      const clean = messageText.trim();
      if (!clean) return;

      // Drop if microphone captured speech while partner was speaking
      if (isMutedDueToSpeechRef.current || audioEngine.getIsSpeaking()) {
        return;
      }

      setDuplexStatus('processing');
      setInterimTranscript('');
      setLatestDialog((prev) => ({ ...prev, user: clean, sources: [] }));

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: clean,
        emotion: currentEmotion.id,
        timestamp: Date.now(),
      };
      onNewMessage(userMsg);
      chatHistoryRef.current.push({ sender: 'user', text: clean });

      // Automatically detect emotional state from context
      const autoEmotion = detectEmotionFromContext(clean);

      // Query Gemini with Google Search Grounding or Spring Boot backend
      const brainResponse = await sendChatToBrain(
        springBootEndpoint,
        clean,
        chatHistoryRef.current,
        activeBrain
      );

      const finalEmotion = brainResponse.emotion || autoEmotion;
      onEmotionChange(finalEmotion);

      const partnerMsg: ChatMessage = {
        id: `partner-${Date.now()}`,
        sender: 'partner',
        text: brainResponse.text,
        emotion: finalEmotion,
        timestamp: Date.now(),
        sources: brainResponse.sources,
        searchQueries: brainResponse.searchQueries,
      };
      onNewMessage(partnerMsg);
      chatHistoryRef.current.push({ sender: 'partner', text: brainResponse.text });
      setLatestDialog({
        user: clean,
        partner: brainResponse.text,
        sources: brainResponse.sources,
      });

      // Voice response with emotional profile
      const targetProfile = EMOTION_PROFILES[finalEmotion] || currentEmotion;
      speakPartnerReply(brainResponse.text, targetProfile);
    },
    [activeBrain, currentEmotion, onEmotionChange, onNewMessage, speakPartnerReply, springBootEndpoint]
  );

  /**
   * Start microphone hardware capture and audio volume meter
   */
  const startMicCapture = async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicError('Audio media devices not supported in this browser.');
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      setMicError(null);

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicVolume(normalized);

        micAnimRef.current = requestAnimationFrame(updateVolume);
      };

      updateVolume();
      return true;
    } catch (err: unknown) {
      console.warn('Microphone permission request error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowedError')) {
        setMicError('Microphone permission denied. Please allow microphone access in your browser address bar.');
      } else {
        setMicError(`Microphone setup error: ${msg}`);
      }
      return false;
    }
  };

  const stopMicCapture = () => {
    if (micAnimRef.current) {
      cancelAnimationFrame(micAnimRef.current);
      micAnimRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setMicVolume(0);
  };

  /**
   * Initialize browser SpeechRecognition once on mount
   */
  useEffect(() => {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechAPI) {
      setMicError('Speech recognition not supported in this browser. You can still type in the prompt!');
      return;
    }

    try {
      const recognition = new SpeechAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isRecognitionActiveRef.current = true;
        if (!isMutedDueToSpeechRef.current) {
          setDuplexStatus('listening');
        }
      };

      recognition.onend = () => {
        isRecognitionActiveRef.current = false;
        if (isFullDuplexLiveRef.current && !isMutedDueToSpeechRef.current) {
          restartRecognitionSafely();
        } else if (!isFullDuplexLiveRef.current) {
          setDuplexStatus('idle');
        }
      };

      recognition.onerror = (event: { error: string }) => {
        if (event.error === 'not-allowed') {
          setMicError('Microphone blocked by browser. Please click the lock icon in the address bar to allow mic access.');
          setIsFullDuplexLive(false);
          stopMicCapture();
        } else if (event.error === 'no-speech') {
          // Normal silence, will auto-restart via onend
        }
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Drop any results if speech is currently playing or in acoustic settling delay
        if (isMutedDueToSpeechRef.current || audioEngine.getIsSpeaking()) {
          return;
        }

        let interim = '';
        let final = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        const currentText = (final || interim).trim();
        setInterimTranscript(currentText);

        if (final.trim().length > 0) {
          handleUserMessage(final.trim());
        }
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('Recognition setup error:', e);
    }

    return () => {
      stopMicCapture();
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (speechSettlingTimerRef.current) clearTimeout(speechSettlingTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [handleUserMessage, restartRecognitionSafely]);

  /**
   * Start / Stop Full-Duplex Live Voice
   */
  const toggleFullDuplex = async () => {
    if (isFullDuplexLive) {
      // Turn OFF
      setIsFullDuplexLive(false);
      isFullDuplexLiveRef.current = false;
      stopMicCapture();
      audioEngine.interruptSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setDuplexStatus('idle');
    } else {
      // Turn ON
      setMicError(null);
      const micGranted = await startMicCapture();
      if (!micGranted) {
        return;
      }

      setIsFullDuplexLive(true);
      isFullDuplexLiveRef.current = true;
      audioEngine.playAnimeChime('greet');

      if (recognitionRef.current && !isRecognitionActiveRef.current) {
        try {
          recognitionRef.current.start();
          isRecognitionActiveRef.current = true;
          setDuplexStatus('listening');
        } catch (e) {
          console.warn('Failed to start recognition:', e);
        }
      }
    }
  };

  /**
   * Real-Time Audio Waveform Canvas Visualizer (60fps reactive to microphone input)
   */
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      animId = requestAnimationFrame(render);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (displayWidth === 0 || displayHeight === 0) return;

      if (canvas.width !== Math.floor(displayWidth * dpr) || canvas.height !== Math.floor(displayHeight * dpr)) {
        canvas.width = Math.floor(displayWidth * dpr);
        canvas.height = Math.floor(displayHeight * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      const width = displayWidth;
      const height = displayHeight;
      const midY = height / 2;
      phase += 0.05;

      const analyser = analyserRef.current;
      const isLive = isFullDuplexLiveRef.current;
      const isSpeakingAssistant = audioEngine.getIsSpeaking();

      if (analyser && isLive && !isSpeakingAssistant) {
        // Real-time microphone audio input captured via AnalyserNode
        const bufferLength = analyser.fftSize;
        const timeData = new Uint8Array(bufferLength);
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        // 1. Live spectrum equalizer bars in background
        const barCount = 36;
        const barWidth = width / barCount - 2;
        const step = Math.max(1, Math.floor(freqData.length / barCount));

        for (let i = 0; i < barCount; i++) {
          const val = freqData[i * step] || 0;
          const barHeight = Math.max(2, (val / 255) * (height * 0.75));
          const x = i * (barWidth + 2);
          const y = midY - barHeight / 2;

          const barGrad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          barGrad.addColorStop(0, 'rgba(244, 63, 94, 0.45)');
          barGrad.addColorStop(0.5, 'rgba(192, 132, 252, 0.35)');
          barGrad.addColorStop(1, 'rgba(244, 63, 94, 0.08)');

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }

        // 2. Real-time oscilloscope time-domain waveform
        const sliceWidth = width / (bufferLength - 1);
        const areaGrad = ctx.createLinearGradient(0, 0, 0, height);
        areaGrad.addColorStop(0, 'rgba(244, 63, 94, 0.25)');
        areaGrad.addColorStop(0.6, 'rgba(217, 70, 239, 0.12)');
        areaGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');

        ctx.beginPath();
        ctx.moveTo(0, midY);

        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v - 1.0) * (height * 0.44) + midY;
          const x = i * sliceWidth;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Glowing stroke line
        ctx.strokeStyle = '#fb7185';
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#f43f5e';
        ctx.stroke();

        // Area fill under waveform
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Smooth ambient idle wave (indicates system readiness)
        const isSpeaking = isSpeakingAssistant;
        const waveColor = isSpeaking ? '#f59e0b' : (isLive ? '#34d399' : '#818cf8');
        const glowColor = isSpeaking ? '#fbbf24' : (isLive ? '#10b981' : '#6366f1');
        const amp = isSpeaking ? 8 : (isLive ? 4.5 : 3.0);
        const freq = isSpeaking ? 3.0 : 2.0;

        ctx.beginPath();
        for (let x = 0; x <= width; x += 4) {
          const normX = x / width;
          const envelope = Math.sin(normX * Math.PI);
          const y = midY + Math.sin(normX * Math.PI * 4 * freq + phase) * amp * envelope;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.strokeStyle = waveColor;
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 6;
        ctx.shadowColor = glowColor;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleManualTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    const msg = textInput.trim();
    setTextInput('');
    handleUserMessage(msg);
  };

  const isSpeakingCurrently = duplexStatus === 'speaking' || audioEngine.getIsSpeaking();

  return (
    <div className="flex flex-col items-stretch gap-2.5 w-full">
      {/* Microphone Error Notification */}
      {micError && (
        <div className="w-full bg-amber-500/20 border border-amber-500/40 rounded-xl p-2.5 text-xs text-amber-200 flex items-center justify-between gap-2 shadow-lg backdrop-blur-xs">
          <span>{micError}</span>
          <button
            onClick={() => setMicError(null)}
            className="text-amber-300 hover:text-white p-1 text-[11px] font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Floating Active Dialogue Card (Exact same width as input box) */}
      {(interimTranscript || latestDialog.user || latestDialog.partner) && (
        <div className="w-full bg-slate-900/90 border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur-md transition-all">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>{assistantName}</span>
                <span className="text-slate-400 font-normal">· {currentEmotion.label}</span>
              </span>
              // <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
              //   {activeBrain === 'gemini_free' ? 'Gemini 2.5 Flash Instant' : 'Spring Boot'}
              // </span>
            </div>

            <button
              onClick={onToggleChatPanel}
              className="text-[11px] text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            >
              <span>{isChatOpen ? 'Close History' : 'Full Chat History'}</span>
              {messageCount > 0 && (
                <span className="bg-rose-500/30 text-rose-300 px-1.5 rounded-full text-[10px]">
                  {messageCount}
                </span>
              )}
            </button>
          </div>

          {/* User recent message */}
          {(interimTranscript || latestDialog.user) && (
            <div className="flex items-start gap-2 mb-2 justify-end">
              <div className="bg-rose-500/20 border border-rose-500/30 rounded-xl px-3 py-1.5 max-w-[88%] text-xs text-rose-100">
                <span className="font-semibold text-rose-300 block text-[10px] uppercase">You</span>
                {interimTranscript || latestDialog.user}
              </div>
            </div>
          )}

          {/* Partner latest message */}
          {latestDialog.partner && (
            <div className="flex flex-col gap-1.5 justify-start">
              <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 max-w-[92%] text-xs text-slate-100 leading-relaxed">
                {latestDialog.partner}
              </div>

              {/* Live Web Sources pill display */}
              {latestDialog.sources && latestDialog.sources.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pl-1">
                  <span className="text-[10px] text-slate-400">Live Sources:</span>
                  {latestDialog.sources.slice(0, 3).map((s, idx) => (
                    <a
                      key={idx}
                      href={s.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-sky-400 hover:text-sky-300 bg-sky-950/40 border border-sky-500/30 px-1.5 py-0.5 rounded max-w-[140px] truncate underline transition-colors"
                      title={s.title || s.uri}
                    >
                      {s.title || s.uri}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual Barge-In Interrupt Banner (Shows while Mikasa speaks to let user interrupt) */}
      {isSpeakingCurrently && (
        <button
          onClick={handleManualInterrupt}
          className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs rounded-full shadow-lg transition-all cursor-pointer animate-pulse"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Mikasa is speaking · <strong>Tap or Press Space to Interrupt</strong></span>
        </button>
      )}

      {/* Real-Time Dynamic Audio Waveform Strip (Reactive to microphone input) */}
      <div className="w-full bg-[#10141f]/90 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-md flex flex-col gap-1.5 transition-all">
        <div className="flex items-center justify-between px-1.5 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isSpeakingCurrently
                  ? 'bg-amber-400 animate-pulse'
                  : isFullDuplexLive
                  ? micVolume > 3
                    ? 'bg-rose-400 animate-ping'
                    : 'bg-emerald-400'
                  : 'bg-slate-500'
              }`}
            />
            <span className="font-medium text-slate-200">
              {isSpeakingCurrently
                ? 'Mikasa Speaking (Voice Out)'
                : isFullDuplexLive
                ? micVolume > 3
                  ? 'Microphone Capturing Audio...'
                  : 'Live Mic Listening (Hands-Free)'
                : 'Microphone Standby · Tap round button for Live Voice'}
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px]">
            {isFullDuplexLive && (
              <span
                className={`px-1.5 py-0.5 rounded font-semibold transition-all ${
                  micVolume > 5
                    ? 'text-rose-300 bg-rose-500/20 border border-rose-500/30'
                    : 'text-slate-400 bg-white/5'
                }`}
              >
                {micVolume}% dB
              </span>
            )}
            <span className="text-slate-500">|</span>
            <span className="text-rose-400/90 font-medium">
              {isFullDuplexLive ? 'Full-Duplex Live' : 'Ready'}
            </span>
          </div>
        </div>

        {/* 60fps Dynamic Canvas Waveform reacting to mic input */}
        <div className="w-full h-10 relative rounded-xl bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center">
          <canvas ref={waveformCanvasRef} className="w-full h-full block" />
        </div>
      </div>

      {/* Main Input Field & Controls Bar */}
      <div className="flex items-center gap-2.5 w-full bg-[#10141f]/95 border border-white/10 rounded-2xl p-2 shadow-2xl backdrop-blur-md">
        {/* Full-Duplex Live Voice Button: Circular / Round & Icon-Only */}
        <button
          onClick={toggleFullDuplex}
          title={isFullDuplexLive ? 'Stop Live Voice' : 'Start Live Voice (Hands-free)'}
          aria-label={isFullDuplexLive ? 'Stop Live Voice' : 'Start Live Voice'}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 p-0 transition-all cursor-pointer ${
            isFullDuplexLive
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 ring-2 ring-rose-400/60 scale-105'
              : 'bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 hover:scale-105'
          }`}
        >
          {isFullDuplexLive ? (
            <div className="flex items-center gap-0.5 h-4 justify-center">
              <span
                className="w-1 bg-white rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, (micVolume / 100) * 16)}px` }}
              />
              <span
                className="w-1 bg-white rounded-full transition-all duration-75"
                style={{ height: `${Math.max(6, (micVolume / 100) * 18)}px` }}
              />
              <span
                className="w-1 bg-white rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, (micVolume / 100) * 14)}px` }}
              />
            </div>
          ) : (
            <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Text Input Form */}
        <form onSubmit={handleManualTextSubmit} className="flex-1 flex items-center">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={
              isFullDuplexLive
                ? 'listening... Speak with me'
                : 'Wanna ask something special..'
            }
            className="w-full bg-transparent px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!textInput.trim()}
            className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-30 transition-colors cursor-pointer shrink-0"
          >
            Send
          </button>
        </form>

        {/* Quick Chat History Toggle Button */}
        <button
          onClick={onToggleChatPanel}
          title="Toggle Scrollable Chat History"
          className={`p-2.5 rounded-xl transition-colors cursor-pointer shrink-0 ${
            isChatOpen ? 'bg-rose-500/20 text-rose-300' : 'bg-white/5 hover:bg-white/10 text-slate-300'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </div>

      {/* Partner Settings dropdown box located directly at the bottom of the input field */}
      <div className="flex items-center justify-between w-full px-2 py-0.5 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 font-medium">Partner Mood:</span>
          <select
            value={currentEmotion.id}
            onChange={(e) => onEmotionChange(e.target.value as EmotionState)}
            className="bg-slate-900/90 text-rose-300 border border-white/10 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-rose-400/60 cursor-pointer shadow-sm backdrop-blur-xs"
          >
            <option value="playful_flirty">Playful(Default)</option>
            <option value="cute_sweet">Cute</option>
            <option value="seductive_sexy">Hot</option>
            <option value="hot_passionate">Passionate</option>
            <option value="companionship_warm">Caring</option>
            <option value="thinking_pensive">Deep</option>
            <option value="surprised_blushing">Surprised</option>
          </select>
        </div>

        {onOpenSettingsTab && (
          <button
            onClick={() => onOpenSettingsTab('partner')}
            className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5"
            title="Open Full Partner Settings"
          >
            <svg className="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Show Partner Settings</span>
          </button>
        )}
      </div>
    </div>
  );
};
