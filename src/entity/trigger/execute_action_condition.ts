import { Execute_Action } from "./execute_action.js";
import { Entity, Column, ManyToOne } from "typeorm";
import type { Relation } from "typeorm";
import { TriggerMethod, SetType } from "../../type/trigger.js";
import AbstractContent from "../AbstractContent.js";

@Entity({
  name: "trigger_execute_action_condition",
})
export class Execute_Action_Condition extends AbstractContent {
  @Column()
  label: string;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column({
    type: "enum",
    enum: TriggerMethod,
  })
  method: TriggerMethod;

  @Column({
    type: "enum",
    enum: SetType,
    default: SetType.FIXED,
  })
  set_type: SetType;

  @Column()
  value: string;

  @ManyToOne(
    () => Execute_Action,
    (execute_action) => execute_action.execute_action_conditions,
    {
      cascade: true,
      onDelete: "CASCADE",
    }
  )
  execute_action: Relation<Execute_Action>;
}
