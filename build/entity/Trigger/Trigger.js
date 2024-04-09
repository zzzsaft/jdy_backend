var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Column, OneToMany, } from "typeorm";
import AbstractContent from "../AbstractContent";
import { Execute_Action } from "./Execute_Action";
import { Trigger_Condition } from "./Trigger_Condition";
import { Flow_State_Change } from "./Flow_State_Change";
let Trigger = class Trigger extends AbstractContent {
    trigger_name;
    app_id;
    app_name;
    entry_id;
    entry_name;
    trigger_action;
    isActive;
    flow_state_change_list;
    trigger_conditions;
    trigger_actions;
    trigger_action_list;
};
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger.prototype, "trigger_name", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger.prototype, "app_id", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger.prototype, "app_name", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger.prototype, "entry_id", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger.prototype, "entry_name", void 0);
__decorate([
    Column("varchar", { array: true }),
    __metadata("design:type", Array)
], Trigger.prototype, "trigger_action", void 0);
__decorate([
    Column(),
    __metadata("design:type", Boolean)
], Trigger.prototype, "isActive", void 0);
__decorate([
    OneToMany(() => Flow_State_Change, (flow_state_change) => flow_state_change.trigger, {
        cascade: true,
        onDelete: "CASCADE",
    }),
    __metadata("design:type", Object)
], Trigger.prototype, "flow_state_change_list", void 0);
__decorate([
    OneToMany(() => Trigger_Condition, (trigger_condition) => trigger_condition.trigger),
    __metadata("design:type", Object)
], Trigger.prototype, "trigger_conditions", void 0);
__decorate([
    OneToMany(() => Execute_Action, (execute_action) => execute_action.trigger),
    __metadata("design:type", Object)
], Trigger.prototype, "trigger_actions", void 0);
Trigger = __decorate([
    Entity()
], Trigger);
export { Trigger };
//# sourceMappingURL=Trigger.js.map