import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Tree,
  ManyToOne,
  TreeParent,
  TreeChildren,
  BaseEntity,
} from "typeorm";

@Entity({ name: "crm_quote" })
export class Quote extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number; // 自增主键

  @Column({ name: "quote_id", unique: true })
  quoteId: string;

  @Column({ name: "order_id", unique: true })
  orderId: string;

  @Column({ name: "quote_number" })
  quoteNumber: number; // 第几次报价

  @Column({ nullable: true })
  type: string;

  @Column({ name: "quote_name", nullable: true })
  quoteName: string; // jdyid

  @Column({ name: "jdy_id", nullable: true, unique: true })
  jdyId: string; // jdyid

  @Column({ name: "opportunity_id", nullable: true })
  opportunityId: string; // opportunityId

  @Column({ name: "opportunity_name", nullable: true })
  opportunityName: string; // opportunityName

  @Column({ nullable: true })
  status: string; // 报价状态

  @Column({ name: "material", type: "simple-array", nullable: true })
  material: string[]; // 适用原料

  @Column({ name: "final_product", nullable: true })
  finalProduct: string; // 最终产品

  @Column({ name: "application_field", nullable: true })
  applicationField: string; // 应用领域

  @Column({ name: "currency_type", nullable: true })
  currencyType: string; // 货币类型

  @Column({ name: "customer_name", nullable: true })
  customerName: string; // 客户名称

  @Column({ name: "customer_id", nullable: true })
  customerId: string; // 客户id

  @Column({ name: "creator_id", nullable: true })
  creatorId: string; // 创建人id

  @Column({ name: "charger_id", nullable: true })
  chargerId: string; // 负责人id

  @Column({ name: "sales_support_id", nullable: true })
  salesSupportId: string; // 销售支持id

  @Column({ name: "project_manager_id", nullable: true })
  projectManagerId: string; // 项目管理id

  @Column({ name: "doc_creator_id", nullable: true })
  docCreatorId: string; // 文档创建人id

  @Column({ name: "is_closed", nullable: true })
  isClosed: boolean;

  @Column({ name: "customer_production_id", nullable: true })
  customerProductionId: string;

  @Column({
    name: "total_product_price",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  totalProductPrice: number; // 产品价格合计

  @Column({
    name: "discount_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  discountAmount: number; // 优惠金额

  @Column({
    name: "quote_amount",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  quoteAmount: number; // 报价单金额

  @Column({ name: "delivery_days", nullable: true })
  deliveryDays: number; // 交期天数

  @Column("jsonb", { name: "address", nullable: true })
  address: any; // 地址

  @Column("jsonb", { name: "quote_terms", nullable: true })
  quoteTerms: any; //

  @Column("jsonb", { name: "contract_terms", nullable: true })
  contractTerms: any; //

  @Column({ name: "need_print", default: true })
  needPrint: boolean;

  @Column({ name: "hide_item_price", default: true })
  hideItemPrice: boolean;

  @Column({ name: "contact_name", nullable: true })
  contactName: string; // 联系人姓名

  @Column({ name: "contact_phone", nullable: true })
  contactPhone: string; // 联系人手机号

  @Column({ name: "sender_id", nullable: true })
  senderId: string; // 发送人id

  @Column({ name: "sender_phone", nullable: true })
  senderPhone: string; // 发送人电话

  @Column({ name: "fax_number", nullable: true })
  faxNumber: string; // 产品名称

  @Column({ name: "telephone", nullable: true })
  telephone: string; // 产品名称

  @Column("jsonb", { name: "files", nullable: true })
  files: any; // 打印相关文件

  @Column({ type: "text", nullable: true })
  remark: string; // 备注

  @Column({ name: "technical_level", nullable: true })
  technicalLevel: string; // 技术等级

  @Column({ name: "project_level", nullable: true })
  projectLevel: string; // 项目等级

  @Column({ name: "flow_state", nullable: true })
  flowState: string; // 报价状态

  @Column({ name: "current_approval_node", nullable: true })
  currentApprovalNode: string; // 当前审批节点

  @Column("simple-array", { name: "current_approver", nullable: true })
  currentApprover: string; // 当前审批人

  @Column({ name: "quote_time", type: "timestamp", nullable: true })
  quoteTime: Date; // 报价时间

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date; // 创建时间

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date; // 更新时间


  @Column({ name: "quote_valid_days", nullable: true })
  quoteValidDays: number;

  @Column({ name: "quote_deadline", nullable: true })
  quoteDeadline: Date;

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true })
  items: QuoteItem[];
  @Column("jsonb", { name: "company_info", nullable: true })
  companyInfo: any;
}

@Entity({ name: "crm_quote_item" })
// @Tree("closure-table")
export class QuoteItem extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "jdy_id", nullable: true, unique: true })
  jdyId: string; // jdyid

  @Column({ nullable: true })
  index: number; //顺序

  @Column({ name: "link_id", nullable: true })
  linkId: number; //顺序

  @Column("simple-array", { name: "product_category", nullable: true })
  productCategory: string[]; // 产品类别数组

  @Column({ name: "product_name", nullable: true })
  productName: string; // 产品名称

  @Column("jsonb", { nullable: true })
  config: any; // 配置信息(JSON)

  @Column({ nullable: true })
  brand: string; //品牌 如jctims 古迪

  @Column({ nullable: true })
  unit: string; //单位

  @Column({ name: "product_code", nullable: true })
  productCode: string; // 产品编码

  @Column({ name: "order_product_name", nullable: true })
  orderProductName: string; // 订单中匹配到的产品名称

  @Column({ name: "form_type", nullable: true })
  formType: string; // 表单类型

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  quantity: number; // 数量

  @Column({
    name: "unit_price",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  unitPrice: number; // 单价

  @Column({
    name: "guide_price",
    type: "decimal",
    precision: 10,
    scale: 2,
    nullable: true,
  })
  guidePrice: number; // 指导单价

  @Column({
    name: "discount_rate",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
  })
  discountRate: number; // 折扣率

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  subtotal: number; // 小计

  @Column({ name: "is_completed", nullable: true })
  isCompleted: boolean; // 配置是否完成

  @Column("jsonb", { nullable: true })
  source: any; // 来源信息(JSON)

  @Column({ name: "parentId", nullable: true })
  parentId: number; // 父项ID

  // @TreeChildren()
  // children: QuoteItem[]; // 子项

  // @TreeParent()
  // parent: QuoteItem; // 父项

  @ManyToOne(() => Quote, (quote) => quote.items)
  quote: Quote; // 关联的报价单

  @Column()
  quoteId: number; // 父项ID

  @Column({ name: "is_category_locked", nullable: true })
  isCategoryLocked: boolean; // 配置是否完成

  @Column("jsonb", { name: "import_info", nullable: true })
  importInfo: any;
}
