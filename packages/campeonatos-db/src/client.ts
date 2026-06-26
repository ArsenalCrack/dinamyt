import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import * as dotenv from 'dotenv';

dotenv.config();

const client = postgres(process.env.CAMPEONATOS_DATABASE_URL!, {
  prepare: false, // obligatorio con el pooler de Supabase
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
