const checkoutModal = document.querySelector("#checkout-modal");
const previewModal = document.querySelector("#preview-modal");
const closeModalButtons = document.querySelectorAll(".modal-close");
const openCheckoutButtons = document.querySelectorAll(".open-checkout");
const openPreviewButtons = document.querySelectorAll(".open-preview");
const heroVideo = document.querySelector(".hero-video");
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
let addToCartTracked = false;
let leadTracked = false;
let purchaseTracked = false;
let previewTracked = false;
let latestCustomerData = null;

const activeOrderStorageKey = "active_order";

function playHeroVideoWithSound() {
  if (!heroVideo) return;

  heroVideo.muted = false;
  heroVideo.volume = 1;

  const playPromise = heroVideo.play();

  if (playPromise?.catch) {
    playPromise.catch(() => {
      heroVideo.controls = true;
    });
  }
}

const pixelProductParams = {
  content_name: "Album da Copa 2026 Completo em PDF",
  content_type: "product",
  contents: [
    {
      id: "album-copa-2026-pdf",
      quantity: 1,
    },
  ],
  content_ids: ["album-copa-2026-pdf"],
  currency: "BRL",
  value: 19.9,
};

const purchasePixelParams = {
  ...pixelProductParams,
  value: 19.9,
  currency: "BRL",
};

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function setCookie(name, value, days = 90) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function captureFbclid() {
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbclid) return getCookie("_fbc");

  const existing = getCookie("_fbc");
  if (existing && existing.includes(fbclid)) return existing;

  const fbc = `fb.1.${Date.now()}.${fbclid}`;
  setCookie("_fbc", fbc);
  return fbc;
}

function getOrCreateFbp() {
  const existing = getCookie("_fbp");
  if (existing) return existing;

  const randomValue = Math.floor(Math.random() * 10 ** 16);
  const fbp = `fb.1.${Date.now()}.${randomValue}`;
  setCookie("_fbp", fbp);
  return fbp;
}

function getMetaUserData(extra = {}) {
  return {
    fbp: getOrCreateFbp(),
    fbc: captureFbclid(),
    email: extra.email,
    phone: extra.phone,
  };
}

function createEventId(eventName) {
  if (window.crypto?.randomUUID) {
    return `${eventName}.${window.crypto.randomUUID()}`;
  }

  return `${eventName}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
}

function sendCapiEvent({ eventName, eventId, params = {}, customer = {} }) {
  return fetch("/api/meta/events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_name: eventName,
      event_id: eventId,
      event_source_url: window.location.href,
      custom_data: params,
      user_data: getMetaUserData(customer),
    }),
  }).catch((error) => {
    console.warn("[Meta CAPI] Falha ao enviar evento", eventName, error);
  });
}

function trackMetaEvent(eventName, params = {}, options = {}) {
  const eventId = options.eventId || createEventId(eventName);
  const customer = options.customer || latestCustomerData || {};

  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, params, { eventID: eventId });
  }

  sendCapiEvent({
    eventName,
    eventId,
    params,
    customer,
  });

  return eventId;
}

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

function saveActiveOrder(order = {}) {
  try {
    window.localStorage.setItem(activeOrderStorageKey, JSON.stringify(order));
  } catch {
    // The checkout still works if the browser blocks localStorage.
  }
}

function restoreActiveOrder() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(activeOrderStorageKey) || "{}");
    if (!saved.orderId) return;

    currentOrderId = saved.orderId;
    currentTransactionHash = saved.transactionHash || null;
    latestCustomerData = saved.customer || null;
  } catch {
    // Ignore invalid persisted state.
  }
}

function clearActiveOrder() {
  try {
    window.localStorage.removeItem(activeOrderStorageKey);
  } catch {
    // Nothing to clear.
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
    trackMetaEvent("InitiateCheckout", pixelProductParams);
    checkoutTracked = true;
  }

  if (currentOrderId) {
    pixResult?.classList.add("is-open");
    pixResult?.setAttribute("aria-hidden", "false");
    deliveryStatus.textContent = "Consultando status do pagamento anterior...";
    checkOrderStatus().catch((error) => {
      deliveryStatus.textContent = error.message;
    });
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

function scrollToPixResult() {
  if (!pixResult) return;

  window.requestAnimationFrame(() => {
    pixResult.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
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
      trackMetaEvent("Purchase", purchasePixelParams, {
        eventId: `Purchase.${currentOrderId}`,
      });
      markPurchaseTracked(currentOrderId);
    }
    clearActiveOrder();
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

trackMetaEvent("PageView");
trackMetaEvent("ViewContent", pixelProductParams);
restoreActiveOrder();

if (heroVideo) {
  playHeroVideoWithSound();
  window.addEventListener("load", playHeroVideoWithSound, { once: true });
  document.addEventListener("pointerdown", playHeroVideoWithSound, { once: true, capture: true });
  document.addEventListener("keydown", playHeroVideoWithSound, { once: true, capture: true });
}

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
  latestCustomerData = {
    email: payload.email,
    phone: onlyDigits(payload.phone),
  };

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
    saveActiveOrder({
      orderId: currentOrderId,
      transactionHash: currentTransactionHash,
      customer: latestCustomerData,
    });

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
    scrollToPixResult();
    if (!addToCartTracked) {
      trackMetaEvent("AddToCart", pixelProductParams, { customer: latestCustomerData });
      addToCartTracked = true;
    }
    if (!leadTracked) {
      trackMetaEvent("Lead", pixelProductParams, { customer: latestCustomerData });
      leadTracked = true;
    }
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
