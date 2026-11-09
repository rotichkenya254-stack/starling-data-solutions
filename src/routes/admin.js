const router = require("express").Router();
const Package = require("../models/Package");
const Order = require("../models/Order");
const User = require("../models/User");
const { protect, adminOnly } = require("../middleware/auth");
router.use(protect, adminOnly);

router.get("/overview", async (_req, res) => {
  const [users, orders, completed, revenue] = await Promise.all([
    User.countDocuments({ role: "customer" }), Order.countDocuments(),
    Order.countDocuments({ status: "completed" }),
    Order.aggregate([{ $match: { status: "completed" } }, { $group: { _id: null, total: { $sum: "$amountTzs" } } }])
  ]);
  res.json({ users, orders, completed, revenueTzs: revenue[0]?.total || 0 });
});
router.get("/orders", async (_req, res) => {
  const orders = await Order.find().populate("user", "name email").populate("package").sort({ createdAt: -1 }).limit(300);
  res.json({ orders });
});
router.post("/packages", async (req, res) => {
  try {
    const { network, name, dataAmount, validity, priceTzs, providerProductCode } = req.body;
    if (!["Vodacom", "Halotel", "Airtel", "YAS"].includes(network) || !name || !dataAmount || !validity || Number(priceTzs) <= 0)
      return res.status(400).json({ message: "Provide valid package details." });
    const pack = await Package.create({ network, name, dataAmount, validity, priceTzs: Number(priceTzs), providerProductCode });
    res.status(201).json({ package: pack });
  } catch { res.status(400).json({ message: "Could not create package." }); }
});
router.patch("/packages/:id", async (req, res) => {
  const pack = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!pack) return res.status(404).json({ message: "Package not found." });
  res.json({ package: pack });
});
router.patch("/orders/:id/status", async (req, res) => {
  const allowed = ["awaiting_payment", "paid", "processing", "completed", "failed", "refunded"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid status." });
  const order = await Order.findByIdAndUpdate(req.params.id, {
    status: req.body.status, failureReason: String(req.body.failureReason || "").slice(0, 500)
  }, { new: true });
  if (!order) return res.status(404).json({ message: "Order not found." });
  res.json({ order });
});
module.exports = router;
