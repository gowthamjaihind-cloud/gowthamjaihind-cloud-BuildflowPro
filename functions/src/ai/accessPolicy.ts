/**
 * The decision half of ai/access.ts, free of the Admin SDK so it can be tested
 * without an initialised app (the same split as claimsPolicy.ts).
 */

/** Whether a members map lists this uid. */
export function isMember(members: unknown, uid: string): boolean {
  return Boolean(uid && members && typeof members === "object" && (members as Record<string, unknown>)[uid]);
}

/** Instance cap for anything that calls Gemini -- see ai/access.ts. */
export const AI_MAX_INSTANCES = 10;
