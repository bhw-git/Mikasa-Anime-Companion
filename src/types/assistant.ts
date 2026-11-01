/**
 * Core type definitions for 3D Anime Virtual Partner & ChatGPT Live Voice
 */

export type EmotionState =
  | 'playful_flirty' // Default baseline virtual partner
  | 'cute_sweet'
  | 'seductive_sexy'
  | 'hot_passionate'
  | 'companionship_warm'
  | 'thinking_pensive'
  | 'surprised_blushing';

export interface EmotionProfile {
  id: EmotionState;
  label: string;
  tagline: string;
  blushIntensity: number; // 0.0 to 1.0
  blushColor: string;
  eyeSquint: number;
  smileIntensity: number;
  headTiltDeg: number;
  leanForward: number; // units closer to camera
  voicePitch: number;
  voiceRate: number;
  accentTone: string;
  defaultResponses: string[];
}

export type FullDuplexStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'live_duplex';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'partner';
  text: string;
  emotion: EmotionState;
  timestamp: number;
  sources?: Array<{ uri: string; title: string }>;
  searchQueries?: string[];
}

export interface SpringBootConfig {
  endpoint: string; // default http://localhost:8080/api/assistant
  wsEndpoint: string; // ws://localhost:8080/ws/realtime
  isConnected: boolean;
  lastTested: number | null;
  activeBrain: 'gemini_free' | 'springboot'; // 'gemini_free' uses Google Gemini 3.8 Flash
  systemPrompt: string;
}

export interface LoadedModelMeta {
  fileName: string;
  fileSize: string;
  animationClips: string[];
  activeClip: string;
  meshCount: number;
  boneCount: number;
  hasMorphs: boolean;
  morphNames: string[];
  isCustom: boolean;
}
