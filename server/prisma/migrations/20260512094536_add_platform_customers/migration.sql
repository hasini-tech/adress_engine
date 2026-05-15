-- CreateTable
CREATE TABLE `platform_customers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `scoringApiKeyId` INTEGER NOT NULL,
    `externalId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `rawData` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `platform_customers_scoringApiKeyId_externalId_key`(`scoringApiKeyId`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_customers` ADD CONSTRAINT `platform_customers_scoringApiKeyId_fkey` FOREIGN KEY (`scoringApiKeyId`) REFERENCES `scoring_api_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
