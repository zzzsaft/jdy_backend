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
  @Column()
  isActive: boolean;

  //   @OneToMany(
  //     () => Flow_State_Change,
  //     (flow_state_change) => flow_state_change.trigger,
  //     {
  //       cascade: true,
  //       onDelete: "CASCADE",
  //     }
  //   )
  //   flow_state_change_list: Relation<Flow_State_Change[]>;

  //   @OneToMany(
  //     () => Trigger_Condition,
  //     (trigger_condition) => trigger_condition.trigger
  //   )
  //   trigger_conditions: Relation<Trigger_Condition[]>;

  //   @OneToMany(() => Execute_Action, (execute_action) => execute_action.trigger)
  //   trigger_actions: Relation<Execute_Action[]>;
}
