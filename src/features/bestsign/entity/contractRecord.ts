import { Column, Entity } from "typeorm";
import AbstractContent from "../../../entity/AbstractContent";

export type BestSignSignerStatus = {
  operationStatus?: string;
  userType?: string;
  roleName?: string;
  signType?: string;
  receiverId?: string;
  signerAccount?: string;
  signerEnterpriseName?: string;
  originUserAccounts?: string[];
};

@Entity({ name: "bestsign_contract_record" })
export class BestSignContractRecord extends AbstractContent {
  @Column({ name: "contract_id", nullable: true })
  contractId: string;

  @Column({ name: "draft_id", nullable: true })
  draftId: string;

  @Column({ name: "biz_no", nullable: true })
  bizNo: string;

  @Column({ name: "template_id", nullable: true })
  templateId: string;

  @Column({ name: "template_name", nullable: true })
  templateName: string;

  @Column({ name: "status", nullable: true })
  status: string;

  @Column("timestamp", { name: "send_time", nullable: true })
  sendTime: Date;

  @Column("timestamp", { name: "finish_time", nullable: true })
  finishTime: Date;

  @Column({ name: "sender_name", nullable: true })
  senderName: string;

  @Column({ name: "sender_phone", nullable: true })
  senderPhone: string;

  @Column({ name: "sender_enterprise_name", nullable: true })
  senderEnterpriseName: string;

  @Column({ name: "jdy_id", nullable: true })
  jdyId: string;

  // BestSign overview: sender.name (display name)
  @Column({ name: "overview_sender_name", nullable: true })
  overviewSenderName: string;

  // BestSign overview: per-document labels (subContractId + labels)
  @Column("jsonb", { name: "overview_labels", nullable: true })
  overviewLabels: Array<{
    subContractId?: string;
    docTitle?: string;
    labels?: Array<{ name: string; value: string }>;
  }>;

  // BestSign overview: signer/participant summary fields
  @Column("jsonb", { name: "overview_participants", nullable: true })
  overviewParticipants: Array<{
    participantName?: string;
    userType?: string;
    receiverType?: string | null;
    roleName?: string | null;
    account?: string | null;
    name?: string | null;
    receiverId?: string | null;
    routeOrder?: number | null;
    status?: string | null;
    finishTime?: number | null;
    signShortUrl?: string | null;
  }>;

  @Column("simple-json", { name: "enabled_document_ids", nullable: true })
  enabledDocumentIds: string[];

  @Column("simple-json", { name: "signer_status", nullable: true })
  signerStatus: BestSignSignerStatus[];

  // Idempotency flags for duplicated BestSign notifications.
  @Column({ name: "after_sign_uploaded", type: "boolean", default: false })
  afterSignUploaded: boolean;

  @Column({ name: "archive_uploaded", type: "boolean", default: false })
  archiveUploaded: boolean;
}
