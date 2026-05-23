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
const phoneInput = checkoutForm?.querySelector('input[name="phone"]');
const documentInput = checkoutForm?.querySelector('input[name="document"]');

let currentOrderId = null;
let currentTransactionHash = null;
let pollTimer = null;
let checkoutTracked = false;
let purchaseTracked = false;

function trackPixel(eventName, params = {}) {
  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, params);
  }
}

function onlyDigits(value = "") {
  return String(value).replace(/\D/g, "");
}

function formatCpf(value = "") {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatPhone(value = "") {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return digits.replace(/(\d{2})(\d{0,4})/, "($1) $2");
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");

  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

function openCheckout() {
  checkoutModal?.classList.add("is-open");
  checkoutModal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (!checkoutTracked) {
    trackPixel("InitiateCheckout", {
      content_name: "Album da Copa 2026 Completo em PDF",
      content_type: "product",
      currency: "BRL",
      value: 19.9,
    });
    checkoutTracked = true;
  }
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
    throw new Error(data.error || "Nao foi possivel consultar o pedido.");
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
        <span>Seu PDF do Album da Copa 2026 esta liberado para download.</span>
        ${downloadButton}
      </div>
    `;
    if (!purchaseTracked) {
      trackPixel("Purchase", {
        content_name: "Album da Copa 2026 Completo em PDF",
        content_type: "product",
        currency: "BRL",
        value: 19.9,
      });
      purchaseTracked = true;
    }
    setFeedback("Pagamento confirmado. O PDF foi liberado.", "success");
    return;
  }

  deliveryStatus.textContent =
    "Pagamento ainda pendente. Depois de pagar, a confirmacao pode levar alguns instantes.";
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

phoneInput?.addEventListener("input", (event) => {
  event.target.value = formatPhone(event.target.value);
});

documentInput?.addEventListener("input", (event) => {
  event.target.value = formatCpf(event.target.value);
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
          document: onlyDigits(payload.document),
          phone: onlyDigits(payload.phone),
        },
        deliveryPreference: payload.deliveryPreference,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Nao foi possivel gerar o Pix.");
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
    trackPixel("AddPaymentInfo", {
      content_name: "Album da Copa 2026 Completo em PDF",
      content_type: "product",
      currency: "BRL",
      value: 19.9,
    });
    setFeedback("Pix gerado. Pague usando o QR Code ou o copia e cola.", "success");
    deliveryStatus.textContent = currentTransactionHash
      ? "Aguardando confirmacao do pagamento."
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

  copyPixButton.textContent = "Codigo copiado";
  window.setTimeout(() => {
    copyPixButton.textContent = "Copiar codigo Pix";
  }, 1600);
});

checkPaymentButton?.addEventListener("click", () => {
  checkOrderStatus().catch((error) => {
    deliveryStatus.textContent = error.message;
  });
});
