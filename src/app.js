import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pinoHttp from 'pino-http';
import {
  User,
  Notice,
  Event,
  Registration,
  Assignment,
  Submission,
  Complaint,
} from './models.js';
const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const text = (min, max) => z.string().trim().min(min).max(max);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (v) => Buffer.byteLength(v, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes.',
  );
const authInput = z.object({
  email,
  password: z
    .string()
    .min(1)
    .max(72)
    .refine(
      (v) => Buffer.byteLength(v, 'utf8') <= 72,
      'Password must be at most 72 UTF-8 bytes.',
    ),
});
const registerInput = z.object({ name: text(2, 80), email, password });
const noticeInput = z.object({ title: text(3, 120), body: text(10, 5000) });
const date = z
  .string()
  .datetime({ offset: true })
  .refine((v) => new Date(v) > new Date(), 'Date must be in the future');
const eventInput = z.object({
  title: text(3, 120),
  description: text(10, 5000),
  location: text(2, 120),
  date,
  capacity: z.number().int().min(1).max(10000),
});
const assignmentInput = z.object({
  title: text(3, 120),
  description: text(10, 5000),
  due: date,
});
const complaintInput = z.object({
  title: text(3, 120),
  description: text(10, 5000),
  category: z.enum(['Academic', 'Hostel', 'IT', 'Facilities']),
});
const userView = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  branch: u.branch,
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const oid = (value) => {
  if (!/^[a-f\d]{24}$/i.test(value))
    throw fail(400, 'Invalid record identifier.');
  return value;
};
const login = (req, res, next) =>
  req.user ? next() : next(fail(401, 'Please sign in.'));
const roles =
  (...allowed) =>
  (req, res, next) =>
    req.user && allowed.includes(req.user.role)
      ? next()
      : next(fail(403, 'You do not have permission.'));
const paging = (req) => {
  const p = Number(req.query.page ?? 1),
    limit = Number(req.query.limit ?? 8);
  if (
    !Number.isInteger(p) ||
    p < 1 ||
    p > 100000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  )
    throw fail(400, 'Invalid pagination.');
  return { page: p, limit, skip: (p - 1) * limit };
};
async function list(req, res, Model, filter = {}, populate = []) {
  const { page, limit, skip } = paging(req);
  let q = Model.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit);
  for (const p of populate) q = q.populate(p, 'name title email');
  const [items, total] = await Promise.all([q, Model.countDocuments(filter)]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}
const saveSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
export function createApp({
  mongoUrl,
  secret,
  production = false,
  uploadDir = './uploads',
  sessionStore,
  logging = true,
  trustProxy = false,
} = {}) {
  if (!secret || secret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': production ? [] : null,
        },
      },
    }),
  );
  if (logging)
    app.use(
      pinoHttp({
        redact: [
          'req.headers.cookie',
          'req.headers.authorization',
          'res.headers.set-cookie',
        ],
        autoLogging: { ignore: (req) => req.url === '/health' },
      }),
    );
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(
    session({
      name: 'campus.sid',
      secret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore ?? MongoStore.create({ mongoUrl, ttl: 3600 }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: production,
        maxAge: 3600000,
      },
    }),
  );
  app.use('/api', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    req.session.csrf ??= randomBytes(32).toString('hex');
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.get('x-csrf-token') !== req.session.csrf
    )
      throw fail(403, 'Invalid CSRF token. Refresh the page and try again.');
    if (req.session.userId) {
      req.user = await User.findById(req.session.userId);
      if (!req.user) delete req.session.userId;
    }
    next();
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Try again later.' },
  });
  app.get('/api/session', (req, res) =>
    res.json({
      user: req.user ? userView(req.user) : null,
      csrf: req.session.csrf,
    }),
  );
  async function establish(req, user) {
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.userId = String(user._id);
    req.session.csrf = randomBytes(32).toString('hex');
    await saveSession(req);
    return { user: userView(user), csrf: req.session.csrf };
  }
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const input = registerInput.parse(req.body);
    const user = await User.create({
      ...input,
      password: await bcrypt.hash(input.password, 12),
      role: 'student',
    });
    res.status(201).json(await establish(req, user));
  });
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const input = authInput.parse(req.body);
    const user = await User.findOne({ email: input.email }).select('+password');
    if (!user || !(await bcrypt.compare(input.password, user.password)))
      throw fail(401, 'Invalid email or password.');
    res.json(await establish(req, user));
  });
  app.post('/api/auth/logout', login, async (req, res) => {
    await new Promise((resolve, reject) =>
      req.session.destroy((e) => (e ? reject(e) : resolve())),
    );
    res.clearCookie('campus.sid', {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
    });
    res.json({ message: 'Signed out.' });
  });
  app.get('/api/dashboard', login, async (req, res) => {
    const scope = req.user.role === 'student' ? { student: req.user._id } : {};
    const [notices, events, assignments, complaints] = await Promise.all([
      Notice.countDocuments(),
      Event.countDocuments({ date: { $gte: new Date() } }),
      Assignment.countDocuments({ due: { $gte: new Date() } }),
      Complaint.countDocuments({ ...scope, status: { $ne: 'Resolved' } }),
    ]);
    res.json({ notices, events, assignments, complaints });
  });
  app.patch('/api/me', login, async (req, res) => {
    const input = z
      .object({ name: text(2, 80), branch: text(0, 80) })
      .parse(req.body);
    Object.assign(req.user, input);
    await req.user.save();
    res.json({ user: userView(req.user) });
  });
  app.get('/api/notices', login, (req, res) =>
    list(req, res, Notice, {}, ['author']),
  );
  app.post('/api/notices', login, roles('admin', 'faculty'), async (req, res) =>
    res.status(201).json(
      await Notice.create({
        ...noticeInput.parse(req.body),
        author: req.user._id,
      }),
    ),
  );
  app.delete(
    '/api/notices/:id',
    login,
    roles('admin', 'faculty'),
    async (req, res) => {
      const n = await Notice.findById(oid(req.params.id));
      if (!n) throw fail(404, 'Notice not found.');
      if (req.user.role !== 'admin' && !n.author.equals(req.user._id))
        throw fail(403, 'Only the author can delete this notice.');
      await n.deleteOne();
      res.json({ message: 'Notice deleted.' });
    },
  );
  app.get('/api/events', login, (req, res) => list(req, res, Event));
  app.post('/api/events', login, roles('admin', 'faculty'), async (req, res) =>
    res.status(201).json(
      await Event.create({
        ...eventInput.parse(req.body),
        author: req.user._id,
      }),
    ),
  );
  app.get('/api/registrations', login, roles('student'), (req, res) =>
    list(req, res, Registration, { student: req.user._id }, ['event']),
  );
  app.post(
    '/api/events/:id/register',
    login,
    roles('student'),
    async (req, res) => {
      const id = oid(req.params.id);
      let reserved = false;
      if (await Registration.exists({ event: id, student: req.user._id }))
        throw fail(409, 'You already registered for this event.');
      const event = await Event.findOneAndUpdate(
        {
          _id: id,
          date: { $gt: new Date() },
          $expr: { $lt: ['$registered', '$capacity'] },
        },
        { $inc: { registered: 1 } },
        { new: true },
      );
      if (!event) throw fail(409, 'Event is full, closed, or unavailable.');
      reserved = true;
      try {
        const r = await Registration.create({
          event: id,
          student: req.user._id,
        });
        res.status(201).json(r);
      } catch (e) {
        if (reserved)
          await Event.updateOne({ _id: id }, { $inc: { registered: -1 } });
        throw e;
      }
    },
  );
  app.get('/api/assignments', login, (req, res) =>
    list(req, res, Assignment, {}, ['author']),
  );
  app.post(
    '/api/assignments',
    login,
    roles('admin', 'faculty'),
    async (req, res) =>
      res.status(201).json(
        await Assignment.create({
          ...assignmentInput.parse(req.body),
          author: req.user._id,
        }),
      ),
  );
  app.get('/api/complaints', login, (req, res) =>
    list(
      req,
      res,
      Complaint,
      req.user.role === 'student' ? { student: req.user._id } : {},
      ['student'],
    ),
  );
  app.post('/api/complaints', login, roles('student'), async (req, res) =>
    res.status(201).json(
      await Complaint.create({
        ...complaintInput.parse(req.body),
        student: req.user._id,
      }),
    ),
  );
  app.patch('/api/complaints/:id', login, roles('admin'), async (req, res) => {
    const { status } = z
      .object({ status: z.enum(['Open', 'In Progress', 'Resolved']) })
      .parse(req.body);
    const c = await Complaint.findByIdAndUpdate(
      oid(req.params.id),
      { status },
      { new: true, runValidators: true },
    );
    if (!c) throw fail(404, 'Complaint not found.');
    res.json(c);
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 },
    fileFilter: (req, file, cb) =>
      cb(
        null,
        file.mimetype === 'application/pdf' &&
          path.extname(file.originalname).toLowerCase() === '.pdf',
      ),
  });
  const disk = path.resolve(uploadDir);
  async function storePdf(file) {
    if (!file || file.buffer.subarray(0, 5).toString() !== '%PDF-')
      throw fail(400, 'Upload a valid PDF file, maximum 5 MB.');
    await fs.mkdir(disk, { recursive: true });
    const name = randomUUID() + '.pdf';
    await fs.writeFile(path.join(disk, name), file.buffer, { flag: 'wx' });
    return name;
  }
  const erase = async (name) => {
    if (name)
      await fs.unlink(path.join(disk, path.basename(name))).catch(() => {});
  };
  app.post(
    '/api/me/resume',
    login,
    roles('student'),
    upload.single('file'),
    async (req, res) => {
      const name = await storePdf(req.file);
      const user = await User.findById(req.user._id).select('+resume');
      const old = user.resume;
      try {
        user.resume = name;
        await user.save();
      } catch (e) {
        await erase(name);
        throw e;
      }
      await erase(old);
      res.json({ message: 'Resume uploaded.' });
    },
  );
  app.get('/api/me/resume', login, async (req, res) => {
    const user = await User.findById(req.user._id).select('+resume');
    if (!user.resume) throw fail(404, 'No resume uploaded.');
    res.download(
      path.join(disk, path.basename(user.resume)),
      'resume.pdf',
      (e) => {
        if (e && !res.headersSent)
          res.status(404).json({ error: 'File unavailable.' });
      },
    );
  });
  app.post(
    '/api/assignments/:id/submit',
    login,
    roles('student'),
    upload.single('file'),
    async (req, res) => {
      const assignment = await Assignment.findById(oid(req.params.id));
      if (!assignment) throw fail(404, 'Assignment not found.');
      if (assignment.due < new Date())
        throw fail(409, 'Submission deadline has passed.');
      const file = await storePdf(req.file);
      try {
        const s = await Submission.create({
          assignment: assignment._id,
          student: req.user._id,
          file,
        });
        res.status(201).json({ id: s._id, message: 'Assignment submitted.' });
      } catch (e) {
        await erase(file);
        throw e;
      }
    },
  );
  app.get('/api/submissions', login, async (req, res) => {
    let filter = { student: req.user._id };
    if (req.user.role === 'admin') filter = {};
    if (req.user.role === 'faculty')
      filter = {
        assignment: {
          $in: (
            await Assignment.find({ author: req.user._id }).select('_id')
          ).map((a) => a._id),
        },
      };
    return list(req, res, Submission, filter, ['assignment', 'student']);
  });
  app.get('/api/submissions/:id/file', login, async (req, res) => {
    const s = await Submission.findById(oid(req.params.id)).populate(
      'assignment',
    );
    if (!s) throw fail(404, 'Submission not found.');
    if (
      req.user.role !== 'admin' &&
      !s.student.equals(req.user._id) &&
      !(
        req.user.role === 'faculty' && s.assignment?.author.equals(req.user._id)
      )
    )
      throw fail(403, 'This file is private.');
    res.download(
      path.join(disk, path.basename(s.file)),
      'submission.pdf',
      (e) => {
        if (e && !res.headersSent)
          res.status(404).json({ error: 'File unavailable.' });
      },
    );
  });
  app.get('/api/users', login, roles('admin'), (req, res) =>
    list(req, res, User),
  );
  app.post('/api/users', login, roles('admin'), async (req, res) => {
    const input = registerInput
      .extend({ role: z.enum(['faculty', 'student']) })
      .parse(req.body);
    const user = await User.create({
      ...input,
      password: await bcrypt.hash(input.password, 12),
    });
    res.status(201).json(userView(user));
  });
  app.use('/api', (req, res) =>
    res.status(404).json({ error: 'API endpoint not found.' }),
  );
  app.use(express.static(publicDir, { index: 'index.html' }));
  app.use((req, res) => res.status(404).send('Page not found.'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = error.status || 500,
      message =
        status < 500
          ? error.message
          : 'Something went wrong. Please try again.';
    if (error instanceof z.ZodError) {
      status = 400;
      message = error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
    }
    if (error.code === 11000) {
      status = 409;
      message = 'This email, registration, or submission already exists.';
    }
    if (error instanceof multer.MulterError) {
      status = 400;
      message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'File must be 5 MB or smaller.'
          : 'Invalid upload.';
    }
    if (error.name === 'CastError') {
      status = 400;
      message = 'Invalid identifier.';
    }
    if (status >= 500) req.log?.error({ err: error }, 'Request failed');
    res.status(status).json({ error: message });
  });
  return app;
}
