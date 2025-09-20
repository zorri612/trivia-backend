// models/Question.js
let db;

export const Question = {
  init(database) {
    db = database;
  },

  collection() {
    if (!db) throw new Error("❌ DB no inicializada (Question)");
    return db.collection("questions");
  },

  async create(question) {
    const result = await this.collection().insertOne(question);
    return result.insertedId;
  },

  async getRandom() {
    const random = await this.collection().aggregate([{ $sample: { size: 1 } }]).toArray();
    return random[0];
  },
};
