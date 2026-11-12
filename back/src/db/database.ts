
import { Pool } from 'pg';

const password = process.env.DB_PASSWORD;

export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password,
  database: process.env.DB_NAME || 'cetiverso',
  max: 10,
});