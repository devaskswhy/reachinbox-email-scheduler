-- CreateTable
CREATE TABLE `senders` (
    `id` VARCHAR(191) NOT NULL,
    `poolIndex` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `smtpHost` VARCHAR(191) NOT NULL,
    `smtpPort` INTEGER NOT NULL,
    `smtpUser` VARCHAR(191) NOT NULL,
    `smtpPass` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `senders_poolIndex_key`(`poolIndex`),
    UNIQUE INDEX `senders_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `campaigns` (
    `id` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `delayMs` INTEGER NOT NULL,
    `hourlyLimit` INTEGER NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `campaigns_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `recipientEmail` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `scheduledFor` DATETIME(3) NOT NULL,
    `status` ENUM('PENDING', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'RESCHEDULED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `providerMessageId` VARCHAR(512) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `email_jobs_status_scheduledFor_idx`(`status`, `scheduledFor`),
    INDEX `email_jobs_senderId_status_idx`(`senderId`, `status`),
    INDEX `email_jobs_campaignId_idx`(`campaignId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `email_jobs` ADD CONSTRAINT `email_jobs_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_jobs` ADD CONSTRAINT `email_jobs_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `senders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
