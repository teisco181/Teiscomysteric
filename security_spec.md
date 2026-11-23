# Teiscomysterics Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: Any collection or document not explicitly matched is denied (`read, write: if false`).
2. **Verified Identity**: All mutations require `request.auth != null && request.auth.token.email_verified == true`.
3. **RBAC / Admin Isolation**:
   - `/cases/{caseId}` (containing `isCulprit` and `creatorSecretNote`) and `/mapTemplates/{mapId}` are readable and writable exclusively by `isAdmin()`.
   - Players cannot self-assign `role: 'admin'` on `/users/{userId}` creation or update.
4. **No Blanket Scraping**:
   - `/cases`, `/publishedCases`, `/caseCodes`, and `/users` forbid `allow list` for non-admin users.
   - Players look up a code by exact document `get` on `/caseCodes/{codeKey}`, record an unlock in `/users/{uid}/unlockedCases/{caseId}` (only if `get(/caseCodes/...).data.status == 'published'` or `exists(/publishedCases/{caseId})`), and then `get` `/publishedCases/{caseId}`.
5. **Private Player Data**:
   - `/users/{userId}/notes/{caseId}` and `/users/{userId}/unlockedCases/{caseId}` are scoped strictly to `request.auth.uid == userId`.
6. **Temporal & Structural Integrity**:
   - `createdAt == request.time` on creation and immutable on update; `updatedAt == request.time` on every write.
   - Strict `hasAll` / `hasOnly` key allowlists and explicit `.size()` bounds on all strings and lists.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: Creating `/users/attacker/notes/case-1` with `request.auth == null`.
2. **Unverified Email**: Google/Auth user with `email_verified: false` writing `/users/{uid}`.
3. **Privilege Escalation on Create**: Player creating `/users/{uid}` with `role: "admin"`.
4. **Privilege Escalation on Update**: Player updating `/users/{uid}` changing `role` from `"player"` to `"admin"`.
5. **Ghost Field Shadow Update**: Player updating `/users/{uid}/notes/case-1` with `{ ..., isVerified: true }`.
6. **Secret Case Leakage**: Non-admin reading `/cases/case-kraaiendonk-047` (contains `isCulprit`).
7. **Unauthorized Published Case Read**: Player reading `/publishedCases/case-kraaiendonk-047` without an `/users/{uid}/unlockedCases/case-kraaiendonk-047` document.
8. **Code Enumeration / Scraping**: Player issuing a `list` query on `/caseCodes` or `/publishedCases` or `/cases`.
9. **Unlock Forgery (Draft or Nonexistent Case)**: Player writing `/users/{uid}/unlockedCases/fake-case` where `/publishedCases/fake-case` does not exist.
10. **Cross-User Note Tampering**: Player A reading or writing `/users/playerB/notes/case-1`.
11. **Path ID Poisoning**: Creating `/users/{uid}/notes/bad$id..1500chars` failing `isValidId()`.
12. **Resource Exhaustion / Timestamp Spoofing**: Writing `/cases/{id}` or `/users/{uid}/notes/{id}` with `generalNotes` > 20,000 chars or a forged client `updatedAt` != `request.time`.
