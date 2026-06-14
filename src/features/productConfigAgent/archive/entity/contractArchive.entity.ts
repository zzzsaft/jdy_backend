import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Documents } from "../../workflow/entity/documents.entity.js";
import { ExtractionResults } from "../../extraction/entity/extractionResults.entity.js";
import { ContractArchiveItem } from "./contractArchiveItem.entity.js";
import { ContractArchiveVersion } from "./contractArchiveVersion.entity.js";

@Entity({ name: "contract_archives", schema: "quote_agent" })
@Unique(["documentId", "extractionResultId"])
@Index(["status"])
@Index(["productNumber"])
@Index(["customerId"])
@Index(["contractNumber"])
@Index(["orderNumber"])
export class ContractArchive extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "document_id", type: "bigint" })
  documentId: string;

  @Column({ name: "extraction_result_id", type: "bigint" })
  extractionResultId: string;

  @Column({ type: "varchar", length: 50, default: "archived" })
  status: string;

  @Column({ name: "product_number", type: "text", nullable: true })
  productNumber: string | null;

  @Column({ name: "contract_number", type: "text", nullable: true })
  contractNumber: string | null;

  @Column({ name: "order_number", type: "text", nullable: true })
  orderNumber: string | null;

  @Column({ name: "customer_id", type: "text", nullable: true })
  customerId: string | null;

  @Column({ type: "text", nullable: true })
  country: string | null;

  @Column({ name: "order_date", type: "date", nullable: true })
  orderDate: string | null;

  @Column({ name: "delivery_date", type: "date", nullable: true })
  deliveryDate: string | null;

  @Column("jsonb", { name: "doc_info_jsonb", default: () => "'{}'::jsonb" })
  docInfoJsonb: unknown;

  @Column({ name: "current_version", type: "int", default: 1 })
  currentVersion: number;

  @Column({ name: "archived_by", type: "text", nullable: true })
  archivedBy: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;

  @ManyToOne(() => Documents, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document: Relation<Documents>;

  @ManyToOne(() => ExtractionResults, { onDelete: "CASCADE" })
  @JoinColumn({ name: "extraction_result_id" })
  extractionResult: Relation<ExtractionResults>;

  @OneToMany(() => ContractArchiveItem, (item) => item.archive)
  items: Relation<ContractArchiveItem[]>;

  @OneToMany(() => ContractArchiveVersion, (version) => version.archive)
  versions: Relation<ContractArchiveVersion[]>;
}
