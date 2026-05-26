const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ordersById = new Map();
const ordersByTransaction = new Map();
const storagePath = path.resolve(process.env.ORDER_STORE_FILE || path.join("outputs", "orders.json"));

function ensureStorageDir() {
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
}

function loadOrders() {
  try {
    const saved = JSON.parse(fs.readFileSync(storagePath, "utf8"));
    const orders = Array.isArray(saved.orders) ? saved.orders : [];

    orders.forEach((order) => {
      if (!order?.id) return;
      ordersById.set(order.id, order);
      if (order.transactionHash) ordersByTransaction.set(order.transactionHash, order.id);
    });
  } catch {
    // The store starts empty when there is no persisted file yet.
  }
}

function persistOrders() {
  ensureStorageDir();
  fs.writeFileSync(
    storagePath,
    JSON.stringify({ orders: Array.from(ordersById.values()) }, null, 2)
  );
}

loadOrders();

function createOrder({ customer, deliveryPreference, item, transactionHash, pixCode, metaAttribution }) {
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
    metaAttribution: metaAttribution || {},
    downloadToken,
    deliveryAttempts: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  ordersById.set(id, order);
  if (transactionHash) ordersByTransaction.set(transactionHash, id);
  persistOrders();

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
  persistOrders();
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
