import { PrismaClient, type Sender } from '@prisma/client';

import { loadRootEnv } from '../src/config/loadRootEnv.js';

loadRootEnv();

// nodemailer captures ETHEREAL_CACHE into a module-level const at import time
// and, while enabled (the default), hands back the SAME test account for every
// createTestAccount() call in a process. A sender pool needs N distinct
// inboxes, so the flag has to be set before the module is ever evaluated -
// which is why nodemailer is pulled in via dynamic import below rather than a
// hoisted static import.
process.env['ETHEREAL_CACHE'] = 'false';

const prisma = new PrismaClient();

const DEFAULT_POOL_SIZE = 3;
const MINT_ATTEMPTS = 5;

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number };
}

function resolvePoolSize(): number {
  const raw = process.env['SENDER_POOL_SIZE'];
  if (raw === undefined || raw.trim() === '') return DEFAULT_POOL_SIZE;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `SENDER_POOL_SIZE must be a positive integer, received ${JSON.stringify(raw)}`,
    );
  }
  return parsed;
}

/**
 * Mints an Ethereal inbox that no other sender is already using. Ethereal can
 * hand back an address we hold, so verify against the database and retry
 * rather than dying on a unique-constraint violation.
 */
async function mintUnusedAccount(): Promise<EtherealAccount> {
  const { default: nodemailer } = await import('nodemailer');

  for (let attempt = 1; attempt <= MINT_ATTEMPTS; attempt += 1) {
    const account = (await nodemailer.createTestAccount()) as EtherealAccount;
    const clash = await prisma.sender.findUnique({ where: { email: account.user } });
    if (!clash) return account;

    console.warn(
      `      (attempt ${attempt}: Ethereal returned ${account.user}, already in use - retrying)`,
    );
  }

  throw new Error(
    `Ethereal returned an already-used address ${MINT_ATTEMPTS} times in a row. ` +
      'Try again shortly, or lower SENDER_POOL_SIZE.',
  );
}

function report(sender: Sender, action: 'created' | 'reused'): void {
  const tag = action === 'created' ? 'minted new' : 'reusing existing';
  console.log(
    [
      ``,
      `  [${sender.poolIndex}] ${tag} Ethereal account`,
      `      label    : ${sender.label}`,
      `      email    : ${sender.email}`,
      `      smtp     : ${sender.smtpHost}:${sender.smtpPort}`,
      `      user     : ${sender.smtpUser}`,
      `      pass     : ${sender.smtpPass}`,
      `      webmail  : https://ethereal.email/login`,
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const poolSize = resolvePoolSize();
  console.log(`Seeding sender pool (SENDER_POOL_SIZE=${poolSize})`);

  let created = 0;
  let reused = 0;

  for (let poolIndex = 0; poolIndex < poolSize; poolIndex += 1) {
    // Ethereal accounts are real, remotely-minted inboxes holding test sends we
    // still want to review. Check before minting so a second run never burns a
    // new account or overwrites live credentials.
    const existing = await prisma.sender.findUnique({ where: { poolIndex } });

    if (existing) {
      report(existing, 'reused');
      reused += 1;
      continue;
    }

    const account = await mintUnusedAccount();

    const sender = await prisma.sender.upsert({
      where: { poolIndex },
      // Empty update: if a concurrent run claimed this slot first, keep its
      // credentials rather than clobbering them with the account just minted.
      update: {},
      create: {
        poolIndex,
        label: `Sender ${poolIndex + 1}`,
        email: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
      },
    });

    const wasCreated = sender.smtpUser === account.user;
    report(sender, wasCreated ? 'created' : 'reused');
    if (wasCreated) created += 1;
    else reused += 1;
  }

  const total = await prisma.sender.count();
  console.log(
    `\nSeed complete: ${created} created, ${reused} reused, ${total} sender(s) total.`,
  );
  console.log('Sign in at https://ethereal.email/login with the credentials above.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
