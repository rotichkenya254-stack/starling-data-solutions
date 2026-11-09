const mongoose = require("mongoose");
const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  package: { type: mongoose.Schema.Types.ObjectId, ref: "Package", required: true },
  network: { type: String, required: true },
  recipientPhone: { type: String, required: true },
  amountTzs: { type: Number, required: true },
  status: { type: String, enum: ["awaiting_payment", "paid", "processing", "completed", "failed", "refunded"], default: "awaiting_payment" },
  paymentReference: { type: String, default: "" },
  providerReference: { type: String, default: "" },
  providerTransactionId: { type: String, default: "" },
  globalReference: { type: String, default: "" },
  globalTransactionId: { type: String, default: "" },
  payerPhone: { type: String, default: "" },
  providerCode: { type: String, enum: ["", "VODACOM", "YAS", "AIRTEL", "HALOTEL"], default: "" },
  paymentStatus: { type: String, enum: ["not_started", "initiated", "completed", "failed", "verification_error"], default: "not_started" },
  mpesaReceiptNumber: { type: String, default: "" },
  failureReason: { type: String, default: "" }
}, { timestamps: true });
module.exports = mongoose.model("Order", orderSchema);
