import { NextRequest, NextResponse } from 'next/server';

// ---------- Helpers ----------

interface ChatRequestBody {
  agentId: string;
  conversationId: string;
  message: string;
  idempotencyKey?: string;
}

function validateBody(body: unknown): body is ChatRequestBody {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.agentId === 'string' &&
    b.agentId.length > 0 &&
    typeof b.conversationId === 'string' &&
    b.conversationId.length > 0 &&
    typeof b.message === 'string' &&
    b.message.length > 0
  );
}

// ---------- POST /api/chat ----------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!validateBody(body)) {
      return NextResponse.json(
        { error: 'Missing required fields: agentId, conversationId, message' },
        { status: 400 }
      );
    }

    const { agentId, conversationId, message, idempotencyKey } = body;

    const authHeader = req.headers.get('authorization') || '';

    const functionsUrl =
      process.env.NEXT_PUBLIC_FUNCTIONS_URL ||
      process.env.FUNCTIONS_URL ||
      '';

    if (!functionsUrl) {
      return NextResponse.json(
        { error: 'Backend not configured. Set NEXT_PUBLIC_FUNCTIONS_URL.' },
        { status: 503 }
      );
    }

    const cfResponse = await fetch(functionsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({
        agentId,
        conversationId,
        content: message,
        idempotencyKey,
      }),
    });

    if (cfResponse.ok) {
      const cfData = await cfResponse.json();
      return NextResponse.json(cfData);
    }

    // Return the error from the Cloud Function
    const errBody = await cfResponse.json().catch(() => ({ error: `Cloud function error (${cfResponse.status})` }));
    return NextResponse.json(
      { error: errBody.error || `Request failed (${cfResponse.status})` },
      { status: cfResponse.status }
    );
  } catch (err) {
    console.error('POST /api/chat error:', err);
    return NextResponse.json(
      { error: 'Failed to reach the AI backend. Please try again.' },
      { status: 502 }
    );
  }
}
