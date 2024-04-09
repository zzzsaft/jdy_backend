var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Entity, Column, OneToMany, Index } from "typeorm";
import AbstractContent from "../AbstractContent";
import { CheckinData } from "./CheckinData";
import { HardwareCheckinData } from "./HardwareCheckinData";
let Checkin = class Checkin extends AbstractContent {
    date;
    userid;
    checkin_data;
    hardware_checkin_data;
};
__decorate([
    Column("date"),
    __metadata("design:type", Date)
], Checkin.prototype, "date", void 0);
__decorate([
    Column(),
    __metadata("design:type", String)
], Checkin.prototype, "userid", void 0);
__decorate([
    OneToMany(() => CheckinData, (checkinData) => checkinData.checkin, {
        cascade: true,
    }),
    __metadata("design:type", Object)
], Checkin.prototype, "checkin_data", void 0);
__decorate([
    OneToMany(() => HardwareCheckinData, (hardwareCheckinData) => hardwareCheckinData.checkin, {
        cascade: true,
    }),
    __metadata("design:type", Object)
], Checkin.prototype, "hardware_checkin_data", void 0);
Checkin = __decorate([
    Entity(),
    Index(["userid", "date"], { unique: true })
], Checkin);
export { Checkin };
//# sourceMappingURL=Checkin.js.map