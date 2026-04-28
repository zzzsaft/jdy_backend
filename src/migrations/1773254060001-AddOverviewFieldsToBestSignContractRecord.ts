import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOverviewFieldsToBestSignContractRecord1773254060001
  implements MigrationInterface
{
  name = "AddOverviewFieldsToBestSignContractRecord1773254060001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "finish_time" timestamp`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "overview_sender_name" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "overview_labels" jsonb`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "overview_participants" jsonb`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "overview_participants"`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "overview_labels"`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "overview_sender_name"`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "finish_time"`
    );
  }
}

