const express = require("express");
const paymentService = require("../services/paymentService");
const orderStore = require("../services/orderStore");
const metaCapiService = require("../services/metaCapiService");

const router = express.Router();

function sanitizePreference(value) {
  return ["email", "whatsapp", "both"].includes(value) ? value : "email";
}

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || req.ip || "";
}

function sanitizeAttribution(value = {}) {
  return {
    fbp: value.fbp || "",
    fbc: value.fbc || "",
    external_id: value.external_id || "",
    event_source_url: value.event_source_url || "",
  };
}

function sanitizeTracking(value = {}) {
  return {
    src: value.src || "",
    utm_source: value.utm_source || "",
    utm_medium: value.utm_medium || "",
    utm_campaign: value.utm_campaign || "",
    utm_term: value.utm_term || "",
    utm_content: value.utm_content || "",
  };
}

router.post("/checkout", async (req, res) => {
  try {
    const { customer, deliveryPreference } = req.body;
    const attribution = sanitizeAttribution(req.body.attribution);
    const tracking = sanitizeTracking(req.body.tracking);

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
      tracking,
    });

    const order = orderStore.createOrder({
      customer,
      deliveryPreference: sanitizePreference(deliveryPreference),
      item,
      transactionHash: payment.transaction_hash,
      pixCode: payment.pix_code,
      metaAttribution: {
        ...attribution,
        external_id: attribution.external_id || metaCapiService.createExternalId(customer),
        client_ip_address: getIp(req),
        client_user_agent: req.headers["user-agent"] || "",
      },
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
