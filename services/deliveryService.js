const fs = require("fs/promises");
const path = require("path");
const orderStore = require("./orderStore");

function getPublicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function getProductFilePath() {
  return path.resolve(
    process.cwd(),
    process.env.PRODUCT_FILE_PATH || "private/Album Completo - Figurinhas.pdf"
  );
}

function getDownloadUrl(order) {
  return `${getPublicBaseUrl()}/api/orders/${order.id}/download?token=${order.downloadToken}`;
}

function normalizePhone(phone = "") {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

async function sendEmail(order, downloadUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { channel: "email", sent: false, reason: "RESEND_API_KEY não configurado." };
  }

  const fileBytes = await fs.readFile(getProductFilePath());

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DELIVERY_FROM_EMAIL || "Álbum Completo <entrega@example.com>",
      to: [order.customer.email],
      subject: "Seu PDF do Álbum Completo chegou",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
          <h1>Obrigado pela compra, ${order.customer.name}!</h1>
          <p>Seu PDF do Álbum Completo está anexado neste e-mail.</p>
          <p>Se preferir, também pode baixar pelo link abaixo:</p>
          <p><a href="${downloadUrl}">Baixar PDF do Álbum Completo</a></p>
        </div>
      `,
      attachments: [
        {
          filename: "Album Completo - Figurinhas.pdf",
          content: fileBytes.toString("base64"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro ao enviar e-mail: ${text}`);
  }

  return { channel: "email", sent: true };
}

async function sendWhatsapp(order, downloadUrl) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { channel: "whatsapp", sent: false, reason: "WhatsApp Cloud API não configurado." };
  }

  const to = normalizePhone(order.customer.phone);
  if (!to) {
    return { channel: "whatsapp", sent: false, reason: "Telefone invalido." };
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        preview_url: true,
        body: `Pagamento confirmado. Aqui está seu PDF do Álbum Completo: ${downloadUrl}`,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro ao enviar WhatsApp: ${text}`);
  }

  return { channel: "whatsapp", sent: true };
}

async function deliverOrder(order) {
  if (!order?.isPaid) {
    return { delivered: false, reason: "Pedido ainda não pago." };
  }

  const downloadUrl = getDownloadUrl(order);
  const preference = order.deliveryPreference || "email";
  const attempts = [];

  try {
    if (preference === "email" || preference === "both") {
      attempts.push(await sendEmail(order, downloadUrl));
    }

    if (preference === "whatsapp" || preference === "both") {
      attempts.push(await sendWhatsapp(order, downloadUrl));
    }
  } catch (error) {
    attempts.push({ channel: preference, sent: false, reason: error.message });
  }

  for (const attempt of attempts) {
    orderStore.addDeliveryAttempt(order.id, attempt);
  }

  return {
    delivered: attempts.some((attempt) => attempt.sent),
    downloadUrl,
    attempts,
  };
}

module.exports = {
  deliverOrder,
  getDownloadUrl,
};
