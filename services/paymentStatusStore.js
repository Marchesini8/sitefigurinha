const payments = new Map();

function savePayment(transactionHash, data = {}) {
  if (!transactionHash) return null;

  const existing = payments.get(transactionHash) || {};
  const next = {
    ...existing,
    ...data,
    transactionHash,
    updatedAt: new Date().toISOString(),
  };

  payments.set(transactionHash, next);
  return next;
}

function getPayment(transactionHash) {
  return payments.get(transactionHash) || null;
}

module.exports = {
  savePayment,
  getPayment,
};
