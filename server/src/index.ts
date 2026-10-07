import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { validatedOpportunityUrl } from './opportunity-url.js';
import { normalizedName, parsePosting } from './quick-add.js';
import { CalendarAuthorizationError, GoogleCalendarApiError, calendarEventBody, decryptToken, deterministicEventId, encryptToken, exchangeAuthorizationCode, googleAuthorizationUrl, googleCalendarConfigured, googleCalendarRequest, refreshGoogleToken, revokeGoogleToken } from './google-calendar.js';
const prisma = new PrismaClient(), app = express(), port = Number(process.env.PORT || 4000), uploadDir = path.resolve(process.env.UPLOAD_DIR || (process.env.NODE_ENV === 'production' ? '/data/uploads' : 'uploads')), scrypt = promisify(scryptCallback);
const documentTypes = ['RESUME', 'COVER_LETTER', 'TRANSCRIPT', 'HEADSHOT', 'WRITING_SAMPLE', 'REFERENCE', 'OTHER'] as const;
const allowedDocumentFiles: Record<string, {
    mimeType: string;
    label: string;
}> = { '.pdf': { mimeType: 'application/pdf', label: 'PDF' }, '.doc': { mimeType: 'application/msword', label: 'DOC' }, '.docx': { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'DOCX' }, '.png': { mimeType: 'image/png', label: 'PNG' }, '.jpg': { mimeType: 'image/jpeg', label: 'JPG' }, '.jpeg': { mimeType: 'image/jpeg', label: 'JPEG' } };
const maxDocumentSize = 10 * 1024 * 1024;
fs.mkdirSync(uploadDir, { recursive: true });
const documentStorage = multer.diskStorage({ destination: (_req, _file, done) => done(null, uploadDir), filename: (_req, file, done) => done(null, `${randomBytes(20).toString('hex')}${path.extname(file.originalname).toLowerCase()}`) });
const upload = multer({ storage: documentStorage, limits: { fileSize: maxDocumentSize, files: 10 }, fileFilter: (req, file, done) => { const extension = path.extname(file.originalname).toLowerCase(); if (!allowedDocumentFiles[extension]) {
        const rejected = ((req as any).rejectedDocuments ||= []);
        rejected.push({ name: path.basename(file.originalname), error: 'Only PDF, DOC, DOCX, PNG, JPG, and JPEG files are supported.' });
        return done(null, false);
    } done(null, true); } });
const uploadDocuments = (req: Request, res: Response, next: NextFunction) => upload.fields([{ name: 'files', maxCount: 10 }, { name: 'file', maxCount: 1 }])(req, res, error => { if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? `Each file must be ${maxDocumentSize / 1024 / 1024} MB or smaller.` : error.code === 'LIMIT_FILE_COUNT' ? 'Upload up to 10 files at a time.' : 'Could not process the selected files.';
    return res.status(400).json({ error: message });
} if (error)
    return next(error); next(); });
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());
type Authed = Request & {
    userId?: string;
};
const publicUser = (u: any) => ({ id: u.id, name: u.name, email: u.email, school: u.school, graduationYear: u.graduationYear, recruitingFor: u.recruitingFor, targetRecruitingYear: u.targetRecruitingYear, targetConsultingTypes: u.targetConsultingTypes || [], onboardingCompleted: u.onboardingCompleted, createdAt: u.createdAt });
const tokenHash = (x: string) => createHash('sha256').update(x).digest('hex');
const hashPassword = async (password: string) => { const salt = randomBytes(16).toString('hex'), derived = await scrypt(password, salt, 64) as Buffer; return `${salt}:${derived.toString('hex')}`; };
const checkPassword = async (password: string, stored: string) => { const [salt, expected] = stored.split(':'); if (!salt || !expected)
    return false; const actual = await scrypt(password, salt, 64) as Buffer, exp = Buffer.from(expected, 'hex'); return actual.length === exp.length && timingSafeEqual(actual, exp); };
const cookie = (r: Request) => Object.fromEntries((r.headers.cookie || '').split(';').filter(Boolean).map(v => { const i = v.indexOf('='); return [v.slice(0, i).trim(), decodeURIComponent(v.slice(i + 1))]; }));
const startSession = async (res: Response, userId: string) => { const token = randomBytes(32).toString('base64url'), expiresAt = new Date(Date.now() + 30 * 864e5); await prisma.session.create({ data: { userId, tokenHash: tokenHash(token), expiresAt } }); res.cookie('consulting_hub_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', expires: expiresAt, path: '/' }); };
const auth = async (req: Authed, res: Response, next: NextFunction) => { try {
    const token = cookie(req).consulting_hub_session;
    if (!token)
        return res.status(401).json({ error: 'Please log in to continue.' });
    const session = await prisma.session.findFirst({ where: { tokenHash: tokenHash(token), expiresAt: { gt: new Date() } } });
    if (!session)
        return res.status(401).json({ error: 'Please log in to continue.' });
    req.userId = session.userId;
    next();
}
catch (e) {
    next(e);
} };
const activity = (userId: string, message: string, entityType?: string, entityId?: string) => prisma.activity.create({ data: { userId, type: 'activity', message, entityType, entityId } });
const owned = (model: any, id: string | string[], userId: string, include?: any) => model.findFirst({ where: { id: Array.isArray(id) ? id[0] : id, userId }, include });
const companyFor = async (name: string, userId: string) => { let x = await prisma.company.findFirst({ where: { name, userId } }); if (!x)
    x = await prisma.company.create({ data: { name, userId } }); return x; };
app.get('/api/health', (_, res) => res.json({ ok: true }));
app.post('/api/auth/register', async (req, res, next) => { try {
    const { name, email, password } = req.body || {}, normalized = String(email || '').trim().toLowerCase();
    if (!String(name || '').trim() || !normalized || !password)
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (!/^\S+@\S+\.\S+$/.test(normalized))
        return res.status(400).json({ error: 'Enter a valid email address.' });
    if (String(password).length < 8)
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (await prisma.user.findUnique({ where: { email: normalized } }))
        return res.status(409).json({ error: 'An account with that email already exists.' });
    const user = await prisma.user.create({ data: { name: String(name).trim(), email: normalized, passwordHash: await hashPassword(password) } });
    await startSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
}
catch (e) {
    next(e);
} });
app.post('/api/auth/login', async (req, res, next) => { try {
    const user = await prisma.user.findUnique({ where: { email: String(req.body?.email || '').trim().toLowerCase() } });
    if (!user || !(await checkPassword(String(req.body?.password || ''), user.passwordHash)))
        return res.status(401).json({ error: 'Invalid email or password.' });
    await startSession(res, user.id);
    res.json({ user: publicUser(user) });
}
catch (e) {
    next(e);
} });
app.post('/api/auth/logout', auth, async (req: Authed, res, next) => { try {
    const token = cookie(req).consulting_hub_session;
    if (token)
        await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    res.clearCookie('consulting_hub_session', { path: '/' }).status(204).end();
}
catch (e) {
    next(e);
} });
app.get('/api/auth/me', auth, async (req: Authed, res, next) => { try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    res.json({ user: publicUser(user) });
}
catch (e) {
    next(e);
} });
app.patch('/api/profile', auth, async (req: Authed, res, next) => { try {
    const b = req.body || {}, types = Array.isArray(b.targetConsultingTypes) ? b.targetConsultingTypes.filter((x: unknown) => typeof x === 'string') : undefined;
    const user = await prisma.user.update({ where: { id: req.userId }, data: { name: b.name?.trim() || undefined, school: b.school?.trim() || null, graduationYear: b.graduationYear ? Number(b.graduationYear) : null, recruitingFor: b.recruitingFor || null, targetRecruitingYear: b.targetRecruitingYear?.trim() || null, targetConsultingTypes: types, onboardingCompleted: b.onboardingCompleted === true ? true : undefined } });
    res.json({ user: publicUser(user) });
}
catch (e) {
    next(e);
} });
app.use('/api', auth);
const plannedInteractionTypes = ['COFFEE_CHAT', 'PHONE_CALL', 'VIDEO_CALL', 'LUNCH', 'OTHER'];
const validTimeZone = (value: string) => { try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
}
catch {
    return false;
} };
const plannedInput = (body: any, current?: any) => {
    const type = body.type === undefined ? current?.type : String(body.type).trim().toUpperCase().replaceAll(' ', '_');
    if (!plannedInteractionTypes.includes(type))
        throw Object.assign(new Error('Choose a valid interaction type.'), { status: 400 });
    const raw = body.scheduledAt === undefined ? current?.scheduledAt : body.scheduledAt;
    if (!raw || !(/(?:Z|[+-]\d{2}:\d{2})$/.test(String(raw))))
        throw Object.assign(new Error('Choose a date and start time with a timezone.'), { status: 400 });
    const scheduledAt = new Date(raw);
    if (Number.isNaN(scheduledAt.getTime()))
        throw Object.assign(new Error('Choose a valid date and start time.'), { status: 400 });
    const timezone = body.timezone === undefined ? (current?.timezone || 'America/Denver') : String(body.timezone);
    if (!validTimeZone(timezone))
        throw Object.assign(new Error('Choose a valid timezone.'), { status: 400 });
    const durationMinutes = body.durationMinutes === undefined ? (current?.durationMinutes || 30) : Number(body.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480)
        throw Object.assign(new Error('Duration must be between 5 and 480 minutes.'), { status: 400 });
    return { type, scheduledAt, timezone, durationMinutes, notes: body.notes === undefined ? current?.notes : (String(body.notes).trim() || null), location: body.location === undefined ? current?.location : (String(body.location).trim() || null) };
};
const calendarAccessToken = async (userId: string) => {
    const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId } });
    if (!connection)
        throw new CalendarAuthorizationError('Connect Google Calendar to sync this interaction.');
    if (connection.accessTokenEncrypted && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() > Date.now() + 60000)
        return decryptToken(connection.accessTokenEncrypted);
    const refreshed = await refreshGoogleToken(decryptToken(connection.refreshTokenEncrypted));
    if (!refreshed.access_token)
        throw new CalendarAuthorizationError('Reconnect Google Calendar to resume syncing.');
    await prisma.googleCalendarConnection.update({ where: { userId }, data: { accessTokenEncrypted: encryptToken(refreshed.access_token), accessTokenExpiresAt: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000) } });
    return String(refreshed.access_token);
};
const syncPlannedInteraction = async (id: string, userId: string) => {
    const planned = await prisma.plannedInteraction.findFirst({ where: { id, userId }, include: { contact: { include: { company: true } } } });
    if (!planned)
        return null;
    if (!planned.addToCalendar)
        return prisma.plannedInteraction.update({ where: { id }, data: { calendarSyncStatus: 'NOT_REQUESTED', calendarSyncError: null } });
    try {
        const accessToken = await calendarAccessToken(userId), eventId = planned.calendarEventId || deterministicEventId(planned.id), body = calendarEventBody(planned, planned.contact, process.env.APP_BASE_URL);
        if (planned.calendarEventId)
            await googleCalendarRequest({ method: 'PATCH', eventId, body, accessToken });
        else
            try {
                await googleCalendarRequest({ method: 'POST', body: { id: eventId, ...body }, accessToken });
            }
            catch (error) {
                if (error instanceof GoogleCalendarApiError && error.status === 409)
                    await googleCalendarRequest({ method: 'PATCH', eventId, body, accessToken });
                else
                    throw error;
            }
        return prisma.plannedInteraction.update({ where: { id }, data: { calendarEventId: eventId, calendarSyncStatus: 'SYNCED', calendarSyncError: null } });
    }
    catch (error) {
        const authorization = error instanceof CalendarAuthorizationError;
        return prisma.plannedInteraction.update({ where: { id }, data: { calendarSyncStatus: authorization ? 'CONNECTION_REQUIRED' : 'ERROR', calendarSyncError: authorization ? 'Reconnect Google Calendar to sync this interaction.' : 'Calendar sync failed. Your interaction is safely saved; retry when ready.' } });
    }
};
const removePlannedCalendarEvent = async (id: string, userId: string) => {
    const planned = await prisma.plannedInteraction.findFirst({ where: { id, userId } });
    if (!planned?.calendarEventId)
        return planned;
    try {
        await googleCalendarRequest({ method: 'DELETE', eventId: planned.calendarEventId, accessToken: await calendarAccessToken(userId) });
        return prisma.plannedInteraction.update({ where: { id }, data: { calendarEventId: null, calendarSyncStatus: 'DELETED', calendarSyncError: null } });
    }
    catch (error) {
        const authorization = error instanceof CalendarAuthorizationError;
        return prisma.plannedInteraction.update({ where: { id }, data: { calendarSyncStatus: authorization ? 'CONNECTION_REQUIRED' : 'ERROR', calendarSyncError: authorization ? 'Reconnect Google Calendar to remove the calendar event.' : 'The Consulting Hub record was updated, but its Google Calendar event could not be removed.' } });
    }
};
const calendarReturnUrl = (req: Request, result: string) => { const base = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, ''); return `${base}/#/settings?calendar=${encodeURIComponent(result)}`; };
app.get('/api/google-calendar/status', async (req: Authed, res, next) => { try {
    const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId: req.userId! }, select: { connectedAt: true, autoAddPlannedInteractions: true } });
    res.json({ configured: googleCalendarConfigured(), connected: !!connection, connectedAt: connection?.connectedAt || null, autoAddPlannedInteractions: connection?.autoAddPlannedInteractions || false });
}
catch (e) {
    next(e);
} });
app.get('/api/google-calendar/connect', async (req: Authed, res, next) => { try {
    if (!googleCalendarConfigured())
        return res.status(503).json({ error: 'Google Calendar is not configured for this environment.' });
    const state = randomBytes(32).toString('base64url');
    await prisma.$transaction([prisma.googleOAuthState.deleteMany({ where: { OR: [{ userId: req.userId! }, { expiresAt: { lte: new Date() } }] } }), prisma.googleOAuthState.create({ data: { userId: req.userId!, stateHash: tokenHash(state), expiresAt: new Date(Date.now() + 10 * 60000) } })]);
    res.redirect(googleAuthorizationUrl(state));
}
catch (e) {
    next(e);
} });
app.get('/api/google-calendar/callback', async (req: Authed, res, next) => { try {
    const state = String(req.query.state || ''), record = state ? await prisma.googleOAuthState.findFirst({ where: { userId: req.userId!, stateHash: tokenHash(state), expiresAt: { gt: new Date() } } }) : null;
    if (!record)
        return res.status(400).json({ error: 'This Google Calendar connection request is invalid or expired.' });
    await prisma.googleOAuthState.delete({ where: { id: record.id } });
    if (req.query.error || !req.query.code)
        return res.redirect(calendarReturnUrl(req, 'canceled'));
    const tokens = await exchangeAuthorizationCode(String(req.query.code)), existing = await prisma.googleCalendarConnection.findUnique({ where: { userId: req.userId! } }), refreshToken = tokens.refresh_token ? String(tokens.refresh_token) : (existing ? decryptToken(existing.refreshTokenEncrypted) : '');
    if (!refreshToken)
        throw new CalendarAuthorizationError('Google did not return offline access. Try connecting again.');
    await prisma.googleCalendarConnection.upsert({ where: { userId: req.userId! }, create: { userId: req.userId!, refreshTokenEncrypted: encryptToken(refreshToken), accessTokenEncrypted: tokens.access_token ? encryptToken(String(tokens.access_token)) : null, accessTokenExpiresAt: tokens.access_token ? new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000) : null }, update: { refreshTokenEncrypted: encryptToken(refreshToken), accessTokenEncrypted: tokens.access_token ? encryptToken(String(tokens.access_token)) : undefined, accessTokenExpiresAt: tokens.access_token ? new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000) : undefined } });
    res.redirect(calendarReturnUrl(req, 'connected'));
}
catch (e) {
    console.error('Google Calendar callback failed.', { reason: e instanceof CalendarAuthorizationError ? 'authorization' : e instanceof GoogleCalendarApiError ? 'upstream' : e instanceof Error ? e.name : 'unknown' });
    res.redirect(calendarReturnUrl(req, 'error'));
} });
app.patch('/api/google-calendar/preferences', async (req: Authed, res, next) => { try {
    const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId: req.userId! } });
    if (!connection)
        return res.status(409).json({ error: 'Connect Google Calendar before changing calendar preferences.' });
    const item = await prisma.googleCalendarConnection.update({ where: { userId: req.userId! }, data: { autoAddPlannedInteractions: !!req.body?.autoAddPlannedInteractions }, select: { connectedAt: true, autoAddPlannedInteractions: true } });
    res.json({ connected: true, ...item });
}
catch (e) {
    next(e);
} });
app.delete('/api/google-calendar/connection', async (req: Authed, res, next) => { try {
    const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId: req.userId! } });
    if (connection) {
        let token = '';
        try {
            token = decryptToken(connection.refreshTokenEncrypted);
        }
        catch { }
        if (token)
            await revokeGoogleToken(token);
        await prisma.googleCalendarConnection.delete({ where: { userId: req.userId! } });
    }
    res.status(204).end();
}
catch (e) {
    next(e);
} });
app.post('/api/contacts/:id/planned-interactions', async (req: Authed, res, next) => { try {
    const userId = req.userId!, contact = await owned(prisma.contact, req.params.id, userId);
    if (!contact)
        return res.status(404).json({ error: 'Contact not found.' });
    const connection = await prisma.googleCalendarConnection.findUnique({ where: { userId }, select: { autoAddPlannedInteractions: true } }), addToCalendar = req.body?.addToCalendar === undefined ? !!connection?.autoAddPlannedInteractions : !!req.body.addToCalendar, item = await prisma.plannedInteraction.create({ data: { userId, contactId: contact.id, ...plannedInput(req.body), addToCalendar, calendarSyncStatus: addToCalendar ? 'PENDING' : 'NOT_REQUESTED' } }), synced = addToCalendar ? await syncPlannedInteraction(item.id, userId) : item;
    await activity(userId, `Planned ${item.type} with ${contact.firstName} ${contact.lastName}`, 'plannedInteraction', item.id);
    res.status(201).json(synced);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to plan this interaction.' });
} });
app.get('/api/planned-interactions/:id', async (req: Authed, res, next) => { try {
    const item = await prisma.plannedInteraction.findFirst({ where: { id: String(req.params.id), userId: req.userId }, include: { contact: { include: { company: true } }, completedInteraction: true } });
    if (!item)
        return res.status(404).json({ error: 'Planned interaction not found.' });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.patch('/api/planned-interactions/:id', async (req: Authed, res, next) => { try {
    const userId = req.userId!, current = await owned(prisma.plannedInteraction, req.params.id, userId);
    if (!current)
        return res.status(404).json({ error: 'Planned interaction not found.' });
    if (current.status !== 'SCHEDULED')
        return res.status(409).json({ error: 'Only upcoming interactions can be edited.' });
    const addToCalendar = req.body?.addToCalendar === undefined ? current.addToCalendar : !!req.body.addToCalendar, item = await prisma.plannedInteraction.update({ where: { id: current.id }, data: { ...plannedInput(req.body, current), addToCalendar, calendarSyncStatus: addToCalendar ? 'PENDING' : 'NOT_REQUESTED', calendarSyncError: null } });
    let result = item;
    if (addToCalendar)
        result = (await syncPlannedInteraction(item.id, userId)) || item;
    else if (current.calendarEventId)
        result = (await removePlannedCalendarEvent(item.id, userId)) || item;
    res.json(result);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to update this interaction.' });
} });
app.post('/api/planned-interactions/:id/retry-calendar', async (req: Authed, res, next) => { try {
    const item = await owned(prisma.plannedInteraction, req.params.id, req.userId!);
    if (!item)
        return res.status(404).json({ error: 'Planned interaction not found.' });
    const result = item.status === 'CANCELED' ? await removePlannedCalendarEvent(item.id, req.userId!) : await syncPlannedInteraction(item.id, req.userId!);
    res.json(result);
}
catch (e) {
    next(e);
} });
app.post('/api/planned-interactions/:id/cancel', async (req: Authed, res, next) => { try {
    const item = await owned(prisma.plannedInteraction, req.params.id, req.userId!);
    if (!item)
        return res.status(404).json({ error: 'Planned interaction not found.' });
    if (item.status === 'COMPLETED')
        return res.status(409).json({ error: 'Completed interactions remain in relationship history.' });
    let updated = await prisma.plannedInteraction.update({ where: { id: item.id }, data: { status: 'CANCELED' } });
    if (item.calendarEventId)
        updated = (await removePlannedCalendarEvent(item.id, req.userId!)) || updated;
    res.json(updated);
}
catch (e) {
    next(e);
} });
app.post('/api/planned-interactions/:id/complete', async (req: Authed, res, next) => { try {
    const userId = req.userId!, planned = await prisma.plannedInteraction.findFirst({ where: { id: String(req.params.id), userId }, include: { contact: true } });
    if (!planned)
        return res.status(404).json({ error: 'Planned interaction not found.' });
    if (planned.status !== 'SCHEDULED')
        return res.status(409).json({ error: planned.status === 'COMPLETED' ? 'This interaction is already in relationship history.' : 'Canceled interactions cannot be completed.' });
    const followUpDate = req.body?.followUpDate ? interactionDate(req.body.followUpDate, 'follow-up') : null, result = await prisma.$transaction(async (tx) => { const claimed = await tx.plannedInteraction.updateMany({ where: { id: planned.id, userId, status: 'SCHEDULED' }, data: { status: 'COMPLETING' } }); if (claimed.count !== 1)
        throw Object.assign(new Error('This interaction was already completed.'), { status: 409 }); await tx.contact.update({ where: { id: planned.contactId }, data: { updatedAt: new Date() } }); let followUpTaskId: string | undefined; if (followUpDate) {
        const existing = await tx.task.findFirst({ where: { userId, contactId: planned.contactId, status: { not: 'COMPLETED' }, taskType: 'FOLLOW_UP' }, orderBy: { createdAt: 'desc' } }), taskData = { dueDate: followUpDate, taskType: 'FOLLOW_UP', title: `Follow up with ${[planned.contact.firstName, planned.contact.lastName].filter(Boolean).join(' ')}` };
        followUpTaskId = existing ? (await tx.task.update({ where: { id: existing.id }, data: taskData })).id : (await tx.task.create({ data: { ...taskData, userId, contactId: planned.contactId, companyId: planned.contact.companyId, priority: 'MEDIUM' } })).id;
    } const interaction = await tx.interaction.create({ data: { userId, contactId: planned.contactId, date: planned.scheduledAt, type: planned.type, summary: String(req.body?.summary || '').trim(), notes: String(req.body?.notes ?? planned.notes ?? '').trim() || null, followUpNeeded: !!followUpDate, followUpDate, followUpTaskId } }); const latest = await tx.interaction.findFirst({ where: { userId, contactId: planned.contactId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }); await tx.contact.update({ where: { id: planned.contactId }, data: { lastContactDate: latest?.date || null, ...(followUpDate ? { nextFollowUpDate: followUpDate } : {}) } }); const completed = await tx.plannedInteraction.update({ where: { id: planned.id }, data: { status: 'COMPLETED', completedInteractionId: interaction.id } }); return { plannedInteraction: completed, interaction }; });
    await activity(userId, `Completed ${planned.type} with ${planned.contact.firstName} ${planned.contact.lastName}`, 'interaction', result.interaction.id);
    res.status(201).json(result);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to complete this interaction.' });
} });
app.use('/api/opportunities', async (req: Authed, _res, next) => { try {
    if (req.method === 'POST') {
        req.body = req.body || {};
        req.body.practiceArea ||= 'General Consulting';
        req.body.location ||= 'Unspecified';
        req.body.source ||= 'Manual';
        if (!req.body.companyId && req.body.company) {
            const company = await prisma.company.findFirst({ where: { userId: req.userId, name: String(req.body.company) } });
            if (company)
                req.body.companyId = company.id;
        }
    }
    next();
}
catch (e) {
    next(e);
} });
// Opportunity detail reads every related collection through the authenticated owner.
app.get('/api/opportunities/:id', async (req: Authed, res, next) => {
    try {
        const userId = req.userId!, id = String(req.params.id), item = await owned(prisma.opportunity, id, userId);
        if (!item)
            return res.status(404).json({ error: 'Opportunity not found.' });
        const applications = await prisma.application.findMany({ where: { userId, opportunityId: id }, include: { resume: true, coverLetter: true, transcript: true } });
        for (const application of applications)
            for (const key of ['resume', 'coverLetter', 'transcript'] as const)
                if (application[key]?.userId !== userId)
                    application[key] = null;
        const contactIds = [item.networkingContactId, ...applications.flatMap(a => [a.referralContactId, a.recruiterContactId])].filter((x): x is string => !!x);
        const applicationIds = applications.map(a => a.id);
        const interviews = await prisma.interview.findMany({ where: { userId, applicationId: { in: applicationIds } }, orderBy: { date: 'asc' } });
        const [company, office, contacts, tasks, availableContacts] = await Promise.all([
            owned(prisma.company, item.companyId, userId), item.officeId ? owned(prisma.office, item.officeId, userId) : null,
            prisma.contact.findMany({ where: { userId, id: { in: contactIds } }, include: { interactions: { where: { userId }, orderBy: { date: 'desc' }, take: 1 } } }),
            prisma.task.findMany({ where: { userId, OR: [{ opportunityId: id }, { applicationId: { in: applicationIds } }, { interviewId: { in: interviews.map(i => i.id) } }, { contactId: { in: contactIds } }] }, orderBy: { dueDate: 'asc' } }),
            prisma.contact.findMany({ where: { userId, companyId: item.companyId }, select: { id: true, firstName: true, lastName: true, title: true } })
        ]);
        res.json({ ...item, company, office, applications, contacts, tasks, interviews, availableContacts });
    }
    catch (e) {
        next(e);
    }
});
app.patch('/api/opportunities/:id/details', async (req: Authed, res, next) => {
    try {
        const item = await owned(prisma.opportunity, req.params.id, req.userId!);
        if (!item)
            return res.status(404).json({ error: 'Opportunity not found.' });
        const b = req.body || {}, jobUrl = validatedOpportunityUrl(b.jobUrl), applicationPortalUrl = validatedOpportunityUrl(b.applicationPortalUrl);
        if (b.roleTitle !== undefined && !String(b.roleTitle).trim())
            return res.status(400).json({ error: 'Role title is required.' });
        if (b.priority !== undefined && !['HIGH', 'MEDIUM', 'LOW'].includes(String(b.priority)))
            return res.status(400).json({ error: 'Choose a valid priority.' });
        if (b.employmentType !== undefined && b.employmentType && !['INTERNSHIP', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'OTHER'].includes(String(b.employmentType)))
            return res.status(400).json({ error: 'Choose a valid employment type.' });
        const applicationDeadline = b.applicationDeadline === undefined ? undefined : b.applicationDeadline ? new Date(`${String(b.applicationDeadline).slice(0, 10)}T12:00:00.000Z`) : null;
        if (applicationDeadline instanceof Date && Number.isNaN(applicationDeadline.getTime()))
            return res.status(400).json({ error: 'Enter a valid application deadline.' });
        const updated = await prisma.$transaction(async (tx) => {
            if (applicationPortalUrl !== undefined)
                await tx.application.updateMany({ where: { userId: req.userId, opportunityId: item.id }, data: { applicationPortalUrl } });
            return tx.opportunity.update({ where: { id: item.id }, data: {
                jobUrl,
                roleTitle: b.roleTitle === undefined ? undefined : String(b.roleTitle).trim(),
                practiceArea: b.practiceArea === undefined ? undefined : String(b.practiceArea).trim() || 'General Consulting',
                location: b.location === undefined ? undefined : String(b.location).trim() || 'Unspecified',
                employmentType: b.employmentType === undefined ? undefined : b.employmentType || null,
                recruitingSeason: b.recruitingSeason === undefined ? undefined : String(b.recruitingSeason).trim() || null,
                applicationDeadline,
                priority: b.priority === undefined ? undefined : String(b.priority),
                notes: b.notes === undefined ? undefined : String(b.notes),
                source: b.source === undefined ? undefined : String(b.source)
            } });
        });
        res.json(updated);
    }
    catch (e: any) {
        res.status(e.status || 500).json({ error: e.message || 'Unable to update opportunity.' });
    }
});
app.use('/api', (req: Authed, res, next) => { try {
    if (['POST', 'PATCH'].includes(req.method) && req.body) {
        for (const key of ['jobUrl', 'applicationPortalUrl', 'careersUrl'])
            if (req.body[key] !== undefined)
                req.body[key] = validatedOpportunityUrl(req.body[key]);
    }
    next();
}
catch (e: any) {
    res.status(400).json({ error: e.message });
} });
const pipelineApplicationInclude = { opportunity: { include: { company: true, office: true, networkingContact: true } }, resume: true, coverLetter: true, transcript: true, referralContact: true, recruiterContact: true, interviews: true, tasks: true };
const pipelineOpportunityInclude = { company: true, office: true, networkingContact: true, applications: { include: { resume: true, coverLetter: true, transcript: true } } };
const applicationDocument = async (userId: string, id: any, type: string) => { if (id === undefined || id === null || id === '')
    return null; const doc = await prisma.document.findFirst({ where: { id: String(id), userId, type } }); if (!doc)
    throw Object.assign(new Error(`Select a ${type.replace('_', ' ').toLowerCase()} document from your account.`), { status: 400 }); return doc; };
const selectedApplicationDocuments = async (userId: string, body: any, useDefaultResume: boolean) => { const resumeId = body?.resumeId; if (resumeId === undefined && useDefaultResume) {
    const defaultResume = await prisma.document.findFirst({ where: { userId, type: 'RESUME', isDefault: true } });
    return { resumeId: defaultResume?.id ?? null, coverLetterId: (await applicationDocument(userId, body?.coverLetterId, 'COVER_LETTER'))?.id ?? null, transcriptId: (await applicationDocument(userId, body?.transcriptId, 'TRANSCRIPT'))?.id ?? null };
} return { resumeId: (await applicationDocument(userId, resumeId, 'RESUME'))?.id ?? null, coverLetterId: (await applicationDocument(userId, body?.coverLetterId, 'COVER_LETTER'))?.id ?? null, transcriptId: (await applicationDocument(userId, body?.transcriptId, 'TRANSCRIPT'))?.id ?? null }; };
const opportunityStages = ['TARGET', 'NETWORKING', 'READY_TO_APPLY', 'CLOSED'];
const pipelineApplicationStages = ['PREPARING_APPLICATION', 'APPLIED', 'ASSESSMENT', 'FIRST_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'];
const taskInclude = { company: true, contact: true, opportunity: { include: { company: true, office: true } }, application: { include: { opportunity: { include: { company: true, office: true } } } }, interview: true };
const taskLinks = async (body: any, userId: string, current?: any) => { const link = async (model: any, key: string, label: string) => { if (body?.[key] === undefined)
    return current ? current[key] : undefined; if (!body[key])
    return null; const record = await owned(model, String(body[key]), userId); if (!record)
    throw Object.assign(new Error(`Choose a ${label} from your account.`), { status: 400 }); return record.id; }; return { companyId: await link(prisma.company, 'companyId', 'firm'), contactId: await link(prisma.contact, 'contactId', 'contact'), opportunityId: await link(prisma.opportunity, 'opportunityId', 'opportunity'), applicationId: await link(prisma.application, 'applicationId', 'application'), interviewId: await link(prisma.interview, 'interviewId', 'interview') }; };
const taskData = async (body: any, userId: string, current?: any) => { const links = await taskLinks(body, userId, current), completed = body?.completed === undefined ? undefined : !!body.completed, status = completed === undefined ? (body?.status === undefined ? current?.status : body.status) : (completed ? 'COMPLETED' : 'NOT_STARTED'), isCompleted = status === 'COMPLETED'; return { title: body?.title === undefined ? current?.title : String(body.title).trim(), description: body?.description === undefined ? current?.description : (body.description || null), dueDate: body?.dueDate === undefined ? current?.dueDate : (body.dueDate ? new Date(body.dueDate) : null), priority: body?.priority === undefined ? current?.priority : (body.priority || 'MEDIUM'), taskType: body?.taskType === undefined ? current?.taskType : (body.taskType || 'GENERAL'), status, completedAt: isCompleted ? (current?.completedAt || new Date()) : null, ...links }; };
const startOfToday = (timeZone = process.env.RECRUITING_TIME_ZONE || 'America/Denver') => { const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()), part = (type: string) => parts.find(x => x.type === type)?.value || ''; return new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`); };
const dashboardAction = (kind: string, id: string, title: string, dueDate?: Date | null, detail?: string) => ({ kind, id, title, dueDate, detail });
const interviewRounds = ['RECRUITER_SCREEN', 'ASSESSMENT', 'FIRST_ROUND', 'FINAL_ROUND', 'OTHER'];
const interviewFormats = ['VIRTUAL', 'PHONE', 'IN_PERSON', 'ASSESSMENT', 'OTHER'];
const interviewOutcomes = ['PENDING', 'ADVANCED', 'REJECTED', 'WITHDRAWN', 'OFFER', 'OTHER'];
const interviewTaskInclude = { id: true, title: true, status: true, dueDate: true, priority: true, taskType: true, completedAt: true };
const queueAction = (kind: string, id: string, title: string, detail: string, options: {
    dueDate?: Date | null;
    timezone?: string;
    urgency: string;
    urgencyLabel: string;
    typeLabel: string;
}) => ({ kind, id, title, detail, dueDate: options.dueDate || null, timezone: options.timezone || null, urgency: options.urgency, urgencyLabel: options.urgencyLabel, typeLabel: options.typeLabel });
const queueDateKey = (date?: Date | null) => date ? date.toISOString().slice(0, 10) : '';
// One authoritative dashboard handler keeps action queues and pipeline counts consistent.
app.get('/api/dashboard', async (req: Authed, res, next) => {
    try {
        const userId = req.userId!, today = startOfToday(), tomorrow = new Date(today), soon = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        soon.setDate(soon.getDate() + 7);
        // Expiration follows the browser's local calendar without changing task/interview timing.
        const expirationZone = typeof req.query.timeZone === 'string' && isTimezone(req.query.timeZone) ? req.query.timeZone : undefined;
        const opportunityToday = startOfToday(expirationZone), opportunitySoon = new Date(opportunityToday);
        opportunitySoon.setUTCDate(opportunitySoon.getUTCDate() + 8);
        const [openTasks, followUps, deadlines, ready, assessments, interviews, awaitingOutcome, priorityFirms, recentNetworking, opportunities, applications] = await Promise.all([
            prisma.task.findMany({ where: { userId, status: { not: 'COMPLETED' }, dueDate: { not: null } }, include: taskInclude, orderBy: { dueDate: 'asc' } }),
            prisma.contact.findMany({ where: { userId, nextFollowUpDate: { not: null, lte: soon } }, include: { company: true, office: true }, orderBy: { nextFollowUpDate: 'asc' } }),
            prisma.opportunity.findMany({ where: { userId, applicationDeadline: { gte: opportunityToday, lt: opportunitySoon }, status: { not: 'CLOSED' }, applications: {none:{currentStage:{not:'PREPARING_APPLICATION'}}} }, include: { company: true, office: true }, orderBy: { applicationDeadline: 'asc' } }),
            prisma.opportunity.findMany({ where: { userId, status: 'READY_TO_APPLY', applications: { none: {} }, OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: opportunityToday } }] }, include: { company: true, office: true }, orderBy: { applicationDeadline: 'asc' } }),
            prisma.application.findMany({ where: { userId, currentStage: 'ASSESSMENT' }, include: pipelineApplicationInclude }),
            prisma.interview.findMany({ where: { userId, archivedAt: null, completedAt: null, date: { gte: today, lte: soon } }, include: interviewInclude, orderBy: { date: 'asc' } }),
            prisma.interview.findMany({ where: { userId, archivedAt: null, completedAt: { not: null }, outcome: 'PENDING' }, include: interviewInclude, orderBy: { completedAt: 'desc' } }),
            prisma.company.findMany({ where: { userId, priority: 'HIGH', contacts: { none: {} } }, orderBy: { name: 'asc' } }),
            prisma.activity.findMany({ where: { userId, entityType: { in: ['contact', 'interaction'] } }, orderBy: { createdAt: 'desc' }, take: 5 }),
            prisma.opportunity.findMany({ where: { userId, status: { not: 'CLOSED' }, OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: opportunityToday } }] }, select: { status: true, applications:{select:{currentStage:true}} } }),
            prisma.application.findMany({ where: { userId }, select: { currentStage: true } })
        ]);
        const overdueTasks = openTasks.filter(x => x.dueDate! < today), todayTasks = openTasks.filter(x => x.dueDate! >= today && x.dueDate! < tomorrow), upcomingTasks = openTasks.filter(x => x.dueDate! >= tomorrow && x.dueDate! <= soon), overdueFollowUps = followUps.filter(x => x.nextFollowUpDate! < today), todayFollowUps = followUps.filter(x => x.nextFollowUpDate! >= today && x.nextFollowUpDate! < tomorrow), imminentDeadlines = deadlines, todayInterviews = interviews.filter(x => x.date < tomorrow), upcomingInterviews = interviews.filter(x => x.date >= tomorrow);
        const generatedFollowUpKeys = new Set(openTasks.filter(x => x.contactId && /^follow up with /i.test(x.title)).map(x => `${x.contactId}:${queueDateKey(x.dueDate)}`));
        const actionCandidates = [
            ...overdueTasks.map(x => queueAction('task', x.id, x.title, x.company?.name || (`${x.contact?.firstName || ''} ${x.contact?.lastName || ''}`.trim() || 'Recruiting task'), { dueDate: x.dueDate, urgency: 'overdue', urgencyLabel: 'Overdue', typeLabel: 'TASK' })),
            ...overdueFollowUps.filter(x => !generatedFollowUpKeys.has(`${x.id}:${queueDateKey(x.nextFollowUpDate)}`)).map(x => queueAction('contact', x.id, `Follow up with ${x.firstName} ${x.lastName}`, x.company?.name || 'Networking follow-up', { dueDate: x.nextFollowUpDate, urgency: 'overdue', urgencyLabel: 'Overdue', typeLabel: 'FOLLOW-UP' })),
            ...todayTasks.map(x => queueAction('task', x.id, x.title, x.company?.name || (`${x.contact?.firstName || ''} ${x.contact?.lastName || ''}`.trim() || 'Recruiting task'), { dueDate: x.dueDate, urgency: 'today', urgencyLabel: 'Today', typeLabel: 'TASK' })),
            ...todayFollowUps.filter(x => !generatedFollowUpKeys.has(`${x.id}:${queueDateKey(x.nextFollowUpDate)}`)).map(x => queueAction('contact', x.id, `Follow up with ${x.firstName} ${x.lastName}`, x.company?.name || 'Networking follow-up', { dueDate: x.nextFollowUpDate, urgency: 'today', urgencyLabel: 'Today', typeLabel: 'FOLLOW-UP' })),
            ...todayInterviews.map(x => queueAction('interview', x.id, `Attend ${x.application.opportunity.company.name} ${x.interviewRound.replaceAll('_', ' ').toLowerCase()}`, x.application.opportunity.roleTitle, { dueDate: x.date, timezone: x.timezone, urgency: 'today', urgencyLabel: 'Today', typeLabel: 'INTERVIEW' })),
            ...imminentDeadlines.map(x => queueAction('opportunity', x.id, `Apply to ${x.company.name}`, x.roleTitle, { dueDate: x.applicationDeadline, urgency: 'soon', urgencyLabel: 'Deadline soon', typeLabel: 'DEADLINE' })),
            ...followUps.filter(x => x.nextFollowUpDate! >= tomorrow && !generatedFollowUpKeys.has(`${x.id}:${queueDateKey(x.nextFollowUpDate)}`)).map(x => queueAction('contact', x.id, `Follow up with ${x.firstName} ${x.lastName}`, x.company?.name || 'Networking follow-up', { dueDate: x.nextFollowUpDate, urgency: 'soon', urgencyLabel: 'Follow-up soon', typeLabel: 'FOLLOW-UP' })),
            ...assessments.map(x => queueAction('application', x.id, `Complete ${x.opportunity.company.name} assessment`, x.opportunity.roleTitle, { urgency: 'upcoming', urgencyLabel: 'Assessment', typeLabel: 'APPLICATION' })),
            ...upcomingTasks.map(x => queueAction('task', x.id, x.title, x.company?.name || (`${x.contact?.firstName || ''} ${x.contact?.lastName || ''}`.trim() || 'Recruiting task'), { dueDate: x.dueDate, urgency: x.contactId && /^follow up with /i.test(x.title) ? 'soon' : 'upcoming', urgencyLabel: x.contactId && /^follow up with /i.test(x.title) ? 'Follow-up soon' : 'Upcoming', typeLabel: x.taskType === 'FOLLOW_UP' ? 'FOLLOW-UP' : 'TASK' })),
            ...upcomingInterviews.map(x => queueAction('interview', x.id, `Prepare for ${x.application.opportunity.company.name} ${x.interviewRound.replaceAll('_', ' ').toLowerCase()}`, x.application.opportunity.roleTitle, { dueDate: x.date, timezone: x.timezone, urgency: 'upcoming', urgencyLabel: 'Interview upcoming', typeLabel: 'INTERVIEW' })),
            ...awaitingOutcome.map(x => queueAction('interview', x.id, `Record ${x.application.opportunity.company.name} interview outcome`, x.application.opportunity.roleTitle, { dueDate: x.completedAt, timezone: x.timezone, urgency: 'upcoming', urgencyLabel: 'Outcome needed', typeLabel: 'INTERVIEW' })),
            ...ready.map(x => queueAction('opportunity', x.id, `Start ${x.company.name} application`, x.roleTitle, { dueDate: x.applicationDeadline, urgency: 'upcoming', urgencyLabel: 'Ready to apply', typeLabel: 'OPPORTUNITY' }))
        ];
        const priority: Record<string, number> = { overdue: 0, today: 1, soon: 2, upcoming: 3 };
        const seen = new Set<string>(), todayActions = actionCandidates.filter(x => { const key = `${x.kind}:${x.id}`; if (seen.has(key))
            return false; seen.add(key); return true; }).sort((a, b) => priority[a.urgency] - priority[b.urgency] || ((a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER) - (b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER)));
        const pipeline = { target: opportunities.filter(x => !x.applications.length && x.status === 'TARGET').length, networking: opportunities.filter(x => !x.applications.length && x.status === 'NETWORKING').length, readyToApply: opportunities.filter(x => !x.applications.length && x.status === 'READY_TO_APPLY').length, applied: applications.filter(x => x.currentStage === 'APPLIED').length, interviewing: applications.filter(x => ['FIRST_ROUND', 'FINAL_ROUND'].includes(x.currentStage)).length, offers: applications.filter(x => x.currentStage === 'OFFER').length };
        res.json({ todayActions, needsAttention: todayActions, taskBuckets: { overdue: overdueTasks, today: todayTasks, upcoming: upcomingTasks }, followUps, deadlines, readyToApply: ready, assessments, interviews, interviewBuckets: { today: todayInterviews, tomorrow: interviews.filter(x => x.date >= tomorrow && x.date < new Date(tomorrow.getTime() + 864e5)), upcoming: interviews.filter(x => x.date >= new Date(tomorrow.getTime() + 864e5)) }, awaitingOutcome, interviewPrepTasks: openTasks.filter(x => x.interviewId && x.dueDate! < today), priorityFirmsWithoutContacts: priorityFirms, pipeline, networkingHealth: { contactsDue: followUps.length, overdueFollowUps: overdueFollowUps.length, highPriorityFirmsWithoutContacts: priorityFirms.length, recentActivity: recentNetworking }, metrics: { ops: opportunities.length, apps: applications.filter(x => x.currentStage !== 'PREPARING_APPLICATION').length, interviews: interviews.length, offers: pipeline.offers }, funnel: Object.entries(pipeline).map(([stage, count]) => ({ stage, count })), tasks: openTasks, activities: recentNetworking });
    }
    catch (e) {
        next(e);
    }
});
const interviewInclude = { interviewerContact: true, tasks: { select: interviewTaskInclude, orderBy: { dueDate: 'asc' } as const }, application: { include: { opportunity: { include: { company: true, office: true } } } } };
const isTimezone = (value: string) => { try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
}
catch {
    return false;
} };
const scheduledInstant = (value: any, current?: Date) => { if (value === undefined)
    return current; if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value))
    throw Object.assign(new Error('Send scheduledAt as an ISO date-time with an offset and timezone.'), { status: 400 }); const parsed = new Date(value); if (Number.isNaN(parsed.getTime()))
    throw Object.assign(new Error('Enter a valid scheduled date and time.'), { status: 400 }); return parsed; };
const interviewData = async (body: any, userId: string, current?: any) => { const applicationId = body?.applicationId === undefined ? current?.applicationId : String(body.applicationId || ''); const application = await owned(prisma.application, applicationId, userId); if (!application)
    throw Object.assign(new Error('Choose an application from your account.'), { status: 400 }); const interviewerContactId = body?.interviewerContactId === undefined ? current?.interviewerContactId : (body.interviewerContactId ? String(body.interviewerContactId) : null); if (interviewerContactId && !await owned(prisma.contact, interviewerContactId, userId))
    throw Object.assign(new Error('Choose an interviewer contact from your account.'), { status: 400 }); const timezone = body?.timezone === undefined ? (current?.timezone || process.env.RECRUITING_TIME_ZONE || 'America/Denver') : String(body.timezone); if (!isTimezone(timezone))
    throw Object.assign(new Error('Choose a valid IANA timezone.'), { status: 400 }); const interviewRound = body?.interviewRound === undefined ? current?.interviewRound : String(body.interviewRound); const interviewType = body?.interviewType === undefined ? current?.interviewType : String(body.interviewType); const outcome = body?.outcome === undefined ? (current?.outcome || 'PENDING') : String(body.outcome); if (!interviewRounds.includes(interviewRound) || !interviewFormats.includes(interviewType) || !interviewOutcomes.includes(outcome))
    throw Object.assign(new Error('Choose a valid round, format, and outcome.'), { status: 400 }); const completed = body?.completed === undefined ? undefined : !!body.completed; return { applicationId: application.id, date: scheduledInstant(body?.scheduledAt ?? body?.date, current?.date), timezone, interviewRound, interviewType, interviewer: body?.interviewer === undefined ? current?.interviewer : (String(body.interviewer || '').trim() || null), interviewerContactId, location: body?.location === undefined ? current?.location : (String(body.location || '').trim() || null), meetingLink: body?.meetingLink === undefined ? current?.meetingLink : (String(body.meetingLink || '').trim() || null), caseType: body?.caseType === undefined ? current?.caseType : (String(body.caseType || '').trim() || null), behavioralTopics: body?.behavioralTopics === undefined ? current?.behavioralTopics : (String(body.behavioralTopics || '').trim() || null), notes: body?.notes === undefined ? current?.notes : (String(body.notes || '').trim() || null), preparationNotes: body?.preparationNotes === undefined ? current?.preparationNotes : (String(body.preparationNotes || '').trim() || null), outcome, completedAt: completed === undefined ? current?.completedAt : (completed ? (current?.completedAt || new Date()) : null), archivedAt: body?.archived === undefined ? current?.archivedAt : (body.archived ? (current?.archivedAt || new Date()) : null) }; };
// Native selects submit their human-readable option labels; accept those while
// persisting the canonical enum values used by the pipeline and API.
app.use('/api/interviews', (req: Authed, _res, next) => { if (['POST', 'PATCH'].includes(req.method) && req.body)
    for (const key of ['interviewRound', 'interviewType', 'outcome'])
        if (typeof req.body[key] === 'string')
            req.body[key] = req.body[key].trim().toUpperCase().replaceAll(' ', '_'); next(); });
app.use('/api/contacts', (req: Authed, _res, next) => { if (['POST', 'PATCH'].includes(req.method) && req.body)
    for (const key of ['source', 'networkingStage', 'referralStatus'])
        if (typeof req.body[key] === 'string')
            req.body[key] = req.body[key].trim().toUpperCase().replaceAll(' ', '_'); next(); });
app.use('/api', (req: Authed, _res, next) => { if (['POST', 'PATCH'].includes(req.method) && req.body)
    for (const key of ['nextFollowUpDate', 'followUpDate', 'applicationDeadline', 'dueDate'])
        if (typeof req.body[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body[key]))
            req.body[key] = `${req.body[key]}T12:00:00`; next(); });
app.get('/api/interviews', async (req: Authed, res, next) => { try {
    const includeArchived = String(req.query.archived || '') === 'true';
    res.json(await prisma.interview.findMany({ where: { userId: req.userId, ...(includeArchived ? {} : { archivedAt: null }) }, include: interviewInclude, orderBy: { date: 'asc' } }));
}
catch (e) {
    next(e);
} });
app.post('/api/interviews', async (req: Authed, res, next) => { try {
    const userId = req.userId!, data: any = await interviewData(req.body, userId);
    if (!data.date)
        return res.status(400).json({ error: 'A scheduled date and time is required.' });
    const item = await prisma.interview.create({ data: { userId, ...data }, include: interviewInclude });
    await activity(userId, `Scheduled ${item.interviewRound.replaceAll('_', ' ')} at ${item.application.opportunity.company.name}`, 'interview', item.id);
    res.status(201).json(item);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to schedule interview.' });
} });
app.get('/api/interviews/:id', async (req: Authed, res, next) => { try {
    const item = await prisma.interview.findFirst({ where: { id: String(req.params.id), userId: req.userId }, include: interviewInclude });
    if (!item)
        return res.status(404).json({ error: 'Interview not found.' });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.patch('/api/interviews/:id', async (req: Authed, res, next) => { try {
    const current = await prisma.interview.findFirst({ where: { id: String(req.params.id), userId: req.userId } });
    if (!current)
        return res.status(404).json({ error: 'Interview not found.' });
    const data: any = await interviewData(req.body, req.userId!, current);
    const item = await prisma.interview.update({ where: { id: current.id }, data, include: interviewInclude });
    if (current.date.getTime() !== item.date.getTime())
        await activity(req.userId!, `Rescheduled ${item.interviewRound.replaceAll('_', ' ')} at ${item.application.opportunity.company.name}`, 'interview', item.id);
    res.json(item);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to update interview.' });
} });
app.delete('/api/interviews/:id', async (req: Authed, res, next) => { try {
    const item = await owned(prisma.interview, req.params.id, req.userId!);
    if (!item)
        return res.status(404).json({ error: 'Interview not found.' });
    await prisma.interview.delete({ where: { id: item.id } });
    res.status(204).end();
}
catch (e) {
    next(e);
} });
// A completed interview is surfaced only in the outcome-follow-up collection,
// never again as an upcoming calendar item or duplicate urgent action.
app.use('/api/dashboard', (req, res, next) => { if (req.method !== 'GET')
    return next(); const send = res.json.bind(res); res.json = ((payload: any) => { if (payload?.interviews) {
    const active = payload.interviews.filter((item: any) => !item.completedAt);
    const activeIds = new Set(active.map((item: any) => item.id));
    payload.interviews = active;
    payload.interviewBuckets = { today: (payload.interviewBuckets?.today || []).filter((item: any) => activeIds.has(item.id)), tomorrow: (payload.interviewBuckets?.tomorrow || []).filter((item: any) => activeIds.has(item.id)), upcoming: (payload.interviewBuckets?.upcoming || []).filter((item: any) => activeIds.has(item.id)) };
    payload.needsAttention = (payload.needsAttention || []).filter((item: any) => item.kind !== 'interview' || activeIds.has(item.id));
    if (payload.metrics)
        payload.metrics.interviews = active.length;
} return send(payload); }) as any; next(); });


app.get('/api/tasks', async (req: Authed, res, next) => { try {
    res.json(await prisma.task.findMany({ where: { userId: req.userId }, include: taskInclude, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] }));
}
catch (e) {
    next(e);
} });
app.post('/api/tasks', async (req: Authed, res, next) => { try {
    const userId = req.userId!, data: any = await taskData(req.body, userId);
    if (!data.title)
        return res.status(400).json({ error: 'Task title is required.' });
    if (await prisma.task.findFirst({ where: { userId, title: data.title, status: { not: 'COMPLETED' }, dueDate: data.dueDate, companyId: data.companyId || null, contactId: data.contactId || null, opportunityId: data.opportunityId || null, applicationId: data.applicationId || null, interviewId: data.interviewId || null } }))
        return res.status(409).json({ error: 'An open matching task already exists.' });
    const item = await prisma.task.create({ data: { userId, ...data }, include: taskInclude });
    await activity(userId, `Added task: ${item.title}`, 'task', item.id);
    res.status(201).json(item);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to create task.' });
} });
app.patch('/api/tasks/:id', async (req: Authed, res, next) => {
    try {
        const task = await owned(prisma.task, req.params.id, req.userId!);
        if (!task)
            return res.status(404).json({ error: 'Task not found.' });
        const data: any = await taskData(req.body, req.userId!, task);
        if (!data.title)
            return res.status(400).json({ error: 'Task title is required.' });
        const item = await prisma.task.update({ where: { id: task.id }, data, include: taskInclude });
        if (item.contactId && /^Follow up with /i.test(item.title) && task.status !== item.status) {
            const contact = await owned(prisma.contact, item.contactId, req.userId!);
            if (contact) {
                const pending = await prisma.task.findFirst({ where: { userId: req.userId, contactId: item.contactId, status: { not: 'COMPLETED' }, title: { startsWith: 'Follow up with ' } }, orderBy: { dueDate: 'asc' } });
                if (pending || contact.nextFollowUpDate?.toISOString().slice(0, 10) === task.dueDate?.toISOString().slice(0, 10))
                    await prisma.contact.update({ where: { id: contact.id }, data: { nextFollowUpDate: pending?.dueDate || null } });
            }
        }
        if (task.status !== item.status)
            await activity(req.userId!, `${item.status === 'COMPLETED' ? 'Completed' : 'Reopened'} task: ${item.title}`, 'task', item.id);
        res.json(item);
    }
    catch (e: any) {
        res.status(e?.status || 500).json({ error: e?.message || 'Unable to update task.' });
    }
});
app.get('/api/opportunities', async (req: Authed, res, next) => { try {
    const stage = typeof req.query.stage === 'string' ? req.query.stage : undefined, includeConverted = req.query.includeConverted === 'true';
    res.json(await prisma.opportunity.findMany({ where: { userId: req.userId, ...(stage ? { status: stage } : {}), ...(includeConverted ? {} : { applications: { none: {} } }) }, include: pipelineOpportunityInclude, orderBy: [{ priority: 'desc' }, { applicationDeadline: 'asc' }] }));
}
catch (e) {
    next(e);
} });
app.post('/api/quick-add/opportunity/parse', async (req: Authed, res, next) => { try {
    const text = String(req.body?.text || ''), url = String(req.body?.url || '').trim(), draft = parsePosting(text, url), companies = await prisma.company.findMany({ where: { userId: req.userId }, include: { offices: true } }), firm = companies.find(x => draft.company && normalizedName(x.name) === normalizedName(draft.company)), office = firm?.offices.find(x => draft.location && normalizedName([x.city, x.region].filter(Boolean).join(', ')) === normalizedName(draft.location)), duplicates = await prisma.opportunity.findMany({ where: { userId: req.userId, OR: [...(url ? [{ jobUrl: url }] : []), ...(firm && draft.roleTitle ? [{ companyId: firm.id, roleTitle: draft.roleTitle }] : [])] }, include: { company: true, office: true }, take: 3 });
    res.json({ draft: { ...draft, companyId: firm?.id || null, officeId: office?.id || null }, firmMatches: firm ? [{ id: firm.id, name: firm.name, offices: firm.offices }] : [], duplicates });
}
catch (e) {
    next(e);
} });
app.post('/api/opportunities', async (req: Authed, res, next) => { try {
    const b = req.body || {}, userId = req.userId!, companyName = String(b.company || '').trim();
    let company = b.companyId ? await owned(prisma.company, String(b.companyId), userId) : null;
    if (!company && !b.companyId && companyName) {
        company = await prisma.company.findFirst({ where: { userId, name: companyName } });
        if (!company)
            company = await prisma.company.create({ data: { userId, name: companyName } });
    }
    if (!company)
        return res.status(404).json({ error: 'Firm not found.' });
    const office = b.officeId ? await owned(prisma.office, String(b.officeId), userId) : null;
    if (b.officeId && (!office || office.companyId !== company.id))
        return res.status(400).json({ error: 'Choose a target office belonging to this firm.' });
    const contact = b.networkingContactId ? await owned(prisma.contact, String(b.networkingContactId), userId) : null;
    if (b.networkingContactId && (!contact || contact.companyId !== company.id))
        return res.status(400).json({ error: 'Choose a networking contact belonging to this firm.' });
    const status = opportunityStages.includes(String(b.status)) ? String(b.status) : 'TARGET';
    const item = await prisma.opportunity.create({ data: { userId, companyId: company.id, officeId: office?.id ?? null, networkingContactId: contact?.id ?? null, roleTitle: String(b.roleTitle || 'Untitled opportunity'), practiceArea: b.practiceArea || null, location: b.location || office?.city || null, employmentType: b.employmentType || null, recruitingSeason: b.recruitingSeason || null, source: b.source || null, jobUrl: validatedOpportunityUrl(b.jobUrl), rawPostingText: b.rawPostingText || null, description: b.description || null, applicationDeadline: b.applicationDeadline ? new Date(b.applicationDeadline) : null, priority: b.priority || 'MEDIUM', status, referralStatus: b.referralStatus || 'NONE', transcriptRequired: !!b.transcriptRequired, assessmentRequired: !!b.assessmentRequired, notes: b.notes || null }, include: pipelineOpportunityInclude });
    await activity(userId, `Added ${item.roleTitle} at ${item.company.name}`, 'opportunity', item.id);
    res.status(201).json(item);
}
catch (e) {
    next(e);
} });
app.patch('/api/opportunities/:id/stage', async (req: Authed, res, next) => { try {
    const item = await owned(prisma.opportunity, req.params.id, req.userId!);
    if (!item)
        return res.status(404).json({ error: 'Opportunity not found.' });
    const status = String(req.body?.stage || '');
    if (!opportunityStages.includes(status))
        return res.status(400).json({ error: 'Invalid opportunity stage.' });
    const updated = await prisma.opportunity.update({ where: { id: item.id }, data: { status }, include: pipelineOpportunityInclude });
    await activity(req.userId!, `${updated.company.name} opportunity moved to ${status.replaceAll('_', ' ')}`, 'opportunity', updated.id);
    res.json(updated);
}
catch (e) {
    next(e);
} });
app.patch('/api/opportunities/:id/context', async (req: Authed, res, next) => { try {
    const item = await owned(prisma.opportunity, req.params.id, req.userId!);
    if (!item)
        return res.status(404).json({ error: 'Opportunity not found.' });
    const b = req.body || {}, office = b.officeId === undefined ? undefined : b.officeId ? await owned(prisma.office, String(b.officeId), req.userId!) : null, contact = b.networkingContactId === undefined ? undefined : b.networkingContactId ? await owned(prisma.contact, String(b.networkingContactId), req.userId!) : null;
    if (office && office.companyId !== item.companyId || b.officeId && !office)
        return res.status(400).json({ error: 'Choose a target office belonging to this firm.' });
    if (contact && contact.companyId !== item.companyId || b.networkingContactId && !contact)
        return res.status(400).json({ error: 'Choose a networking contact belonging to this firm.' });
    const updated = await prisma.opportunity.update({ where: { id: item.id }, data: { officeId: office === undefined ? undefined : office?.id ?? null, networkingContactId: contact === undefined ? undefined : contact?.id ?? null, referralStatus: b.referralStatus, assessmentRequired: b.assessmentRequired, transcriptRequired: b.transcriptRequired, recruitingSeason: b.recruitingSeason }, include: pipelineOpportunityInclude });
    res.json(updated);
}
catch (e) {
    next(e);
} });
app.delete('/api/opportunities/:id', async (req: Authed, res, next) => { try {
    const opportunity = await owned(prisma.opportunity, req.params.id, req.userId!);
    if (!opportunity)
        return res.status(404).json({ error: 'Opportunity not found.' });
    const [applications, tasks] = await Promise.all([prisma.application.count({ where: { userId: req.userId, opportunityId: opportunity.id } }), prisma.task.count({ where: { userId: req.userId, opportunityId: opportunity.id } })]);
    if (applications || tasks) {
        const blocked = [applications && `${applications} linked application${applications === 1 ? '' : 's'}`, tasks && `${tasks} linked task${tasks === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
        return res.status(409).json({ error: `Cannot delete this opportunity while it has ${blocked}. Remove the linked record${applications + tasks === 1 ? '' : 's'} first; nothing was deleted.` });
    }
    await prisma.opportunity.delete({ where: { id: opportunity.id } });
    res.status(204).end();
}
catch (e) {
    next(e);
} });
app.post('/api/opportunities/:id/application', async (req: Authed, res, next) => { try {
    const opportunity = await owned(prisma.opportunity, req.params.id, req.userId!);
    if (!opportunity)
        return res.status(404).json({ error: 'Opportunity not found.' });
    if (await prisma.application.findFirst({ where: { userId: req.userId, opportunityId: opportunity.id } }))
        return res.status(409).json({ error: 'This opportunity already has an application.' });
    const documents = await selectedApplicationDocuments(req.userId!, req.body, true);
    const item = await prisma.application.create({ data: { userId: req.userId!, opportunityId: opportunity.id, currentStage: 'PREPARING_APPLICATION', ...documents }, include: pipelineApplicationInclude });
    await activity(req.userId!, `Started application for ${item.opportunity.company.name}`, 'application', item.id);
    res.status(201).json(item);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to start application.' });
} });
app.post('/api/opportunities/:id/applied', async (req: Authed, res, next) => { try {
    const userId = req.userId!, opportunity = await owned(prisma.opportunity, req.params.id, userId);
    if (!opportunity)
        return res.status(404).json({ error: 'Opportunity not found.' });
    const documents = await selectedApplicationDocuments(userId, req.body, true), result = await prisma.$transaction(async (tx) => { const existing = await tx.application.findFirst({ where: { userId, opportunityId: opportunity.id } }); if (existing) {
        const moveToApplied = ['RESEARCHING', 'PREPARING_APPLICATION'].includes(existing.currentStage), item = await tx.application.update({ where: { id: existing.id }, data: { currentStage: moveToApplied ? 'APPLIED' : undefined, dateSubmitted: existing.dateSubmitted || new Date() }, include: pipelineApplicationInclude });
        if (moveToApplied)
            await tx.activity.create({ data: { userId, type: 'activity', message: `Moved ${item.opportunity.company.name} to Applied`, entityType: 'application', entityId: item.id } });
        return { item, created: false, movedToApplied: moveToApplied };
    } const item = await tx.application.create({ data: { userId, opportunityId: opportunity.id, currentStage: 'APPLIED', dateSubmitted: new Date(), ...documents }, include: pipelineApplicationInclude }); await tx.activity.create({ data: { userId, type: 'activity', message: `Moved ${item.opportunity.company.name} to Applied`, entityType: 'application', entityId: item.id } }); return { item, created: true, movedToApplied: true }; });
    res.status(result.created ? 201 : 200).json(result);
}
catch (e: any) {
    if (e?.code === 'P2002') {
        const item = await prisma.application.findFirst({ where: { userId: req.userId, opportunityId: String(req.params.id) }, include: pipelineApplicationInclude });
        if (item)
            return res.json({ item, created: false, movedToApplied: false });
    }
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to move this opportunity to Applied.' });
} });
app.get('/api/applications', async (req: Authed, res, next) => { try {
    res.json(await prisma.application.findMany({ where: { userId: req.userId }, include: pipelineApplicationInclude, orderBy: { dateStarted: 'desc' } }));
}
catch (e) {
    next(e);
} });
app.get('/api/applications/:id', async (req: Authed, res, next) => { try {
    const item = await prisma.application.findFirst({ where: { id: String(req.params.id), userId: req.userId }, include: pipelineApplicationInclude });
    if (!item)
        return res.status(404).json({ error: 'Application not found.' });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.patch('/api/applications/:id/documents', async (req: Authed, res, next) => { try {
    const application = await owned(prisma.application, req.params.id, req.userId!);
    if (!application)
        return res.status(404).json({ error: 'Application not found.' });
    const body = req.body || {}, selected = await selectedApplicationDocuments(req.userId!, body, false), documents = { resumeId: body.resumeId === undefined ? application.resumeId : selected.resumeId, coverLetterId: body.coverLetterId === undefined ? application.coverLetterId : selected.coverLetterId, transcriptId: body.transcriptId === undefined ? application.transcriptId : selected.transcriptId };
    const item = await prisma.application.update({ where: { id: application.id }, data: documents, include: pipelineApplicationInclude });
    res.json(item);
}
catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || 'Unable to update application documents.' });
} });
app.patch('/api/applications/:id/stage', async (req: Authed, res, next) => { try {
    const application = await owned(prisma.application, req.params.id, req.userId!);
    if (!application)
        return res.status(404).json({ error: 'Application not found.' });
    const currentStage = String(req.body?.stage || '');
    if (!pipelineApplicationStages.includes(currentStage))
        return res.status(400).json({ error: 'Invalid application stage.' });
    const item = await prisma.application.update({ where: { id: application.id }, data: { currentStage, dateSubmitted: currentStage === 'APPLIED' && !application.dateSubmitted ? new Date() : undefined }, include: pipelineApplicationInclude });
    await activity(req.userId!, `${item.opportunity.company.name} moved to ${currentStage.replaceAll('_', ' ')}`, 'application', item.id);
    res.json({ item });
}
catch (e) {
    next(e);
} });
app.delete('/api/applications/:id', async (req: Authed, res, next) => { try {
    const application = await owned(prisma.application, req.params.id, req.userId!);
    if (!application)
        return res.status(404).json({ error: 'Application not found.' });
    const [interviews, tasks] = await Promise.all([prisma.interview.count({ where: { userId: req.userId, applicationId: application.id } }), prisma.task.count({ where: { userId: req.userId, applicationId: application.id } })]);
    if (interviews || tasks)
        return res.status(409).json({ error: 'Remove the application’s interviews and tasks first; they are not deleted automatically.' });
    await prisma.application.delete({ where: { id: application.id } });
    res.status(204).end();
}
catch (e) {
    next(e);
} });



app.patch('/api/opportunities/:id', async (req: Authed, res, next) => { try {
    const x = await owned(prisma.opportunity, req.params.id, req.userId!);
    if (!x)
        return res.status(404).json({ error: 'Opportunity not found.' });
    const b = req.body || {}, item = await prisma.opportunity.update({ where: { id: x.id }, data: { roleTitle: b.roleTitle, practiceArea: b.practiceArea, location: b.location, source: b.source, priority: b.priority, status: b.status, applicationDeadline: b.applicationDeadline ? new Date(b.applicationDeadline) : undefined }, include: { company: true } });
    res.json(item);
}
catch (e) {
    next(e);
} });




const contactInclude = (userId: string) => ({ company: true, office: true, interactions: { where: { userId }, orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }] }, plannedInteractions: { where: { userId }, orderBy: { scheduledAt: 'asc' } as const }, tasks: { where: { userId, status: { not: 'COMPLETED' } }, orderBy: { dueDate: 'asc' } as const } });
const contactStages = ['IDENTIFIED', 'CONTACTED', 'RESPONDED', 'COFFEE_CHAT', 'RELATIONSHIP', 'REFERRAL'], contactSources = ['ALUMNI', 'CONSULTING_NIGHT', 'CAREER_FAIR', 'PROFESSOR', 'FRIEND', 'LINKEDIN', 'RECRUITER', 'REFERRAL', 'OTHER'], referralStatuses = ['NONE', 'POTENTIAL', 'REQUESTED', 'RECEIVED'];
const validContactValue = (v: any, values: string[]) => v === undefined || values.includes(v);
const interactionTypes = ['COFFEE_CHAT', 'PHONE_CALL', 'VIDEO_CALL', 'LUNCH', 'TEXT', 'EMAIL', 'LINKEDIN_MESSAGE', 'RECRUITING_EVENT', 'INTERVIEW', 'OFFICE_VISIT', 'OTHER'];
const interactionDate = (value: any, label: string) => { const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00.000Z` : value); if (Number.isNaN(date.getTime()))
    throw Object.assign(new Error(`Enter a valid ${label} date.`), { status: 400 }); return date; };
const contactData = async (b: any, userId: string) => {
    if (typeof b.name === 'string') {
        const [firstName, ...rest] = b.name.trim().split(/\s+/);
        b = { ...b, firstName, lastName: rest.join(' ') };
    }
    if (!String(b.firstName || '').trim())
        throw Object.assign(new Error('Name is required.'), { status: 400 });
    if (b.companyId && !await owned(prisma.company, String(b.companyId), userId))
        throw Object.assign(new Error('Firm not found.'), { status: 404 });
    if (b.linkedinUrl)
        validatedOpportunityUrl(b.linkedinUrl);
    let companyId = b.companyId ? ((await owned(prisma.company, b.companyId, userId))?.id) : undefined;
    if (b.company && !companyId)
        companyId = (await companyFor(String(b.company).trim(), userId)).id;
    let officeId: string | undefined;
    if (b.officeId) {
        const office = await owned(prisma.office, b.officeId, userId);
        if (!office)
            throw Object.assign(new Error('Target office not found.'), { status: 404 });
        officeId = office.id;
        companyId = companyId || office.companyId;
        if (companyId !== office.companyId)
            throw Object.assign(new Error('Choose an office for the selected firm.'), { status: 400 });
    }
    return { firstName: String(b.firstName || '').trim(), lastName: String(b.lastName || '').trim(), companyId: companyId || null, officeId: officeId || null, title: b.title?.trim() || null, email: b.email?.trim() || null, phone: b.phone?.trim() || null, linkedinUrl: b.linkedinUrl?.trim() || null, school: b.school?.trim() || null, source: b.source || 'OTHER', networkingStage: b.networkingStage || 'IDENTIFIED', referralStatus: b.referralStatus || 'NONE', relationshipType: b.relationshipType || 'CONSULTANT', relationshipStrength: b.relationshipStrength || 'New', location: b.location?.trim() || null, notes: b.notes?.trim() || null, nextFollowUpDate: b.nextFollowUpDate ? new Date(b.nextFollowUpDate) : null };
};
app.get('/api/contacts', async (req: Authed, res, next) => { try {
    const q = String(req.query.q || ''), stage = String(req.query.stage || ''), source = String(req.query.source || ''), followUp = String(req.query.followUp || '');
    const where: any = { userId: req.userId, ...(q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { company: { name: { contains: q } } }, { school: { contains: q } }] } : {}), ...(stage ? { networkingStage: stage } : {}), ...(source ? { source } : {}), ...(followUp === 'due' ? { nextFollowUpDate: { lte: new Date() } } : {}) };
    res.json(await prisma.contact.findMany({ where, include: contactInclude(req.userId!), orderBy: [{ nextFollowUpDate: 'asc' }, { lastName: 'asc' }] }));
}
catch (e) {
    next(e);
} });
app.post('/api/contacts', async (req: Authed, res, next) => { try {
    const b = req.body || {}, userId = req.userId!;
    if (!validContactValue(b.source, contactSources) || !validContactValue(b.networkingStage, contactStages) || !validContactValue(b.referralStatus, referralStatuses))
        return res.status(400).json({ error: 'Use a valid networking source, stage, and referral status.' });
    const item = await prisma.contact.create({ data: { userId, ...await contactData(b, userId) }, include: contactInclude(req.userId!) });
    await activity(userId, `Added networking contact ${item.firstName} ${item.lastName}`, 'contact', item.id);
    res.status(201).json(item);
}
catch (e: any) {
    if (e.status)
        return res.status(e.status).json({ error: e.message });
    next(e);
} });
app.get('/api/contacts/:id', async (req: Authed, res, next) => { try {
    const item = await prisma.contact.findFirst({ where: { id: String(req.params.id), userId: req.userId }, include: contactInclude(req.userId!) });
    if (!item)
        return res.status(404).json({ error: 'Contact not found.' });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.patch('/api/contacts/:id', async (req: Authed, res, next) => { try {
    const current = await owned(prisma.contact, req.params.id, req.userId!);
    if (!current)
        return res.status(404).json({ error: 'Contact not found.' });
    const b = req.body || {};
    if (!validContactValue(b.source, contactSources) || !validContactValue(b.networkingStage, contactStages) || !validContactValue(b.referralStatus, referralStatuses))
        return res.status(400).json({ error: 'Use a valid networking source, stage, and referral status.' });
    const item = await prisma.contact.update({ where: { id: current.id }, data: await contactData({ ...current, ...b }, req.userId!), include: contactInclude(req.userId!) });
    res.json(item);
}
catch (e: any) {
    if (e.status)
        return res.status(e.status).json({ error: e.message });
    next(e);
} });
app.post('/api/contacts/:id/interactions', async (req: Authed, res, next) => {
    try {
        const userId = req.userId!, contact = await owned(prisma.contact, req.params.id, userId);
        if (!contact)
            return res.status(404).json({ error: 'Contact not found.' });
        const b = req.body || {}, type = String(b.type || '').trim().toUpperCase().replaceAll(' ', '_');
        if (!interactionTypes.includes(type))
            return res.status(400).json({ error: 'Choose an interaction type.' });
        // Existing API callers may omit date; quick entry always supplies today's calendar date.
        const date = b.date ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date + 'T12:00:00.000Z' : b.date) : new Date(), followUpDate = b.followUpDate ? new Date(b.followUpDate) : null;
        if (Number.isNaN(date.getTime()) || (followUpDate && Number.isNaN(followUpDate.getTime())))
            return res.status(400).json({ error: 'Enter a valid interaction and follow-up date.' });
        const interaction = await prisma.$transaction(async (tx) => {
            // Serialize reminder updates for this contact, including simultaneous logs from two tabs.
            await tx.contact.update({ where: { id: contact.id }, data: { updatedAt: new Date() } });
            let taskId: string | undefined;
            if (followUpDate) {
                const existing = await tx.task.findFirst({ where: { userId, contactId: contact.id, status: { not: 'COMPLETED' }, title: { startsWith: 'Follow up with ' } }, orderBy: { createdAt: 'desc' } });
                const taskData = { dueDate: followUpDate, taskType: 'FOLLOW_UP', title: `Follow up with ${[contact.firstName, contact.lastName].filter(Boolean).join(' ')}` };
                taskId = existing ? (await tx.task.update({ where: { id: existing.id }, data: taskData })).id : (await tx.task.create({ data: { ...taskData, userId, contactId: contact.id, companyId: contact.companyId, priority: 'MEDIUM' } })).id;
            }
            const summary = String(b.summary || '').trim(), notes = String(b.notes || '').trim();
            const created = await tx.interaction.create({ data: { userId, contactId: contact.id, date, type, summary, notes: notes || null, followUpNeeded: !!followUpDate, followUpDate, followUpTaskId: taskId } });
            const latest = await tx.interaction.findFirst({ where: { userId, contactId: contact.id }, orderBy: { date: 'desc' } });
            await tx.contact.update({ where: { id: contact.id }, data: { lastContactDate: contact.lastContactDate && contact.lastContactDate > latest!.date ? contact.lastContactDate : latest!.date, ...(followUpDate ? { nextFollowUpDate: followUpDate } : {}) } });
            return created;
        });
        await activity(userId, `Logged ${interaction.type} with ${contact.firstName} ${contact.lastName}`, 'interaction', interaction.id);
        res.status(201).json(interaction);
    }
    catch (e) {
        next(e);
    }
});
app.patch('/api/interactions/:id', async (req: Authed, res, next) => {
    try {
        const userId = req.userId!, current = await prisma.interaction.findFirst({ where: { id: String(req.params.id), userId }, include: { contact: true } });
        if (!current || current.contact.userId !== userId)
            return res.status(404).json({ error: 'Interaction not found.' });
        const b = req.body || {}, type = b.type === undefined ? current.type : String(b.type).trim().toUpperCase().replaceAll(' ', '_');
        if (!interactionTypes.includes(type))
            return res.status(400).json({ error: 'Choose an interaction type.' });
        const date = b.date === undefined ? current.date : interactionDate(b.date, 'interaction'), followUpSpecified = b.followUpDate !== undefined;
        const followUpDate = !followUpSpecified ? current.followUpDate : b.followUpDate ? interactionDate(b.followUpDate, 'follow-up') : null;
        const updated = await prisma.$transaction(async (tx) => {
            await tx.contact.update({ where: { id: current.contactId }, data: { updatedAt: new Date() } });
            let followUpTaskId = current.followUpTaskId;
            if (followUpSpecified) {
                const generatedTasks = await tx.task.findMany({ where: { userId, contactId: current.contactId, status: { not: 'COMPLETED' }, taskType: 'FOLLOW_UP' }, orderBy: { createdAt: 'desc' } });
                if (followUpDate) {
                    const taskData = { dueDate: followUpDate, taskType: 'FOLLOW_UP', title: `Follow up with ${[current.contact.firstName, current.contact.lastName].filter(Boolean).join(' ')}` }, task = generatedTasks.find(x => x.id === current.followUpTaskId) || generatedTasks[0];
                    followUpTaskId = task ? (await tx.task.update({ where: { id: task.id }, data: taskData })).id : (await tx.task.create({ data: { ...taskData, userId, contactId: current.contactId, companyId: current.contact.companyId, priority: 'MEDIUM' } })).id;
                    if (generatedTasks.length > 1)
                        await tx.task.deleteMany({ where: { id: { in: generatedTasks.filter(x => x.id !== followUpTaskId).map(x => x.id) }, userId } });
                }
                else {
                    const fallback = generatedTasks.length ? await tx.interaction.findFirst({ where: { userId, contactId: current.contactId, id: { not: current.id }, followUpNeeded: true, followUpDate: { not: null }, followUpTaskId: { in: generatedTasks.map(x => x.id) } }, orderBy: { createdAt: 'desc' } }) : null;
                    if (fallback?.followUpDate) {
                        const task = generatedTasks.find(x => x.id === current.followUpTaskId) || generatedTasks[0], taskData = { dueDate: fallback.followUpDate, taskType: 'FOLLOW_UP', title: `Follow up with ${[current.contact.firstName, current.contact.lastName].filter(Boolean).join(' ')}` };
                        const kept = task ? await tx.task.update({ where: { id: task.id }, data: taskData }) : await tx.task.create({ data: { ...taskData, userId, contactId: current.contactId, companyId: current.contact.companyId, priority: 'MEDIUM' } });
                        await tx.interaction.update({ where: { id: fallback.id }, data: { followUpTaskId: kept.id } });
                        if (generatedTasks.length > 1)
                            await tx.task.deleteMany({ where: { id: { in: generatedTasks.filter(x => x.id !== kept.id).map(x => x.id) }, userId } });
                    }
                    else if (generatedTasks.length)
                        await tx.task.deleteMany({ where: { id: { in: generatedTasks.map(x => x.id) }, userId } });
                    followUpTaskId = null;
                }
            }
            const item = await tx.interaction.update({ where: { id: current.id }, data: { type, date, summary: b.summary === undefined ? current.summary : String(b.summary).trim(), notes: b.notes === undefined ? current.notes : (String(b.notes).trim() || null), followUpNeeded: !!followUpDate, followUpDate, followUpTaskId } });
            const [latest, reminder] = await Promise.all([tx.interaction.findFirst({ where: { userId, contactId: current.contactId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }), tx.task.findFirst({ where: { userId, contactId: current.contactId, status: { not: 'COMPLETED' }, taskType: 'FOLLOW_UP' }, orderBy: { createdAt: 'desc' } })]);
            await tx.contact.update({ where: { id: current.contactId }, data: { lastContactDate: latest?.date || null, nextFollowUpDate: reminder?.dueDate || null } });
            return item;
        });
        await activity(userId, `Updated ${updated.type} with ${current.contact.firstName} ${current.contact.lastName}`, 'interaction', updated.id);
        res.json(updated);
    }
    catch (e: any) {
        if (e.status)
            return res.status(e.status).json({ error: e.message });
        next(e);
    }
});
const preApplicationStages = ['TARGET', 'NETWORKING', 'READY_TO_APPLY', 'CLOSED'], applicationStages = ['APPLIED', 'ASSESSMENT', 'FIRST_ROUND', 'FINAL_ROUND', 'OFFER', 'REJECTED', 'WITHDRAWN', 'CLOSED'];





app.delete('/api/tasks/:id', async (req: Authed, res, next) => { try {
    const x = await owned(prisma.task, req.params.id, req.userId!);
    if (!x)
        return res.status(404).json({ error: 'Task not found.' });
    await prisma.task.delete({ where: { id: x.id } });
    res.status(204).end();
}
catch (e) {
    next(e);
} });
const documentFields = { id: true, name: true, version: true, dateCreated: true, type: true, targetRole: true, notes: true, isDefault: true, mimeType: true, sizeBytes: true, createdAt: true, updatedAt: true } as const;
const documentTypeValid = (value: unknown): value is typeof documentTypes[number] => typeof value === 'string' && documentTypes.includes(value as typeof documentTypes[number]);
const documentFiles = (req: Request) => { const files = (req.files || {}) as Record<string, Express.Multer.File[]>; return [...(files.files || []), ...(files.file || [])]; };
const removeStoredFiles = (files: Express.Multer.File[]) => Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => undefined)));
const documentFilePath = (document: {
    storageKey: string | null;
    filePath: string | null;
}) => { const key = document.storageKey || path.basename(document.filePath || ''); if (!key)
    return null; const resolved = path.resolve(uploadDir, key); return resolved.startsWith(`${uploadDir}${path.sep}`) ? resolved : null; };
app.get('/api/documents', async (req: Authed, res, next) => { try {
    res.json(await prisma.document.findMany({ where: { userId: req.userId }, select: documentFields, orderBy: [{ isDefault: 'desc' }, { dateCreated: 'desc' }] }));
}
catch (e) {
    next(e);
} });
app.post('/api/documents', uploadDocuments, async (req: Authed, res, next) => { const files = documentFiles(req); try {
    const b = req.body || {}, userId = req.userId!, type = String(b.type || 'OTHER');
    if (!documentTypeValid(type)) {
        await removeStoredFiles(files);
        return res.status(400).json({ error: 'Choose a valid document type.' });
    }
    if (!files.length)
        return res.status(400).json({ error: (req as any).rejectedDocuments?.[0]?.error || 'Choose at least one supported document.' });
    let hasDefault = false;
    const created = await prisma.$transaction(async (tx) => { hasDefault = !!await tx.document.findFirst({ where: { userId, type: 'RESUME', isDefault: true } }); const items = []; for (const file of files) {
        const extension = path.extname(file.originalname).toLowerCase(), fileType = allowedDocumentFiles[extension];
        const item = await tx.document.create({ data: { userId, name: path.basename(file.originalname), version: b.version?.trim() || null, type, targetRole: b.targetRole?.trim() || null, notes: b.notes?.trim() || null, isDefault: type === 'RESUME' && !hasDefault, filePath: null, storageKey: file.filename, mimeType: fileType.mimeType, sizeBytes: file.size }, select: documentFields });
        if (item.isDefault)
            hasDefault = true;
        items.push(item);
    } return items; });
    await Promise.all(created.map(item => activity(userId, `Uploaded ${item.name}`, 'document', item.id)));
    const rejected = (req as any).rejectedDocuments || [];
    res.status(rejected.length ? 207 : 201).json({ documents: created, rejected });
}
catch (e) {
    await removeStoredFiles(files);
    next(e);
} });
app.get('/api/documents/:id', async (req: Authed, res, next) => { try {
    const item = await prisma.document.findFirst({ where: { id: String(req.params.id), userId: req.userId }, select: documentFields });
    const applications=item?await prisma.application.findMany({where:{userId:req.userId,OR:[{resumeId:item.id},{coverLetterId:item.id},{transcriptId:item.id}]},select:{id:true,opportunity:{select:{company:{select:{name:true}},roleTitle:true}}}}):[];
    if (!item)
        return res.status(404).json({ error: 'Document not found.' });
    res.json({...item,applications});
}
catch (e) {
    next(e);
} });
app.get('/api/documents/:id/download', async (req: Authed, res, next) => { try {
    const item = await prisma.document.findFirst({ where: { id: String(req.params.id), userId: req.userId }, select: { name: true, storageKey: true, filePath: true, mimeType: true } });
    if (!item)
        return res.status(404).json({ error: 'Document not found.' });
    const file = documentFilePath(item);
    if (!file || !fs.existsSync(file))
        return res.status(404).json({ error: 'Document file is unavailable.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(item.mimeType || 'application/octet-stream');
    res.download(file, item.name);
}
catch (e) {
    next(e);
} });
app.patch('/api/documents/:id', async (req: Authed, res, next) => { try {
    const current = await prisma.document.findFirst({ where: { id: String(req.params.id), userId: req.userId } });
    if (!current)
        return res.status(404).json({ error: 'Document not found.' });
    const b = req.body || {}, type = b.type === undefined ? current.type : String(b.type);
    if (!documentTypeValid(type))
        return res.status(400).json({ error: 'Choose a valid document type.' });
    const item = await prisma.document.update({ where: { id: current.id }, data: { name:b.name===undefined?undefined:(path.basename(String(b.name)).trim()||current.name), type, version: b.version === undefined ? undefined : String(b.version).trim() || null, targetRole: b.targetRole === undefined ? undefined : String(b.targetRole).trim() || null, notes: b.notes === undefined ? undefined : String(b.notes).trim() || null, isDefault: type === 'RESUME' ? undefined : false }, select: documentFields });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.post('/api/documents/:id/default', async (req: Authed, res, next) => { try {
    const current = await prisma.document.findFirst({ where: { id: String(req.params.id), userId: req.userId } });
    if (!current)
        return res.status(404).json({ error: 'Document not found.' });
    if (current.type !== 'RESUME')
        return res.status(400).json({ error: 'Only resumes can be the default resume.' });
    const item = await prisma.$transaction(async (tx) => { await tx.document.updateMany({ where: { userId: req.userId, type: 'RESUME', isDefault: true }, data: { isDefault: false } }); return tx.document.update({ where: { id: current.id }, data: { isDefault: true }, select: documentFields }); });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.delete('/api/documents/:id', async (req: Authed, res, next) => { try {
    const current = await prisma.document.findFirst({ where: { id: String(req.params.id), userId: req.userId } });
    if (!current)
        return res.status(404).json({ error: 'Document not found.' });
    const linked = await prisma.application.count({ where: { userId: req.userId, OR: [{ resumeId: current.id }, { coverLetterId: current.id }, {transcriptId:current.id}] } });
    if (linked)
        return res.status(409).json({ error: 'This document is linked to an application. Choose another document there before deleting it.' });
    await prisma.document.delete({ where: { id: current.id } });
    const file = documentFilePath(current);
    if (file)
        await fs.promises.unlink(file).catch(() => undefined);
    res.status(204).end();
}
catch (e) {
    next(e);
} });
app.get('/api/timeline', async (req: Authed, res, next) => { try {
    const userId = req.userId!, [deadlines, interviews, tasks, followups] = await Promise.all([prisma.opportunity.findMany({ where: { userId, applicationDeadline: { not: null } }, include: { company: true } }), prisma.interview.findMany({ where: { userId }, include: { application: { include: { opportunity: { include: { company: true } } } } } }), prisma.task.findMany({ where: { userId, dueDate: { not: null } }, include: { company: true, contact: true } }), prisma.contact.findMany({ where: { userId, nextFollowUpDate: { not: null } }, include: { company: true } })]);
    res.json({ deadlines, interviews, tasks, followups });
}
catch (e) {
    next(e);
} });
app.get('/api/analytics', async (req: Authed, res, next) => { try {
    const apps = await prisma.application.findMany({ where: { userId: req.userId }, include: { opportunity: true } }), by = (key: (a: any) => string) => Object.entries(apps.reduce((m: any, a) => { const k = key(a); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([label, value]) => ({ label, value })), interviews = apps.filter(x => ['FIRST_ROUND', 'SECOND_ROUND', 'FINAL_ROUND', 'OFFER'].includes(x.currentStage)).length, finals = apps.filter(x => ['FINAL_ROUND', 'OFFER'].includes(x.currentStage)).length, offers = apps.filter(x => x.currentStage === 'OFFER').length;
    res.json({ total: apps.length, interviews, interviewRate: apps.length ? Math.round(interviews / apps.length * 100) : 0, finalRate: interviews ? Math.round(finals / interviews * 100) : 0, offerRate: finals ? Math.round(offers / finals * 100) : 0, bySource: by(x => x.opportunity.source), byPractice: by(x => x.opportunity.practiceArea) });
}
catch (e) {
    next(e);
} });
const firmTypes = ['MBB', 'Big 4', 'Strategy Consulting', 'Boutique', 'Economic Consulting', 'Technology Consulting', 'Other'];
const priorities = ['HIGH', 'MEDIUM', 'LOW'];
const validFirmType = (value: any) => !value || firmTypes.includes(value);
const validPriority = (value: any) => !value || priorities.includes(value);
app.get('/api/companies', async (req: Authed, res, next) => { try {
    const q = String(req.query.q || ''), firmType = String(req.query.firmType || ''), priority = String(req.query.priority || ''), where: any = { userId: req.userId, ...(q ? { name: { contains: q } } : {}), ...(firmType ? { firmType } : {}), ...(priority ? { priority } : {}) };
    res.json(await prisma.company.findMany({ where, include: { offices: true, _count: { select: { contacts: true, opportunities: true } }, }, orderBy: [{ priority: 'asc' }, { name: 'asc' }] }));
}
catch (e) {
    next(e);
} });
app.post('/api/companies', async (req: Authed, res, next) => { try {
    const b = req.body || {}, userId = req.userId!, name = String(b.name || '').trim();
    if (!name)
        return res.status(400).json({ error: 'Firm name is required.' });
    if (!validFirmType(b.firmType) || !validPriority(b.priority))
        return res.status(400).json({ error: 'Enter a valid firm type and priority.' });
    const existing = await prisma.company.findFirst({ where: { userId, name } });
    if (existing)
        return res.status(409).json({ error: 'You already have a firm with this name.' });
    const item = await prisma.company.create({ data: { userId, name, website: b.website?.trim() || null, careersUrl: validatedOpportunityUrl(b.careersUrl), firmType: b.firmType || null, priority: b.priority || 'MEDIUM', category: b.category?.trim() || null, notes: b.notes?.trim() || null }, include: { offices: true } });
    await activity(userId, `Added firm ${item.name}`, 'company', item.id);
    res.status(201).json(item);
}
catch (e) {
    next(e);
} });
app.get('/api/companies/:id', async (req: Authed, res, next) => { try {
    const item = await prisma.company.findFirst({ where: { id: String(req.params.id), userId: req.userId }, include: { offices: { orderBy: [{ priority: 'asc' }, { city: 'asc' }] }, contacts: { include: { interactions: { orderBy: { date: 'desc' }, take: 3 } }, orderBy: { nextFollowUpDate: 'asc' } }, opportunities: { include: { applications: { include: { interviews: true } } }, orderBy: { applicationDeadline: 'asc' } }, tasks: { where: { status: { not: 'COMPLETED' } }, orderBy: { dueDate: 'asc' } } } });
    if (!item)
        return res.status(404).json({ error: 'Firm not found.' });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.patch('/api/companies/:id', async (req: Authed, res, next) => { try {
    const existing = await owned(prisma.company, req.params.id, req.userId!);
    if (!existing)
        return res.status(404).json({ error: 'Firm not found.' });
    const b = req.body || {};
    if (!validFirmType(b.firmType) || !validPriority(b.priority))
        return res.status(400).json({ error: 'Enter a valid firm type and priority.' });
    const item = await prisma.company.update({ where: { id: existing.id }, data: { name: b.name?.trim() || undefined, website: b.website === undefined ? undefined : b.website?.trim() || null, careersUrl: validatedOpportunityUrl(b.careersUrl), firmType: b.firmType === undefined ? undefined : b.firmType || null, priority: b.priority, category: b.category === undefined ? undefined : b.category?.trim() || null, notes: b.notes === undefined ? undefined : b.notes?.trim() || null }, include: { offices: true } });
    res.json(item);
}
catch (e) {
    next(e);
} });
app.delete('/api/companies/:id', async (req: Authed, res, next) => { try {
    const existing = await owned(prisma.company, req.params.id, req.userId!);
    if (!existing)
        return res.status(404).json({ error: 'Firm not found.' });
    const [opportunities, contacts, tasks] = await Promise.all([prisma.opportunity.count({ where: { companyId: existing.id, userId: req.userId } }), prisma.contact.count({ where: { companyId: existing.id, userId: req.userId } }), prisma.task.count({ where: { companyId: existing.id, userId: req.userId } })]);
    if (opportunities || contacts || tasks)
        return res.status(409).json({ error: 'This firm has linked recruiting records. Remove or reassign them before deleting the firm.' });
    await prisma.company.delete({ where: { id: existing.id } });
    res.status(204).end();
}
catch (e) {
    next(e);
} });
app.post('/api/companies/:id/offices', async (req: Authed, res, next) => { try {
    const company = await owned(prisma.company, req.params.id, req.userId!);
    if (!company)
        return res.status(404).json({ error: 'Firm not found.' });
    const b = req.body || {}, city = String(b.city || '').trim();
    if (!city)
        return res.status(400).json({ error: 'Office city is required.' });
    if (!validPriority(b.priority))
        return res.status(400).json({ error: 'Enter a valid office priority.' });
    const office = await prisma.office.create({ data: { companyId: company.id, userId: req.userId!, city, region: b.region?.trim() || null, country: b.country?.trim() || null, targetStatus: b.targetStatus || 'TARGET', priority: b.priority || 'MEDIUM' } });
    res.status(201).json(office);
}
catch (e: any) {
    if (e.code === 'P2002')
        return res.status(409).json({ error: 'That target office already exists for this firm.' });
    next(e);
} });
app.patch('/api/offices/:id', async (req: Authed, res, next) => { try {
    const existing = await owned(prisma.office, req.params.id, req.userId!);
    if (!existing)
        return res.status(404).json({ error: 'Target office not found.' });
    const b = req.body || {};
    if (!validPriority(b.priority))
        return res.status(400).json({ error: 'Enter a valid office priority.' });
    const office = await prisma.office.update({ where: { id: existing.id }, data: { city: b.city?.trim() || undefined, region: b.region === undefined ? undefined : b.region?.trim() || null, country: b.country === undefined ? undefined : b.country?.trim() || null, targetStatus: b.targetStatus, priority: b.priority } });
    res.json(office);
}
catch (e) {
    next(e);
} });
app.delete('/api/offices/:id', async (req: Authed, res, next) => { try {
    const existing = await owned(prisma.office, req.params.id, req.userId!);
    if (!existing)
        return res.status(404).json({ error: 'Target office not found.' });
    await prisma.office.delete({ where: { id: existing.id } });
    res.status(204).end();
}
catch (e) {
    next(e);
} });
app.delete('/api/contacts/:id', async (req: Authed, res, next) => { try {
    const contact = await owned(prisma.contact, req.params.id, req.userId!);
    if (!contact)
        return res.status(404).json({ error: 'Contact not found.' });
    const [taskCount, plannedCount] = await Promise.all([prisma.task.count({ where: { userId: req.userId, contactId: contact.id } }), prisma.plannedInteraction.count({ where: { userId: req.userId, contactId: contact.id, OR: [{ status: 'SCHEDULED' }, { status: 'CANCELED', calendarEventId: { not: null } }] } })]);
    if (taskCount)
        return res.status(409).json({ error: 'Remove or reassign linked tasks before deleting this contact.' });
    if (plannedCount)
        return res.status(409).json({ error: 'Cancel upcoming interactions and finish any Calendar cleanup before deleting this contact.' });
    await prisma.$transaction(async (tx) => { const interactions = await tx.interaction.findMany({ where: { userId: req.userId, contactId: contact.id }, select: { id: true } }), entityIds = [contact.id, ...interactions.map(x => x.id)]; await tx.activity.deleteMany({ where: { userId: req.userId, entityId: { in: entityIds } } }); await tx.interaction.deleteMany({ where: { userId: req.userId, contactId: contact.id } }); await tx.contact.delete({ where: { id: contact.id } }); });
    res.status(204).end();
}
catch (e) {
    next(e);
} });

const csvCell=(value:unknown)=>{let text=String(value??'');if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
app.get('/api/export/opportunities',async(req:Authed,res,next)=>{try{
 const rows=await prisma.opportunity.findMany({where:{userId:req.userId},include:{company:true,applications:{where:{userId:req.userId},select:{currentStage:true}}},orderBy:{createdAt:'asc'}});
 const csv=[['Firm','Role','Location','Deadline','Stage','Priority','Job URL'],...rows.map(x=>[x.company.name,x.roleTitle,x.location,x.applicationDeadline?.toISOString().slice(0,10),x.applications[0]?.currentStage||x.status,x.priority,x.jobUrl])].map(row=>row.map(csvCell).join(',')).join('\r\n');
 res.type('text/csv').attachment('consulting-opportunities.csv').send(csv);
}catch(e){next(e)}});
const clientDist = path.resolve(process.cwd(), 'client/dist');
app.use(express.static(clientDist));
app.get('/{*path}', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(clientDist, 'index.html')));
app.use((e: any, _req: Request, res: Response, _next: NextFunction) => { console.error(e); res.status(500).json({ error: 'Something went wrong. Please try again.' }); });
app.listen(port, () => console.log(`API running on ${port}`));
