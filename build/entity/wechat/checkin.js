var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Column, BeforeInsert, BeforeUpdate, } from "typeorm";
import AbstractContent from "../AbstractContent";
var CheckinType;
(function (CheckinType) {
    CheckinType["\u4E0A\u5348\u6253\u5361"] = "\u4E0A\u5348\u6253\u5361";
    CheckinType["\u4E0B\u5348\u6253\u5361"] = "\u4E0B\u5348\u6253\u5361";
    CheckinType["\u5916\u51FA\u6253\u5361"] = "\u5916\u51FA\u6253\u5361";
})(CheckinType || (CheckinType = {}));
var CheckinState;
(function (CheckinState) {
    CheckinState["\u4E0D\u9002\u7528"] = "\u4E0D\u9002\u7528";
    CheckinState["\u6B63\u5E38"] = "\u6B63\u5E38";
    CheckinState["\u7F3A\u5361"] = "\u7F3A\u5361";
    CheckinState["\u8FDF\u5230\u65E9\u9000"] = "\u8FDF\u5230/\u65E9\u9000";
    CheckinState["\u6B63\u5E38\u8865\u5361"] = "\u6B63\u5E38(\u8865\u5361)";
    CheckinState["\u8FDF\u5230\u8865\u5361"] = "\u8FDF\u5230(\u8865\u5361)";
})(CheckinState || (CheckinState = {}));
let WechatCheckin = class WechatCheckin extends AbstractContent {
    date;
    name;
    wechat_id;
    company;
    department;
    department_id;
    start_time;
    end_time;
    standard_start_time;
    standard_end_time;
    start_time_state;
    end_time_state;
    checkin_type;
    late_count = 0;
    absent = 0;
    original_checkin_time;
    checkin_rule;
    is_winter_time;
    CheckinInsert() { }
    CheckinUpdate() { }
};
__decorate([
    Column(),
    __metadata("design:type", Date)
], WechatCheckin.prototype, "date", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], WechatCheckin.prototype, "name", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", String)
], WechatCheckin.prototype, "wechat_id", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", String)
], WechatCheckin.prototype, "company", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", String)
], WechatCheckin.prototype, "department", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", String)
], WechatCheckin.prototype, "department_id", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", Date)
], WechatCheckin.prototype, "start_time", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", Date)
], WechatCheckin.prototype, "end_time", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", Date)
], WechatCheckin.prototype, "standard_start_time", void 0);
__decorate([
    Column({ nullable: true }),
    __metadata("design:type", Date)
], WechatCheckin.prototype, "standard_end_time", void 0);
__decorate([
    Column({
        type: "enum",
        enum: CheckinState,
    }),
    __metadata("design:type", String)
], WechatCheckin.prototype, "start_time_state", void 0);
__decorate([
    Column({
        type: "enum",
        enum: CheckinState,
    }),
    __metadata("design:type", String)
], WechatCheckin.prototype, "end_time_state", void 0);
__decorate([
    Column({
        type: "enum",
        enum: CheckinType,
    }),
    __metadata("design:type", String)
], WechatCheckin.prototype, "checkin_type", void 0);
__decorate([
    Column({ type: "int" }),
    __metadata("design:type", Number)
], WechatCheckin.prototype, "late_count", void 0);
__decorate([
    Column({ type: "float" }),
    __metadata("design:type", Number)
], WechatCheckin.prototype, "absent", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], WechatCheckin.prototype, "original_checkin_time", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], WechatCheckin.prototype, "checkin_rule", void 0);
__decorate([
    Column(),
    __metadata("design:type", Boolean)
], WechatCheckin.prototype, "is_winter_time", void 0);
__decorate([
    BeforeInsert(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WechatCheckin.prototype, "CheckinInsert", null);
__decorate([
    BeforeUpdate(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WechatCheckin.prototype, "CheckinUpdate", null);
WechatCheckin = __decorate([
    Entity()
], WechatCheckin);
export { WechatCheckin };
//# sourceMappingURL=checkin.js.map