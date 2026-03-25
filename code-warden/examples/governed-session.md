# Example: Governed Session Transcript

This is an annotated example of a code-warden governed session.
It shows how the rules activate in practice during a real feature request.

---

## Session: Add user authentication middleware

**User:** Let's add JWT authentication middleware to the API. It should protect all `/api/v1/` routes.

---

**Assistant (Re-injection Check):**
> Before writing anything — per the Re-injection Rule, let me restate the current architecture:
> - `src/server.ts` — Express app entry point, mounts routers
> - `src/routes/api.ts` — All `/api/v1/` route definitions
> - `src/middleware/` — Existing middleware directory (currently only `logger.ts`)
> - No architecture doc found → applying Re-injection Fallback
>
> **Session scope:** Adding JWT auth middleware. Touching: `middleware/`, `routes/api.ts`, possibly `server.ts`.
> That's 3 files — this crosses the >2 file threshold.
>
> **[AWAITING CONFIRMATION]** — Plan before proceeding:
> 1. Create `src/middleware/auth.ts` — JWT verification logic only
> 2. Create `src/types/auth.types.ts` — Token payload type definition
> 3. Patch `src/routes/api.ts` — Apply middleware to `/api/v1/` router (diff only, no rewrite)
>
> Blast Radius:
> - **What might break:** Any route under `/api/v1/` that lacks a valid JWT will begin returning 401. No other routes affected.
> - **Test strategy:** Add unit test for `auth.ts`; smoke test unauthenticated request to `/api/v1/users`.
> - **Rollback:** `git checkout HEAD -- src/routes/api.ts && rm src/middleware/auth.ts src/types/auth.types.ts`
>
> Confirm to proceed?

---

**User:** Yes, go ahead.

---

**Assistant:**
> **Pre-flight:**
> - **File:** `src/middleware/auth.ts` — **Lines:** ~35 / 400 max
> - **Concern:** JWT token verification and request gating
> - **Secrets:** env-var sourced: `JWT_SECRET`
> - **Files changed this action:** `auth.ts` (new), `auth.types.ts` (new), `api.ts` (patch)

**`src/middleware/auth.ts`** (new file, ~35 lines)
```ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenPayload } from '../types/auth.types';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    // Zero-Trust: never fall back to a default secret
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as TokenPayload;
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

**`src/types/auth.types.ts`** (new file, ~10 lines)
```ts
export interface TokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}
```

**Patch for `src/routes/api.ts`** (diff only):
```diff
+ import { requireAuth } from '../middleware/auth';

- router.use('/api/v1', apiRouter);
+ router.use('/api/v1', requireAuth, apiRouter);
```

> TECH DEBT FLAGGED: `src/routes/api.ts:14` — Route file mounts all sub-routers inline.
> Consider splitting into domain-specific router files (e.g., `routes/users.ts`, `routes/orders.ts`)
> as the API grows. [Do not fix now — logged for next cleanup pass.]
>
> Decision logged to DECISIONS.md (change affects 3 files, alters request data flow).

---

## What this example demonstrates

| Rule | Where it fired |
|------|----------------|
| Re-injection Rule | Session opened with architecture restatement |
| Re-injection Fallback | No architecture doc found — fell back to last 3 dependencies |
| Think Before Coding | Execution plan written before any code |
| Human Checkpoint | `[AWAITING CONFIRMATION]` issued at >2-file change |
| Blast Radius Check | Defined before touching existing route file |
| Zero-Trust Secrets | `JWT_SECRET` read from `process.env`, hard failure if missing |
| Patch-First Editing | `api.ts` change delivered as a diff, not a full rewrite |
| Tech Debt Flagged | Inline router mounting noted in correct format |
| Decision Log | Multi-file + data flow change triggers DECISIONS.md entry |
| Anchor Check (Pre-Flight) | Verifiable manifest prepended before code output |
