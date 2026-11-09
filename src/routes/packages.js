const router = require("express").Router();
const Package = require("../models/Package");
router.get("/", async (_req, res) => {
  const packages = await Package.find({ active: true }).sort({ network: 1, priceTzs: 1 });
  res.json({ packages });
});
module.exports = router;
