const $ = id => document.getElementById(id);
let token = localStorage.getItem("tdh_token") || "";
let selectedNetwork = "Vodacom";
let selectedPackage = null;
let authMode = "register";
let packages = [];

$("year").textContent = new Date().getFullYear();
$("menuBtn").addEventListener("click", () => $("topbar")?.classList.toggle("menu-open"));
document.querySelector(".menu-btn").addEventListener("click", () => document.querySelector(".topbar").classList.toggle("menu-open"));

function toast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  setTimeout(() => $("toast").classList.remove("show"), 3000);
}
async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
}
function openAuth(mode) {
  authMode = mode;
  $("authModal").classList.add("open");
  $("authTitle").textContent = mode === "register" ? "Create your account" : "Welcome back";
  $("authEyebrow").textContent = mode === "register" ? "WELCOME TO STARLING" : "YOUR STARLING ACCOUNT";
  $("authDesc").textContent = mode === "register" ? "Manage your bundles and orders in one place." : "Sign in to view your account and orders.";
  $("nameField").style.display = mode === "register" ? "grid" : "none";
  $("phoneField").style.display = mode === "register" ? "grid" : "none";
  $("authName").required = mode === "register"; $("authPhone").required = mode === "register";
  $("authSubmit").textContent = mode === "register" ? "Create account" : "Log in";
  $("switchText").textContent = mode === "register" ? "Already have an account?" : "New to Starling?";
  $("switchAuth").textContent = mode === "register" ? "Log in" : "Create account";
  $("authMessage").textContent = "";
}
$("loginOpen").onclick = () => openAuth("login");
$("registerOpen").onclick = $("ctaRegister").onclick = () => openAuth("register");
$("modalClose").onclick = () => $("authModal").classList.remove("open");
$("checkoutClose").onclick = () => $("checkoutModal").classList.remove("open");
$("switchAuth").onclick = () => openAuth(authMode === "register" ? "login" : "register");

$("authForm").addEventListener("submit", async e => {
  e.preventDefault(); $("authMessage").textContent = "Please wait…";
  const body = { email: $("authEmail").value, password: $("authPassword").value };
  if (authMode === "register") Object.assign(body, { name: $("authName").value, phone: $("authPhone").value });
  try {
    const result = await api(`/api/auth/${authMode}`, { method: "POST", body: JSON.stringify(body) });
    token = result.token; localStorage.setItem("tdh_token", token);
    $("authModal").classList.remove("open"); toast(`Welcome${result.user?.name ? ", " + result.user.name : ""}!`);
  } catch (err) { $("authMessage").textContent = err.message; }
});

async function loadPackages() {
  try {
    const data = await api("/api/packages"); packages = data.packages || []; renderPackages();
  } catch { $("packageGrid").innerHTML = '<div class="empty-state">Unable to load packages right now. Please try again later.</div>'; }
}
function renderPackages() {
  const list = packages.filter(p => p.network === selectedNetwork);
  $("packageTitle").textContent = `${selectedNetwork} bundles`;
  if (!list.length) {
    $("packageGrid").innerHTML = '<div class="empty-state">No packages have been published for this network yet. Please check back soon.</div>'; return;
  }
  $("packageGrid").innerHTML = list.map(p => `<article class="package-card"><div class="package-network">${escapeHtml(p.network)}</div><h3>${escapeHtml(p.dataAmount)}</h3><p>${escapeHtml(p.name)}</p><div class="package-meta"><span>Validity</span><b>${escapeHtml(p.validity)}</b></div><div class="package-meta"><span>Price</span><span class="price">${Number(p.priceTzs).toLocaleString("en-TZ")} TZS</span></div><button class="btn btn-primary" data-buy="${p._id}">Choose bundle →</button></article>`).join("");
  document.querySelectorAll("[data-buy]").forEach(btn => btn.onclick = () => {
    selectedPackage = packages.find(p => p._id === btn.dataset.buy);
    if (!token) { openAuth("login"); toast("Please sign in before placing an order."); return; }
    $("checkoutPackage").textContent = `${selectedPackage.network} · ${selectedPackage.dataAmount} · ${Number(selectedPackage.priceTzs).toLocaleString("en-TZ")} TZS`;
    $("checkoutModal").classList.add("open");
  });
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
document.querySelectorAll(".network-card").forEach(btn => btn.addEventListener("click", () => {
  selectedNetwork = btn.dataset.network;
  document.querySelectorAll(".network-card").forEach(b => b.classList.toggle("selected", b === btn));
  renderPackages();
}));
$("checkoutForm").addEventListener("submit", async e => {
  e.preventDefault(); $("checkoutMessage").textContent = "Creating order…";
  try {
    const result = await api("/api/orders", { method: "POST", body: JSON.stringify({ packageId: selectedPackage._id, recipientPhone: $("recipientPhone").value }) });
    const payment = await api("/api/payments/initiate", { method: "POST", body: JSON.stringify({
      orderId: result.order._id,
      payerPhone: $("payerPhone").value,
      provider: $("payerProvider").value
    }) });
    $("checkoutMessage").textContent = payment.message + " Reference: " + (payment.reference || "pending");
    if (!document.getElementById("checkPaymentStatus")) {
      const check = document.createElement("button");
      check.type = "button"; check.id = "checkPaymentStatus"; check.className = "btn btn-ghost full-btn";
      check.textContent = "Check payment status";
      $("checkoutForm").appendChild(check);
      check.onclick = async () => {
        check.disabled = true; check.textContent = "Checking…";
        try {
          const status = await api(`/api/payments/status/${result.order._id}`);
          $("checkoutMessage").textContent = status.message + " Payment: " + status.paymentStatus + ". Order: " + status.orderStatus + ".";
        } catch (err) { $("checkoutMessage").textContent = err.message; }
        finally { check.disabled = false; check.textContent = "Check payment status"; }
      };
    }
  } catch (err) { $("checkoutMessage").textContent = err.message; }
});
loadPackages();
