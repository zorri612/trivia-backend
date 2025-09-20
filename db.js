import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, ".env") });


console.log("🌍 MONGO_URI desde .env:", process.env.MONGO_URI);

let client;
let db;

export async function connectDB() {
  if (db) return db;

  try {
    client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    db = client.db("trivia");
    console.log("✅ Conectado a MongoDB");
    return db;
  } catch (err) {
    console.error("❌ Error al conectar con MongoDB:", err);
    process.exit(1);
  }
}

export function getDB() {
  if (!db) {
    throw new Error("❌ La base de datos no está inicializada");
  }
  return db;
}
