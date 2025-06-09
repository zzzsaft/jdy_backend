import {
  Entity,
  PrimaryColumn,
  Column,
  OneToMany,
  PrimaryGeneratedColumn,
  JoinColumn,
  ManyToOne,
  Unique,
  BaseEntity,
} from "typeorm";
import AbstractContent from "../AbstractContent";

@Entity({ name: "crm_external_contact" })
export class ExternalContact extends BaseEntity {
  @PrimaryColumn()
  external_userid: string; // 外部联系人的userid

  @Column({ nullable: true })
  name: string; // 外部联系人的名称

  @Column({ nullable: true })
  avatar: string; // 外部联系人头像

  @Column({ nullable: true, name: "company_jdy_id" })
  companyJdyId: string; //

  @Column({ nullable: true, name: "company_name" })
  companyName: string; //

  @Column()
  type: number; // 外部联系人的类型，1表示该外部联系人是微信用户，2表示该外部联系人是企业微信用户

  @Column({ default: 0 })
  gender: number; // 外部联系人性别 0-未知 1-男性 2-女性

  @Column({ nullable: true })
  unionid: string; // 外部联系人在微信开放平台的唯一身份标识

  @Column({ nullable: true })
  position: string; // 外部联系人的职位
  @Column({ nullable: true })
  remark_name: string; // 外部联系人的备注名称
  @Column({ nullable: true })
  mobile: string; // 外部联系人的手机号码
  @Column({ nullable: true })
  remark: string; // 外部联系人的备注
  @Column({ nullable: true })
  is_key_decision_maker: boolean; // 是否为决策人

  @Column({ nullable: true })
  corp_name: string; // 外部联系人所在企业的简称

  @Column({ nullable: true })
  corp_full_name: string; // 外部联系人所在企业的主体名称

  @Column("simple-json", { nullable: true })
  external_profile: any; // 外部联系人的自定义展示信息

  // 启用级联插入和更新
  @OneToMany(() => FollowUser, (followUser) => followUser.external_contact, {
    cascade: true, // 自动保存关联的 FollowUser
    onDelete: "CASCADE", // 删除 ExternalContact 时自动删除关联的 FollowUser
  })
  follow_users: FollowUser[];
}

// @Unique(["external_userid", "userid"]) // 添加唯一约束
@Entity()
export class FollowUser extends BaseEntity {
  @PrimaryColumn()
  external_userid: string; // 外部联系人的userid，用于关联

  @PrimaryColumn()
  userid: string; // 添加了此外部联系人的企业成员userid

  @Column({ nullable: true })
  remark: string; // 该成员对此外部联系人的备注

  @Column({ nullable: true })
  description: string; // 该成员对此外部联系人的描述

  @Column({ nullable: true })
  createtime: Date; // 该成员添加此外部联系人的时间

  @Column("simple-json", { nullable: true })
  tags: {
    group_name?: string; // 标签的分组名称
    tag_name?: string; // 标签名称
    type?: number; // 标签类型, 1-企业设置，2-用户自定义，3-规则组标签
    tag_id?: string; // 企业标签的id
  }[];

  @Column({ nullable: true })
  remark_corp_name: string; // 该成员对此微信客户备注的企业名称

  @Column("simple-array", { nullable: true })
  remark_mobiles: string[]; // 该成员对此客户备注的手机号码

  @Column({ nullable: true })
  add_way: string; // 该成员添加此客户的来源文字描述

  @Column("simple-json", { nullable: true })
  wechat_channels: {
    nickname?: string;
    source?: string;
  }; // 视频号信息

  @Column({ nullable: true })
  oper_userid: string; // 发起添加的userid

  @ManyToOne(
    () => ExternalContact,
    (externalContact) => externalContact.follow_users
  )
  @JoinColumn({ name: "external_userid" })
  external_contact: ExternalContact;

  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  created_at: Date;

  @Column({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
  })
  updated_at: Date;
}
