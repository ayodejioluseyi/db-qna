import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET() {
  try {
    // Read key from env
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, where: 'env', message: 'OPENAI_API_KEY is missing from .env.local' },
        { status: 500 }
      );
    }

    // Call OpenAI directly (no alias imports)
    const client = new OpenAI({ apiKey });
    const r = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: 'Say "pong".'
    });

    return NextResponse.json({ ok: true, text: r.output_text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, where: 'openai', message: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
