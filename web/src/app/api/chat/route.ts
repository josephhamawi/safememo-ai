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

    // Forward auth header from client
    const authHeader = req.headers.get('authorization') || '';

    // ---------- Try Cloud Function first ----------
    const functionsUrl =
      process.env.NEXT_PUBLIC_FUNCTIONS_URL ||
      process.env.FUNCTIONS_URL ||
      '';

    if (functionsUrl) {
      try {
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

        // Surface 4xx errors from the Cloud Function directly
        if (cfResponse.status >= 400 && cfResponse.status < 500) {
          const errBody = await cfResponse.json().catch(() => ({}));
          return NextResponse.json(
            { error: errBody.error || 'Cloud function returned an error' },
            { status: cfResponse.status }
          );
        }

        // 5xx or other transient failure -- fall through to mock
        console.warn(
          `Cloud function returned ${cfResponse.status}, falling back to mock response`
        );
      } catch (cfErr) {
        console.warn('Cloud function unreachable, using mock fallback:', cfErr);
      }
    }

    // ---------- Mock / fallback ----------
    // Return mock content to the client. The client will write the assistant
    // message to Firestore so the real-time listener picks it up.

    const assistantMessageId = crypto.randomUUID();
    const assistantContent = generateMockReply(message);

    return NextResponse.json({
      success: true,
      messageId: assistantMessageId,
      content: assistantContent,
      mock: true,
    });
  } catch (err) {
    console.error('POST /api/chat error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------- Mock reply generator ----------

function generateMockReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes('hello') || lower.includes('hi')) {
    return "Hello! I'm your Noomachy AI agent. How can I help you today?";
  }
  if (lower.includes('help')) {
    return (
      "Sure, I'd be happy to help! Here's what I can do:\n\n" +
      '- **Answer questions** about a wide range of topics\n' +
      '- **Write and review code** in many languages\n' +
      '- **Research** topics and summarize findings\n' +
      '- **Plan** tasks and break down complex problems\n\n' +
      'What would you like to work on?'
    );
  }
  if (lower.includes('code') || lower.includes('function')) {
    return (
      "Here's a quick example:\n\n" +
      '```typescript\n' +
      'function greet(name: string): string {\n' +
      '  return `Hello, ${name}!`;\n' +
      '}\n' +
      '```\n\n' +
      'Let me know if you want me to write something specific!'
    );
  }

  return (
    `I received your message: "${userMessage.slice(0, 100)}"\n\n` +
    'This is a **mock response** because the Cloud Function is not deployed yet. ' +
    'Once the backend is connected, you will receive real AI-generated replies.'
  );
}
