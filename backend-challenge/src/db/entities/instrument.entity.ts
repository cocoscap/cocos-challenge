import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'instruments' })
export class Instrument {
  @PrimaryGeneratedColumn({ name: 'id', type: 'int' })
  id!: number;

  @Column({ name: 'ticker', type: 'varchar', length: 10, nullable: true })
  ticker!: string;

  @Column({ name: 'name', type: 'varchar', length: 255, nullable: true })
  name!: string;

  @Column({ name: 'type', type: 'varchar', length: 10, nullable: true })
  type!: string;
}
