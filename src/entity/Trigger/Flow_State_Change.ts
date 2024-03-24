import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  Relation,
  AfterLoad,
  BeforeInsert,
} from "typeorm";
import AbstractContent from "../AbstractContent";
import { Trigger } from "./Trigger";
@Entity({
  name: "trigger_flow_state_change",
})
export class Flow_State_Change extends AbstractContent {
  @Column()
  flow_state_action: string;

  flow_state_action_list: string[];

  @Column()
  flow_state_id: number;

  @ManyToOne(() => Trigger, (trigger) => trigger.flow_state_change_list)
  trigger: Relation<Trigger>;

  @AfterLoad()
  trigger_action_listArray() {
    this.flow_state_action_list = this.flow_state_action.split(",");
  }

  @BeforeInsert()
  trigger_action_listString() {
    if (this.flow_state_action_list)
      this.flow_state_action = this.flow_state_action_list.join(",");
  }
}
