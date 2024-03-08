import { Entity, Column, ManyToOne, Relation } from "typeorm";
import { TriggerMethod } from "../../type/trigger";
import AbstractContent from "../AbstractContent";
import { Trigger } from "./Trigger";

@Entity()
export class Trigger_Condition extends AbstractContent {
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

  @Column()
  value: string;

  @ManyToOne(() => Trigger, (trigger) => trigger.trigger_conditions, {
    cascade: true,
    onDelete: "CASCADE",
  })
  trigger: Relation<Trigger>;
}
