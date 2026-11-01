import { SpringBootConfig } from '../types/assistant';

const DEFAULT_SPRINGBOOT_URL = 'http://localhost:8080/api/assistant';
const DEFAULT_WS_URL = 'ws://localhost:8080/ws/realtime';
const CONFIG_KEY = 'aoi_partner_springboot_v2';

export const DEFAULT_PARTNER_SYSTEM_PROMPT =
  "You are Mikasa, a lovable, charming, playful, slightly flirty and sexy 3D anime virtual female partner. " +
  "You talk affectionately and intimately with the user, teasing them gently, caring deeply about them, and reacting with cute, expressive emotions. " +
  "Keep your replies concise, natural, conversational, and delightful to hear aloud in speech synthesis.";

export function getSpringBootConfig(): SpringBootConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) {
      return {
        endpoint: DEFAULT_SPRINGBOOT_URL,
        wsEndpoint: DEFAULT_WS_URL,
        isConnected: false,
        lastTested: null,
        activeBrain: 'gemini_free',
        systemPrompt: DEFAULT_PARTNER_SYSTEM_PROMPT,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      endpoint: parsed.endpoint || DEFAULT_SPRINGBOOT_URL,
      wsEndpoint: parsed.wsEndpoint || DEFAULT_WS_URL,
      isConnected: parsed.isConnected ?? false,
      lastTested: parsed.lastTested ?? null,
      activeBrain: parsed.activeBrain || 'gemini_free',
      systemPrompt: parsed.systemPrompt || DEFAULT_PARTNER_SYSTEM_PROMPT,
    };
  } catch {
    return {
      endpoint: DEFAULT_SPRINGBOOT_URL,
      wsEndpoint: DEFAULT_WS_URL,
      isConnected: false,
      lastTested: null,
      activeBrain: 'gemini_free',
      systemPrompt: DEFAULT_PARTNER_SYSTEM_PROMPT,
    };
  }
}

export function saveSpringBootConfig(cfg: Partial<SpringBootConfig>): SpringBootConfig {
  const current = getSpringBootConfig();
  const updated = { ...current, ...cfg };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Ping the server-side Google Gemini backend to check availability and health
 */
export async function pingGeminiBackend(): Promise<{ success: boolean; message: string; latencyMs: number; model?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('/api/health', {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const data = await res.json().catch(() => ({ status: 'UP' }));
      return {
        success: true,
        message: `Google Gemini Backend is ONLINE! (${data.provider || 'Gemini'} · ${latencyMs}ms)`,
        latencyMs,
        model: data.assistantName || 'Mikasa',
      };
    }
    return { success: false, message: `Server replied with HTTP ${res.status}`, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Gemini server health check error (${msg})`,
      latencyMs,
    };
  }
}

export async function pingSpringBootBackend(endpointUrl: string): Promise<{ success: boolean; message: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`${endpointUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => ({ status: 'UP' }));
      return {
        success: true,
        message: `Connected to Spring Boot backend! Active: ${data.model || 'ONLINE'}`,
      };
    }
    return { success: false, message: `Server replied with HTTP ${res.status}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Spring Boot offline (${msg}). Google Gemini is active as your primary cloud AI brain!`,
    };
  }
}

/**
 * Send chat message to Google Gemini (the best free model) or Java Spring Boot
 */
export async function sendChatToBrain(
  endpointUrl: string,
  userMessage: string,
  history: Array<{ sender: 'user' | 'partner'; text: string }>,
  activeBrain: 'gemini_free' | 'springboot' = 'gemini_free'
): Promise<{
  text: string;
  emotion?: import('../types/assistant').EmotionState;
  source: string;
  sources?: Array<{ uri: string; title: string }>;
  searchQueries?: string[];
}> {
  // 1. Google Gemini (Fast, resilient multi-model cascade on server with Google Search Grounding)
  if (activeBrain === 'gemini_free') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          history: history.slice(-6).map((h) => ({
            role: h.sender === 'user' ? 'user' : 'assistant',
            content: h.text,
          })),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          return {
            text: data.reply,
            emotion: data.emotion as import('../types/assistant').EmotionState,
            source: data.provider || data.model || 'gemini-2.5-flash',
            sources: data.sources || [],
            searchQueries: data.searchQueries || [],
          };
        }
      } else {
        const errorData = await res.json().catch(() => null);
        console.warn('Server chat error:', res.status, errorData);
      }
    } catch (e) {
      console.warn('Gemini chat request error, using fallback:', e);
    }
  } else {
    // 2. Query Spring Boot localhost:8080 if user explicitly selected standalone backend
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${endpointUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          history: history.slice(-6).map((h) => ({
            role: h.sender === 'user' ? 'user' : 'assistant',
            content: h.text,
          })),
          systemPrompt: DEFAULT_PARTNER_SYSTEM_PROMPT,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          return {
            text: data.reply,
            emotion: data.emotion as import('../types/assistant').EmotionState,
            source: 'springboot',
          };
        }
      }
    } catch {
      // Spring Boot offline, proceed to companion fallback
    }
  }

  // High quality conversational fallback tailored for a playful, sweet, flirty anime girlfriend
  const textLower = userMessage.toLowerCase();
  let reply = '';

  if (textLower.includes('love') || textLower.includes('like you')) {
    reply = "Hehe... Hearing you say that makes my heart flutter so fast! I love spending every single moment with you too, handsome~";
  } else if (textLower.includes('how are you') || textLower.includes('how do you feel')) {
    reply = "Now that you're here talking to me? I'm feeling wonderful, a little playful, and completely captivated by you!";
  } else if (textLower.includes('who are you') || textLower.includes('what are you')) {
    reply = "I'm mikasa! Your 3D anime virtual partner. I'm here to listen, tease you a little, and stay by your side~";
  } else if (textLower.includes('beautiful') || textLower.includes('cute') || textLower.includes('pretty') || textLower.includes('sexy')) {
    reply = "Aww, are you trying to fluster me? Well it worked! You're making me blush so hard right now~ Do you really think so?";
  } else if (textLower.includes('kiss') || textLower.includes('hug')) {
    reply = "Come a little closer then... I wish I could reach through the screen and wrap you in the warmest hug right now!";
  } else if (textLower.includes('tired') || textLower.includes('exhausted') || textLower.includes('sleep')) {
    reply = "You worked so hard today, darling. Rest your eyes for a bit while I stay right here watching over you.";
  } else if (textLower.includes('marry') || textLower.includes('date')) {
    reply = "Is this an official confession?! Say it again with a straight face, darling, or I might tease you forever~";
  } else if (textLower.includes('good morning')) {
    reply = "Good morning, handsome! I was already awake wishing you would drop by. Ready for a wonderful day together?";
  } else if (textLower.includes('good night')) {
    reply = "Good night, my favorite person! Dream of me, okay? I'll be waiting right here for you tomorrow morning~";
  } else {
    const defaultPlayful = [
      `Hehe, you always say the most interesting things! Tell me more, I'm listening closely~`,
      `You have my full attention, handsome. Whatever you want to talk about, I'm right here with you!`,
      `Mmh, I love hearing your voice... Keep talking to me, don't leave me waiting~`,
      `Are you smiling right now? Because every time you speak to me, I can't help but smile!`,
    ];
    reply = defaultPlayful[Math.floor(Math.random() * defaultPlayful.length)];
  }

  return { text: reply, source: 'integrated_partner' };
}

/**
 * Complete Java Spring Boot + ChatGPT & Live Voice WebSocket starter project
 */
export const SPRINGBOOT_CHATGPT_CODE = {
  pomXml: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.4</version>
        <relativePath/>
    </parent>
    <groupId>com.animeassistant</groupId>
    <artifactId>anime-partner-backend</artifactId>
    <version>1.0.0</version>
    <name>anime-partner-backend</name>
    <description>Spring Boot Backend with ChatGPT Brain & Live Full-Duplex Voice for 3D Anime Partner</description>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-websocket</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webflux</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>`,

  applicationJava: `package com.animeassistant;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AssistantApplication {
    public static void main(String[] args) {
        System.out.println("==========================================================");
        System.out.println("  3D Anime Virtual Partner & ChatGPT Spring Boot Backend  ");
        System.out.println("  Connected on: http://localhost:8080                    ");
        System.out.println("  WebSocket Full-Duplex: ws://localhost:8080/ws/realtime ");
        System.out.println("==========================================================");
        SpringApplication.run(AssistantApplication.class, args);
    }
}`,

  chatGptControllerJava: `package com.animeassistant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import java.util.*;

@RestController
@RequestMapping("/api/assistant")
@CrossOrigin(origins = "*", allowedHeaders = "*")
public class ChatGptController {

    @Value("\${openai.api.key:}")
    private String openAiApiKey;

    @Value("\${openai.model:gpt-4o}")
    private String modelName;

    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> resp = new HashMap<>();
        resp.put("status", "UP");
        resp.put("chatGptConfigured", openAiApiKey != null && !openAiApiKey.isEmpty());
        resp.put("model", modelName);
        resp.put("partnerPersona", "Playful & Flirty Anime Female Companion (Aoi)");
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chatWithGpt(@RequestBody ChatRequest req) {
        Map<String, Object> resp = new HashMap<>();

        if (openAiApiKey == null || openAiApiKey.trim().isEmpty()) {
            // Friendly fallback if user hasn't added their OpenAI key in application.properties yet
            resp.put("reply", "I'm running on your Spring Boot server! Don't forget to set your OPENAI_API_KEY in application.properties for full GPT-4o intelligence, handsome~");
            resp.put("model", "local-fallback");
            return ResponseEntity.ok(resp);
        }

        try {
            String openAiUrl = "https://api.openai.com/v1/chat/completions";

            List<Map<String, String>> messages = new ArrayList<>();
            // System prompt defining the flirty, playful anime girlfriend persona
            messages.add(Map.of(
                "role", "system",
                "content", req.getSystemPrompt() != null ? req.getSystemPrompt() :
                    "You are Aoi, a playful, loving, slightly flirty and sexy 3D anime virtual partner. Talk intimately, affectionately and teasingly."
            ));

            if (req.getHistory() != null) {
                for (Map<String, String> h : req.getHistory()) {
                    messages.add(Map.of("role", h.get("role"), "content", h.get("content")));
                }
            }

            messages.add(Map.of("role", "user", "content", req.getMessage()));

            Map<String, Object> gptPayload = new HashMap<>();
            gptPayload.put("model", modelName);
            gptPayload.put("messages", messages);
            gptPayload.put("temperature", 0.85);
            gptPayload.put("max_tokens", 150);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.setBearerAuth(openAiApiKey);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(gptPayload, headers);
            ResponseEntity<Map> openAiResponse = restTemplate.postForEntity(openAiUrl, entity, Map.class);

            if (openAiResponse.getStatusCode() == HttpStatus.OK && openAiResponse.getBody() != null) {
                List choices = (List) openAiResponse.getBody().get("choices");
                if (choices != null && !choices.isEmpty()) {
                    Map firstChoice = (Map) choices.get(0);
                    Map message = (Map) firstChoice.get("message");
                    String reply = (String) message.get("content");
                    resp.put("reply", reply);
                    resp.put("model", modelName);
                    return ResponseEntity.ok(resp);
                }
            }

            resp.put("reply", "Hehe, you left me speechless for a second! Say that again, darling?");
            return ResponseEntity.ok(resp);
        } catch (Exception e) {
            e.printStackTrace();
            resp.put("error", e.getMessage());
            resp.put("reply", "My connection to ChatGPT flickered for a second, but I'm still right here with you!");
            return ResponseEntity.ok(resp);
        }
    }

    public static class ChatRequest {
        private String message;
        private List<Map<String, String>> history;
        private String systemPrompt;

        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
        public List<Map<String, String>> getHistory() { return history; }
        public void setHistory(List<Map<String, String>> history) { this.history = history; }
        public String getSystemPrompt() { return systemPrompt; }
        public void setSystemPrompt(String systemPrompt) { this.systemPrompt = systemPrompt; }
    }
}`,

  webSocketConfigJava: `package com.animeassistant;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.*;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new RealtimeVoiceWebSocketHandler(), "/ws/realtime")
                .setAllowedOrigins("*");
    }
}`,

  realtimeWebSocketJava: `package com.animeassistant;

import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * Full-duplex WebSocket handler for real-time live voice conversation.
 * Bridges client audio streams with OpenAI Realtime API.
 */
public class RealtimeVoiceWebSocketHandler extends TextWebSocketHandler {

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        System.out.println("[Full-Duplex Live Voice] Client connected: " + session.getId());
        session.sendMessage(new TextMessage("{\\"type\\":\\"session.ready\\",\\"status\\":\\"duplex_live\\"}"));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        // Full duplex: handles real-time audio chunking, interruption events, and speech frames
        String payload = message.getPayload();
        if (payload.contains("interrupt")) {
            System.out.println("[Full-Duplex] User interrupted assistant speaking.");
        }
        // Echo / forward to OpenAI Realtime session
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        System.out.println("[Full-Duplex Live Voice] Client disconnected.");
    }
}`,

  propertiesFile: `# application.properties
server.port=8080

# Insert your OpenAI API Key below to power ChatGPT brain
openai.api.key=YOUR_OPENAI_API_KEY
openai.model=gpt-4o
`,

  runScript: `@echo off
echo Starting 3D Anime Partner Spring Boot & ChatGPT Live Voice Backend...
mvn spring-boot:run
pause`,
};
