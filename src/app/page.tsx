'use client';

import { useState } from 'react';
import Image from 'next/image';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

const EXAMPLES = [
  'Have the opening checks been completed?',
  'What temperature checks were completed today and did any fail?',
  'What checks are outstanding for today?',
  'Show temperature readings for the last 24 hours.',
  'How many checks were completed last week?',
];

export default function Home() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const restaurantId = 53;

  const now = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: question, timestamp: now() },
    ]);
    setLoading(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, restaurantId }),
      });
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || data.detail || data.error || 'No answer.',
          timestamp: now(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Error contacting the server.',
          timestamp: now(),
        },
      ]);
    } finally {
      setLoading(false);
      setQuestion('');
    }
  }

  function handleExampleClick(text: string) {
    setQuestion(text);
    // Optional auto-submit:
    // setTimeout(() => document.getElementById('ask-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })), 0);
  }

  // a tiny helper to render chips (reused in two places)
  function Chips({ examples, compact = false }: { examples: string[]; compact?: boolean }) {
    return (
      <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-2'}`}>
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => handleExampleClick(ex)}
            className={`text-sm px-3 py-2 rounded-full border bg-white hover:bg-gray-50 transition shadow-sm ${
              compact ? 'text-xs px-2 py-1' : ''
            }`}
            type="button"
          >
            {ex}
          </button>
        ))}
      </div>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-gray-100">
      {/* Header with logo */}
      <header className="p-4 flex items-center border-b bg-white shadow-sm">
        <Image
          src="/safeintel-logo.png"
          alt="SafeIntel Logo"
          width={150}
          height={40}
          priority
        />
      </header>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-4">
          {/* Full suggestions only when empty */}
          {messages.length === 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-700">Try asking:</h2>
              <Chips examples={EXAMPLES} />
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div key={i} className="flex flex-col max-w-[80%]">
              <div
                className={`p-3 rounded-lg shadow ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white self-end ml-auto'
                    : 'bg-white text-gray-900 self-start mr-auto'
                }`}
              >
                {msg.content}
              </div>
              <span
                className={`text-xs mt-1 ${
                  msg.role === 'user' ? 'text-right text-gray-200' : 'text-left text-gray-500'
                }`}
              >
                {msg.timestamp}
              </span>
            </div>
          ))}

          {loading && (
            <div className="bg-gray-200 text-gray-600 p-3 rounded-lg self-start">Thinking…</div>
          )}
        </div>
      </div>

      {/* Input area fixed at bottom */}
      <footer className="p-4 border-t bg-white">
        <form
          id="ask-form"
          onSubmit={handleAsk}
          className="w-full max-w-2xl mx-auto flex flex-col gap-2"
        >
          {/* Always-present compact quick prompts */}
          <div>
            <div className="text-xs text-gray-600">Quick prompts:</div>
            <Chips examples={EXAMPLES.slice(0, 2)} compact />
          </div>

          <div className="text-xs text-gray-500">
            Tip: Ask about today, last week, or a specific date. Example:{' '}
            <span className="italic">“Have the opening checks been completed?”</span>
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 border rounded p-2"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question…"
            />
            <button className="bg-blue-600 text-white rounded px-4 py-2" disabled={loading}>
              {loading ? 'Thinking…' : 'Ask'}
            </button>
          </div>
        </form>
      </footer>
    </main>
  );
}
