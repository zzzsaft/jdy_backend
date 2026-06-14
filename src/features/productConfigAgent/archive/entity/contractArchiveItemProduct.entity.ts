import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { ContractArchive } from "./contractArchive.entity.js";
import { ContractArchiveItem } from "./contractArchiveItem.entity.js";

export type ContractArchiveItemProductRole =
  | "primary"
  | "component"
  | "spare_part"
  | "derived"
  | "unknown";

export type ContractArchiveItemProductBindingSource =
  | "document"
  | "erp"
  | "manual"
  | "rule"
  | "inherited";

export type ContractArchiveItemProductErpMatchStatus =
  | "unmatched"
  | "matched"
  | "ambiguous"
  | "manual";

@Entity({ name: "contract_archive_item_products", schema: "quote_agent" })
@Unique(["archiveItemId", "productNumber"])
@Index(["archiveId"])
@Index(["archiveItemId"])
@Index(["productNumber"])
@Index(["erpProductId"])
@Index(["role"])
export class ContractArchiveItemProduct extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "archive_id", type: "bigint" })
  archiveId: string;

  @Column({ name: "archive_item_id", type: "bigint" })
  archiveItemId: string;

  @Column({ name: "product_number", type: "text" })
  productNumber: string;

  @Column({ type: "varchar", length: 50, default: "unknown" })
  role: ContractArchiveItemProductRole;

  @Column({ type: "text", nullable: true })
  quantity: string | null;

  @Column({ name: "binding_source", type: "varchar", length: 50 })
  bindingSource: ContractArchiveItemProductBindingSource;

  @Column({ type: "float", nullable: true })
  confidence: number | null;

  @Column({ name: "erp_product_id", type: "text", nullable: true })
  erpProductId: string | null;

  @Column({ name: "erp_parent_product_number", type: "text", nullable: true })
  erpParentProductNumber: string | null;

  @Column({
    name: "erp_match_status",
    type: "varchar",
    length: 50,
    default: "unmatched",
  })
  erpMatchStatus: ContractArchiveItemProductErpMatchStatus;

  @Column("jsonb", { name: "evidence_jsonb", nullable: true })
  evidenceJsonb: unknown | null;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;

  @ManyToOne(() => ContractArchive, { onDelete: "CASCADE" })
  @JoinColumn({ name: "archive_id" })
  archive: Relation<ContractArchive>;

  @ManyToOne(() => ContractArchiveItem, (item) => item.productBindings, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "archive_item_id" })
  item: Relation<ContractArchiveItem>;
}
