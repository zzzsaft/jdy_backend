import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "crm_quote_item_share" })
export class QuoteItemShare extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "quote_item_id" })
  quoteItemId: number;

  @Column({ unique: true })
  uuid: string;

  @Column()
  pwd: string;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ default: false })
  editable: boolean;

  @Column({ default: false })
  disabled: boolean;

  @Column({ name: "expires_at", type: "timestamp", nullable: true })
  expiresAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
