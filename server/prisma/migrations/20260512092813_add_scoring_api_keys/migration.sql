-- CreateTable
CREATE TABLE `clients` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `client_id` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `company` VARCHAR(255) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(100) NULL,
    `country` VARCHAR(100) NULL,
    `postal_code` VARCHAR(50) NULL,
    `quality_score` INTEGER NULL,
    `quality_band` VARCHAR(50) NULL,
    `metadata` JSON NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `import_id` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `clients_client_id_key`(`client_id`),
    INDEX `clients_email_idx`(`email`),
    INDEX `clients_phone_idx`(`phone`),
    INDEX `clients_company_idx`(`company`),
    INDEX `clients_city_idx`(`city`),
    INDEX `clients_import_id_idx`(`import_id`),
    INDEX `clients_quality_band_idx`(`quality_band`),
    FULLTEXT INDEX `clients_name_email_company_city_idx`(`name`, `email`, `company`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `import_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `import_id` VARCHAR(100) NOT NULL,
    `file_name` VARCHAR(255) NULL,
    `file_size` BIGINT NULL DEFAULT 0,
    `total_records` INTEGER NOT NULL DEFAULT 0,
    `processed` INTEGER NOT NULL DEFAULT 0,
    `inserted_records` INTEGER NOT NULL DEFAULT 0,
    `updated_records` INTEGER NOT NULL DEFAULT 0,
    `failed_records` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(50) NOT NULL DEFAULT 'pending',
    `error_message` TEXT NULL,
    `detected_schema` JSON NULL,
    `field_mappings` JSON NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `duration_ms` INTEGER NULL DEFAULT 0,

    UNIQUE INDEX `import_logs_import_id_key`(`import_id`),
    INDEX `import_logs_status_idx`(`status`),
    INDEX `import_logs_started_at_idx`(`started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scoring_api_keys` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiKey` TEXT NOT NULL,
    `apiKeyPreview` VARCHAR(191) NULL,
    `label` VARCHAR(191) NULL,
    `platform` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'saved',
    `band` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
