var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Column, ManyToOne, OneToMany } from "typeorm";
import { TriggerAction } from "../../type/trigger";
import AbstractContent from "../AbstractContent";
import { Execute_Action_Condition } from "./Execute_Action_Condition";
import { Execute_Action_Content } from "./Execute_Action_Content";
import { Trigger } from "./Trigger";
let Execute_Action = class Execute_Action extends AbstractContent {
    action;
    app_id;
    entry_id;
    app_name;
    entry_name;
    extension_subform_name;
    is_start_workflow;
    trigger;
    execute_action_conditions;
    execute_action_contents;
};
__decorate([
    Column({
        type: "enum",
        enum: TriggerAction,
    }),
    __metadata("design:type", String)
], Execute_Action.prototype, "action", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action.prototype, "app_id", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action.prototype, "entry_id", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action.prototype, "app_name", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action.prototype, "entry_name", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", String)
], Execute_Action.prototype, "extension_subform_name", void 0);
__decorate([
    Column(),
    __metadata("design:type", Boolean)
], Execute_Action.prototype, "is_start_workflow", void 0);
__decorate([
    ManyToOne(() => Trigger, {
        cascade: true,
        onDelete: "CASCADE",
    }),
    __metadata("design:type", Object)
], Execute_Action.prototype, "trigger", void 0);
__decorate([
    OneToMany(() => Execute_Action_Condition, (execute_action_condition) => execute_action_condition.execute_action),
    __metadata("design:type", Object)
], Execute_Action.prototype, "execute_action_conditions", void 0);
__decorate([
    OneToMany(() => Execute_Action_Content, (execute_action_content) => execute_action_content.execute_action),
    __metadata("design:type", Object)
], Execute_Action.prototype, "execute_action_contents", void 0);
Execute_Action = __decorate([
    Entity({
        name: "trigger_execute_action",
    })
], Execute_Action);
export { Execute_Action };
//# sourceMappingURL=Execute_Action.js.map