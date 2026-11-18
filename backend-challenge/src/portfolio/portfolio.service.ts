import { In } from 'typeorm';
import { computeAccountState } from '../account/account-state';
import { findLedgerOrders } from '../account/account.repository';
import type { Db } from '../db/db';
import { Instrument } from '../db/entities/instrument.entity';
import { User } from '../db/entities/user.entity';
import { findLatestPrices } from '../market/market.repository';
import { userNotFound } from '../shared/errors';
import { type Portfolio, buildPortfolio } from './portfolio.builder';

export async function getPortfolio(db: Db, userId: number): Promise<Portfolio> {
  const user = await db.manager.findOneBy(User, { id: userId });
  if (!user) {
    throw userNotFound(userId);
  }

  const state = computeAccountState(await findLedgerOrders(db.manager, userId));

  const heldIds = [...state.holdings]
    .filter(([, holding]) => holding.quantity > 0)
    .map(([instrumentId]) => instrumentId);
  const instruments = heldIds.length > 0 ? await db.manager.findBy(Instrument, { id: In(heldIds) }) : [];
  const prices = await findLatestPrices(db.manager, heldIds);

  return buildPortfolio({ userId, state, instruments, prices });
}
