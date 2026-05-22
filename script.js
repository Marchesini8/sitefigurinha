const checkoutModal = document.querySelector("#checkout-modal");
const closeModalButton = document.querySelector(".modal-close");
const openCheckoutButtons = document.querySelectorAll(".open-checkout");
const checkoutForm = document.querySelector("#checkout-form");
const paymentFeedback = document.querySelector("#payment-feedback");
const pixResult = document.querySelector("#pix-result");
const pixQrImage = document.querySelector("#pix-qr-image");
const pixQrEmpty = document.querySelector("#pix-qr-empty");
const pixCode = document.querySelector("#pix-code");
const copyPixButton = document.querySelector(".copy-pix-button");
const checkPaymentButton = document.querySelector(".check-payment-button");
const deliveryStatus = document.querySelector("#delivery-status");

let currentOrderId = null;
let currentTransactionHash = null;
let pollTimer = null;

function openCheckout() {
  checkoutModal?.classList.add("is-open");
  checkoutModal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeCheckout() {
  checkoutModal?.classList.remove("is-open");
  checkoutModal?.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function setFeedback(message = "", type = "info") {
  if (!paymentFeedback) return;
  paymentFeedback.textContent = message;
  paymentFeedback.dataset.type = type;
}

function resetSubmitButton(button) {
  if (button) button.textContent = "Gerar Pix de R$ 19,90";
}

function buildQrCodeUrl(pixPayload = "") {
  if (!pixPayload) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(
    pixPayload
  )}`;
}

function normalizeQrImageSource(qrImage = "", pixPayload = "") {
  const value = String(qrImage || "").trim();

  if (value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value) {
    return `data:image/png;base64,${value.replace(/\s/g, "")}`;
  }

  return buildQrCodeUrl(pixPayload);
}

async function checkOrderStatus() {
  if (!currentOrderId) return;

  const response = await fetch(`/api/orders/${currentOrderId}/status`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Não foi possível consultar o pedido.");
  }

  if (data.isPaid) {
    window.clearInterval(pollTimer);
    pollTimer = null;

    const downloadButton = data.downloadUrl
      ? `<a class="button" href="${data.downloadUrl}" target="_blank" rel="noopener">Baixar PDF agora</a>`
      : "";

    deliveryStatus.innerHTML = `
      <div class="download-ready">
        <strong>Pagamento confirmado!</strong>
        <span>Seu PDF do Álbum Completo está liberado para download.</span>
        ${downloadButton}
      </div>
    `;
    setFeedback("Pagamento confirmado. O PDF foi liberado.", "success");
    return;
  }

  deliveryStatus.textContent =
    "Pagamento ainda pendente. Depois de pagar, a confirmação pode levar alguns instantes.";
}

function startPolling() {
  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    checkOrderStatus().catch((error) => {
      deliveryStatus.textContent = error.message;
    });
  }, 5000);
}

openCheckoutButtons.forEach((button) => button.addEventListener("click", openCheckout));
closeModalButton?.addEventListener("click", closeCheckout);

checkoutModal?.addEventListener("click", (event) => {
  if (event.target === checkoutModal) closeCheckout();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCheckout();
});

checkoutForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = checkoutForm.querySelector(".submit-payment");
  const formData = new FormData(checkoutForm);
  const payload = Object.fromEntries(formData.entries());

  submitButton.disabled = true;
  submitButton.textContent = "Gerando Pix...";
  setFeedback("");
  deliveryStatus.textContent = "";
  pixResult?.classList.remove("is-open");

  try {
    const response = await fetch("/api/payments/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: {
          name: payload.name,
          email: payload.email,
          document: payload.document,
          phone: payload.phone,
        },
        deliveryPreference: payload.deliveryPreference,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Não foi possível gerar o Pix.");
    }

    currentOrderId = data.order_id;
    currentTransactionHash = data.transaction_hash;

    if (pixCode) pixCode.value = data.pix_code || "";

    if (pixQrImage && pixQrEmpty) {
      const qrImageSource = normalizeQrImageSource(data.pix_base64, data.pix_code);

      if (qrImageSource) {
        pixQrImage.src = qrImageSource;
        pixQrImage.classList.add("is-visible");
        pixQrEmpty.classList.add("is-hidden");
      } else {
        pixQrImage.classList.remove("is-visible");
        pixQrEmpty.classList.remove("is-hidden");
      }
    }

    pixResult?.classList.add("is-open");
    pixResult?.setAttribute("aria-hidden", "false");
    setFeedback("Pix gerado. Pague usando o QR Code ou o copia e cola.", "success");
    deliveryStatus.textContent = currentTransactionHash
      ? "Aguardando confirmação do pagamento."
      : "Pix gerado. Depois de pagar, clique em verificar pagamento.";
    startPolling();
  } catch (error) {
    setFeedback(error.message, "error");
  } finally {
    submitButton.disabled = false;
    resetSubmitButton(submitButton);
  }
});

copyPixButton?.addEventListener("click", async () => {
  const code = pixCode?.value || "";
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
  } catch {
    pixCode.select();
    document.execCommand("copy");
  }

  copyPixButton.textContent = "Código copiado";
  window.setTimeout(() => {
    copyPixButton.textContent = "Copiar código Pix";
  }, 1600);
});

checkPaymentButton?.addEventListener("click", () => {
  checkOrderStatus().catch((error) => {
    deliveryStatus.textContent = error.message;
  });
});
