/**
 * Full-Duplex Audio Engine & Lip-Sync Frequency Analyzer
 * Manages full-duplex live microphone input, interruptible speech synthesis,
 * and procedural Web Audio harmonic synthesis for anime voice resonance.
 */

class FullDuplexAudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private isSpeaking = false;
  private mouthAmplitude = 0;
  private animFrameId: number | null = null;
  private speechUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    // Lazy init audio context on user gesture
  }

  public initAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Play procedural anime chime (happy/flirty/connecting)
   */
  public playAnimeChime(type: 'greet' | 'interrupt' | 'wink' | 'flirt'): void {
    try {
      const ctx = this.initAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'greet') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'flirt') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.2); // B5
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'wink') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.12);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'interrupt') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.1);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      console.warn('Audio chime warning:', e);
    }
  }

  /**
   * Auto-select exclusively female voices and strictly reject all male voices
   */
  public getBestFemaleVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Strict regex blocking any male keywords, names, or masculine presets
    const MALE_VOICE_REGEX =
      /\b(male|man|boy|guy|david|mark|george|james|daniel|alex|fred|oliver|thomas|lee|nathan|aaron|rishi|arthur|edward|bruce|ralph|albert|zarvox|ravi|hemant|sean|richard|stefan|diego|jorge|alva|sinji|damien|reed|junior|deranged|whisper|good news|bad news|bell|boing|cellos|pipe organ|trinoids|bahh|wobble)\b/i;

    // Filter out ANY voice with male traits
    const strictlyFemaleVoices = voices.filter((v) => !MALE_VOICE_REGEX.test(v.name));

    // 1. Explicitly named top-tier female voices
    const topFemaleNames = [
      'google uk english female',
      'google us english female',
      'samantha',
      'victoria',
      'microsoft zira',
      'zira',
      'karen',
      'tessa',
      'fiona',
      'moira',
      'aria',
      'jenny',
      'sara',
      'michelle',
      'emma',
      'hazel',
      'susan',
      'allison',
      'ava',
      'stephanie',
      'linda',
      'veena',
      'kavya',
      'kyoko',
      'sora',
      'yuna',
      'mei-jia',
      'sin-ji',
      'ayumi',
      'haruka',
      'nanami',
      'aoi',
      'ting-ting',
      'su-jin',
    ];

    for (const name of topFemaleNames) {
      const match = strictlyFemaleVoices.find((v) => v.name.toLowerCase().includes(name));
      if (match) return match;
    }

    // 2. Any voice explicitly tagged 'female', 'woman', or 'girl'
    const femaleTagged = strictlyFemaleVoices.find((v) => {
      const lower = v.name.toLowerCase();
      return lower.includes('female') || lower.includes('woman') || lower.includes('girl');
    });
    if (femaleTagged) return femaleTagged;

    // 3. Any non-male English voice
    const enVoice = strictlyFemaleVoices.find((v) => v.lang.startsWith('en'));
    if (enVoice) return enVoice;

    // Return the first strictly non-male voice, or null (never fall back to voices[0] which could be male)
    return strictlyFemaleVoices[0] || null;
  }

  /**
   * Speak response with strictly female anime pitch and rate (mouth animation disabled)
   */
  public speakAnimeVoice(
    text: string,
    options: {
      pitch: number;
      rate: number;
      onStart?: () => void;
      onEnd?: () => void;
      onBoundary?: (charIndex: number) => void;
    }
  ): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    this.interruptSpeech(); // Clean interrupt if already speaking

    const utterance = new SpeechSynthesisUtterance(text);
    this.speechUtterance = utterance;

    // Guarantee bright, sweet female pitch (minimum 1.30 to ensure feminine anime timbre)
    utterance.pitch = Math.min(2.0, Math.max(1.30, options.pitch || 1.40));
    utterance.rate = Math.min(1.5, Math.max(0.92, options.rate || 1.05));

    // Guarantee female voice selection; never assign a male voice
    const femaleVoice = this.getBestFemaleVoice();
    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      if (options.onStart) options.onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      if (options.onEnd) options.onEnd();
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      if (options.onEnd) options.onEnd();
    };

    utterance.onboundary = (e) => {
      if (options.onBoundary) options.onBoundary(e.charIndex);
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Full-duplex immediate interrupt: if user speaks, cut off assistant immediately
   */
  public interruptSpeech(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (this.isSpeaking) {
        this.playAnimeChime('interrupt');
      }
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.mouthAmplitude = 0;
  }

  /**
   * Returns normalized mouth open amplitude (kept at 0 - mouth animation removed)
   */
  public getMouthAmplitude(): number {
    return 0;
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
}

export const audioEngine = new FullDuplexAudioEngine();
