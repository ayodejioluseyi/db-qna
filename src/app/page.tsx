'use client';

import { useState } from 'react';

export default function Home() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  // 👇 Hardcode accountId for now — later replace with session/user auth
  const accountId = 53;

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, accountId }),
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
    <main className="min-h-screen p-6 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-4">Ask the Database</h1>
      <form onSubmit={handleAsk} className="w-full max-w-xl flex gap-2">
        <input
          className="flex-1 border rounded p-2"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g., Have the opening checks been completed?"
        />
        <button
          className="bg-blue-600 text-white rounded px-4 py-2"
          disabled={loading}
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {answer && (
        <div className="mt-6 w-full max-w-xl border rounded p-3 bg-gray-50">
          <div className="font-semibold mb-1">Answer</div>
          <div>{answer}</div>
        </div>
      )}
    </main>
  );
}
