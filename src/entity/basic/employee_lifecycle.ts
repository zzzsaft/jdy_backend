import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  BaseEntity,
  CreateDateColumn,
  Unique,
} from "typeorm";

@Entity({ name: "employee_lifecycle" })
@Unique(["type", "certificateId", "actualDate"])
export class EmployeeLifecycle extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  userid: string;

  @Column()
  certificateId: string;

  @Column()
  type: string;

  @Column({ nullable: true, type: "date" })
  planDate: Date;

  @Column({ type: "date" })
  actualDate: Date;

  @Column({ nullable: true })
  departmentId: string;

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  newDepartmentId: string;

  @Column({ nullable: true })
  newDepartment: string;

  static async add(data: EmployeeLifecycle) {
    await EmployeeLifecycle.createQueryBuilder()
      .insert()
      .into(EmployeeLifecycle)
      .values(data)
      .orIgnore()
      .execute();
  }
}
