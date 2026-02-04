-- Database Schema for Cloud Connect Backup Manager
-- Production-ready PostgreSQL schema with encryption and indexing

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Backups table with encrypted content
CREATE TABLE backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    source VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    content_preview TEXT,
    encrypted_data TEXT NOT NULL,
    encryption_iv VARCHAR(255),
    file_type VARCHAR(50),
    checksum VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT size_positive CHECK (size_bytes > 0)
);

-- Projects table (extracted from backups)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    backup_id UUID REFERENCES backups(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    type VARCHAR(100) NOT NULL,
    description TEXT,
    source VARCHAR(100) NOT NULL,
    language VARCHAR(50),
    lines_of_code INTEGER,
    features JSONB DEFAULT '[]',
    code TEXT NOT NULL,
    tags JSONB DEFAULT '[]',
    starred BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT loc_positive CHECK (lines_of_code >= 0)
);

-- API Keys table for programmatic access
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    key_name VARCHAR(255) NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, key_name)
);

-- Audit log table for security tracking
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analytics events table
CREATE TABLE analytics_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_name VARCHAR(100) NOT NULL,
    event_properties JSONB DEFAULT '{}',
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_backups_user_id ON backups(user_id);
CREATE INDEX idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX idx_backups_source ON backups(source);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_backup_id ON projects(backup_id);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX idx_projects_type ON projects(type);
CREATE INDEX idx_projects_source ON projects(source);
CREATE INDEX idx_projects_starred ON projects(starred) WHERE starred = true;
CREATE INDEX idx_projects_tags ON projects USING GIN(tags);
CREATE INDEX idx_projects_features ON projects USING GIN(features);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

CREATE INDEX idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX idx_analytics_events_name ON analytics_events(event_name);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_backups_updated_at BEFORE UPDATE ON backups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for analytics
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    u.id,
    u.email,
    u.company_name,
    COUNT(DISTINCT b.id) as total_backups,
    COUNT(DISTINCT p.id) as total_projects,
    SUM(b.size_bytes) as total_storage_bytes,
    MAX(b.created_at) as last_backup_date
FROM users u
LEFT JOIN backups b ON u.id = b.user_id
LEFT JOIN projects p ON u.id = p.user_id
GROUP BY u.id, u.email, u.company_name;

CREATE OR REPLACE VIEW project_timeline AS
SELECT 
    p.id,
    p.user_id,
    p.name,
    p.type,
    p.source,
    p.created_at,
    DATE(p.created_at) as date,
    u.email as user_email
FROM projects p
JOIN users u ON p.user_id = u.id
ORDER BY p.created_at DESC;

-- Insert default admin user (password: ChangeMe123!)
-- Hash generated with bcrypt cost 10
INSERT INTO users (email, password_hash, subscription_tier, is_active)
VALUES ('admin@cloudconnect.com', '$2a$10$rEZYLQqXKX5GjQKjzN7TK.xGxWJKlZH8KsHJN5FKvLYP8DJdYr8Me', 'enterprise', true);
