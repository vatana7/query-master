import { DatabaseSchemas, TableConstraintTypeSchema } from 'types/SqlSchema';
import SQLCommonInterface from './SQLCommonInterface';
import { SqlRunnerManager } from 'libs/SqlRunnerManager';

export default class MySQLCommonInterface extends SQLCommonInterface {
  protected runner: SqlRunnerManager;
  protected currentDatabaseName?: string;

  constructor(executor: SqlRunnerManager, currentDatabaseName?: string) {
    super();
    this.runner = executor;
    this.currentDatabaseName = currentDatabaseName;
  }

  async getSchema(): Promise<DatabaseSchemas> {
    const response = await this.runner.execute(
      [
        {
          sql: this.currentDatabaseName
            ? `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=:database_name`
            : `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS`,
          params: this.currentDatabaseName
            ? { database_name: this.currentDatabaseName }
            : undefined,
        },
        {
          sql: 'SELECT kc.CONSTRAINT_SCHEMA, kc.CONSTRAINT_NAME, kc.TABLE_SCHEMA, kc.TABLE_NAME, kc.COLUMN_NAME, tc.CONSTRAINT_TYPE FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS kc INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS tc ON (kc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND kc.TABLE_NAME = tc.TABLE_NAME AND kc.TABLE_SCHEMA = tc.TABLE_SCHEMA)',
        },
      ],
      {
        disableAnalyze: true,
        skipProtection: true,
      }
    );

    const databases: DatabaseSchemas = {};
    const data = response[0].result;
    const constraints = response[1].result;

    for (const row of data.rows) {
      const databaseName = row[0] as string;
      const tableName = row[1] as string;
      const columnName = row[2] as string;

      if (!databases[databaseName]) {
        databases[databaseName] = {
          tables: {},
          name: databaseName,
        };
      }

      const database = databases[databaseName];
      if (!database.tables[tableName]) {
        database.tables[tableName] = {
          name: tableName,
          columns: {},
          constraints: [],
          primaryKey: [],
        };
      }

      const table = database.tables[tableName];
      table.columns[columnName] = { name: columnName };
    }

    for (const row of constraints.rows) {
      const constraintName = row[1] as string;
      const tableSchema = row[2] as string;
      const tableName = row[3] as string;
      const constraintType = row[5] as string;
      const columnName = row[4] as string;

      if (databases[tableSchema]) {
        const database = databases[tableSchema];
        if (database.tables[tableName]) {
          const table = database.tables[tableName];
          if (constraintType === 'PRIMARY KEY') {
            table.primaryKey.push(columnName);
          }

          const constraintFound = table.constraints.find(
            (constraint) => constraint.name === constraintName
          );
          if (constraintFound) {
            constraintFound.columns.push(columnName);
          } else {
            table.constraints.push({
              columns: [columnName],
              name: constraintName,
              type: constraintType as TableConstraintTypeSchema,
            });
          }
        }
      }
    }

    return databases;
  }
}
