/**
 * Security Rules Verification Suite (Phase 0 TDD)
 * Documents and verifies the Dirty Dozen payloads against firestore.rules.
 */
export interface DirtyDozenScenario {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  expected: 'PERMISSION_DENIED';
  rationale: string;
}

export const DIRTY_DOZEN_SCENARIOS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated note write',
    operation: 'create',
    path: '/users/attacker/notes/case-kraaiendonk-047',
    expected: 'PERMISSION_DENIED',
    rationale: 'isSignedIn() requires request.auth != null.',
  },
  {
    id: 2,
    name: 'Unverified email user write',
    operation: 'create',
    path: '/users/unverified_uid',
    expected: 'PERMISSION_DENIED',
    rationale: 'isSignedIn() mandates request.auth.token.email_verified == true.',
  },
  {
    id: 3,
    name: 'Self-assigned admin role on create',
    operation: 'create',
    path: '/users/player_uid',
    expected: 'PERMISSION_DENIED',
    rationale: 'Non-admin users can only create profiles with role == "player".',
  },
  {
    id: 4,
    name: 'Privilege escalation on profile update',
    operation: 'update',
    path: '/users/player_uid',
    expected: 'PERMISSION_DENIED',
    rationale: 'incoming().role == existing().role and affectedKeys.hasOnly(["displayName", "updatedAt"]).',
  },
  {
    id: 5,
    name: 'Ghost field shadow update on notes',
    operation: 'update',
    path: '/users/player_uid/notes/case-kraaiendonk-047',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidPlayerNote enforces keys().hasOnly(...) and affectedKeys().hasOnly(...).',
  },
  {
    id: 6,
    name: 'Direct read of secret maker case',
    operation: 'get',
    path: '/cases/case-kraaiendonk-047',
    expected: 'PERMISSION_DENIED',
    rationale: '/cases is strictly limited to isAdmin().',
  },
  {
    id: 7,
    name: 'Reading locked publishedCase without unlock record',
    operation: 'get',
    path: '/publishedCases/case-kraaiendonk-047',
    expected: 'PERMISSION_DENIED',
    rationale: 'Requires exists(/users/$(uid)/unlockedCases/$(caseId)) for non-admins.',
  },
  {
    id: 8,
    name: 'Blanket list query on caseCodes',
    operation: 'list',
    path: '/caseCodes',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list on /caseCodes is restricted to isAdmin().',
  },
  {
    id: 9,
    name: 'Forging unlock for draft or nonexistent case',
    operation: 'create',
    path: '/users/player_uid/unlockedCases/draft-case',
    expected: 'PERMISSION_DENIED',
    rationale: 'Requires exists(/publishedCases/$(caseId)).',
  },
  {
    id: 10,
    name: 'Cross-user note access',
    operation: 'get',
    path: '/users/player_b/notes/case-kraaiendonk-047',
    expected: 'PERMISSION_DENIED',
    rationale: 'isOwner(userId) enforces request.auth.uid == userId.',
  },
  {
    id: 11,
    name: 'Path variable ID poisoning',
    operation: 'create',
    path: '/users/player_uid/notes/invalid$id!poison',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidId(caseId) rejects non-[a-zA-Z0-9_-] or >128 char IDs.',
  },
  {
    id: 12,
    name: 'Timestamp spoofing on note update',
    operation: 'update',
    path: '/users/player_uid/notes/case-kraaiendonk-047',
    expected: 'PERMISSION_DENIED',
    rationale: 'incoming().updatedAt == request.time rejects client-supplied timestamps.',
  },
];
