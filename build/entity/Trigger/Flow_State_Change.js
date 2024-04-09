var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Column, ManyToOne, } from "typeorm";
import AbstractContent from "../AbstractContent";
import { Trigger } from "./Trigger";
let Flow_State_Change = class Flow_State_Change extends AbstractContent {
    flow_state_action;
    flow_state_id;
    trigger;
};
__decorate([
    Column("varchar", { array: true }),
    __metadata("design:type", Array)
], Flow_State_Change.prototype, "flow_state_action", void 0);
__decorate([
    Column(),
    __metadata("design:type", Number)
], Flow_State_Change.prototype, "flow_state_id", void 0);
__decorate([
    ManyToOne(() => Trigger, (trigger) => trigger.flow_state_change_list),
    __metadata("design:type", Object)
], Flow_State_Change.prototype, "trigger", void 0);
Flow_State_Change = __decorate([
    Entity({
        name: "trigger_flow_state_change",
    })
], Flow_State_Change);
export { Flow_State_Change };
//# sourceMappingURL=Flow_State_Change.js.map