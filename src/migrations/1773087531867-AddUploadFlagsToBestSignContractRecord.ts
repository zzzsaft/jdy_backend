import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUploadFlagsToBestSignContractRecord1773087531867
  implements MigrationInterface
{
  name = "AddUploadFlagsToBestSignContractRecord1773087531867";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "after_sign_uploaded" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "archive_uploaded" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "archive_uploaded"`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "after_sign_uploaded"`
    );
  }
}

