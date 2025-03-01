import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from "typeorm";

type staff = {
  id: number;
  name: string;
  position: string[];
  type: string;
};

@Entity({ name: "tyc_info" })
export class TycInfo extends BaseEntity {
  @PrimaryColumn({ type: "bigint" })
  id: number;

  @Column({ name: "staff_num_range", length: 200 })
  staffNumRange: string;

  @Column({ name: "from_time", type: "timestamp" })
  fromTime: Date;

  @Column({ name: "type" })
  type: string; // 1: 人, 2: 公司

  @Column({ name: "bond_name", length: 20 })
  bondName: string;

  @Column({ name: "is_micro_ent" })
  isMicroEnt: string; // 0: 不是, 1: 是

  @Column({ name: "used_bond_name", length: 50 })
  usedBondName: string;

  @Column({ name: "reg_number", length: 31 })
  regNumber: string;

  @Column({ name: "percentile_score" })
  percentileScore: number;

  @Column({ name: "reg_capital", length: 50 })
  regCapital: string;

  @Column({ name: "name", length: 255 })
  name: string;

  @Column({ name: "reg_institute", length: 255 })
  regInstitute: string;

  @Column({ name: "reg_location", length: 255 })
  regLocation: string;

  @Column({ name: "industry", length: 255 })
  industry: string;

  @Column({ name: "approved_time", type: "timestamp" })
  approvedTime: Date;

  @Column({ name: "update_times", type: "timestamp" })
  updateTimes: Date;

  @Column({ name: "social_staff_num" })
  socialStaffNum: number;

  @Column({ name: "tags", length: 255 })
  tags: string;

  @Column({ name: "tax_number", length: 255 })
  taxNumber: string;

  @Column({ name: "business_scope", length: 4091 })
  businessScope: string;

  @Column({ name: "property3", length: 255 })
  property3: string;

  @Column({ name: "alias", length: 255 })
  alias: string;

  @Column({ name: "org_number", length: 31 })
  orgNumber: string;

  @Column({ name: "reg_status", length: 31 })
  regStatus: string;

  @Column({ name: "estiblish_time", type: "date" })
  estiblishTime: Date;

  @Column({ name: "bond_type", length: 31 })
  bondType: string;

  @Column({ name: "legal_person_name", length: 120 })
  legalPersonName: string;

  @Column({ name: "to_time", type: "timestamp", nullable: true })
  toTime: Date;

  @Column({ name: "actual_capital", length: 50 })
  actualCapital: string;

  @Column({ name: "company_org_type", length: 127 })
  companyOrgType: string;

  @Column({ name: "base", length: 31 })
  base: string;

  @Column({ name: "credit_code", length: 255 })
  creditCode: string;

  @Column({ name: "history_names", length: 255 })
  historyNames: string;

  @Column({ name: "history_name_list", type: "json" })
  historyNameList: string[];

  @Column({ name: "bond_num", length: 20 })
  bondNum: string;

  @Column({ name: "reg_capital_currency", length: 10 })
  regCapitalCurrency: string;

  @Column({ name: "actual_capital_currency", length: 10 })
  actualCapitalCurrency: string;

  @Column({ name: "email", length: 1024 })
  email: string;

  @Column({ name: "website_list", type: "text" })
  websiteList: string;

  @Column({ name: "phone_number", length: 1024 })
  phoneNumber: string;

  @Column({ name: "revoke_date", type: "date" })
  revokeDate: Date;

  @Column({ name: "revoke_reason", length: 500 })
  revokeReason: string;

  @Column({ name: "cancel_date", type: "date" })
  cancelDate: Date;

  @Column({ name: "cancel_reason", length: 500 })
  cancelReason: string;

  @Column({ name: "city", length: 20 })
  city: string;

  @Column({ name: "district", length: 20 })
  district: string;

  @Column({ name: "staff_list", type: "json" })
  staffList: staff[];

  @Column({ name: "category", length: 255 })
  category: string;

  @Column({ name: "category_big", length: 255 })
  categoryBig: string;

  @Column({ name: "category_middle", length: 255 })
  categoryMiddle: string;

  @Column({ name: "category_small", length: 255 })
  categorySmall: string;

  @CreateDateColumn({ name: "created_at", nullable: true })
  createdAt: Date;
}
