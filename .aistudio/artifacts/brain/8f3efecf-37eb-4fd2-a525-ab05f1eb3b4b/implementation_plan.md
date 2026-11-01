# Implementation Plan: Mikasa 3D Anime Assistant Upgrades

Fix the full-duplex self-trigger audio bug, enable live web search intelligence (weather, news, real-time updates) via Google Search Grounding, replace the default 3D model with an anime female character, and provide persistent custom model loading.

---

## 1. Acoustic Anti-Echo Lock & Full-Duplex Audio Fix

### Cause of the Issue
Currently, while Mikasa speaks via `speechSynthesis.speak()`, the microphone continues listening. The computer's speaker output bleeds into the microphone, triggering `onresult` within 1–2 words. The incoming audio transcript is interpreted as a new user message, which immediately aborts speech synthesis (`window.speechSynthesis.cancel()`), cutting Mikasa off after only two words.

### Proposed Solution
- **Acoustic Audio Lock**: Introduce an active speech mutex (`isBotSpeaking` ref and state).
- **Recognition Suspension**: When TTS begins (`utterance.onstart`), pause/suspend voice recognition or discard any incoming speech transcript until TTS finishes.
- **Acoustic Settling Window**: When speech finishes (`utterance.onend` or `onerror`), wait an acoustic settling delay (~500ms) before re-enabling microphone listening to prevent residual speaker reverberation from triggering input.
- **Manual Barge-In / Interrupt Button**: Add a visible "Interrupt Mikasa / Tap to Speak" button on the UI (and spacebar shortcut) allowing the user to deliberately interrupt her at any time.

---

## 2. Real-Time Web Intelligence via Google Search Grounding

### Problem
Mikasa cannot currently fetch real-time information such as live local weather, breaking news, sports, or system updates.

### Proposed Solution
- **Gemini Search Grounding**: In `/server.ts`, configure `@google/genai` calls with `tools: [{ googleSearch: {} }]`.
- **Hybrid Persona Tuning**: Update the system prompt so Mikasa seamlessly balances two identities:
  1. A playful, affectionate, slightly flirty virtual anime companion (`playful`, `flirty`, `cute`, `companionship`).
  2. A knowledgeable personal assistant with access to real-time Google search data, providing accurate weather forecasts, today's news headlines, and live facts without losing her endearing personality.
- **Grounding Metadata & Sources**: Display grounded search sources or search query pills unobtrusively in the chat messages when web search was utilized.

---

## 3. Anime Female Default 3D Model & Persistent Custom Loader

### Problem
The current fallback loads a generic male ReadyPlayerMe model. The user also has their own downloaded Sketchfab 3D models they want to load permanently.

### Proposed Solution
- **Female Anime Default Model**: Replace the default male model with a high-fidelity anime female avatar GLB (with expressive eye morph targets, hair rigging, and head tracking).
- **Persistent Custom Model Manager**:
  - Allow the user to input a custom GLB/VRM URL or upload local 3D files (`.glb`, `.gltf`, `.vrm`).
  - Store uploaded custom models in browser `IndexedDB` so the model persists permanently across browser reloads, cache clears, and restarts.
  - Provide a quick model switcher dock icon to switch between presets and user-saved custom models.

---

## 4. Chat & Duplex UI Polish

- Ensure the chat transcript panel has smooth auto-scrolling with scroll-lock when reviewing past messages.
- Add real-time duplex visualizers (Mic Listening Waveform vs. Mikasa Speaking Spectrum) so the user clearly sees duplex status and anti-echo locking.

---

## Verification & Testing Plan
1. **Audio Duplex Test**: Ask Mikasa a long multi-sentence question ("Tell me about your favorite anime world in detail"). Verify that her voice synthesis plays continuously without self-interruption.
2. **Search Grounding Test**: Ask "What's the weather like today in Tokyo and what's the latest tech news?" Verify that Google Search grounding retrieves live 2026 data and Mikasa answers accurately in her anime persona.
3. **Model Persistence Test**: Upload a custom `.glb` model or enter a model URL; reload the page; verify that the custom model remains loaded as default.
4. **Build Verification**: Run `compile_applet` and verify zero TypeScript or bundle errors.
