var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Execute_Action } from "./Execute_Action";
import { Entity, Column, ManyToOne } from "typeorm";
import { TriggerMethod, SetType } from "../../type/trigger";
import AbstractContent from "../AbstractContent";
let Execute_Action_Condition = class Execute_Action_Condition extends AbstractContent {
    label;
    name;
    type;
    method;
    set_type;
    value;
    execute_action;
};
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Condition.prototype, "label", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Condition.prototype, "name", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Condition.prototype, "type", void 0);
__decorate([
    Column({
        type: "enum",
        enum: TriggerMethod,
    }),
    __metadata("design:type", String)
], Execute_Action_Condition.prototype, "method", void 0);
__decorate([
    Column({
        type: "enum",
        enum: SetType,
        default: SetType.FIXED,
    }),
    __metadata("design:type", String)
], Execute_Action_Condition.prototype, "set_type", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Condition.prototype, "value", void 0);
__decorate([
    ManyToOne(() => Execute_Action, (execute_action) => execute_action.execute_action_conditions, {
        cascade: true,
        onDelete: "CASCADE",
    }),
    __metadata("design:type", Object)
], Execute_Action_Condition.prototype, "execute_action", void 0);
Execute_Action_Condition = __decorate([
    Entity({
        name: "trigger_execute_action_condition",
    })
], Execute_Action_Condition);
export { Execute_Action_Condition };
//# sourceMappingURL=Execute_Action_Condition.js.map