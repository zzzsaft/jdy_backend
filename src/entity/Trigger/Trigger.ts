import { Entity, Column, OneToMany, Relation } from "typeorm";
import AbstractContent from "../AbstractContent";
import { Execute_Action } from "./execute_action1";
import { Flow_State_Change } from "./flow_state_change1";
import { Trigger_Condition } from "./trigger_condition1";

@Entity()
export class Trigger extends AbstractContent {
  @Column()
  trigger_name: string;
  @Column()
  app_id: string;
  @Column()
  app_name: string;
  @Column()
  entry_id: string;
  @Column()
  entry_name: string;
  @Column("varchar", { array: true })
  trigger_action: string[];
  @Column()
  isActive: boolean;

  @OneToMany(
    () => Flow_State_Change,
    (flow_state_change) => flow_state_change.trigger,
    {
      cascade: true,
      onDelete: "CASCADE",
    }
  )
  flow_state_change_list: Relation<Flow_State_Change[]>;

  @OneToMany(
    () => Trigger_Condition,
    (trigger_condition) => trigger_condition.trigger
  )
  trigger_conditions: Relation<Trigger_Condition[]>;

  @OneToMany(() => Execute_Action, (execute_action) => execute_action.trigger)
  trigger_actions: Relation<Execute_Action[]>;

  trigger_action_list: string[];
}
