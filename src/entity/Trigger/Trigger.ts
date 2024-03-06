import { Entity, Column, ManyToOne, OneToMany, Relation } from "typeorm";
import AbstractContent from "../AbstractContent";
import { Execute_Action } from "./Execute_Action";
import { Trigger_Condition } from "./Trigger_Condition";

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
  @Column()
  trigger_action: string;
  @Column()
  isActive: boolean;

  @OneToMany(
    () => Trigger_Condition,
    (trigger_condition) => trigger_condition.trigger
  )
  trigger_conditions: Relation<Trigger_Condition[]>;

  @OneToMany(() => Execute_Action, (execute_action) => execute_action.trigger)
  trigger_actions: Relation<Execute_Action[]>;
}
