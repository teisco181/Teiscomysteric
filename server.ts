import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthUser, CaseFile, MapTemplate, PlayerNote } from './src/types.ts';
import {
  claimAdminAccount,
  createCase,
  createMapTemplate,
  deleteCase,
  deleteMapTemplate,
  getAuthStatus,
  getCaseForUser,
  getPlayerNote,
  listCasesForUser,
  listMapTemplates,
  loginUser,
  redeemCaseCode,
  registerPlayerAccount,
  savePlayerNote,
  updateCase,
  updateMapTemplate,
  verifyAuthToken,
} from './server/store.ts';

interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authenticatie vereist.' });
    return;
  }
  const user = verifyAuthToken(token);
  if (!user) {
    res.status(401).json({ error: 'Sessie verlopen of ongeldig.' });
    return;
  }
  req.authUser = user;
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Alleen toegankelijk voor beheerders.' });
    return;
  }
  next();
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Auth routes
  app.get('/api/auth/status', (_req, res) => {
    res.json(getAuthStatus());
  });

  app.post('/api/auth/claim-admin', (req, res) => {
    const body = req.body as { username?: unknown; password?: unknown };
    if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
      res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
      return;
    }
    const result = claimAdminAccount(body.username, body.password);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ user: result.user, token: result.token });
  });

  app.post('/api/auth/register', (req, res) => {
    const body = req.body as { username?: unknown; password?: unknown };
    if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
      res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
      return;
    }
    const result = registerPlayerAccount(body.username, body.password);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.status(201).json({ user: result.user, token: result.token });
  });

  app.post('/api/auth/login', (req, res) => {
    const body = req.body as { username?: unknown; password?: unknown };
    if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
      res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
      return;
    }
    const result = loginUser(body.username, body.password);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ user: result.user, token: result.token });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser });
  });

  // Cases CRUD
  app.get('/api/cases', requireAuth, (req: AuthenticatedRequest, res) => {
    const cases = listCasesForUser(req.authUser!.role, req.authUser!.id);
    res.json({ cases });
  });

  app.post('/api/cases/redeem', requireAuth, (req: AuthenticatedRequest, res) => {
    const body = req.body as { code?: unknown };
    if (typeof body?.code !== 'string') {
      res.status(400).json({ error: 'Dossiercode is verplicht.' });
      return;
    }
    const result = redeemCaseCode(req.authUser!.id, body.code);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      caseFile: result.caseFile,
      alreadyUnlocked: result.alreadyUnlocked,
    });
  });

  app.post('/api/cases', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const payload = (req.body ?? {}) as Partial<CaseFile>;
    const created = createCase(payload);
    res.status(201).json({ caseFile: created });
  });

  app.get('/api/cases/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const found = getCaseForUser(
      req.params.id,
      req.authUser!.role,
      req.authUser!.id
    );
    if (!found) {
      res.status(404).json({ error: 'Dossier niet gevonden.' });
      return;
    }
    res.json({ caseFile: found });
  });

  app.put('/api/cases/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const payload = req.body as CaseFile;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Ongeldige dossiergegevens.' });
      return;
    }
    const updated = updateCase(req.params.id, payload);
    if (!updated) {
      res.status(404).json({ error: 'Dossier niet gevonden.' });
      return;
    }
    res.json({ caseFile: updated });
  });

  app.delete('/api/cases/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const ok = deleteCase(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Dossier niet gevonden.' });
      return;
    }
    res.json({ deleted: true });
  });

  // Player notes (strictly scoped to authenticated user)
  app.get('/api/cases/:id/notes', requireAuth, (req: AuthenticatedRequest, res) => {
    const found = getCaseForUser(
      req.params.id,
      req.authUser!.role,
      req.authUser!.id
    );
    if (!found) {
      res.status(404).json({ error: 'Dossier niet gevonden.' });
      return;
    }
    const note = getPlayerNote(req.params.id, req.authUser!.id);
    res.json({ note });
  });

  app.put('/api/cases/:id/notes', requireAuth, (req: AuthenticatedRequest, res) => {
    const found = getCaseForUser(
      req.params.id,
      req.authUser!.role,
      req.authUser!.id
    );
    if (!found) {
      res.status(404).json({ error: 'Dossier niet gevonden.' });
      return;
    }
    const payload = (req.body ?? {}) as Partial<PlayerNote>;
    const saved = savePlayerNote(req.params.id, req.authUser!.id, payload);
    res.json({ note: saved });
  });

  // Reusable Map Templates (Admin only)
  app.get('/api/maps', requireAuth, requireAdmin, (_req, res) => {
    res.json({ maps: listMapTemplates() });
  });

  app.post('/api/maps', requireAuth, requireAdmin, (req, res) => {
    const payload = (req.body ?? {}) as Partial<MapTemplate>;
    const created = createMapTemplate(payload);
    res.status(201).json({ mapTemplate: created });
  });

  app.put('/api/maps/:id', requireAuth, requireAdmin, (req, res) => {
    const payload = (req.body ?? {}) as Partial<MapTemplate>;
    const updated = updateMapTemplate(req.params.id, payload);
    if (!updated) {
      res.status(404).json({ error: 'Kaart niet gevonden.' });
      return;
    }
    res.json({ mapTemplate: updated });
  });

  app.delete('/api/maps/:id', requireAuth, requireAdmin, (req, res) => {
    const ok = deleteMapTemplate(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Kaart niet gevonden.' });
      return;
    }
    res.json({ deleted: true });
  });

  // Serve frontend via Vite in dev or static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Teiscomysterics server listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Teiscomysterics server:', err);
  process.exit(1);
});
