import { Entity, Column, ManyToOne, OneToMany, Relation } from "typeorm";
import { TriggerAction } from "../../type/trigger";
import AbstractContent from "../AbstractContent";
import { Trigger } from "./Trigger";
import { Execute_Action_Content } from "./execute_action_content";
import { Execute_Action_Condition } from "./execute_action_condition";

@Entity({
  name: "trigger_execute_action",
})
export class Execute_Action extends AbstractContent {
  @Column({
    type: "enum",
    enum: TriggerAction,
  })
  action: TriggerAction;

  @Column()
  app_id: string;

  @Column()
  entry_id: string;

  @Column()
  app_name: string;

  @Column()
  entry_name: string;

  @Column({ nullable: true })
  extension_subform_name: string;

  @Column()
  is_start_workflow: boolean;

  @ManyToOne(() => Trigger, {
    cascade: true,
    onDelete: "CASCADE",
  })
  trigger: Relation<Trigger>;

  @OneToMany(
    () => Execute_Action_Condition,
    (execute_action_condition) => execute_action_condition.execute_action
  )
  execute_action_conditions: Relation<Execute_Action_Condition[]>;

  @OneToMany(
    () => Execute_Action_Content,
    (execute_action_content) => execute_action_content.execute_action
  )
  execute_action_contents: Relation<Execute_Action_Content[]>;
}
