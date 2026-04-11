import './../init';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { Timestamp } from 'firebase-admin/firestore';

const db = admin.firestore();

/**
 * Per-user behavior profile that the system learns from every interaction.
 * Tracks patterns like:
 * - Most-used tools
 * - Common task domains
 * - Preferred response style (short vs detailed, formal vs casual)
 * - Time-of-day usage patterns
 * - Frequently mentioned topics
 *
 * This profile is updated incrementally after each conversation and injected
 * into the system prompt so the agent adapts to the user over time.
 */

export interface BehaviorProfile {
  userId: string;
  totalInteractions: number;
  toolUsage: Record<string, number>;        // tool name → count
  taskDomains: Record<string, number>;      // domain → count
  hourHistogram: number[];                  // 24-element array of hourly counts
  averageMessageLength: number;
  averageResponseLength: number;
  preferredStyle: 'concise' | 'detailed' | 'mixed';
  topTopics: string[];                      // recent recurring topics
  lastUpdated: Timestamp;
  insights: string[];                       // human-readable learned facts
}

const DEFAULT_PROFILE = (userId: string): BehaviorProfile => ({
  userId,
  totalInteractions: 0,
  toolUsage: {},
  taskDomains: {},
  hourHistogram: new Array(24).fill(0),
  averageMessageLength: 0,
  averageResponseLength: 0,
  preferredStyle: 'mixed',
  topTopics: [],
  lastUpdated: Timestamp.now(),
  insights: [],
});

/**
 * Load a user's behavior profile, creating an empty one if needed.
 */
export async function loadBehaviorProfile(userId: string): Promise<BehaviorProfile> {
  try {
    const ref = db.collection('users').doc(userId).collection('learning').doc('profile');
    const snap = await ref.get();
    if (!snap.exists) return DEFAULT_PROFILE(userId);
    return { ...DEFAULT_PROFILE(userId), ...(snap.data() as Partial<BehaviorProfile>) };
  } catch (err) {
    logger.warn('Failed to load behavior profile', err);
    return DEFAULT_PROFILE(userId);
  }
}

/**
 * Update the behavior profile after a conversation completes.
 * Called from the orchestrator/router after processing a request.
 */
export async function updateBehaviorProfile(params: {
  userId: string;
  userMessage: string;
  assistantResponse: string;
  toolsUsed: string[];
  taskDomain: string;
}): Promise<void> {
  try {
    const { userId, userMessage, assistantResponse, toolsUsed, taskDomain } = params;
    const ref = db.collection('users').doc(userId).collection('learning').doc('profile');

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const profile: BehaviorProfile = snap.exists
        ? { ...DEFAULT_PROFILE(userId), ...(snap.data() as Partial<BehaviorProfile>) }
        : DEFAULT_PROFILE(userId);

      // Increment counters
      profile.totalInteractions = (profile.totalInteractions || 0) + 1;

      // Track tool usage
      for (const tool of toolsUsed) {
        profile.toolUsage[tool] = (profile.toolUsage[tool] || 0) + 1;
      }

      // Track task domain
      if (taskDomain) {
        profile.taskDomains[taskDomain] = (profile.taskDomains[taskDomain] || 0) + 1;
      }

      // Time-of-day histogram (UTC hour)
      const hour = new Date().getUTCHours();
      if (!Array.isArray(profile.hourHistogram) || profile.hourHistogram.length !== 24) {
        profile.hourHistogram = new Array(24).fill(0);
      }
      profile.hourHistogram[hour] = (profile.hourHistogram[hour] || 0) + 1;

      // Rolling average message lengths
      const n = profile.totalInteractions;
      profile.averageMessageLength =
        Math.round(((profile.averageMessageLength || 0) * (n - 1) + userMessage.length) / n);
      profile.averageResponseLength =
        Math.round(((profile.averageResponseLength || 0) * (n - 1) + assistantResponse.length) / n);

      // Infer preferred style from average message length
      if (profile.averageMessageLength < 50) profile.preferredStyle = 'concise';
      else if (profile.averageMessageLength > 200) profile.preferredStyle = 'detailed';
      else profile.preferredStyle = 'mixed';

      // Build human-readable insights for the system prompt
      profile.insights = buildInsights(profile);
      profile.lastUpdated = Timestamp.now();

      tx.set(ref, profile, { merge: true });
    });
  } catch (err) {
    logger.warn('Failed to update behavior profile (non-fatal)', err);
  }
}

/**
 * Generate concise human-readable insights from a profile that Claude can
 * use to adapt its responses.
 */
function buildInsights(profile: BehaviorProfile): string[] {
  const insights: string[] = [];

  if (profile.totalInteractions < 3) {
    return insights; // not enough data
  }

  // Most-used tools (top 3)
  const topTools = Object.entries(profile.toolUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} (${count}x)`);
  if (topTools.length > 0) {
    insights.push(`Frequently uses: ${topTools.join(', ')}`);
  }

  // Most common task domains
  const topDomains = Object.entries(profile.taskDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => d);
  if (topDomains.length > 0) {
    insights.push(`Typical task areas: ${topDomains.join(', ')}`);
  }

  // Style preference
  if (profile.preferredStyle === 'concise') {
    insights.push('Prefers short, concise responses (typically writes brief messages)');
  } else if (profile.preferredStyle === 'detailed') {
    insights.push('Engages with detailed, in-depth responses');
  }

  // Active hours (find top 3 hours)
  const topHours = profile.hourHistogram
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((h) => h.count > 0)
    .map((h) => `${h.hour}:00 UTC`);
  if (topHours.length > 0) {
    insights.push(`Most active around: ${topHours.join(', ')}`);
  }

  insights.push(`Total interactions so far: ${profile.totalInteractions}`);

  return insights;
}

/**
 * Format the profile insights as a system prompt section.
 */
export function formatBehaviorInsights(profile: BehaviorProfile): string {
  if (!profile.insights || profile.insights.length === 0) return '';

  return (
    `\n<learned_user_patterns>` +
    `\nThe system has learned the following about this user from past interactions:` +
    `\n${profile.insights.map((i) => `  - ${i}`).join('\n')}` +
    `\nAdapt your responses to match these preferences naturally.` +
    `\n</learned_user_patterns>`
  );
}
