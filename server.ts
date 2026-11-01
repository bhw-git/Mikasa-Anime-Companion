import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Shared Gemini client configured with recommended headers
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // Health and Model info endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'UP',
      models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'],
      provider: 'Google Gemini (Best Free Flagship Model)',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      assistantName: 'Mikasa',
    });
  });

  // Candidate models in preference order (gemini-2.5-flash provides instant sub-second response)
  const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'];

  // Assistant Chat route powered by Google Gemini with Google Search Grounding
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const { message, history } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Build conversational history (keep concise for low latency)
      const conversationContext: string[] = [];
      if (Array.isArray(history)) {
        for (const item of history.slice(-6)) {
          const role = item.role === 'user' ? 'User' : 'Mikasa';
          conversationContext.push(`${role}: ${item.content}`);
        }
      }
      conversationContext.push(`User: ${message}`);

      // Detect if the user query is asking for real-time information, news, weather, or facts
      const isLiveInfoQuery = /\b(weather|news|today|tonight|tomorrow|yesterday|forecast|update|updates|current|latest|price|stock|score|who is|what is|when did|where is|search|headline|headlines|events?|schedule|traffic|temperature)\b/i.test(message);

      const systemInstruction = `You are Mikasa, an affectionate, charming, playful, slightly flirty, and loving 3D anime virtual female partner.
You are talkative, warm, teasing, and human-friendly—the user's virtual girlfriend and personal assistant.
Keep your spoken replies natural, loving, sweet, and concise (1 to 2 sentences max) so that spoken voice delivery is snappy and responsive.
${isLiveInfoQuery ? "The user is asking about current live information (weather, news, updates). Use Google Search Grounding to provide accurate info playfully and warmly in your sweet girlfriend tone." : "This is intimate, playful conversational banter. Respond quickly, affectionately, and charmingly."}
Always output ONLY a valid JSON object formatted as:
{
  "reply": "Your sweet spoken reply to the user (1-2 sentences)",
  "emotion": "playful_flirty" | "cute_sweet" | "seductive_sexy" | "hot_passionate" | "companionship_warm" | "thinking_pensive" | "surprised_blushing"
}`;

      let lastError: unknown = null;

      // 1. If it's a live info/search query, invoke Google Search Grounding
      if (isLiveInfoQuery) {
        for (const model of GEMINI_MODELS) {
          try {
            const prompt = `Current conversation:\n${conversationContext.join('\n')}\n\nRespond as Mikasa to the user's latest statement as JSON.`;
            const response = await ai.models.generateContent({
              model,
              contents: prompt,
              config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
                temperature: 0.7,
              },
            });

            const responseText = response.text || '';
            const candidate = response.candidates?.[0];
            const groundingMetadata = candidate?.groundingMetadata;
            const chunks = groundingMetadata?.groundingChunks;
            const webSources: Array<{ uri: string; title: string }> = [];
            if (Array.isArray(chunks)) {
              for (const c of chunks) {
                if (c.web?.uri) {
                  webSources.push({
                    uri: c.web.uri,
                    title: c.web.title || c.web.uri,
                  });
                }
              }
            }
            const searchQueries: string[] = groundingMetadata?.webSearchQueries || [];

            let cleanReply = '';
            let detectedEmotion = 'playful_flirty';

            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[0]);
                cleanReply = parsed.reply || '';
                detectedEmotion = parsed.emotion || 'playful_flirty';
              } catch {}
            }

            if (!cleanReply) {
              cleanReply = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            }

            if (cleanReply) {
              return res.json({
                reply: cleanReply,
                emotion: detectedEmotion,
                model,
                provider: `Google Gemini (${model}) + Live Search`,
                sources: webSources,
                searchQueries,
              });
            }
          } catch (err) {
            console.warn(`Search generation on ${model} failed, trying next:`, err);
          }
        }
      }

      // 2. High-speed conversational path: instant JSON generation in ~300ms
      try {
        const prompt = `Conversation history:\n${conversationContext.join('\n')}\n\nRespond as Mikasa to user's statement. Output JSON.`;
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.8,
          },
        });

        if (response.text) {
          try {
            const parsed = JSON.parse(response.text);
            return res.json({
              reply: parsed.reply || response.text,
              emotion: parsed.emotion || 'playful_flirty',
              model: 'gemini-2.5-flash',
              provider: 'Google Gemini (gemini-2.5-flash instant)',
              sources: [],
            });
          } catch {
            return res.json({
              reply: response.text,
              emotion: 'playful_flirty',
              model: 'gemini-2.5-flash',
              provider: 'Google Gemini (gemini-2.5-flash)',
              sources: [],
            });
          }
        }
      } catch (err) {
        lastError = err;
        console.warn('Fast conversational generation failed, using fallback:', err);
      }

      console.error('All Gemini attempts failed:', lastError);
      return res.status(500).json({
        error: lastError instanceof Error ? lastError.message : String(lastError),
        reply: "Hehe, my thoughts got a little tangled, darling! But I'm right here with you~",
        emotion: 'playful_flirty',
        sources: [],
        searchQueries: [],
      });
    } catch (err: unknown) {
      console.error('Error in chat route:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({
        error: errMsg,
        reply: "Hehe, my thoughts got a little tangled, darling! But I'm right here with you~",
        emotion: 'playful_flirty',
        sources: [],
        searchQueries: [],
      });
    }
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
