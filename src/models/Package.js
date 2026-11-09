const mongoose = require("mongoose");
const packageSchema = new mongoose.Schema({
  network: { type: String, enum: ["Vodacom", "Halotel", "Airtel", "YAS"], required: true },
  name: { type: String, required: true, trim: true },
  dataAmount: { type: String, required: true },
  validity: { type: String, required: true },
  priceTzs: { type: Number, required: true, min: 1 },
  active: { type: Boolean, default: true },
  providerProductCode: { type: String, default: "" }
}, { timestamps: true });
module.exports = mongoose.model("Package", packageSchema);
