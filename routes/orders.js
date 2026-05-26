const express = require("express");
const path = require("path");
const orderStore = require("../services/orderStore");
const deliveryService = require("../services/deliveryService");
const paymentStatusStore = require("../services/paymentStatusStore");
const webhookService = require("../services/ironpayWebhookService");

const router = express.Router();

router.get("/:orderId/status", async (req, res) => {
  let order = orderStore.getOrder(req.params.orderId);

  if (!order) {
    return res.status(404).json({ error: "Pedido não encontrado." });
  }

  const payment = paymentStatusStore.getPayment(order.transactionHash);
  if (!order.isPaid && payment?.isPaid) {
    order = orderStore.updateOrder(order.id, {
      status: payment.status,
      isPaid: true,
      paidAt: payment.paidAt || new Date().toISOString(),
    });
  }

  if (order.isPaid && !order.metaPurchaseEventSent) {
    if (!order.deliveryAttempts?.length) {
      await deliveryService.deliverOrder(order);
    }
    order = orderStore.getOrder(order.id) || order;
    await webhookService.sendPurchaseEvent(req, order);
    order = orderStore.getOrder(order.id) || order;
  }

  const payload = {
    id: order.id,
    status: order.status,
    isPaid: order.isPaid,
    deliveryPreference: order.deliveryPreference,
    deliveryAttempts: order.deliveryAttempts,
  };

  if (order.isPaid) {
    payload.downloadUrl = deliveryService.getDownloadUrl(order);
  }

  return res.json(payload);
});

router.get("/:orderId/download", (req, res) => {
  const order = orderStore.getOrder(req.params.orderId);

  if (!order || req.query.token !== order.downloadToken) {
    return res.status(404).send("Link invalido.");
  }

  if (!order.isPaid) {
    return res.status(403).send("Pagamento ainda não confirmado.");
  }

  const filePath = path.resolve(
    process.cwd(),
    process.env.PRODUCT_FILE_PATH || "private/Album Completo - Figurinhas.pdf"
  );
  return res.download(filePath, "Album Completo - Figurinhas.pdf");
});

module.exports = router;
