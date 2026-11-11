import Decimal from 'decimal.js';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { decimalTransformer } from '../decimal-transformer';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn({ name: 'id', type: 'int' })
  id!: number;

  @Column({ name: 'instrumentid', type: 'int', nullable: true })
  instrumentId!: number;

  @Column({ name: 'userid', type: 'int', nullable: true })
  userId!: number;

  @Column({ name: 'size', type: 'int', nullable: true })
  size!: number;

  @Column({
    name: 'price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  price!: Decimal | null;

  @Column({ name: 'type', type: 'varchar', length: 10, nullable: true })
  type!: string;

  @Column({ name: 'side', type: 'varchar', length: 10, nullable: true })
  side!: string;

  @Column({ name: 'status', type: 'varchar', length: 20, nullable: true })
  status!: string;

  @Column({ name: 'datetime', type: 'timestamp', nullable: true })
  datetime!: Date;
}
