const express = require("express");
const webhookService = require("../services/ironpayWebhookService");

const router = express.Router();

router.post("/ironpay", async (req, res) => {
  try {
    const receivedKey =
      req.headers["x-webhook-secret"] ||
      req.headers["x-api-key"] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "") ||
      req.query.webhook_secret ||
      req.body?.webhook_secret;

    webhookService.validateWebhookKey(receivedKey);

    const result = await webhookService.processWebhook(req.body, req);

    return res.status(200).json({
      received: true,
      message: "Webhook processado com sucesso.",
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "Erro ao processar webhook.",
    });
  }
});

module.exports = router;
