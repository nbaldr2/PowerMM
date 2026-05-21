-- PowerMM Database Schema
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS & AUTH
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer')),
    quota_daily INTEGER DEFAULT 50000,
    quota_used_today INTEGER DEFAULT 0,
    quota_reset_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255),
    device VARCHAR(255),
    ip_address VARCHAR(45),
    user_agent TEXT,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);

CREATE TABLE password_resets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SMTP SERVERS
-- ============================================================
CREATE TABLE smtp_servers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) DEFAULT 'Default',
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 587,
    encryption VARCHAR(10) DEFAULT 'NONE' CHECK (encryption IN ('NONE', 'TLS', 'SSL')),
    username VARCHAR(255),
    password_encrypted TEXT,
    pool_name VARCHAR(100) DEFAULT 'default',
    weight INTEGER DEFAULT 1,
    daily_limit INTEGER DEFAULT 100000,
    sent_today INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5,2) DEFAULT 0.00,
    max_bounce_rate DECIMAL(5,2) DEFAULT 5.00,
    status VARCHAR(20) DEFAULT 'unknown' CHECK (status IN ('connected', 'auth_failed', 'timeout', 'error', 'unknown', 'disabled')),
    last_checked_at TIMESTAMPTZ,
    latency_ms INTEGER,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_smtp_user ON smtp_servers(user_id);
CREATE INDEX idx_smtp_pool ON smtp_servers(pool_name);

-- ============================================================
-- RECIPIENT LISTS
-- ============================================================
CREATE TABLE recipient_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    record_count INTEGER DEFAULT 0,
    valid_count INTEGER DEFAULT 0,
    invalid_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    hygiene_score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lists_user ON recipient_lists(user_id);

CREATE TABLE recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    list_id UUID NOT NULL REFERENCES recipient_lists(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    email_user VARCHAR(255),
    email_domain VARCHAR(255),
    firstname VARCHAR(255),
    lastname VARCHAR(255),
    company VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    city VARCHAR(255),
    country VARCHAR(255),
    jobtitle VARCHAR(255),
    domain VARCHAR(255),
    custom_fields JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'bounced', 'unsubscribed', 'invalid', 'suppressed')),
    mx_valid BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipients_list ON recipients(list_id);
CREATE INDEX idx_recipients_email ON recipients(email);
CREATE INDEX idx_recipients_status ON recipients(status);

-- ============================================================
-- SUPPRESSION LIST
-- ============================================================
CREATE TABLE suppression_list (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    reason VARCHAR(50) DEFAULT 'manual' CHECK (reason IN ('manual', 'bounce', 'unsubscribe', 'complaint', 'import')),
    source_campaign_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, email)
);

CREATE INDEX idx_suppression_user ON suppression_list(user_id);
CREATE INDEX idx_suppression_email ON suppression_list(email);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    reply_to VARCHAR(255),
    html_body TEXT,
    text_body TEXT,
    custom_headers TEXT,
    redirect_url TEXT,
    logo_url TEXT,
    list_id UUID REFERENCES recipient_lists(id),
    smtp_server_id UUID REFERENCES smtp_servers(id),
    pool_name VARCHAR(100),
    -- All engine settings stored as JSONB
    inbox_shield JSONB DEFAULT '{}',
    content_randomizer JSONB DEFAULT '{}',
    creative_engine JSONB DEFAULT '{}',
    batch_settings JSONB DEFAULT '{"batchSize":1000,"speedMode":"Normal","batchDelay":100,"emailDelay":10}',
    seed_settings JSONB DEFAULT '{"enabled":false,"delay":30,"addresses":[]}',
    -- A/B testing
    ab_variants JSONB,
    ab_winner_criteria VARCHAR(20),
    ab_winner_after_hours INTEGER,
    -- Status
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'failed', 'cancelled')),
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    -- Counters
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,
    unsubscribe_count INTEGER DEFAULT 0,
    complaint_count INTEGER DEFAULT 0,
    -- Progress tracking
    last_processed_offset INTEGER DEFAULT 0,
    send_rate DECIMAL(10,2) DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_user ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_list ON campaigns(list_id);

-- ============================================================
-- SEND LOG
-- ============================================================
CREATE TABLE send_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES recipients(id),
    email VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('sent', 'delivered', 'failed', 'bounced', 'deferred', 'skipped')),
    smtp_server_id UUID REFERENCES smtp_servers(id),
    message_id VARCHAR(255),
    error_msg TEXT,
    bounce_type VARCHAR(10) CHECK (bounce_type IN ('hard', 'soft')),
    bounce_code VARCHAR(10),
    retry_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sendlog_campaign ON send_log(campaign_id);
CREATE INDEX idx_sendlog_email ON send_log(email);
CREATE INDEX idx_sendlog_status ON send_log(status);
CREATE INDEX idx_sendlog_msgid ON send_log(message_id);

-- ============================================================
-- TRACKING EVENTS
-- ============================================================
CREATE TABLE tracking_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    send_log_id UUID REFERENCES send_log(id),
    recipient_email VARCHAR(255),
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('open', 'click', 'unsubscribe', 'complaint', 'bounce')),
    url TEXT,
    user_agent TEXT,
    ip_address VARCHAR(45),
    country VARCHAR(100),
    city VARCHAR(100),
    device VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracking_campaign ON tracking_events(campaign_id);
CREATE INDEX idx_tracking_type ON tracking_events(event_type);
CREATE INDEX idx_tracking_sendlog ON tracking_events(send_log_id);

-- ============================================================
-- PMTA CONFIGS
-- ============================================================
CREATE TABLE pmta_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    server_name VARCHAR(255) DEFAULT 'Default',
    ssh_host VARCHAR(255),
    ssh_port INTEGER DEFAULT 22,
    ssh_user VARCHAR(100) DEFAULT 'root',
    domain VARCHAR(255),
    hostname VARCHAR(255),
    primary_ip VARCHAR(45),
    secondary_ips TEXT,
    dkim_selector VARCHAR(100) DEFAULT 'dkim',
    dkim_private_key TEXT,
    dkim_public_key TEXT,
    smtp_user VARCHAR(255),
    smtp_pass_encrypted TEXT,
    smtp_port INTEGER DEFAULT 2525,
    monitor_port INTEGER DEFAULT 1983,
    config_text TEXT,
    isp_rules JSONB DEFAULT '[]',
    status VARCHAR(20) DEFAULT 'unknown',
    installed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pmta_user ON pmta_configs(user_id);

-- ============================================================
-- WEBHOOKS
-- ============================================================
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events TEXT[] DEFAULT '{}',
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- API KEYS
-- ============================================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    prefix VARCHAR(10) NOT NULL,
    permissions TEXT[] DEFAULT '{"read"}',
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_apikeys_hash ON api_keys(key_hash);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);

-- ============================================================
-- TEMPLATES (saved email templates)
-- ============================================================
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject TEXT,
    html_body TEXT,
    text_body TEXT,
    category VARCHAR(100),
    is_shared BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED DEFAULT ADMIN
-- ============================================================
-- Password: admin123 (bcrypt hash)
INSERT INTO users (email, password_hash, name, role, quota_daily)
VALUES (
    'admin@moonmailer.pro',
    '$2a$12$LJ3lFjT1GC0Y7XkYZjQxGODgN.8iKExNt8FfF5AwEXylEg8dWNTdW',
    'Admin',
    'admin',
    1000000
) ON CONFLICT (email) DO NOTHING;
