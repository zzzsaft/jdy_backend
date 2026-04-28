import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueToBestSignContractRecord1773251625158
  implements MigrationInterface
{
  name = "AddUniqueToBestSignContractRecord1773251625158";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Postgres allows multiple NULLs in UNIQUE constraints, so this works well for
    // records that are created before contractId is known.
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD CONSTRAINT "UQ_bestsign_contract_record_contract_id" UNIQUE ("contract_id")`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD CONSTRAINT "UQ_bestsign_contract_record_biz_no" UNIQUE ("biz_no")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP CONSTRAINT "UQ_bestsign_contract_record_biz_no"`
    );
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP CONSTRAINT "UQ_bestsign_contract_record_contract_id"`
    );
  }
}

