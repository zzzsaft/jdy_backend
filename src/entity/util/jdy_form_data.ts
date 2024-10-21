import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  UpdateDateColumn,
} from "typeorm";
import { JdyForm } from "./jdy_form";
import { PgDataSource } from "../../config/data-source";

@Entity({ name: "temporary" })
class JdyData {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  jdy_id: string;
  @Column()
  name: string;
  @Column({ type: "jsonb" })
  value: any;
  @Column()
  is_delete: boolean;
  @Column()
  is_modify: boolean;
  @Column()
  creator: string;
  @Column()
  updater: string;
  @Column()
  createTime: Date;
  @Column()
  updateTime: Date;
  @CreateDateColumn()
  created_at: Date;
  @UpdateDateColumn()
  updated_at: Date;
  @ManyToOne(() => JdyData, (jdyData) => jdyData.subforms, { nullable: true })
  parent: JdyData | null;
  @OneToMany(() => JdyData, (jdyData) => jdyData.parent)
  subforms: JdyData[];
}

async function getTable({ appid, entryid }) {
  const form = await JdyForm.findOne({
    where: { app_id: appid, entry_id: entryid },
  });
  if (!form) {
    throw new Error("Form not found");
  }
  const tableName = `${form.id}-${form.app_name}-${form.entry_name}`;

  // 确保表存在
  await createTableIfNotExists(tableName);

  // 动态修改表名
  PgDataSource.getMetadata(JdyData).tableName = tableName;

  return PgDataSource.getRepository(JdyData);
}

async function createTableIfNotExists(tableName: string) {
  const queryRunner = PgDataSource.createQueryRunner();

  // 检查表是否存在
  const tableExists = await queryRunner.hasTable(tableName);
  if (!tableExists) {
    // 创建表 SQL
    await queryRunner.query(`
      CREATE TABLE ${tableName} (
        id SERIAL PRIMARY KEY,
        jdy_id VARCHAR(255),
        name VARCHAR(255),
        value JSONB,
        is_delete BOOLEAN DEFAULT FALSE,
        is_modify BOOLEAN DEFAULT FALSE,
        creator VARCHAR(255),
        updator VARCHAR(255),
        parent_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES ${tableName}(id) ON DELETE CASCADE
      );
    `);
    console.log(`Table ${tableName} created successfully.`);
  } else {
    console.log(`Table ${tableName} already exists.`);
  }

  await queryRunner.release();
}
