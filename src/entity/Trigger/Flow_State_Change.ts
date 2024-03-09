import { Entity, Column, ManyToOne, OneToMany, Relation } from "typeorm";
import AbstractContent from "../AbstractContent";
import { Trigger } from "./Trigger";
@Entity({
  name: "trigger_flow_state_change",
})
export class Flow_State_Change extends AbstractContent {
  @Column()
  flow_state_action: string;

  @Column()
  flow_state_id: number;

  @ManyToOne(() => Trigger, (trigger) => trigger.flow_state_change_list)
  trigger: Relation<Trigger>;
}
