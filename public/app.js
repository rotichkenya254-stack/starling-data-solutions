(() => {
  const $ = id => document.getElementById(id);
  const on = (id, event, handler) => { const el=$(id); if(el) el.addEventListener(event, handler); };
  let token = localStorage.getItem("tdh_token") || "";
  let selectedNetwork = "Vodacom", selectedPackage = null, authMode = "register", packages = [];
  const text = (id, value) => { if($(id)) $(id).textContent=value; };
  const show = id => {
    const el = $(id);
    if (!el) return;
    el.classList.add("open");
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  };
  const hide = id => {
    const el = $(id);
    if (!el) return;
    el.classList.remove("open");
    el.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".modal-backdrop.open")) document.body.classList.remove("modal-open");
    if (id === "authModal" && $("authPassword")) $("authPassword").value = "";
  };
  if ($("year")) text("year", new Date().getFullYear());

  on("menuBtn","click",()=>$("topbar")?.classList.toggle("menu-open"));
  document.querySelectorAll(".topbar nav a").forEach(a=>a.addEventListener("click",()=>$("topbar")?.classList.remove("menu-open")));
  on("loginOpen","click",()=>{
    if (token) signOut();
    else openAuth("login");
  });
  on("registerOpen","click",()=>openAuth("register"));
  on("accountLogin","click",()=>openAuth("login"));
  on("forgotPassword","click",()=>toast("Please contact support@starling.co.tz for password assistance."));
  on("modalClose","click",()=>hide("authModal"));
  on("checkoutClose","click",()=>hide("checkoutModal"));
  on("switchAuth","click",()=>openAuth(authMode==="register"?"login":"register"));
  ["authModal","checkoutModal"].forEach(id=>on(id,"click",e=>{if(e.target===$(id))hide(id);}));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if ($("authModal")?.classList.contains("open")) hide("authModal");
      else if ($("checkoutModal")?.classList.contains("open")) hide("checkoutModal");
    }
  });
  on("authForm","submit",submitAuth);
  on("logoutBtn","click",signOut);
  function signOut(){
    token="";
    localStorage.removeItem("tdh_token");
    updateAccount(null);
    toast("You have signed out successfully.");
  }

  function toast(message){const el=$("toast");if(!el)return;el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),3500);}
  async function api(url,options={}){
    const headers={...(options.headers||{})}; if(options.body && !(options.body instanceof FormData)) headers["Content-Type"]="application/json"; if(token)headers.Authorization=`Bearer ${token}`;
    const response=await fetch(url,{...options,headers}); const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.message||`Request failed (${response.status}).`);return data;
  }
  function openAuth(mode){authMode=mode;show("authModal");text("authTitle",mode==="register"?"Create your account":"Welcome back");text("authEyebrow",mode==="register"?"WELCOME TO STARLING":"YOUR STARLING ACCOUNT");text("authDesc",mode==="register"?"Manage your bundles and orders in one place.":"Sign in to view your account and orders.");if($("nameField"))$("nameField").hidden=mode!=="register";if($("phoneField"))$("phoneField").hidden=mode!=="register";$("authName").required=mode==="register";$("authPhone").required=mode==="register";text("authSubmit",mode==="register"?"Create account":"Log in");text("switchText",mode==="register"?"Already have an account?":"New to Starling?");text("switchAuth",mode==="register"?"Log in":"Create account");text("authMessage","");
    if ($("authPassword")) $("authPassword").value = "";
    const firstField = mode === "register" ? $("authName") : $("authEmail");
    if (firstField) setTimeout(() => firstField.focus(), 0);
  }
  async function submitAuth(e){e.preventDefault();const submit=$("authSubmit");submit.disabled=true;text("authMessage","Please wait…");const body={email:$("authEmail").value.trim(),password:$("authPassword").value};if(authMode==="register")Object.assign(body,{name:$("authName").value.trim(),phone:$("authPhone").value.trim()});try{const result=await api(`/api/auth/${authMode}`,{method:"POST",body:JSON.stringify(body)});token=result.token;localStorage.setItem("tdh_token",token);hide("authModal");updateAccount(result.user);await loadOrders();toast(`Welcome${result.user?.name?", "+result.user.name:""}!`);}catch(err){text("authMessage",err.message);}finally{submit.disabled=false;}}
  function updateAccount(user){
    const loggedIn = Boolean(user);
    const navAuthButton = $("loginOpen");
    const registerButton = $("registerOpen");

    // Keep the header actions clear and mutually exclusive:
    // logged out = Login + Register; logged in = Logout only.
    if (navAuthButton) {
      navAuthButton.textContent = loggedIn ? "↪ Logout" : "♙ Login";
      navAuthButton.setAttribute("aria-label", loggedIn ? "Log out of your account" : "Log in to your account");
      navAuthButton.classList.toggle("btn-primary", loggedIn);
      navAuthButton.classList.toggle("btn-ghost", !loggedIn);
    }
    if (registerButton) registerButton.hidden = loggedIn;

    if(!user){
      text("accountWelcome","Sign in to view your profile and recent orders.");
      text("profileName","Guest");
      text("profileEmail","Not signed in");
      text("profilePhone","");
      if($("logoutBtn"))$("logoutBtn").hidden=true;
      text("ordersList","Sign in to view your transactions.");
      return;
    }
    text("accountWelcome","Your Starling account details and order history.");
    text("profileName",user.name||"Customer");
    text("profileEmail",user.email||"");
    text("profilePhone",user.phone||"");
    if($("logoutBtn"))$("logoutBtn").hidden=false;
  }
  async function restoreSession(){if(!token){updateAccount(null);return;}try{const r=await api("/api/auth/me");updateAccount(r.user);await loadOrders();}catch{token="";localStorage.removeItem("tdh_token");updateAccount(null);}}
  async function loadOrders(){if(!token)return;const box=$("ordersList");if(!box)return;box.textContent="Loading transactions…";try{const r=await api("/api/orders/mine");if(!r.orders?.length){box.textContent="No transactions yet. Your bundle orders will appear here.";return;}box.innerHTML=r.orders.map(o=>`<div class="order-row"><div><b>${escapeHtml(o.network)} · ${escapeHtml(o.package?.dataAmount||"Data bundle")}</b><small>${escapeHtml(o.recipientPhone)} · ${new Date(o.createdAt).toLocaleString()}</small><small>${Number(o.amountTzs||0).toLocaleString("en-TZ")} TZS</small></div><span class="status-pill">${escapeHtml(o.status||"pending").replaceAll("_"," ")}</span></div>`).join("");}catch(e){box.textContent=e.message;}}
  async function loadPackages(){try{const data=await api("/api/packages");packages=data.packages||[];renderPackages();}catch(e){const box=$("packageGrid");if(box)box.textContent=e.message;}}
  function renderPackages(){const box=$("packageGrid");if(!box)return;const list=packages.filter(p=>p.network===selectedNetwork);text("packageTitle",`${selectedNetwork} bundles`);if(!list.length){box.innerHTML='<div class="empty-state">No packages have been published for this network yet. Please check back soon.</div>';return;}box.innerHTML=list.map(p=>`<article class="package-card"><div class="package-network">${escapeHtml(p.network)}</div><h3>${escapeHtml(p.dataAmount)}</h3><p>${escapeHtml(p.name)}</p><div class="package-meta"><span>Validity</span><b>${escapeHtml(p.validity)}</b></div><div class="package-meta"><span>Price</span><span class="price">${Number(p.priceTzs).toLocaleString("en-TZ")} TZS</span></div><button class="btn btn-primary" data-buy="${escapeHtml(p._id)}">Choose bundle →</button></article>`).join("");box.querySelectorAll("[data-buy]").forEach(btn=>btn.addEventListener("click",()=>{selectedPackage=packages.find(p=>p._id===btn.dataset.buy);if(!token){openAuth("login");toast("Please sign in before placing an order.");return;}text("checkoutPackage",`${selectedPackage.network} · ${selectedPackage.dataAmount} · ${Number(selectedPackage.priceTzs).toLocaleString("en-TZ")} TZS`);text("checkoutMessage","");show("checkoutModal");}));}
  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  document.querySelectorAll(".network-card").forEach(btn=>btn.addEventListener("click",()=>{selectedNetwork=btn.dataset.network;document.querySelectorAll(".network-card").forEach(b=>b.classList.toggle("selected",b===btn));renderPackages();}));
  document.querySelectorAll("[data-premium]").forEach(btn=>btn.addEventListener("click",()=>document.querySelectorAll("[data-premium]").forEach(b=>b.classList.toggle("selected",b===btn))));
  on("upgradeNow","click",()=>{const plan=document.querySelector("[data-premium].selected")?.dataset.premium||"Daily";if(!token){openAuth("login");toast(`Please sign in to continue with the ${plan} plan.`);}else toast(`You selected the ${plan} plan. Premium checkout is not configured yet.`);});
  on("checkoutForm","submit",async e=>{e.preventDefault();if(!selectedPackage){text("checkoutMessage","Please select a bundle first.");return;}const submit=$("checkoutForm").querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=true;text("checkoutMessage","Creating order and requesting payment…");try{const created=await api("/api/orders",{method:"POST",body:JSON.stringify({packageId:selectedPackage._id,recipientPhone:$("recipientPhone").value.trim()})});const payment=await api("/api/payments/initiate",{method:"POST",body:JSON.stringify({orderId:created.order._id,payerPhone:$("payerPhone").value.trim(),provider:$("payerProvider").value})});text("checkoutMessage",`${payment.message} Reference: ${payment.reference||"pending"}`);let check=$("checkPaymentStatus");if(!check){check=document.createElement("button");check.type="button";check.id="checkPaymentStatus";check.className="btn btn-ghost full-btn";check.textContent="Check payment status";$("checkoutForm").appendChild(check);}check.onclick=async()=>{check.disabled=true;try{const status=await api(`/api/payments/status/${created.order._id}`);text("checkoutMessage",`${status.message} Payment: ${status.paymentStatus}. Order: ${status.orderStatus}.`);await loadOrders();}catch(err){text("checkoutMessage",err.message);}finally{check.disabled=false;}};await loadOrders();}catch(err){text("checkoutMessage",err.message);}finally{if(submit)submit.disabled=false;}});
  loadPackages();restoreSession();
})();
