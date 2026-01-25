import { Column, Entity } from "typeorm";
import AbstractContent from "../../../entity/AbstractContent";

export type BestSignSignerStatus = {
  operationStatus?: string;
  userType?: string;
  roleName?: string;
};

@Entity()
export class BestSignContractRecord extends AbstractContent {
  @Column({ nullable: true })
  contractId: string;

  @Column({ nullable: true })
  draftId: string;

  @Column({ nullable: true })
  bizNo: string;

  @Column({ nullable: true })
  status: string;

  @Column("timestamp", { nullable: true })
  sendTime: Date;

  @Column({ nullable: true })
  senderName: string;

  @Column({ nullable: true })
  senderPhone: string;

  @Column({ nullable: true })
  senderEnterpriseName: string;

  @Column("simple-json", { nullable: true })
  enabledDocumentIds: string[];

  @Column("simple-json", { nullable: true })
  signerStatus: BestSignSignerStatus[];
}
