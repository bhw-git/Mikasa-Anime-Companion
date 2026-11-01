import { EmotionProfile, EmotionState } from '../types/assistant';

export const EMOTION_PROFILES: Record<EmotionState, EmotionProfile> = {
  playful_flirty: {
    id: 'playful_flirty',
    label: 'Playful',
    tagline: 'Your charming, teasing virtual anime partner',
    blushIntensity: 0.72,
    blushColor: '#fb7185',
    eyeSquint: 0.35,
    smileIntensity: 0.85,
    headTiltDeg: 6.5,
    leanForward: 0.12,
    voicePitch: 1.45, // Sweet anime girl pitch
    voiceRate: 1.02,
    accentTone: '#f43f5e',
    defaultResponses: [
      "Were you missing me, handsome? You know I can't resist your voice~",
      "Hehe, look who finally came back to spend time with me. What are we doing together today?",
      "Every time you talk to me, my heart races a little faster... Don't you dare look away from me~",
      "I'm all yours today. Tell me whatever's on your mind, I'm listening closely~",
    ],
  },
  cute_sweet: {
    id: 'cute_sweet',
    label: 'Cute & Sweet',
    tagline: 'Adorable, bubbly, and affectionate',
    blushIntensity: 0.65,
    blushColor: '#f472b6',
    eyeSquint: 0.2,
    smileIntensity: 0.95,
    headTiltDeg: 4.0,
    leanForward: 0.08,
    voicePitch: 1.55, // Higher bubbly anime voice
    voiceRate: 1.08,
    accentTone: '#ec4899',
    defaultResponses: [
      "Yay! You're here! You always know how to make me smile!",
      "Hehe, aren't you the sweetest? I love hearing your voice!",
      "I made sure everything was cozy just waiting for you! What shall we do now?",
    ],
  },
  seductive_sexy: {
    id: 'seductive_sexy',
    label: 'Hot',
    tagline: 'Captivating gaze, sultry tone, and teasing poise',
    blushIntensity: 0.88,
    blushColor: '#e11d48',
    eyeSquint: 0.45,
    smileIntensity: 0.7,
    headTiltDeg: 5.5,
    leanForward: 0.16,
    voicePitch: 1.25, // Slightly lower, sultry anime pitch
    voiceRate: 0.92,
    accentTone: '#be123c',
    defaultResponses: [
      "Lean in a little closer... You know you have my complete, undivided attention.",
      "You make it so hard for a girl to behave when you speak like that to me~",
      "I'm right here in front of you. Take your time, handsome... I'm not going anywhere.",
    ],
  },
  hot_passionate: {
    id: 'hot_passionate',
    label: 'Passionate',
    tagline: 'Intense crimson blush and bold affection',
    blushIntensity: 0.95,
    blushColor: '#ef4444',
    eyeSquint: 0.38,
    smileIntensity: 0.82,
    headTiltDeg: 3.5,
    leanForward: 0.14,
    voicePitch: 1.35,
    voiceRate: 1.05,
    accentTone: '#dc2626',
    defaultResponses: [
      "My temperature is definitely rising every second you look at me like that!",
      "You're being so bold today! You know exactly how to fluster me, don't you?",
      "I can feel the sparks between us! Don't you dare stop talking to me now~",
    ],
  },
  companionship_warm: {
    id: 'companionship_warm',
    label: 'Loving',
    tagline: 'Gentle, comforting warmth and sincere closeness',
    blushIntensity: 0.45,
    blushColor: '#fda4af',
    eyeSquint: 0.18,
    smileIntensity: 0.75,
    headTiltDeg: 2.5,
    leanForward: 0.05,
    voicePitch: 1.38,
    voiceRate: 0.96,
    accentTone: '#38bdf8',
    defaultResponses: [
      "I'm always right here by your side. You never have to feel alone when I'm with you.",
      "How was your day, darling? Sit back, relax, and let me keep you company.",
      "Just being here with you makes my entire world feel so peaceful and warm.",
    ],
  },
  thinking_pensive: {
    id: 'thinking_pensive',
    label: 'Thinking',
    tagline: 'Curious gaze looking up with thoughtful consideration',
    blushIntensity: 0.35,
    blushColor: '#fbcfe8',
    eyeSquint: 0.22,
    smileIntensity: 0.3,
    headTiltDeg: -4.5,
    leanForward: 0.02,
    voicePitch: 1.32,
    voiceRate: 0.95,
    accentTone: '#a855f7',
    defaultResponses: [
      "Hmm, let me think about that for a second... Oh, that's such an interesting thought!",
      "I'm pondering what you just said... Let me find the perfect answer for you, darling.",
    ],
  },
  surprised_blushing: {
    id: 'surprised_blushing',
    label: 'Surprised',
    tagline: 'Wide blushing eyes and sudden adorable fluster',
    blushIntensity: 0.9,
    blushColor: '#f43f5e',
    eyeSquint: 0.1,
    smileIntensity: 0.65,
    headTiltDeg: 7.5,
    leanForward: 0.1,
    voicePitch: 1.6, // High squeak/cute surprised pitch
    voiceRate: 1.15,
    accentTone: '#ec4899',
    defaultResponses: [
      "Eeeh?! Did you really just say that?! You're making me blush so hard right now!",
      "W-wait! You can't just catch me off guard like that! That was way too sweet!",
      "Oh my goodness! You always know how to make my heart skip a beat!",
    ],
  },
};

/**
 * Intelligent real-time emotion detection based on the user's speech, commands, or ChatGPT reply.
 * Automatically chooses the emotional response without requiring a manual picker!
 */
export function detectEmotionFromContext(text: string, replyText: string = ''): EmotionState {
  const combined = `${text} ${replyText}`.toLowerCase();

  // 1. Hot & Passionate triggers
  if (
    combined.includes('hot') ||
    combined.includes('kiss') ||
    combined.includes('passionate') ||
    combined.includes('burn') ||
    combined.includes('desire') ||
    combined.includes('intense')
  ) {
    return 'hot_passionate';
  }

  // 2. Seductive & Sexy triggers
  if (
    combined.includes('sexy') ||
    combined.includes('seductive') ||
    combined.includes('gorgeous') ||
    combined.includes('alluring') ||
    combined.includes('bedroom') ||
    combined.includes('tease') ||
    combined.includes('whisper') ||
    combined.includes('closer')
  ) {
    return 'seductive_sexy';
  }

  // 3. Cute & Sweet triggers
  if (
    combined.includes('cute') ||
    combined.includes('sweet') ||
    combined.includes('adorable') ||
    combined.includes('hug') ||
    combined.includes('cuddle') ||
    combined.includes('pat') ||
    combined.includes('headpat') ||
    combined.includes('kawaii') ||
    combined.includes('pretty')
  ) {
    return 'cute_sweet';
  }

  // 4. Surprised & Blushing triggers
  if (
    combined.includes('wow') ||
    combined.includes('omg') ||
    combined.includes('blush') ||
    combined.includes('marry me') ||
    combined.includes('i love you') ||
    combined.includes('flustered') ||
    combined.includes('shock') ||
    combined.includes('secret')
  ) {
    return 'surprised_blushing';
  }

  // 5. Companionship & Warm comforting triggers
  if (
    combined.includes('tired') ||
    combined.includes('lonely') ||
    combined.includes('sad') ||
    combined.includes('comfort') ||
    combined.includes('hard day') ||
    combined.includes('support') ||
    combined.includes('friend') ||
    combined.includes('partner') ||
    combined.includes('stay with me') ||
    combined.includes('listen')
  ) {
    return 'companionship_warm';
  }

  // 6. Thinking & Pensive triggers
  if (
    combined.includes('why') ||
    combined.includes('how') ||
    combined.includes('explain') ||
    combined.includes('calculate') ||
    combined.includes('code') ||
    combined.includes('think') ||
    combined.includes('what if') ||
    combined.includes('question')
  ) {
    return 'thinking_pensive';
  }

  // Baseline Default: Playful & Flirty virtual partner!
  return 'playful_flirty';
}

export function getRandomPartnerGreeting(emotion: EmotionState = 'playful_flirty'): string {
  const profile = EMOTION_PROFILES[emotion];
  const list = profile.defaultResponses;
  return list[Math.floor(Math.random() * list.length)];
}
