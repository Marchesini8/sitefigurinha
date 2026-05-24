const express = require("express");
const metaCapiService = require("../services/metaCapiService");

const router = express.Router();

router.post("/events", async (req, res) => {
  try {
    const result = await metaCapiService.sendEvent(req, req.body);
    return res.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("[Meta CAPI] Falha no endpoint:", error.message);
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message || "Erro ao enviar evento Meta CAPI.",
    });
  }
});

module.exports = router;
