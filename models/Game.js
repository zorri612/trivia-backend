// models/Game.js
let db;

export const Game = {
  init(database) {
    db = database;
  },

  collection() {
    if (!db) throw new Error("❌ La base de datos no está inicializada");
    return db.collection("games");
  },

  async create(players) {
    const result = await this.collection().insertOne({
      players,
      status: "playing",
      createdAt: new Date(),
      winner: null || "Empate",
    });
    return result.insertedId;
  },
};
