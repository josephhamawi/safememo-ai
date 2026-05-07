/**
 * Seed: Legal Contract Review Agent demo
 *
 * One tenant, one agent, five semantic memories with one deliberate
 * contradiction so the validation gate has something to flag in demos.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     npx ts-node seed/legal-demo.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';

if (getApps().length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    initializeApp({ credential: cert(path.resolve(serviceAccountPath)) });
  } else {
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'noomachy' });
  }
}

const db = getFirestore();

const DEMO_TENANT_ID = 'demo-legal-001';
const DEMO_AGENT_ID = 'demo-agent-legal';

interface SeedFact {
  content: string;
  tags: string[];
  /** True for the one fact that should land in the staging queue with a contradiction flag. */
  contradicts?: boolean;
  confidence: number;
}

const APPROVED_FACTS: SeedFact[] = [
  {
    content: 'Termination notice period is 30 days for Acme matters.',
    tags: ['termination', 'contract', 'acme'],
    confidence: 0.95,
  },
  {
    content: 'Governing law for Acme contracts is the State of Delaware.',
    tags: ['governing-law', 'contract', 'acme'],
    confidence: 0.97,
  },
  {
    content: 'Limitation of liability cap is 12 months of fees in Acme MSAs.',
    tags: ['liability', 'contract', 'acme'],
    confidence: 0.92,
  },
  {
    content: 'Confidentiality survives termination by 5 years for Acme matters.',
    tags: ['confidentiality', 'contract', 'acme'],
    confidence: 0.94,
  },
];

// This one will be staged so the reviewer can see the contradiction flag.
const CONTRADICTING_STAGING_FACT: SeedFact = {
  content: 'Termination notice period is 60 days for Acme matters.',
  tags: ['termination', 'contract', 'acme'],
  contradicts: true,
  confidence: 0.88,
};

async function seed(): Promise<void> {
  // 1. Tenant user
  await db.doc(`users/${DEMO_TENANT_ID}`).set(
    {
      uid: DEMO_TENANT_ID,
      email: 'demo-legal@noomachy.dev',
      displayName: 'Legal Demo Tenant',
      onboardingCompleted: true,
      tourCompleted: true,
      createdAt: Timestamp.now(),
    },
    { merge: true },
  );

  // 2. Agent
  await db.doc(`agents/${DEMO_AGENT_ID}`).set(
    {
      id: DEMO_AGENT_ID,
      ownerId: DEMO_TENANT_ID,
      name: 'Legal Contract Review',
      description:
        'Reviews contracts against your firm\'s prior precedent. Flags terms that contradict standing memories. Every decision is hash-chained for the audit trail.',
      type: 'research',
      systemPrompt:
        'You are a contract review agent for a corporate law firm. You compare incoming contracts against the firm\'s semantic memory of prior matters. ' +
        'When you find a clause that contradicts a prior matter, you do not unilaterally update memory — you propose the new fact to the validation gate so a human partner approves or rejects. ' +
        'Always cite memory IDs. Never assert a fact without a memory ID backing it.',
      model: 'claude',
      modelConfig: { temperature: 0.2, maxTokens: 2048 },
      enabledSkills: [],
      memoryConfig: {
        maxWorkingMemoryMessages: 20,
        semanticSearchTopK: 10,
        episodicSearchTopK: 5,
        autoApprovalEnabled: false, // legal demo: every fact requires human review
        autoApprovalThreshold: 0.99,
      },
      channels: { web: { enabled: true } },
      status: 'active',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );

  // 3. Approved semantic memories
  for (let i = 0; i < APPROVED_FACTS.length; i++) {
    const fact = APPROVED_FACTS[i];
    const memoryId = `demo-mem-${String(i + 1).padStart(3, '0')}`;
    await db
      .doc(`agents/${DEMO_AGENT_ID}/semanticMemory/${memoryId}`)
      .set({
        id: memoryId,
        agentId: DEMO_AGENT_ID,
        content: fact.content,
        embedding: zeroEmbedding(), // demo only; real seeds run through Vertex
        metadata: {
          source: 'conversation',
          confidence: fact.confidence,
          validationStatus: 'approved',
          tags: fact.tags,
          createdAt: Timestamp.now(),
          lastAccessed: Timestamp.now(),
          accessCount: 0,
        },
        accessControl: {
          ownerId: DEMO_TENANT_ID,
          visibility: 'private',
          allowedUsers: [],
        },
      });
  }

  // 4. One staged fact that contradicts memory #1 (30 days vs 60 days)
  const stagingId = 'demo-staging-001';
  await db
    .doc(`agents/${DEMO_AGENT_ID}/stagingMemory/${stagingId}`)
    .set({
      id: stagingId,
      agentId: DEMO_AGENT_ID,
      content: CONTRADICTING_STAGING_FACT.content,
      embedding: zeroEmbedding(),
      metadata: {
        source: 'conversation',
        confidence: CONTRADICTING_STAGING_FACT.confidence,
        validationStatus: 'staging',
        tags: CONTRADICTING_STAGING_FACT.tags,
        createdAt: Timestamp.now(),
        lastAccessed: Timestamp.now(),
        accessCount: 0,
      },
      accessControl: {
        ownerId: DEMO_TENANT_ID,
        visibility: 'private',
        allowedUsers: [],
      },
      proposedBy: 'agent',
      explanation:
        'Extracted from new Acme MSA draft (clause 14.2). New term differs from prior matters.',
      autoApprovalEligible: false,
      autoApprovalReason: 'manual review required',
      duplicateCheckResult: { hasDuplicate: false },
      contradictionCheckResult: {
        hasContradiction: true,
        conflictingMemoryId: 'demo-mem-001',
        explanation:
          'This memory conflicts with: "Termination notice period is 30 days for Acme matters." ' +
          '(84% similar, both tagged "termination", "contract", "acme"). ' +
          'Approve only if both can be true at once.',
      },
    });

  console.log('Legal demo seeded:');
  console.log(`  Tenant: ${DEMO_TENANT_ID}`);
  console.log(`  Agent:  ${DEMO_AGENT_ID}`);
  console.log(`  Approved memories: ${APPROVED_FACTS.length}`);
  console.log('  Staged (with contradiction): 1');
  console.log('');
  console.log(
    'Sign in as the demo tenant and open Pending validation to see the gate in action.',
  );
}

function zeroEmbedding(): number[] {
  // 768-dim zero vector — sufficient for demo browsing without firing Vertex AI.
  return new Array(768).fill(0);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
