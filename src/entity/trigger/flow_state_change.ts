import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  AfterLoad,
  BeforeInsert,
} from "typeorm";
import type { Relation } from "typeorm";
import AbstractContent from "../AbstractContent.js";
import { Trigger } from "./trigger.js";
@Entity({
  name: "trigger_flow_state_change",
})
export class Flow_State_Change extends AbstractContent {
  @Column("varchar", { array: true })
  flow_state_action: string[];

  @Column()
  flow_state_id: number;

  @ManyToOne(() => Trigger, (trigger) => trigger.flow_state_change_list)
  trigger: Relation<Trigger>;
}
