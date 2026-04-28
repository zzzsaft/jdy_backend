import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTemplateNameToBestSignContractRecord1773298779012
  implements MigrationInterface
{
  name = "AddTemplateNameToBestSignContractRecord1773298779012";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" ADD COLUMN IF NOT EXISTS "template_name" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bestsign_contract_record" DROP COLUMN "template_name"`
    );
  }
}

