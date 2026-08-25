-- Prisma Migrate creates a throwaway "shadow database" to diff migrations
-- against. That needs CREATE DATABASE rights, which the default compose user
-- does not get. Scope the grant to the shadow-db name pattern rather than *.*.
GRANT ALL PRIVILEGES ON `reachinbox`.* TO 'reachinbox'@'%';
GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db%`.* TO 'reachinbox'@'%';
FLUSH PRIVILEGES;
