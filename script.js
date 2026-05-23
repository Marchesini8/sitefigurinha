const checkoutModal = document.querySelector("#checkout-modal");
const previewModal = document.querySelector("#preview-modal");
const closeModalButtons = document.querySelectorAll(".modal-close");
const openCheckoutButtons = document.querySelectorAll(".open-checkout");
const openPreviewButtons = document.querySelectorAll(".open-preview");
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
let previewTracked = false;

const pixelProductParams = {
  content_name: "Album da Copa 2026 Completo em PDF",
  content_type: "product",
  currency: "BRL",
  value: 19.9,
};

function trackPixel(eventName, params = {}) {
  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, params);
  }
}

function trackCustomPixel(eventName, params = {}) {
  if (typeof window.fbq === "function") {
    window.fbq("trackCustom", eventName, params);
  }
}

function getPurchaseStorageKey(orderId) {
  return `purchase_tracked_${orderId}`;
}

function hasTrackedPurchase(orderId) {
  if (!orderId) return purchaseTracked;

  try {
    return window.localStorage.getItem(getPurchaseStorageKey(orderId)) === "1";
  } catch {
    return purchaseTracked;
  }
}

function markPurchaseTracked(orderId) {
  purchaseTracked = true;

  if (!orderId) return;

  try {
    window.localStorage.setItem(getPurchaseStorageKey(orderId), "1");
  } catch {
    // Ignore storage failures; the in-memory guard still prevents repeats in this session.
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
  closePreview();
  checkoutModal?.classList.add("is-open");
  checkoutModal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (!checkoutTracked) {
    trackPixel("InitiateCheckout", pixelProductParams);
    checkoutTracked = true;
  }
}

function closeCheckout() {
  checkoutModal?.classList.remove("is-open");
  checkoutModal?.setAttribute("aria-hidden", "true");
  if (!previewModal?.classList.contains("is-open")) {
    document.body.style.overflow = "";
  }
}

function openPreview() {
  previewModal?.classList.add("is-open");
  previewModal?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (!previewTracked) {
    trackCustomPixel("PreviewOpened", pixelProductParams);
    previewTracked = true;
  }
}

function closePreview() {
  previewModal?.classList.remove("is-open");
  previewModal?.setAttribute("aria-hidden", "true");
  if (!checkoutModal?.classList.contains("is-open")) {
    document.body.style.overflow = "";
  }
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
    if (!hasTrackedPurchase(currentOrderId)) {
      trackPixel("Purchase", pixelProductParams);
      markPurchaseTracked(currentOrderId);
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

trackPixel("ViewContent", pixelProductParams);

openCheckoutButtons.forEach((button) => button.addEventListener("click", openCheckout));
openPreviewButtons.forEach((button) => button.addEventListener("click", openPreview));
closeModalButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeCheckout();
    closePreview();
  });
});

checkoutModal?.addEventListener("click", (event) => {
  if (event.target === checkoutModal) closeCheckout();
});

previewModal?.addEventListener("click", (event) => {
  if (event.target === previewModal) closePreview();
});

previewModal?.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCheckout();
    closePreview();
  }
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
    trackPixel("AddPaymentInfo", pixelProductParams);
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
