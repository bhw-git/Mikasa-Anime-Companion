import React, { useEffect, useRef } from 'react';
import { ChatMessage, EmotionProfile } from '../types/assistant';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentEmotion: EmotionProfile;
  assistantName?: string;
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentEmotion,
  assistantName = 'Mikasa',
  isOpen,
  onClose,
  onClearHistory,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (isOpen && scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed top-18 left-6 z-30 w-84 sm:w-[420px] max-w-[calc(100vw-3rem)] max-h-[calc(100vh-230px)] flex flex-col bg-[#10141f]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md overflow-hidden pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/30">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentEmotion.accentTone }} />
          <h3 className="text-xs font-semibold text-white tracking-wide">
            Convo with {assistantName}
          </h3>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onClearHistory}
            title="Clear Chat History"
            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer text-[11px]"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable Messages Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3.5 overscroll-contain"
      >
        {messages.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No messages yet. Speak into the mic or type to chat with {assistantName}!
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className={`text-[10px] uppercase font-semibold ${isUser ? 'text-rose-300' : 'text-slate-400'}`}>
                    {isUser ? 'You' : assistantName}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {timeStr}
                  </span>
                </div>

                <div
                  className={`px-3.5 py-2 rounded-2xl text-xs max-w-[88%] leading-relaxed ${
                    isUser
                      ? 'bg-rose-600/30 border border-rose-500/40 text-rose-100 rounded-br-xs'
                      : 'bg-white/5 border border-white/10 text-slate-100 rounded-bl-xs'
                  }`}
                >
                  {msg.text}

                  {/* Grounded Search Queries */}
                  {!isUser && msg.searchQueries && msg.searchQueries.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-white/10 flex flex-wrap gap-1 items-center">
                      <span className="text-[9px] text-slate-400 font-mono">Searched:</span>
                      {msg.searchQueries.map((q, qIdx) => (
                        <span
                          key={qIdx}
                          className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-white/5"
                        >
                          "{q}"
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Grounded Web Sources */}
                  {!isUser && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-white/10 flex flex-col gap-1">
                      <span className="text-[9px] text-sky-400 font-medium">Live Web Citations:</span>
                      <div className="flex flex-wrap gap-1">
                        {msg.sources.slice(0, 3).map((src, sIdx) => (
                          <a
                            key={sIdx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[9px] text-sky-300 hover:text-sky-100 bg-sky-950/50 border border-sky-500/30 px-1.5 py-0.5 rounded max-w-[170px] truncate underline transition-colors"
                            title={src.title || src.uri}
                          >
                            {src.title || src.uri}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Footer bar */}
      <div className="px-4 py-2 border-t border-white/5 bg-black/20 text-[10px] text-slate-400 font-mono text-center">
      </div>
    </div>
  );
};
