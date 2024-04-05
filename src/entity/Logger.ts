import {
  Entity,
  Column,
  ManyToOne,
  Relation,
  BaseEntity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from "typeorm";
import AbstractContent from "./AbstractContent";

@Entity({
  name: "trigger_execute_action_content",
})
export class Execute_Action_Content extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  method: string;

  @Column()
  url: string;

  @Column()
  status: string;

  @Column()
  get: string;

  @Column()
  body: string;

  @Column()
  value: string;

  @Column()
  value_label: string;

  @Column()
  value_subform_label: string;

  @Column()
  value_subform_name: string;
  @CreateDateColumn()
  created_at: Date;
}
