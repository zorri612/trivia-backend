import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { userModel } from "../models/User.js";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

router.post("/register", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const users = userModel(db);

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Faltan campos" });
    }

    const exists = await users.findOne({ email });
    if (exists) {
      return res.status(400).json({ error: "El email ya está registrado" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await users.insertOne({
      username,
      email,
      password: hashed,
      createdAt: new Date(),
    });

    res.status(201).json({ message: "Usuario registrado", id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en registro" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const db = req.app.locals.db;
    const users = userModel(db);

    const { email, password } = req.body;
    const user = await users.findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ message: "Login exitoso", token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error en login" });
  }
});

export default router;
