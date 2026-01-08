import process from 'node:process';
import { drizzleD1Config } from '@deox/drizzle-d1-utils';

export default drizzleD1Config({
  out: './drizzle/migrations',
  schema: './src/db/schema.ts'
}, {
  accountId: process.env.CLOUDFLARE_D1_ACCOUNT_ID,
  apiToken: process.env.CLOUDFLARE_D1_API_TOKEN,
  databaseId: '0c21b94e-c596-4014-90e5-928ab31344a6',
  binding: 'DB',
  remote: process.env.REMOTE === 'true' || process.env.REMOTE === '1',
});
