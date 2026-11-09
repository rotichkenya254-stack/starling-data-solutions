const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/auth");

const tokenFor = user => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role });

router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !phone || !password || password.length < 8)
      return res.status(400).json({ message: "Enter all fields. Password must be at least 8 characters." });
    const normalizedPhone = String(phone).replace(/\s/g, "");
    if (!/^(?:\+255|0)[67]\d{8}$/.test(normalizedPhone))
      return res.status(400).json({ message: "Enter a valid Tanzanian mobile number, e.g. +255712345678." });
    if (await User.findOne({ email: String(email).toLowerCase() }))
      return res.status(409).json({ message: "An account with that email already exists." });
    const user = await User.create({
      name, email, phone: normalizedPhone,
      passwordHash: await bcrypt.hash(password, 12)
    });
    res.status(201).json({ token: tokenFor(user), user: safeUser(user) });
  } catch (e) { res.status(500).json({ message: "Could not create account." }); }
});

router.post("/login", async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email || "").toLowerCase() });
  if (!user || !user.active || !(await bcrypt.compare(req.body.password || "", user.passwordHash)))
    return res.status(401).json({ message: "Email or password is incorrect." });
  res.json({ token: tokenFor(user), user: safeUser(user) });
});
router.get("/me", protect, (req, res) => res.json({ user: safeUser(req.user) }));
module.exports = router;
