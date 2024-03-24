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
import AbstractContent from "../AbstractContent";
import { SetType } from "../../type/trigger";
import { Execute_Action } from "./Execute_Action";
let Execute_Action_Content = class Execute_Action_Content extends AbstractContent {
    subform_label;
    subform_name;
    label;
    name;
    type;
    set_type;
    value;
    value_label;
    value_subform_label;
    value_subform_name;
    execute_action;
};
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "subform_label", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "subform_name", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "label", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "name", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "type", void 0);
__decorate([
    Column({
        type: "enum",
        enum: SetType,
        default: SetType.FIXED,
    }),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "set_type", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "value", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "value_label", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "value_subform_label", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Execute_Action_Content.prototype, "value_subform_name", void 0);
__decorate([
    ManyToOne(() => Execute_Action, (execute_action) => execute_action.execute_action_conditions, {
        cascade: true,
        onDelete: "CASCADE",
    }),
    __metadata("design:type", Object)
], Execute_Action_Content.prototype, "execute_action", void 0);
Execute_Action_Content = __decorate([
    Entity({
        name: "trigger_execute_action_content",
    })
], Execute_Action_Content);
export { Execute_Action_Content };
//# sourceMappingURL=Execute_Action_Content.js.map