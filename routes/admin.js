import express from "express";
import bcrypt from "bcrypt";
import { MongoClient } from "mongodb";

const router = express.Router();

// ⚡ Registro de admin
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) 
        return res.status(400).json({ error: "Faltan datos" });

    const db = req.app.locals.db;
    const existing = await db.collection("admins").findOne({ email });
    if (existing) return res.status(400).json({ error: "Admin ya registrado" });

    const hashed = await bcrypt.hash(password, 10);
    await db.collection("admins").insertOne({ email, password: hashed, createdAt: new Date() });

    res.json({ ok: true, message: "Admin registrado" });
  } catch (err) {
    console.error("❌ Error en /admin/register", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// ⚡ Login de admin
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Faltan datos" });

    const db = req.app.locals.db;
    const admin = await db.collection("admins").findOne({ email });
    if (!admin) return res.status(400).json({ error: "No existe el admin" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: "Contraseña incorrecta" });

    res.json({ success: true, message: "Login exitoso", admin: { email: admin.email } });
  } catch (err) {
    console.error("❌ Error en /admin/login", err);
    res.status(500).json({ error: "Error interno" });
  }
});

export default router;
