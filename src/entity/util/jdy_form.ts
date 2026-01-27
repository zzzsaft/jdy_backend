import {
  BaseEntity,
  Column,
  Entity,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { appApiClient } from "../../features/jdy/api/app";

@Entity({ name: "util_jdy_form", schema: "jdy" })
@Unique(["app_id", "entry_id"])
export class JdyForm extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  app_id: string;

  @Column()
  entry_id: string;

  @Column()
  app_name: string;

  @Column()
  entry_name: string;

  static async updateForm() {
    const jdyFormList: JdyForm[] = [];
    const applist = await appApiClient.appList();
    for (let app of applist["apps"]) {
      const entryList = await appApiClient.entryList(app.app_id);
      for (let entry of entryList["forms"]) {
        jdyFormList.push(
          JdyForm.create({
            app_id: app.app_id,
            entry_id: entry.entry_id,
            app_name: app.name,
            entry_name: entry.name,
          })
        );
      }
    }
    await JdyForm.upsert(jdyFormList, {
      conflictPaths: ["app_id", "entry_id"],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
