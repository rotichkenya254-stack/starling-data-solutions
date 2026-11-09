require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

const authRoutes = require("./src/routes/auth");
const packageRoutes = require("./src/routes/packages");
const orderRoutes = require("./src/routes/orders");
const adminRoutes = require("./src/routes/admin");
const paymentRoutes = require("./src/routes/payments");
const { seedAdmin } = require("./src/utils/seedAdmin");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
// Same-origin hosting needs no cross-origin access. Set CORS_ORIGINS to a
// comma-separated allowlist only when a separate trusted frontend is used.
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/api", (req, res, next) => {
  // API responses contain live account/catalogue data and must not be cached.
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 250, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false }));
app.get("/api/health", (_req, res) => res.json({
  ok: true,
  service: "Starling Data Solutions Tanzania",
  backend: "admin-routing-fix-2026-11-10",
  database: mongoose.connection.readyState === 1 ? "connected" : "not_connected"
}));

// Vercel serves files in /public from its static CDN. express.static also
// keeps the project convenient to run locally.
// Static assets are mounted AFTER API routes so they cannot shadow API endpoints.

app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

let dbPromise;
async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!dbPromise) {
    dbPromise = mongoose.connect(process.env.MONGODB_URI)
      .then(async () => { await seedAdmin(); })
      .catch(err => { dbPromise = null; throw err; });
  }
  await dbPromise;
}

// Connect only when an API request needs MongoDB. Reuse the connection
// between warm serverless invocations.
app.use("/api", async (_req, res, next) => {
  try {
    if (!process.env.MONGODB_URI) {
      return res.status(500).json({ message: "MONGODB_URI is not configured." });
    }
    await connectDatabase();
    next();
  } catch (err) {
    console.error("Database connection failed:", err.message);
    res.status(503).json({ message: "Database is temporarily unavailable." });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/packages", packageRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);

// Any unknown API URL must return JSON, never the storefront HTML.
// This also makes missing/mis-deployed API routes immediately diagnosable.
app.use("/api", (_req, res) => res.status(404).json({
  message: "API endpoint not found. Confirm the latest backend deployment is active.",
  service: "Starling Data Solutions Tanzania"
}));

// Serve frontend assets only after all API routes have had a chance to match.
app.use(express.static(path.join(__dirname, "public")));

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// Vercel imports this Express app as a serverless backend.
// `npm start` still works for a conventional local Node server.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Starling Data Solutions Tanzania running on port ${PORT}`));
}

module.exports = app;
