-- ============================================
-- CLIENT DATA IMPORT DATABASE SCHEMA
-- ============================================

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS client_data;
USE client_data;

-- ============================================
-- CLIENTS TABLE (Main table)
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(50),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_imported_at TIMESTAMP NULL,
    import_source VARCHAR(255),
    import_batch_id VARCHAR(100),
    
    -- Status flags
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    notes TEXT,
    
    PRIMARY KEY (id),
    UNIQUE KEY uk_client_id (client_id),
    
    -- Indexes for performance
    INDEX idx_email (email(100)),
    INDEX idx_company (company(100)),
    INDEX idx_phone (phone(20)),
    INDEX idx_city (city(50)),
    INDEX idx_country (country(50)),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    INDEX idx_is_active (is_active),
    INDEX idx_last_imported (last_imported_at),
    
    -- Full-text search indexes
    FULLTEXT idx_fulltext_search (name, email, company, address, city, state, country)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- IMPORT HISTORY TABLE (Track all imports)
-- ============================================
CREATE TABLE IF NOT EXISTS import_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    import_id VARCHAR(100) NOT NULL,
    file_name VARCHAR(255),
    original_filename VARCHAR(255),
    
    -- Statistics
    total_records INT DEFAULT 0,
    inserted_records INT DEFAULT 0,
    updated_records INT DEFAULT 0,
    failed_records INT DEFAULT 0,
    skipped_records INT DEFAULT 0,
    
    -- Import settings
    import_mode ENUM('insert', 'update', 'upsert') DEFAULT 'upsert',
    dry_run BOOLEAN DEFAULT FALSE,
    
    -- Timing
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    duration_ms INT,
    
    -- Status
    status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
    
    -- Error handling
    error_message TEXT,
    stack_trace TEXT,
    
    -- User info (if available)
    imported_by VARCHAR(100),
    user_ip VARCHAR(45),
    
    -- Metadata
    file_size BIGINT,
    file_hash VARCHAR(64),
    checksum VARCHAR(64),
    
    PRIMARY KEY (id),
    UNIQUE KEY uk_import_id (import_id),
    
    -- Indexes
    INDEX idx_status (status),
    INDEX idx_started_at (started_at),
    INDEX idx_completed_at (completed_at),
    INDEX idx_imported_by (imported_by),
    INDEX idx_file_name (file_name(100)),
    
    -- Composite indexes
    INDEX idx_status_started (status, started_at),
    INDEX idx_import_mode_status (import_mode, status)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- IMPORT ERRORS TABLE (Failed records)
-- ============================================
CREATE TABLE IF NOT EXISTS import_errors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    import_history_id BIGINT UNSIGNED NOT NULL,
    
    -- Error details
    row_number INT NOT NULL,
    client_data JSON,
    error_message TEXT NOT NULL,
    error_code VARCHAR(50),
    error_type ENUM('validation', 'database', 'system', 'duplicate') DEFAULT 'validation',
    
    -- Timestamp
    failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    
    -- Foreign key to import_history
    CONSTRAINT fk_import_errors_history
        FOREIGN KEY (import_history_id)
        REFERENCES import_history (id)
        ON DELETE CASCADE,
    
    -- Indexes
    INDEX idx_import_history (import_history_id),
    INDEX idx_failed_at (failed_at),
    INDEX idx_error_type (error_type),
    INDEX idx_row_number (row_number),
    
    -- Composite index
    INDEX idx_history_error_type (import_history_id, error_type)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- CLIENT_AUDIT TABLE (Track all changes)
-- ============================================
CREATE TABLE IF NOT EXISTS client_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id VARCHAR(100) NOT NULL,
    
    -- Change details
    changed_by VARCHAR(100),
    change_type ENUM('create', 'update', 'delete', 'import') DEFAULT 'update',
    import_batch_id VARCHAR(100),
    
    -- Old values (stored as JSON)
    old_values JSON,
    
    -- New values (stored as JSON)
    new_values JSON,
    
    -- Changed fields
    changed_fields JSON,
    
    -- Timestamp
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- IP address
    ip_address VARCHAR(45),
    
    -- User agent
    user_agent TEXT,
    
    PRIMARY KEY (id),
    
    -- Indexes
    INDEX idx_client_id (client_id),
    INDEX idx_changed_at (changed_at),
    INDEX idx_change_type (change_type),
    INDEX idx_import_batch (import_batch_id),
    
    -- Composite indexes
    INDEX idx_client_change_date (client_id, changed_at),
    INDEX idx_type_date (change_type, changed_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DUPLICATE_CLIENTS TABLE (Handle duplicates)
-- ============================================
CREATE TABLE IF NOT EXISTS duplicate_clients (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    
    -- Original client
    original_client_id VARCHAR(100),
    original_data JSON,
    
    -- Duplicate client
    duplicate_client_id VARCHAR(100),
    duplicate_data JSON,
    
    -- Match criteria
    match_type ENUM('email', 'phone', 'name_email', 'company_phone', 'multiple') DEFAULT 'email',
    match_score DECIMAL(5,2),
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolution_action ENUM('merge', 'keep_both', 'reject_duplicate', 'manual_review') DEFAULT 'manual_review',
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMP NULL,
    
    -- Import info
    import_batch_id VARCHAR(100),
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    
    -- Indexes
    INDEX idx_original_client (original_client_id),
    INDEX idx_duplicate_client (duplicate_client_id),
    INDEX idx_resolved (resolved),
    INDEX idx_detected_at (detected_at),
    INDEX idx_import_batch (import_batch_id),
    
    -- Composite index
    INDEX idx_resolution_status (resolved, resolution_action)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- IMPORT_SETTINGS TABLE (Configuration)
-- ============================================
CREATE TABLE IF NOT EXISTS import_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    
    -- Setting details
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT,
    setting_type ENUM('string', 'number', 'boolean', 'json', 'array') DEFAULT 'string',
    
    -- Description
    description TEXT,
    
    -- Category
    category VARCHAR(50) DEFAULT 'general',
    
    -- Validation
    validation_rules JSON,
    
    -- Audit
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    PRIMARY KEY (id),
    
    UNIQUE KEY uk_setting_key (setting_key),
    
    -- Indexes
    INDEX idx_category (category),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DEFAULT SETTINGS
-- ============================================
INSERT INTO import_settings (setting_key, setting_value, setting_type, description, category) VALUES
('import.batch_size', '1000', 'number', 'Number of records to process in each batch', 'performance'),
('import.max_file_size', '52428800', 'number', 'Maximum file size in bytes (50MB)', 'validation'),
('import.allowed_extensions', '["json", "csv"]', 'array', 'Allowed file extensions', 'validation'),
('import.default_mode', 'upsert', 'string', 'Default import mode (insert/update/upsert)', 'general'),
('import.enable_validation', 'true', 'boolean', 'Enable data validation before import', 'validation'),
('import.auto_detect_duplicates', 'true', 'boolean', 'Automatically detect duplicate clients', 'duplicates'),
('import.duplicate_match_threshold', '0.85', 'number', 'Minimum match score to flag as duplicate', 'duplicates'),
('import.enable_audit_log', 'true', 'boolean', 'Enable audit logging for all changes', 'audit'),
('import.retain_uploaded_files', 'false', 'boolean', 'Keep uploaded files after processing', 'storage'),
('import.max_retention_days', '30', 'number', 'Days to keep import history', 'retention'),
('import.timeout_seconds', '300', 'number', 'Import process timeout in seconds', 'performance'),
('import.max_concurrent_imports', '3', 'number', 'Maximum concurrent import processes', 'performance'),
('import.email_validation', 'strict', 'string', 'Email validation mode (strict/relaxed/none)', 'validation'),
('import.phone_validation', 'relaxed', 'string', 'Phone validation mode', 'validation'),
('import.required_fields', '["name", "email"]', 'array', 'Required fields for client data', 'validation');

-- ============================================
-- STORED PROCEDURES
-- ============================================

-- Procedure to get import statistics
DELIMITER $$

CREATE PROCEDURE GetImportStatistics(
    IN p_start_date DATE,
    IN p_end_date DATE
)
BEGIN
    SELECT
        DATE(started_at) as import_date,
        COUNT(*) as total_imports,
        SUM(total_records) as total_records,
        SUM(inserted_records) as inserted_records,
        SUM(updated_records) as updated_records,
        SUM(failed_records) as failed_records,
        AVG(duration_ms) as avg_duration_ms,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_imports,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_imports
    FROM import_history
    WHERE DATE(started_at) BETWEEN p_start_date AND p_end_date
    GROUP BY DATE(started_at)
    ORDER BY import_date DESC;
END$$

-- Procedure to cleanup old data
CREATE PROCEDURE CleanupOldData(
    IN p_retention_days INT
)
BEGIN
    -- Delete old import history
    DELETE FROM import_history 
    WHERE started_at < DATE_SUB(NOW(), INTERVAL p_retention_days DAY);
    
    -- Delete associated errors
    DELETE FROM import_errors 
    WHERE import_history_id NOT IN (SELECT id FROM import_history);
    
    -- Archive old client audit records
    INSERT INTO client_audit_archive
    SELECT * FROM client_audit 
    WHERE changed_at < DATE_SUB(NOW(), INTERVAL p_retention_days DAY);
    
    DELETE FROM client_audit 
    WHERE changed_at < DATE_SUB(NOW(), INTERVAL p_retention_days DAY);
    
    SELECT ROW_COUNT() as rows_deleted;
END$$

DELIMITER ;

-- ============================================
-- VIEWS
-- ============================================

-- View for recent imports
CREATE VIEW vw_recent_imports AS
SELECT
    import_id,
    file_name,
    total_records,
    inserted_records,
    updated_records,
    failed_records,
    status,
    started_at,
    completed_at,
    duration_ms,
    TIMESTAMPDIFF(SECOND, started_at, completed_at) as duration_seconds
FROM import_history
ORDER BY started_at DESC
LIMIT 100;

-- View for import success rates
CREATE VIEW vw_import_success_rates AS
SELECT
    DATE(started_at) as import_date,
    COUNT(*) as total_imports,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_imports,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_imports,
    ROUND(
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*) * 100, 
        2
    ) as success_rate_percentage,
    SUM(total_records) as total_records_processed,
    SUM(failed_records) as total_failed_records,
    ROUND(
        (SUM(total_records) - SUM(failed_records)) / SUM(total_records) * 100, 
        2
    ) as record_success_rate_percentage
FROM import_history
GROUP BY DATE(started_at)
ORDER BY import_date DESC;

-- View for client statistics
CREATE VIEW vw_client_statistics AS
SELECT
    COUNT(*) as total_clients,
    COUNT(DISTINCT email) as unique_emails,
    COUNT(DISTINCT phone) as unique_phones,
    COUNT(DISTINCT company) as unique_companies,
    COUNT(DISTINCT country) as countries_represented,
    COUNT(DISTINCT city) as cities_represented,
    SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_clients,
    SUM(CASE WHEN is_verified = TRUE THEN 1 ELSE 0 END) as verified_clients,
    DATE(created_at) as created_date,
    COUNT(*) as clients_created
FROM clients
GROUP BY DATE(created_at)
ORDER BY created_date DESC;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger for client audit logging
DELIMITER $$

CREATE TRIGGER trg_clients_after_update
AFTER UPDATE ON clients
FOR EACH ROW
BEGIN
    DECLARE changed_fields_json JSON;
    DECLARE old_values_json JSON;
    DECLARE new_values_json JSON;
    
    -- Build JSON of changed fields
    SET changed_fields_json = JSON_OBJECT();
    SET old_values_json = JSON_OBJECT();
    SET new_values_json = JSON_OBJECT();
    
    IF OLD.name != NEW.name THEN
        SET changed_fields_json = JSON_SET(changed_fields_json, '$.name', TRUE);
        SET old_values_json = JSON_SET(old_values_json, '$.name', OLD.name);
        SET new_values_json = JSON_SET(new_values_json, '$.name', NEW.name);
    END IF;
    
    IF OLD.email != NEW.email THEN
        SET changed_fields_json = JSON_SET(changed_fields_json, '$.email', TRUE);
        SET old_values_json = JSON_SET(old_values_json, '$.email', OLD.email);
        SET new_values_json = JSON_SET(new_values_json, '$.email', NEW.email);
    END IF;
    
    IF OLD.phone != NEW.phone THEN
        SET changed_fields_json = JSON_SET(changed_fields_json, '$.phone', TRUE);
        SET old_values_json = JSON_SET(old_values_json, '$.phone', OLD.phone);
        SET new_values_json = JSON_SET(new_values_json, '$.phone', NEW.phone);
    END IF;
    
    -- Only log if something actually changed
    IF JSON_LENGTH(changed_fields_json) > 0 THEN
        INSERT INTO client_audit (
            client_id,
            change_type,
            old_values,
            new_values,
            changed_fields,
            changed_at
        ) VALUES (
            NEW.client_id,
            'update',
            old_values_json,
            new_values_json,
            changed_fields_json,
            NOW()
        );
    END IF;
END$$

-- Trigger for new client creation
CREATE TRIGGER trg_clients_after_insert
AFTER INSERT ON clients
FOR EACH ROW
BEGIN
    INSERT INTO client_audit (
        client_id,
        change_type,
        new_values,
        changed_fields,
        changed_at
    ) VALUES (
        NEW.client_id,
        'create',
        JSON_OBJECT(
            'name', NEW.name,
            'email', NEW.email,
            'phone', NEW.phone,
            'company', NEW.company,
            'city', NEW.city,
            'country', NEW.country
        ),
        JSON_OBJECT(
            'name', TRUE,
            'email', TRUE,
            'phone', TRUE,
            'company', TRUE,
            'city', TRUE,
            'country', TRUE
        ),
        NOW()
    );
END$$

DELIMITER ;

-- ============================================
-- COMMENTS AND DOCUMENTATION
-- ============================================
COMMENT ON TABLE clients IS 'Main table storing all client information with full audit trail';
COMMENT ON TABLE import_history IS 'Tracks all import operations with detailed statistics';
COMMENT ON TABLE import_errors IS 'Stores validation and processing errors from imports';
COMMENT ON TABLE client_audit IS 'Audit trail for all client changes (who changed what and when)';
COMMENT ON TABLE duplicate_clients IS 'Identifies and manages duplicate client records';
COMMENT ON TABLE import_settings IS 'Configuration settings for the import system';

-- ============================================
-- GRANT PERMISSIONS (Adjust based on your setup)
-- ============================================
-- CREATE USER IF NOT EXISTS 'import_user'@'localhost' IDENTIFIED BY 'secure_password_here';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON client_data.* TO 'import_user'@'localhost';
-- GRANT EXECUTE ON PROCEDURE client_data.GetImportStatistics TO 'import_user'@'localhost';
-- GRANT EXECUTE ON PROCEDURE client_data.CleanupOldData TO 'import_user'@'localhost';
-- FLUSH PRIVILEGES;

-- ============================================
-- FINAL STATUS MESSAGE
-- ============================================
SELECT '✅ Database schema created successfully!' as message;
SELECT COUNT(*) as tables_created FROM information_schema.tables 
WHERE table_schema = 'client_data';