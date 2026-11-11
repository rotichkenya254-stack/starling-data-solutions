const router = require("express").Router();
const Order = require("../models/Order");
const { protect } = require("../middleware/auth");

const GLOBAL_API_BASE = (process.env.OPTIMAPAY_GLOBAL_BASE_URL ||
  "https://global.optimapaybridge.co.ke/api/v2").replace(/\/+$/, "");

function globalConfig() {
  return {
    key: process.env.TZUG_OPTIMAPAY_API_KEY || process.env.OPTIMAPAY_API_KEY,
    secret: process.env.TZUG_OPTIMAPAY_API_SECRET || process.env.OPTIMAPAY_API_SECRET
  };
}

function configured() {
  const { key, secret } = globalConfig();
  return Boolean(key && secret && process.env.OPTIMAPAY_TANZANIA_ENABLED === "true");
}

function normalizeTanzaniaPhone(value) {
  let phone = String(value || "").replace(/[\s()-]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^0[67]\d{8}$/.test(phone)) phone = "255" + phone.slice(1);
  return /^255[67]\d{8}$/.test(phone) ? phone : null;
}

async function optimapayGlobalRequest(method, endpoint, payload) {
  const { key, secret } = globalConfig();
  if (!key || !secret) {
    throw new Error("OptimaPay Tanzania Global API credentials are not configured.");
  }
  const response = await fetch(`${GLOBAL_API_BASE}/${endpoint}`, {
    method,
    headers: {
      "X-API-KEY": key,
      "X-API-SECRET": secret,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || !data || data.success === false) {
    const error = new Error(
      typeof data?.message === "string"
        ? data.message
        : `OptimaPay Global request failed (HTTP ${response.status}).`
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

function paymentStatusPayload(order) {
  return {
    orderId: String(order._id),
    paymentStatus: order.paymentStatus,
    orderStatus: order.status,
    amountTzs: order.amountTzs,
    currency: "TZS",
    reference: order.paymentReference,
    message: order.failureReason || (
      order.paymentStatus === "completed"
        ? "Payment verified successfully."
        : "Payment is awaiting confirmation."
    )
  };
}

async function verifyTanzaniaPayment(order) {
  const identifier = order.globalReference || order.globalTransactionId || order.paymentReference;
  if (!identifier) return;
  const result = await optimapayGlobalRequest(
    "GET",
    `godigital/tz/status/${encodeURIComponent(identifier)}`
  );
  const provider = result && result.data && typeof result.data === "object"
    ? result.data : result;
  const state = String(provider.status || provider.payment_status || "").trim().toLowerCase();

  if (["completed", "successful", "success", "paid"].includes(state)) {
    const paidAmount = Number(provider.amount);
    const paidPhone = normalizeTanzaniaPhone(provider.phone);
    const expectedPhone = normalizeTanzaniaPhone(order.payerPhone);
    if (!Number.isFinite(paidAmount) || paidAmount !== Number(order.amountTzs) ||
        !paidPhone || !expectedPhone || paidPhone !== expectedPhone) {
      order.paymentStatus = "verification_error";
      order.failureReason = "OptimaPay status did not match the expected TZS amount and payer phone. Order was not marked paid.";
      await order.save();
      return;
    }
    if (order.paymentStatus !== "completed") {
      order.paymentStatus = "completed";
      order.status = "paid";
      order.providerTransactionId = provider.transaction_id != null
        ? String(provider.transaction_id) : "";
      order.mpesaReceiptNumber = String(
        provider.transaction_code || provider.gateway_transaction_id ||
        provider.reference || ""
      ).slice(0, 100);
      order.failureReason = "";
      await order.save();
    }
  } else if (["failed", "cancelled", "canceled", "rejected"].includes(state)) {
    order.paymentStatus = "failed";
    order.failureReason = String(provider.message || "OptimaPay reports payment failed or cancelled.").slice(0, 500);
    await order.save();
  } else {
    order.paymentStatus = "initiated";
    order.failureReason = String(provider.message || "Payment is still pending confirmation.").slice(0, 500);
    await order.save();
  }
}

// POST /api/payments/initiate - Tanzania Global API collection endpoint
router.post("/initiate", protect, async (req, res) => {
  let order;
  try {
    if (!configured()) {
      return res.status(503).json({
        message: "OptimaPay Tanzania checkout is not enabled. Configure the Global API credentials and explicitly enable Tanzania payments."
      });
    }

    order = await Order.findOne({
      _id: req.body.orderId,
      user: req.user._id
    });

    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.status !== "awaiting_payment" || order.paymentStatus === "completed") {
      return res.status(409).json({ message: "This order is not awaiting payment." });
    }
    if (order.paymentStatus === "initiated" && order.paymentReference) {
      return res.status(409).json({
        message: "A payment request already exists for this order. Check its status instead of creating another payment."
      });
    }

    const payerPhone = normalizeTanzaniaPhone(req.body.payerPhone || order.recipientPhone);
    if (!payerPhone) {
      return res.status(400).json({
        message: "Enter a valid Tanzanian mobile-money payer number, e.g. 0712345678 or +255712345678."
      });
    }
    const providerCode = String(req.body.provider || "").trim().toUpperCase();
    if (!["VODACOM", "YAS", "AIRTEL", "HALOTEL"].includes(providerCode)) {
      return res.status(400).json({ message: "Select Vodacom, YAS, Airtel or Halotel as the payer network." });
    }

    const reference = `STARLING-TZ-${Date.now().toString(36).toUpperCase()}-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`.slice(0, 50);
    order.payerPhone = payerPhone;
    order.providerCode = providerCode;
    order.paymentReference = reference;
    order.paymentStatus = "initiated";
    order.failureReason = "";
    await order.save();

    const result = await optimapayGlobalRequest("POST", "godigital/tz/collect", {
      providerCode,
      phone: payerPhone,
      amount: Number(order.amountTzs),
      reference,
      description: `Starling Data Solutions ${order.network} ${order.package ? "data bundle" : "bundle"}`
    });

    // Check status codes returned by the gateway[cite: 5]
    if (!["202", "200"].includes(String(result.http_status || result.status_code || "202"))) {
      throw new Error(result.message || "Tanzania payment request was not accepted by the gateway.");
    }

    const data = result.data || {};
    const providerState = String(data.status || "PENDING").toUpperCase();
    if (["FAILED", "REJECTED", "CANCELLED"].includes(providerState)) {
      order.paymentStatus = "failed";
      order.failureReason = String(result.message || "Payment request was rejected.").slice(0, 500);
      await order.save();
      return res.status(400).json({ message: order.failureReason, order: paymentStatusPayload(order) });
    }

    order.globalReference = String(data.reference || data.client_reference || reference).slice(0, 100);
    order.globalTransactionId = data.transaction_id != null ? String(data.transaction_id) : "";
    order.providerReference = order.globalReference;
    await order.save();

    return res.status(202).json({
      message: result.message || "Tanzania mobile-money payment prompt submitted. Complete the prompt on your phone; final confirmation is pending.",
      ...paymentStatusPayload(order)
    });
  } catch (err) {
    console.error("OptimaPay Tanzania Global API initiation failed:", err.message);
    if (order) {
      const ambiguous = err.name === "AbortError" || err.name === "TimeoutError" ||
        /timeout|network|fetch failed|socket/i.test(String(err.message || ""));
      if (ambiguous) {
        order.globalReference = order.paymentReference;
        order.paymentStatus = "initiated";
        order.failureReason = "Gateway response is not yet confirmed. Check this original transaction reference; do not retry payment.";
        await order.save().catch(() => {});
        return res.status(202).json({ message: order.failureReason, ...paymentStatusPayload(order) });
      }
      order.paymentStatus = "failed";
      order.failureReason = String(err.message || "Payment initiation failed.").slice(0, 500);
      await order.save().catch(() => {});
    }
    res.status(err.status || 502).json({
      message: "Could not initiate Tanzania mobile-money payment. " +
        String(err.message || "Please check your details and try again.")
    });
  }
});

// GET /api/payments/status/:orderId
router.get("/status/:orderId", protect, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.paymentStatus === "completed" || order.paymentStatus === "failed" ||
        order.paymentStatus === "verification_error") {
      return res.json(paymentStatusPayload(order));
    }
    if (!order.paymentReference) return res.json(paymentStatusPayload(order));
    if (!configured()) return res.status(503).json({ message: "OptimaPay Tanzania Global API is not configured." });

    await verifyTanzaniaPayment(order);
    return res.json(paymentStatusPayload(order));
  } catch (err) {
    console.error("OptimaPay Tanzania status check failed:", err.message);
    res.status(err.status || 502).json({ message: "Could not verify payment status with OptimaPay Tanzania." });
  }
});

router.post("/callback", (_req, res) => res.status(202).json({
  received: true,
  message: "Callback received. Payment must be verified against the authenticated OptimaPay Tanzania status endpoint."
}));

module.exports = router;
