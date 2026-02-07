import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddLogMessageTimestamps2026020701
  implements MigrationInterface
{
  name = "AddLogMessageTimestamps2026020701";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableName = "log_message";
    const hasCreated = await queryRunner.hasColumn(tableName, "created_at");
    if (!hasCreated) {
      await queryRunner.addColumn(
        tableName,
        new TableColumn({
          name: "created_at",
          type: "datetime",
          isNullable: false,
          default: "CURRENT_TIMESTAMP",
        })
      );
    }

    const hasUpdated = await queryRunner.hasColumn(tableName, "updated_at");
    if (!hasUpdated) {
      await queryRunner.addColumn(
        tableName,
        new TableColumn({
          name: "updated_at",
          type: "datetime",
          isNullable: false,
          default: "CURRENT_TIMESTAMP",
          onUpdate: "CURRENT_TIMESTAMP",
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableName = "log_message";
    const hasUpdated = await queryRunner.hasColumn(tableName, "updated_at");
    if (hasUpdated) {
      await queryRunner.dropColumn(tableName, "updated_at");
    }
    const hasCreated = await queryRunner.hasColumn(tableName, "created_at");
    if (hasCreated) {
      await queryRunner.dropColumn(tableName, "created_at");
    }
  }
}
