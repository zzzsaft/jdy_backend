import { Entity, Column } from "typeorm";
import AbstractContent from "../AbstractContent";

@Entity({ name: "salary_record" })
export class SalaryRecord extends AbstractContent {
  @Column({ name: "user_id" })
  userid: string;

  @Column()
  probation: number;

  @Column()
  positive: string;

  static async addRecord(body: {
    userid: string;
    probation: number;
    positive: string;
  }) {
    const record = new SalaryRecord();
    record.userid = body.userid;
    record.probation = body.probation;
    record.positive = body.positive;
    await record.save();
  }

  static async getRecord(userid: string) {
    return await SalaryRecord.findOne({
      where: { userid },
      order: { created_at: "DESC" },
    });
  }
}
