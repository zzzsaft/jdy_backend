import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTemplateIdToBestSignContractRecord1773298164735
  implements MigrationInterface
{
  name = "AddTemplateIdToBestSignContractRecord1773298164735";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "template_id" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "template_id"`
    );
  }
}

