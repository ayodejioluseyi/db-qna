import { NextResponse } from 'next/server';
import { openai } from '@/lib/openai';

export async function GET() {
  try {
    const r = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: 'Say "pong".'
    });
    return NextResponse.json({ ok: true, text: r.output_text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, where: 'openai', message: e?.message },
      { status: 500 }
    );
  }
}
