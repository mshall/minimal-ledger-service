import type { Database } from '../db/client.js';
import { createDbContext } from '../db/client.js';
import { loadConfig } from '../config.js';
import { balanceFromJournal, mapAccountRow } from '../domain/account.js';
import { getLogger } from '../observability/logger.js';
import { ledgerBalanceDriftTotal } from '../observability/metrics.js';
import { AccountsRepository } from '../repositories/accounts.repo.js';
import { EntriesRepository } from '../repositories/entries.repo.js';

export type BalanceDrift = {
  accountId: string;
  materialised: string;
  journal: string;
  delta: string;
};

export type BalanceVerificationReport = {
  checkedAt: string;
  accountsChecked: number;
  drifts: BalanceDrift[];
};

export async function verifyBalances(db: Database): Promise<BalanceVerificationReport> {
  const accountsRepo = new AccountsRepository();
  const entriesRepo = new EntriesRepository();
  const logger = getLogger();

  const accountIds = await accountsRepo.listAllAccountIds(db);
  const drifts: BalanceDrift[] = [];

  for (const accountId of accountIds) {
    const accountRow = await accountsRepo.findById(db, accountId);
    if (!accountRow) {
      continue;
    }
    const account = mapAccountRow(accountRow);
    const balanceRow = await accountsRepo.getBalance(db, accountId);
    if (!balanceRow) {
      continue;
    }

    const { debits, credits } = await entriesRepo.sumJournalByAccount(db, accountId);
    const journalBalance = balanceFromJournal(account.type, debits, credits);
    const materialised = balanceRow.balance;

    if (journalBalance !== materialised) {
      drifts.push({
        accountId,
        materialised: materialised.toString(),
        journal: journalBalance.toString(),
        delta: (materialised - journalBalance).toString(),
      });
    }
  }

  if (drifts.length > 0) {
    ledgerBalanceDriftTotal.inc(drifts.length);
    logger.error({ drifts, count: drifts.length }, 'Balance drift detected');
  } else {
    logger.info({ accountsChecked: accountIds.length }, 'Balance verification passed');
  }

  return {
    checkedAt: new Date().toISOString(),
    accountsChecked: accountIds.length,
    drifts,
  };
}

async function runCli(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDbContext(config);
  try {
    const report = await verifyBalances(db);
    console.log(JSON.stringify(report, null, 2));
    if (report.drifts.length > 0) {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

const isCli = process.argv[1]?.includes('balance-verification') && process.argv.includes('--cli');
if (isCli) {
  runCli().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

export function startBalanceVerificationScheduler(
  db: Database,
  intervalMs: number,
): NodeJS.Timeout | undefined {
  if (intervalMs <= 0) {
    return undefined;
  }
  return setInterval(() => {
    void verifyBalances(db);
  }, intervalMs);
}
