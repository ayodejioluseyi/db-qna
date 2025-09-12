'use client';

import { useState } from 'react';
import Image from 'next/image';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function Home() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  // Hardcode accountId for now
  const accountId = 53;

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    // Add user message to chat
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, accountId }),
      });
      const data = await res.json();

      // Add assistant reply
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer || data.detail || data.error || 'No answer.' },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Error contacting the server.' },
      ]);
    } finally {
      setLoading(false);
      setQuestion('');
    }
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
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg shadow ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white self-end ml-auto max-w-[80%]'
                  : 'bg-white text-gray-900 self-start mr-auto max-w-[80%]'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="bg-gray-200 text-gray-600 p-3 rounded-lg self-start">
              Thinking…
            </div>
          )}
        </div>
      </div>

      {/* Input area fixed at bottom */}
      <footer className="p-4 border-t bg-white">
        <form
          onSubmit={handleAsk}
          className="w-full max-w-2xl mx-auto flex gap-2"
        >
          <input
            className="flex-1 border rounded p-2"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question…"
          />
          <button
            className="bg-blue-600 text-white rounded px-4 py-2"
            disabled={loading}
          >
            {loading ? 'Thinking…' : 'Ask SafeIntel AI'}
          </button>
        </form>
      </footer>
    </main>
  );
}
