/**
 * Seed Script - Populates Firestore with sample agent configurations
 *
 * Usage: npx ts-node seed/seed.ts
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account key
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (serviceAccountPath) {
  initializeApp({
    credential: cert(serviceAccountPath),
  });
} else {
  // Use default credentials (emulator or ADC)
  initializeApp({ projectId: 'noomachy' });
}

const db = getFirestore();

async function seed() {
  console.log('Starting Noomachy seed...\n');

  // Load seed data
  const seedData = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'agents.json'), 'utf-8')
  );

  // Create a demo user (for emulator testing)
  const demoUserId = 'demo-user-001';
  console.log('Creating demo user profile...');
  await db.doc(`users/${demoUserId}`).set({
    uid: demoUserId,
    email: 'demo@noomachy.dev',
    displayName: 'Demo User',
    photoURL: null,
    plan: 'pro',
    agentLimit: 10,
    apiUsage: {
      tokensUsed: 0,
      tokensLimit: 1000000,
      resetAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  console.log('  Created user: demo@noomachy.dev\n');

  // Seed agents
  console.log('Creating agents...');
  for (const agent of seedData.agents) {
    const agentRef = db.collection('agents').doc();
    await agentRef.set({
      ...agent,
      id: agentRef.id,
      ownerId: demoUserId,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`  Created agent: ${agent.name} (${agentRef.id})`);

    // Create a sample conversation for each agent
    const convRef = agentRef.collection('conversations').doc();
    await convRef.set({
      id: convRef.id,
      agentId: agentRef.id,
      userId: demoUserId,
      title: `Welcome to ${agent.name}`,
      source: 'web',
      messageCount: 2,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Add welcome messages
    const now = Timestamp.now();
    await convRef.collection('messages').add({
      id: crypto.randomUUID(),
      role: 'user',
      content: `Hello ${agent.name}! What can you help me with?`,
      timestamp: now,
    });

    const laterTimestamp = Timestamp.fromDate(
      new Date(now.toDate().getTime() + 1000)
    );
    await convRef.collection('messages').add({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: getWelcomeMessage(agent.name, agent.type),
      timestamp: laterTimestamp,
    });

    // Create a sample semantic memory
    await agentRef.collection('memory').doc('semantic').collection('items').add({
      id: crypto.randomUUID(),
      agentId: agentRef.id,
      content: `The user prefers ${agent.type === 'code' ? 'TypeScript and React' : 'clear and detailed'} responses.`,
      embedding: new Array(768).fill(0).map(() => Math.random() * 2 - 1),
      metadata: {
        source: 'conversation',
        confidence: 0.85,
        validationStatus: 'approved',
        tags: ['preference', 'user-style'],
        createdAt: Timestamp.now(),
        lastAccessed: Timestamp.now(),
        accessCount: 1,
      },
      accessControl: {
        ownerId: demoUserId,
        visibility: 'private',
        allowedUsers: [],
      },
    });

    // Create a sample episodic memory
    await agentRef.collection('memory').doc('episodic').collection('items').add({
      episodeId: crypto.randomUUID(),
      agentId: agentRef.id,
      userId: demoUserId,
      taskDomain: agent.type,
      sessionSnapshot: {
        sessionId: 'seed-session',
        messageCount: 2,
        toolsUsed: [],
        summary: 'Initial conversation and setup',
      },
      outcome: 'success',
      lessonsLearned: ['User responded well to structured answers'],
      toolCalls: [],
      duration: 5000,
      consolidationScore: 0.3,
      promotedToSemantic: false,
      createdAt: Timestamp.now(),
    });
  }

  // Seed skills
  console.log('\nCreating skills...');
  for (const skill of seedData.skills) {
    const skillRef = db.collection('skills').doc(skill.name);
    await skillRef.set({
      ...skill,
      id: skill.name,
      mcpEndpoint: `https://us-central1-noomachy.cloudfunctions.net/mcpServer/tools/call`,
      implementation: {
        storagePath: `skills/${skill.name}/v${skill.version}/index.js`,
        hash: crypto.randomUUID(),
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    console.log(`  Created skill: ${skill.name}`);
  }

  console.log('\nSeed complete!');
  console.log(`  Users: 1`);
  console.log(`  Agents: ${seedData.agents.length}`);
  console.log(`  Skills: ${seedData.skills.length}`);
  console.log(`  Conversations: ${seedData.agents.length}`);
}

function getWelcomeMessage(name: string, type: string): string {
  const messages: Record<string, string> = {
    general: `Hello! I'm ${name}, your general-purpose AI assistant. I can help with research, writing, analysis, problem-solving, and much more. I learn from our conversations and build up knowledge over time through my memory system. What would you like to explore?`,
    code: `Hey! I'm ${name}, your coding companion. I specialize in software development - from writing code and debugging to architecture design and code reviews. I support multiple languages and frameworks, and I remember patterns from our past sessions to give better suggestions. What are you building?`,
    research: `Greetings! I'm ${name}, your research specialist. I help with deep analysis, literature reviews, data synthesis, and structured research reports. I build a knowledge base from our research sessions, making each investigation richer than the last. What topic shall we explore?`,
    creative: `Hi there! I'm ${name}, your creative partner. I thrive on brainstorming, creative writing, content generation, and thinking outside the box. I remember what creative approaches have worked well for us before and build on that foundation. What shall we create together?`,
    planning: `Welcome! I'm ${name}, your strategic planning assistant. I help with project planning, goal setting, task management, and strategic thinking. I track our planning sessions to provide increasingly relevant suggestions. What are we planning?`,
  };
  return messages[type] || messages.general;
}

seed().catch(console.error);
