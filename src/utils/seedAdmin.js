const bcrypt = require("bcryptjs");
const User = require("../models/User");
async function seedAdmin() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.warn("Admin seed skipped: set ADMIN_EMAIL and ADMIN_PASSWORD in .env");
    return;
  }
  const email = ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({
      name: ADMIN_NAME || "Administrator", email,
      phone: "+255700000000",
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: "admin"
    });
    console.log("Initial admin account created.");
  }
}
module.exports = { seedAdmin };
