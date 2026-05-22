const crypto = require("crypto");

const ordersById = new Map();
const ordersByTransaction = new Map();

function createOrder({ customer, deliveryPreference, item, transactionHash, pixCode }) {
  const id = crypto.randomUUID();
  const downloadToken = crypto.randomBytes(24).toString("hex");
  const order = {
    id,
    transactionHash,
    status: "pending",
    isPaid: false,
    customer,
    deliveryPreference,
    item,
    pixCode,
    downloadToken,
    deliveryAttempts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ordersById.set(id, order);
  if (transactionHash) ordersByTransaction.set(transactionHash, id);

  return order;
}

function getOrder(id) {
  return ordersById.get(id) || null;
}

function getOrderByTransaction(transactionHash) {
  const id = ordersByTransaction.get(transactionHash);
  return id ? getOrder(id) : null;
}

function updateOrder(id, patch = {}) {
  const current = getOrder(id);
  if (!current) return null;

  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  ordersById.set(id, next);
  if (next.transactionHash) ordersByTransaction.set(next.transactionHash, id);
  return next;
}

function addDeliveryAttempt(id, attempt) {
  const current = getOrder(id);
  if (!current) return null;

  return updateOrder(id, {
    deliveryAttempts: [
      ...current.deliveryAttempts,
      {
        ...attempt,
        at: new Date().toISOString(),
      },
    ],
  });
}

module.exports = {
  createOrder,
  getOrder,
  getOrderByTransaction,
  updateOrder,
  addDeliveryAttempt,
};
