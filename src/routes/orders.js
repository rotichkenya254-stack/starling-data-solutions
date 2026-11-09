const router = require("express").Router();
const Order = require("../models/Order");
const Package = require("../models/Package");
const { protect } = require("../middleware/auth");

router.post("/", protect, async (req, res) => {
  const { packageId, recipientPhone } = req.body;
  const phone = String(recipientPhone || "").replace(/\s/g, "");
  if (!/^(?:\+255|0)[67]\d{8}$/.test(phone))
    return res.status(400).json({ message: "Enter a valid Tanzanian mobile number." });
  const pack = await Package.findOne({ _id: packageId, active: true });
  if (!pack) return res.status(404).json({ message: "Bundle package not found." });
  const order = await Order.create({
    user: req.user._id, package: pack._id, network: pack.network,
    recipientPhone: phone, amountTzs: pack.priceTzs
  });
  res.status(201).json({ order, message: "Order created. Payment setup is required before collecting money." });
});
router.get("/mine", protect, async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).populate("package").sort({ createdAt: -1 }).limit(100);
  res.json({ orders });
});
module.exports = router;
