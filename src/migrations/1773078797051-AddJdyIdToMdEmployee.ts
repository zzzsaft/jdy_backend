import { MigrationInterface, QueryRunner } from "typeorm";

export class AddJdyIdToMdEmployee1773078797051 implements MigrationInterface {
  name = "AddJdyIdToMdEmployee1773078797051";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "md_employee" ADD COLUMN IF NOT EXISTS "jdy_id" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "md_employee" DROP COLUMN "jdy_id"`);
  }
}

