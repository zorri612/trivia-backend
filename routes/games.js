import express from "express";
import { ObjectId } from "mongodb";
import { Game } from "../models/Game.js";

const router = express.Router();

// Obtener detalle de una partida
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const game = await Game.collection().findOne({ _id: new ObjectId(id) });

    if (!game) {
      return res.status(404).json({ error: "Partida no encontrada" });
    }

    res.json(game);
  } catch (err) {
    console.error("❌ Error al traer partida:", err);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
