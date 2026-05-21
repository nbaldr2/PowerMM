import { Router } from 'express';
import { query, transaction } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate, schemas } from '../middleware/validate.js';
import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';
import multer from 'multer';
import dns from 'dns';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const router = Router();
const resolveMx = promisify(dns.resolveMx);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Known disposable email domains (subset)
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'maildrop.cc', 'fakeinbox.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'guerrillamail.info', 'trashmail.com',
  'dispostable.com', 'temp-mail.org', '10minutemail.com',
]);

// Role-based email prefixes
const ROLE_PREFIXES = new Set([
  'admin', 'noreply', 'no-reply', 'postmaster', 'webmaster', 'hostmaster',
  'abuse', 'info', 'support', 'sales', 'contact', 'office', 'help',
  'mailer-daemon', 'root', 'security',
]);

// GET /lists
router.get('/', authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM recipient_lists WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ lists: rows });
});

// POST /lists — create list
router.post('/', authenticate, authorize('admin', 'operator'), validate(schemas.recipientList), async (req, res) => {
  const { name, description } = req.validated;
  const { rows } = await query(
    'INSERT INTO recipient_lists (user_id, name, description) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, name, description || '']
  );
  res.status(201).json({ list: rows[0] });
});

// POST /lists/:id/import — import recipients from CSV or raw text
router.post('/:id/import', authenticate, authorize('admin', 'operator'), upload.single('file'), async (req, res) => {
  try {
    const { rows: listRows } = await query('SELECT * FROM recipient_lists WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (listRows.length === 0) return res.status(404).json({ error: 'List not found' });

    let records = [];

    if (req.file) {
      // CSV upload
      const content = req.file.buffer.toString('utf8');
      const parsed = csvParse(content, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });

      // Auto-detect column mapping
      for (const row of parsed) {
        const email = row.email || row.Email || row.EMAIL || row['e-mail'] || row['Email Address'] || Object.values(row).find(v => v && v.includes('@'));
        if (!email || !email.includes('@')) continue;
        records.push({
          email: email.toLowerCase().trim(),
          firstname: row.firstname || row.first_name || row.FirstName || row.first || '',
          lastname: row.lastname || row.last_name || row.LastName || row.last || '',
          company: row.company || row.Company || row.organization || '',
          phone: row.phone || row.Phone || row.telephone || '',
          city: row.city || row.City || '',
          country: row.country || row.Country || '',
          jobtitle: row.jobtitle || row.job_title || row.title || row.Title || '',
          address: row.address || row.Address || '',
        });
      }
    } else if (req.body.emails) {
      // Raw text paste (one email per line)
      const lines = req.body.emails.split('\n').map(l => l.trim()).filter(l => l.includes('@'));
      records = lines.map(email => ({ email: email.toLowerCase() }));
    }

    if (records.length === 0) return res.status(400).json({ error: 'No valid emails found' });

    // Deduplicate
    const seen = new Set();
    const unique = [];
    let duplicates = 0;
    for (const rec of records) {
      if (seen.has(rec.email)) { duplicates++; continue; }
      seen.add(rec.email);
      unique.push(rec);
    }

    // Check against existing in this list
    const { rows: existingRows } = await query('SELECT email FROM recipients WHERE list_id = $1', [req.params.id]);
    const existingSet = new Set(existingRows.map(r => r.email));
    const toInsert = unique.filter(r => {
      if (existingSet.has(r.email)) { duplicates++; return false; }
      return true;
    });

    // Insert in batches
    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      await transaction(async (client) => {
        for (const rec of batch) {
          const parts = rec.email.split('@');
          await client.query(
            `INSERT INTO recipients (list_id, email, email_user, email_domain, firstname, lastname, company, phone, city, country, jobtitle, address, domain)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
            [req.params.id, rec.email, parts[0], parts[1], rec.firstname || '', rec.lastname || '',
             rec.company || '', rec.phone || '', rec.city || '', rec.country || '',
             rec.jobtitle || '', rec.address || '', parts[1]]
          );
          inserted++;
        }
      });
    }

    // Update list counts
    await query(
      'UPDATE recipient_lists SET record_count = record_count + $1, duplicate_count = $2, updated_at = NOW() WHERE id = $3',
      [inserted, duplicates, req.params.id]
    );

    logger.info(`Imported ${inserted} recipients to list ${req.params.id} (${duplicates} duplicates skipped)`);
    res.json({ imported: inserted, duplicates, total: records.length });
  } catch (err) {
    logger.error('Import error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

// POST /lists/:id/hygiene — run list hygiene checks
router.post('/:id/hygiene', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT id, email, email_domain FROM recipients WHERE list_id = $1 AND status = $2',
    [req.params.id, 'active']
  );

  let valid = 0, invalid = 0, disposable = 0, roleBased = 0, mxValid = 0;
  const mxCache = new Map();

  for (const rec of rows) {
    const domain = rec.email_domain;
    const prefix = rec.email.split('@')[0].toLowerCase();

    // Disposable check
    if (DISPOSABLE_DOMAINS.has(domain)) {
      disposable++;
      await query("UPDATE recipients SET status = 'invalid' WHERE id = $1", [rec.id]);
      continue;
    }

    // Role-based check
    if (ROLE_PREFIXES.has(prefix)) {
      roleBased++;
    }

    // MX check (cached per domain)
    if (!mxCache.has(domain)) {
      try {
        const mx = await resolveMx(domain);
        mxCache.set(domain, mx && mx.length > 0);
      } catch {
        mxCache.set(domain, false);
      }
    }

    if (mxCache.get(domain)) {
      mxValid++;
      valid++;
      await query('UPDATE recipients SET mx_valid = TRUE WHERE id = $1', [rec.id]);
    } else {
      invalid++;
      await query("UPDATE recipients SET mx_valid = FALSE, status = 'invalid' WHERE id = $1", [rec.id]);
    }
  }

  const total = rows.length;
  const score = total > 0 ? Math.round((valid / total) * 100) : 0;

  await query(
    'UPDATE recipient_lists SET valid_count = $1, invalid_count = $2, hygiene_score = $3, updated_at = NOW() WHERE id = $4',
    [valid, invalid, score, req.params.id]
  );

  res.json({ total, valid, invalid, disposable, roleBased, mxValid, hygieneScore: score });
});

// GET /lists/:id/export — export list to CSV
router.get('/:id/export', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT email, firstname, lastname, company, phone, city, country, jobtitle, domain, status FROM recipients WHERE list_id = $1',
    [req.params.id]
  );
  const csv = csvStringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="list-${req.params.id}.csv"`);
  res.send(csv);
});

// DELETE /lists/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  await query('DELETE FROM recipient_lists WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ message: 'List deleted' });
});

// ============================================================
// SUPPRESSION LIST
// ============================================================
router.get('/suppression', authenticate, async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM suppression_list WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500',
    [req.user.id]
  );
  res.json({ suppressions: rows });
});

router.post('/suppression', authenticate, async (req, res) => {
  const { email, reason } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  await query(
    'INSERT INTO suppression_list (user_id, email, reason) VALUES ($1, $2, $3) ON CONFLICT (user_id, email) DO NOTHING',
    [req.user.id, email.toLowerCase(), reason || 'manual']
  );
  res.json({ message: 'Added to suppression list' });
});

router.delete('/suppression/:id', authenticate, async (req, res) => {
  await query('DELETE FROM suppression_list WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ message: 'Removed from suppression list' });
});

export default router;
