const express = require("express");
const paymentService = require("../services/paymentService");
const orderStore = require("../services/orderStore");

const router = express.Router();

function sanitizePreference(value) {
  return ["email", "whatsapp", "both"].includes(value) ? value : "email";
}

router.post("/checkout", async (req, res) => {
  try {
    const { customer, deliveryPreference } = req.body;

    if (!customer?.name || !customer?.email || !customer?.phone) {
      return res.status(400).json({
        error: "Informe nome, e-mail e WhatsApp para gerar o Pix.",
      });
    }

    const productName = process.env.PRODUCT_NAME || "Álbum Completo";
    const productPrice = Number(process.env.PRODUCT_PRICE || 19.9);
    const item = {
      title: productName,
      price: productPrice,
      quantity: 1,
    };

    const payment = await paymentService.createPixPayment({
      items: [item],
      customer,
      delivery: {},
    });

    const order = orderStore.createOrder({
      customer,
      deliveryPreference: sanitizePreference(deliveryPreference),
      item,
      transactionHash: payment.transaction_hash,
      pixCode: payment.pix_code,
    });

    return res.json({
      ...payment,
      order_id: order.id,
      delivery_preference: order.deliveryPreference,
    });
  } catch (error) {
    console.error("Erro ao criar pagamento:", error.message);
    return res.status(error.statusCode || 500).json({
      error: error.message || "Erro ao criar pagamento.",
    });
  }
});

router.get("/status/:transactionHash", (req, res) => {
  try {
    const payment = paymentService.getPaymentStatus(req.params.transactionHash);

    if (!payment) {
      return res.json({
        transactionHash: req.params.transactionHash,
        status: "pending",
        isPaid: false,
      });
    }

    return res.json(payment);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.message || "Erro ao consultar pagamento.",
    });
  }
});

module.exports = router;
