'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function Home() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setAnswer(data.answer || data.detail || data.error || 'No answer.');
    } catch {
      setAnswer('Error contacting the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 flex flex-col items-center bg-gray-50">
      {/* Logo */}
      <Image
        src="/safeintel-logo.png"
        alt="SafeIntel Logo"
        width={120}
        height={120}
        className="mb-2"
        priority
      />

      <h1 className="text-2xl font-bold mb-6">Ask the Database</h1>

      <form onSubmit={handleAsk} className="w-full max-w-xl flex gap-2">
        <input
          className="flex-1 border rounded p-2 bg-white"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g., How many accounts are in the system?"
          autoComplete="off"
          // uncomment the next line if a password manager causes hydration warnings:
          // suppressHydrationWarning
        />
        {/* Button color: change emerald to your brand (e.g., indigo, rose, sky) */}
        <button
          type="submit"
          className="rounded px-4 py-2 text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
          disabled={loading}
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {answer && (
        <div className="mt-6 w-full max-w-xl border rounded p-4 bg-white shadow-sm">
          <div className="font-semibold mb-1">Answer</div>
          <div>{answer}</div>
        </div>
      )}
    </main>
  );
}
