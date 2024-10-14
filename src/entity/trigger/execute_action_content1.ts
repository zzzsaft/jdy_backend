import { Entity, Column, ManyToOne, Relation } from "typeorm";
import AbstractContent from "../AbstractContent";
import { SetType } from "../../type/trigger";
import { Execute_Action } from "./execute_action1";

@Entity({
  name: "trigger_execute_action_content",
})
export class Execute_Action_Content extends AbstractContent {
  @Column()
  subform_label: string;

  @Column()
  subform_name: string;

  @Column()
  label: string;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column({
    type: "enum",
    enum: SetType,
    default: SetType.FIXED,
  })
  set_type: SetType;

  @Column()
  value: string;

  @Column()
  value_label: string;

  @Column()
  value_subform_label: string;

  @Column()
  value_subform_name: string;

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
