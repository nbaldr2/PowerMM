import { z } from 'zod';

/**
 * Zod validation middleware factory.
 * @param {z.ZodSchema} schema - Zod schema to validate request body against
 */
export function validate(schema) {
  return (req, res, next) => {
    try {
      req.validated = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

/**
 * Validate query parameters.
 */
export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.validatedQuery = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
}

// ============================================================
// Shared Schemas
// ============================================================

export const schemas = {
  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),

  register: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1).max(255),
  }),

  smtpServer: z.object({
    name: z.string().min(1).max(255).optional(),
    host: z.string().min(1, 'SMTP host is required'),
    port: z.number().int().min(1).max(65535).default(587),
    encryption: z.enum(['NONE', 'TLS', 'SSL']).default('NONE'),
    username: z.string().optional(),
    password: z.string().optional(),
    pool_name: z.string().default('default'),
    weight: z.number().int().min(1).max(100).default(1),
    daily_limit: z.number().int().min(0).default(100000),
  }),

  campaign: z.object({
    name: z.string().min(1).max(255),
    subject: z.string().min(1, 'Subject is required'),
    from_email: z.string().email('Invalid from email'),
    from_name: z.string().optional(),
    reply_to: z.string().email().optional().or(z.literal('')),
    html_body: z.string().min(1, 'HTML body is required'),
    text_body: z.string().optional(),
    custom_headers: z.string().optional(),
    redirect_url: z.string().url().optional().or(z.literal('')),
    logo_url: z.string().url().optional().or(z.literal('')),
    list_id: z.string().uuid().optional(),
    smtp_server_id: z.string().uuid().optional(),
    pool_name: z.string().optional(),
    inbox_shield: z.record(z.any()).optional(),
    content_randomizer: z.record(z.any()).optional(),
    creative_engine: z.record(z.any()).optional(),
    batch_settings: z.object({
      batchSize: z.number().int().default(1000),
      speedMode: z.enum(['Normal', 'Turbo', 'Ludicrous']).default('Normal'),
      batchDelay: z.number().int().min(0).default(100),
      emailDelay: z.number().int().min(0).default(10),
      keepAlive: z.boolean().default(true),
      connectionPooling: z.boolean().default(true),
      gcOptimize: z.boolean().default(false),
    }).optional(),
    seed_settings: z.object({
      enabled: z.boolean().default(false),
      delay: z.number().int().default(30),
      addresses: z.array(z.string().email()).default([]),
    }).optional(),
    recipients_raw: z.string().optional(), // direct paste, one per line
  }),

  recipientList: z.object({
    name: z.string().min(1).max(255),
    description: z.string().optional(),
  }),

  pmtaConfig: z.object({
    server_name: z.string().optional(),
    ssh_host: z.string().min(1),
    ssh_port: z.number().int().default(22),
    ssh_user: z.string().default('root'),
    ssh_password: z.string().optional(),
    ssh_private_key: z.string().optional(),
    domain: z.string().min(1),
    hostname: z.string().optional(),
    primary_ip: z.string().min(1),
    secondary_ips: z.string().optional(),
    dkim_selector: z.string().default('dkim'),
    smtp_user: z.string().optional(),
    smtp_pass: z.string().optional(),
    smtp_port: z.number().int().default(2525),
    monitor_port: z.number().int().default(1983),
    config_text: z.string().optional(),
    isp_rules: z.array(z.any()).optional(),
  }),

  webhook: z.object({
    url: z.string().url(),
    events: z.array(z.enum(['on_open', 'on_click', 'on_bounce', 'on_unsubscribe', 'on_complaint'])),
    secret: z.string().optional(),
  }),
};
