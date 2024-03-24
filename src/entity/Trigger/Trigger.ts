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
import { Execute_Action } from "./Execute_Action";
import { Trigger_Condition } from "./Trigger_Condition";
import { Flow_State_Change } from "./Flow_State_Change";
import { before } from "lodash";

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
  @Column("varchar")
  trigger_action: string;
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

  @AfterLoad()
  trigger_action_listArray() {
    this.trigger_action_list = this.trigger_action.split(",");
  }

  @BeforeInsert()
  trigger_action_listString() {
    console.log(this.trigger_action_list);
    if (this.trigger_action_list) {
      this.trigger_action = this.trigger_action_list.join(",");
    }
  }
}
