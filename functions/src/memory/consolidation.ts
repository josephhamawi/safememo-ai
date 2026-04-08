import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type { EpisodicMemory, StagingMemory } from '../types';
import {
  getHighScoreEpisodes,
  markEpisodesConsolidated,
  paths,
} from './memoryManager';

const db = () => getFirestore();

// ============================================================
// Domain Clustering
// ============================================================

interface DomainCluster {
  taskDomain: string;
  episodes: EpisodicMemory[];
}

/**
 * Group episodes by their taskDomain field.
 */
function clusterByDomain(episodes: EpisodicMemory[]): DomainCluster[] {
  const map = new Map<string, EpisodicMemory[]>();

  for (const ep of episodes) {
    const existing = map.get(ep.taskDomain);
    if (existing) {
      existing.push(ep);
    } else {
      map.set(ep.taskDomain, [ep]);
    }
  }

  return Array.from(map.entries()).map(([taskDomain, eps]) => ({
    taskDomain,
    episodes: eps,
  }));
}

// ============================================================
// Pattern Extraction
// ============================================================

interface ExtractedPattern {
  toolSequences: string[][];
  lessonsLearned: string[];
  successRate: number;
  avgConsolidationScore: number;
}

/**
 * Extract common patterns from a cluster of episodes.
 *
 *  - Identifies the most-used tool sequences
 *  - Collects unique lessons learned
 *  - Computes aggregate success metrics
 */
function extractPatterns(episodes: EpisodicMemory[]): ExtractedPattern {
  // --- Tool sequences ---
  const toolSeqCounts = new Map<string, { seq: string[]; count: number }>();

  for (const ep of episodes) {
    const seq = ep.toolCalls.map((tc) => tc.toolName);
    if (seq.length === 0) continue;
    const key = seq.join(' -> ');
    const existing = toolSeqCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      toolSeqCounts.set(key, { seq, count: 1 });
    }
  }

  // Keep sequences that appear in at least 2 episodes or are the only one
  const minOccurrences = episodes.length > 2 ? 2 : 1;
  const toolSequences = Array.from(toolSeqCounts.values())
    .filter((entry) => entry.count >= minOccurrences)
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.seq);

  // --- Lessons learned (deduplicated) ---
  const lessonSet = new Set<string>();
  for (const ep of episodes) {
    for (const lesson of ep.lessonsLearned) {
      lessonSet.add(lesson.trim());
    }
  }

  // --- Aggregate metrics ---
  const successCount = episodes.filter((e) => e.outcome === 'success').length;
  const successRate = episodes.length > 0 ? successCount / episodes.length : 0;
  const avgConsolidationScore =
    episodes.length > 0
      ? episodes.reduce((sum, e) => sum + e.consolidationScore, 0) /
        episodes.length
      : 0;

  return {
    toolSequences,
    lessonsLearned: Array.from(lessonSet),
    successRate,
    avgConsolidationScore,
  };
}

// ============================================================
// Semantic Summary Generation
// ============================================================

/**
 * Build a human-readable summary from extracted patterns.
 * In production this could call an LLM; here we compose a structured summary.
 */
function generateSummary(
  domain: string,
  patterns: ExtractedPattern,
  episodeCount: number,
): string {
  const parts: string[] = [];

  parts.push(
    `Consolidated from ${episodeCount} episodes in domain "${domain}".`,
  );
  parts.push(
    `Success rate: ${(patterns.successRate * 100).toFixed(0)}%. ` +
      `Avg consolidation score: ${patterns.avgConsolidationScore.toFixed(2)}.`,
  );

  if (patterns.toolSequences.length > 0) {
    parts.push('Common tool sequences:');
    for (const seq of patterns.toolSequences.slice(0, 5)) {
      parts.push(`  - ${seq.join(' -> ')}`);
    }
  }

  if (patterns.lessonsLearned.length > 0) {
    parts.push('Key lessons:');
    for (const lesson of patterns.lessonsLearned.slice(0, 10)) {
      parts.push(`  - ${lesson}`);
    }
  }

  return parts.join('\n');
}

// ============================================================
// Create Staging Entries from Consolidated Patterns
// ============================================================

/**
 * Persist a consolidated summary as a new L2 staging entry.
 * Source is set to 'episodic_promotion'.
 */
async function createStagingFromConsolidation(
  agentId: string,
  domain: string,
  summary: string,
  patterns: ExtractedPattern,
  sourceEpisodeIds: string[],
): Promise<string> {
  const colRef = db().collection(paths.stagingMemory(agentId));
  const docRef = colRef.doc();
  const now = Timestamp.now();

  const staging: StagingMemory = {
    id: docRef.id,
    agentId,
    content: summary,
    embedding: [], // to be filled by vectorSearch.generateEmbedding downstream
    metadata: {
      source: 'episodic_promotion',
      confidence: patterns.avgConsolidationScore,
      validationStatus: 'staging',
      tags: [domain, 'consolidated', ...patterns.toolSequences.flat().slice(0, 10)],
      createdAt: now,
      lastAccessed: now,
      accessCount: 0,
    },
    accessControl: {
      ownerId: '', // will be resolved by the validation gate
      visibility: 'private',
      allowedUsers: [],
    },
    proposedBy: 'agent',
    explanation:
      `Auto-generated from ${sourceEpisodeIds.length} high-score episodes ` +
      `in domain "${domain}".`,
    autoApprovalEligible: false,
  };

  await docRef.set(staging);

  logger.info('Consolidation staging entry created', {
    agentId,
    stagingId: docRef.id,
    domain,
    sourceEpisodeCount: sourceEpisodeIds.length,
  });

  return docRef.id;
}

// ============================================================
// Core Consolidation Logic
// ============================================================

/**
 * Run consolidation for a single agent:
 *  1. Query high-score, un-promoted episodes
 *  2. Cluster by taskDomain
 *  3. Extract patterns per cluster
 *  4. Generate summary text
 *  5. Create L2 staging entries (source = 'episodic_promotion')
 *  6. Mark episodes as consolidated
 */
async function consolidateForAgent(agentId: string): Promise<number> {
  const episodes = await getHighScoreEpisodes(agentId, 0.8, 200);

  if (episodes.length === 0) {
    logger.debug('No episodes to consolidate', { agentId });
    return 0;
  }

  const clusters = clusterByDomain(episodes);
  let promotedCount = 0;

  for (const cluster of clusters) {
    // Only consolidate clusters with at least 2 episodes for meaningful patterns
    if (cluster.episodes.length < 2) continue;

    const patterns = extractPatterns(cluster.episodes);
    const summary = generateSummary(
      cluster.taskDomain,
      patterns,
      cluster.episodes.length,
    );

    const episodeIds = cluster.episodes.map((e) => e.episodeId);

    await createStagingFromConsolidation(
      agentId,
      cluster.taskDomain,
      summary,
      patterns,
      episodeIds,
    );

    await markEpisodesConsolidated(agentId, episodeIds);
    promotedCount += episodeIds.length;
  }

  logger.info('Consolidation complete for agent', {
    agentId,
    totalEpisodes: episodes.length,
    promotedCount,
    clusterCount: clusters.length,
  });

  return promotedCount;
}

// ============================================================
// Scheduled Cloud Function (every 6 hours)
// ============================================================

/**
 * Scheduled function that runs consolidation across all active agents.
 *
 * Runs every 6 hours. Iterates over all agent documents and consolidates
 * eligible episodes. Errors for individual agents are logged but do not
 * halt the entire batch.
 */
export const consolidateEpisodes = onSchedule(
  {
    schedule: 'every 6 hours',
    timeZone: 'UTC',
    retryCount: 2,
    memory: '512MiB',
    timeoutSeconds: 540, // 9 minutes
  },
  async (_event) => {
    logger.info('Starting scheduled episode consolidation');

    const agentsSnap = await db()
      .collection('agents')
      .where('status', '==', 'active')
      .get();

    if (agentsSnap.empty) {
      logger.info('No active agents found, skipping consolidation');
      return;
    }

    let totalPromoted = 0;
    let agentsProcessed = 0;
    let agentsFailed = 0;

    for (const agentDoc of agentsSnap.docs) {
      try {
        const count = await consolidateForAgent(agentDoc.id);
        totalPromoted += count;
        agentsProcessed += 1;
      } catch (err) {
        agentsFailed += 1;
        logger.error('Consolidation failed for agent', {
          agentId: agentDoc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('Scheduled consolidation complete', {
      agentsProcessed,
      agentsFailed,
      totalPromoted,
    });
  },
);
