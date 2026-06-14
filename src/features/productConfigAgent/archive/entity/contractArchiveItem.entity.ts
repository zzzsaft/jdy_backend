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
import { ContractArchive } from "./contractArchive.entity.js";
import { ContractArchiveItemProduct } from "./contractArchiveItemProduct.entity.js";

export type ContractArchiveItemProductNumberStatus =
  | "missing"
  | "inherited"
  | "partially_bound"
  | "bound"
  | "ambiguous";

@Entity({ name: "contract_archive_items", schema: "quote_agent" })
@Unique(["archiveId", "itemIndex"])
@Index(["archiveId"])
@Index(["sourceProductNumber"])
@Index(["productTypeHint"])
@Index(["productNumberStatus"])
export class ContractArchiveItem extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "bigint" })
  id: string;

  @Column({ name: "archive_id", type: "bigint" })
  archiveId: string;

  @Column({ name: "document_id", type: "bigint" })
  documentId: string;

  @Column({ name: "extraction_result_id", type: "bigint" })
  extractionResultId: string;

  @Column({ name: "item_index", type: "int" })
  itemIndex: number;

  @Column({ name: "item_name", type: "text", nullable: true })
  itemName: string | null;

  @Column({ name: "item_quantity", type: "text", nullable: true })
  itemQuantity: string | null;

  @Column({ name: "product_type_hint", type: "text" })
  productTypeHint: string;

  @Column({ name: "product_type_raw_value", type: "text", nullable: true })
  productTypeRawValue: string | null;

  @Column({ name: "product_type_display_name", type: "text", nullable: true })
  productTypeDisplayName: string | null;

  @Column({ name: "source_product_number", type: "text", nullable: true })
  sourceProductNumber: string | null;

  @Column({ name: "product_number_status", type: "varchar", length: 50 })
  productNumberStatus: ContractArchiveItemProductNumberStatus;

  @Column("jsonb", { name: "fields_jsonb", default: () => "'[]'::jsonb" })
  fieldsJsonb: unknown;

  @Column("jsonb", { name: "warnings_jsonb", default: () => "'[]'::jsonb" })
  warningsJsonb: unknown;

  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamp" })
  updatedAt: Date;

  @ManyToOne(() => ContractArchive, (archive) => archive.items, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "archive_id" })
  archive: Relation<ContractArchive>;

  @OneToMany(() => ContractArchiveItemProduct, (product) => product.item)
  productBindings: Relation<ContractArchiveItemProduct[]>;
}
