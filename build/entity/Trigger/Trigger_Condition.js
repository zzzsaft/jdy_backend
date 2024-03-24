var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Column, ManyToOne } from "typeorm";
import { TriggerMethod } from "../../type/trigger";
import AbstractContent from "../AbstractContent";
import { Trigger } from "./Trigger";
let Trigger_Condition = class Trigger_Condition extends AbstractContent {
    label;
    name;
    type;
    method;
    value;
    trigger;
};
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger_Condition.prototype, "label", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger_Condition.prototype, "name", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger_Condition.prototype, "type", void 0);
__decorate([
    Column({
        type: "enum",
        enum: TriggerMethod,
    }),
    __metadata("design:type", String)
], Trigger_Condition.prototype, "method", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Trigger_Condition.prototype, "value", void 0);
__decorate([
    ManyToOne(() => Trigger, (trigger) => trigger.trigger_conditions, {
        cascade: true,
        onDelete: "CASCADE",
    }),
    __metadata("design:type", Object)
], Trigger_Condition.prototype, "trigger", void 0);
Trigger_Condition = __decorate([
    Entity()
], Trigger_Condition);
export { Trigger_Condition };
//# sourceMappingURL=Trigger_Condition.js.map