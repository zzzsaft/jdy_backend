import { Entity, Column, ManyToOne, OneToMany, Relation } from "typeorm";
import { TriggerAction } from "../../type/trigger";
import AbstractContent from "../AbstractContent";
import { Execute_Action_Condition } from "./Execute_Action_Condition";
import { Execute_Action_Content } from "./Execute_Action_Content";
import { Trigger } from "./Trigger";

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

  @Column()
  extension_subform_name: string;

  @Column()
  is_start_workflow: boolean;

  @ManyToOne(() => Trigger)
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
