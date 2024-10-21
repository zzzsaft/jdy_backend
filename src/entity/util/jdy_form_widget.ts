import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

@Entity({ name: "form_widget", schema: "jdy" })
@Unique(["app_id", "entry_id", "name"])
export class JdyWidget extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  app_id: string;
  @Column()
  entry_id: string;
  @Column()
  name: string;
  @Column()
  label: string;
  @Column()
  widgetName: string;
  @Column()
  type: string;
  @Column()
  is_delete: boolean = false;
  @Column({ nullable: true })
  jdy_id: string;
  @ManyToOne(() => JdyWidget, (widget) => widget.subforms, { nullable: true })
  parent: JdyWidget | null;
  @OneToMany(() => JdyWidget, (widget) => widget.parent)
  subforms: JdyWidget[];
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
}
