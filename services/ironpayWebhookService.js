const paymentStatusStore = require("./paymentStatusStore");
const orderStore = require("./orderStore");
const deliveryService = require("./deliveryService");

function validateWebhookKey(receivedKey) {
  const expectedKey = process.env.IRONPAY_WEBHOOK_SECRET || process.env.PAYMENT_API_KEY;

  if (!expectedKey) {
    const error = new Error("IRONPAY_WEBHOOK_SECRET não configurado no .env.");
    error.statusCode = 500;
    throw error;
  }

  if (!receivedKey || receivedKey !== expectedKey) {
    const error = new Error("Chave do webhook invalida.");
    error.statusCode = 401;
    throw error;
  }
}

async function processWebhook(payload) {
  const { transaction_hash, status, amount, payment_method, paid_at } = payload || {};

  if (!transaction_hash || !status || typeof amount !== "number") {
    const error = new Error("Payload do webhook invalido.");
    error.statusCode = 400;
    throw error;
  }

  const normalized = {
    transactionHash: transaction_hash,
    status,
    amount,
    paymentMethod: payment_method || null,
    paidAt: paid_at || null,
    isPaid: status === "paid",
  };

  paymentStatusStore.savePayment(normalized.transactionHash, normalized);

  const order = orderStore.getOrderByTransaction(normalized.transactionHash);
  if (order) {
    const updated = orderStore.updateOrder(order.id, {
      status: normalized.status,
      isPaid: normalized.isPaid,
      paidAt: normalized.paidAt,
    });

    if (normalized.isPaid) {
      normalized.delivery = await deliveryService.deliverOrder(updated);
    }
  }

  return normalized;
}

module.exports = {
  validateWebhookKey,
  processWebhook,
};
