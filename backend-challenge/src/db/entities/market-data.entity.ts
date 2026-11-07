import Decimal from 'decimal.js';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../decimal-transformer';

const price = { type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: decimalTransformer } as const;

@Entity({ name: 'marketdata' })
export class MarketData {
  @PrimaryGeneratedColumn({ name: 'id', type: 'int' })
  id!: number;

  @Column({ name: 'instrumentid', type: 'int', nullable: true })
  instrumentId!: number;

  @Column({ name: 'high', ...price })
  high!: Decimal | null;

  @Column({ name: 'low', ...price })
  low!: Decimal | null;

  @Column({ name: 'open', ...price })
  open!: Decimal | null;

  @Column({ name: 'close', ...price })
  close!: Decimal | null;

  @Column({ name: 'previousclose', ...price })
  previousClose!: Decimal | null;

  /** Fecha del registro, como texto `YYYY-MM-DD`. */
  @Column({ name: 'date', type: 'date', nullable: true })
  date!: string;
}
