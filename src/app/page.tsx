'use client';

import { useState } from 'react';
import Image from "next/image";

export default function Home() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [sql, setSql] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    setRows([]);
    setSql('');
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      setAnswer(data.answer || data.detail || data.error || 'No answer.');
      setRows(data.rows || []);
      setSql(data.sql || '');
    } catch {
      setAnswer('Error contacting the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6 flex flex-col items-center">
      {/* Logo at top */}
      <Image
        src="/safeintel-logo.png"
        alt="SafeIntel Logo"
        width={160}
        height={60}
        className="mb-6"
      />

      <h1 className="text-2xl font-bold mb-4">Ask the Database</h1>

      {/* Form */}
      <form onSubmit={handleAsk} className="w-full max-w-xl flex gap-2">
        <input
          className="flex-1 border rounded p-2"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g., Have the opening checks been completed?"
        />
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white rounded px-4"
          disabled={loading}
        >
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      {/* Answer */}
      {answer && (
        <div className="mt-6 w-full max-w-2xl border rounded p-3 bg-gray-50">
          <div className="font-semibold mb-1">Answer</div>
          <div className="mb-2">{answer}</div>
          {sql && (
            <div className="text-xs text-gray-500 mb-2">
              <strong>SQL used:</strong> {sql}
            </div>
          )}
        </div>
      )}

      {/* Table output */}
      {rows.length > 0 && (
        <div className="mt-4 w-full max-w-4xl overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                {Object.keys(rows[0]).map((col) => (
                  <th key={col} className="border border-gray-300 px-2 py-1 text-left">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="border border-gray-300 px-2 py-1">
                      {val === null ? '—' : String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
