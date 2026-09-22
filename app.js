import { ethers } from "ethers";

("use strict");

window.__RECEH_DEX_VERSION__ = "riche-single-v9";

const CHAIN_CONFIG = {
  id: 132026,
  hex: "0x203BA",
  name: "Riche Chain",
  shortName: "RICHE",
  rpc: "https://seed-richechain.com/",
  explorer: "https://richescan.com/",
  symbol: "RIC",
  decimals: 18,
  FACTORY: "0xAeEdf8B9925c6316171f7c2815e387DE596Fa11B",
  ROUTER: "0x8E9556415124b6C726D5C3610d25c24Be8AC2304",
  WNATIVE: "0xEa126036c94Ab6A384A25A70e29E2fE2D4a91e68",
  WNATIVE_SYMBOL: "WRIC",
  WNATIVE_NAME: "Wrapped RIC",
  WNATIVE_LOGO:
    "https://raw.githubusercontent.com/recehdex/token-logo/refs/heads/main/WRIC.webp",
  TOKEN_LIST_URL:
    "https://raw.githubusercontent.com/recehdex/token-list/refs/heads/main/riche-chain.json",
  INIT_CODE_HASH:
    "0x1a7269cf92faf25d5d029d824efa09ac194fea41206609a271df037af4772a43",
  color: "#f0b90b",
  logo: "https://raw.githubusercontent.com/recehdex/token-logo/refs/heads/main/WRIC.webp",
};

// ─── STATE ───────────────────────────────────────────────────────────────────
const S = {
  provider: null,
  signer: null,
  account: null,
  chainOk: false,
  slippage: 0.5,
  liqSlippage: 0.5,
  deadline: 20,
  tIn: null,
  tOut: null,
  liqA: null,
  liqB: null,
  importA: null,
  importB: null,
  removePct: 50,
  currentPos: null,
  modalCtx: null,
  allTokens: [],
  customTokens: [],
  txns: [],
  positions: [],
  quoteTimer: null,
  quoteBusy: false,
  actionBusy: false,
  isWrapMode: false,
  quoteSeq: 0,
  walletSyncSeq: 0,
  liqApprovalSeq: 0,
  liqApprovalsReady: false,
  liqApprovalToken: null,
  toastEl: null,
  toastTimer: null,
};

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function navTo(page) {
  const allowed = new Set(["swap", "liquidity", "pool"]);
  if (!allowed.has(page)) page = "swap";
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav-link[data-page],.mob-link[data-page]")
    .forEach((l) => {
      l.classList.toggle("active", l.dataset.page === page);
    });
  const pg = $("page-" + page);
  if (pg) pg.classList.add("active");
  if (page === "pool") void loadPositions();
}
window.navTo = navTo;

// selectTok
function selectTok(t) {
  const ctx = S.modalCtx;
  if (!ctx) return;
  closeTokModal();
  if (ctx === "in") {
    if (S.tOut && S.tOut.address === t.address) {
      S.tOut = S.tIn;
      updateOutUI();
    }
    S.tIn = t;
    updateInUI();
  } else if (ctx === "out") {
    if (S.tIn && S.tIn.address === t.address) {
      S.tIn = S.tOut;
      updateInUI();
    }
    S.tOut = t;
    updateOutUI();
  } else if (ctx === "liqA") {
    S.liqA = t;
    updateLiqUI();
  } else if (ctx === "liqB") {
    S.liqB = t;
    updateLiqUI();
  } else if (ctx === "importA") {
    S.importA = t;
    const el = $("importSymA");
    if (el) el.textContent = t.symbol;
    const lg = $("importLogoA");
    if (lg) {
      if (t.logoURI) {
        lg.src = t.logoURI;
        lg.style.display = "";
      } else lg.style.display = "none";
    }
    checkImport();
  } else if (ctx === "importB") {
    S.importB = t;
    const el = $("importSymB");
    if (el) el.textContent = t.symbol;
    const lg = $("importLogoB");
    if (lg) {
      if (t.logoURI) {
        lg.src = t.logoURI;
        lg.style.display = "";
      } else lg.style.display = "none";
    }
    checkImport();
  }
  refreshBals();
}

// updateInUI
function updateInUI() {
  setTokUI("logoIn", "symIn", S.tIn);
  detectWrapMode();
  getQuote();
  updateSwapBtn();
}

// updateOutUI
function updateOutUI() {
  setTokUI("logoOut", "symOut", S.tOut);
  detectWrapMode();
  getQuote();
  updateSwapBtn();
}

// ─── PERSIST ─────────────────────────────────────────────────────────────────
function load(k, def) {
  try {
    const v = localStorage.getItem("rdex_" + k);
    return v ? JSON.parse(v) : def;
  } catch {
    return def;
  }
}
function save(k, v) {
  try {
    localStorage.setItem("rdex_" + k, JSON.stringify(v));
  } catch {}
}

const savedCustomTokens = load("custom", []);
const savedTxns = load("txns", []);
S.customTokens = Array.isArray(savedCustomTokens) ? savedCustomTokens : [];
S.txns = Array.isArray(savedTxns)
  ? savedTxns.filter((tx) => tx && typeof tx.h === "string")
  : [];
S.slippage = Math.min(50, Math.max(0.01, Number(load("slip", 0.5)) || 0.5));
S.deadline = Math.min(4320, Math.max(1, Number(load("ddl", 20)) || 20));

// ─── RICHE ACCESSORS ───────────────────────────────────────────────────────────
function CHAIN() {
  return CHAIN_CONFIG;
}
function allToks() {
  return S.allTokens;
}
function routeAddr(t) {
  return t.isNative ? CHAIN_CONFIG.WNATIVE : t.address;
}

// ─── BUILT-IN TOKENS ─────────────────────────────────────────────────────────
function makeNativeToken() {
  const ch = CHAIN_CONFIG;
  return {
    address: "NATIVE",
    symbol: ch.symbol,
    name: ch.name,
    decimals: 18,
    logoURI: ch.WNATIVE_LOGO,
    isNative: true,
  };
}
function makeWrappedToken() {
  const ch = CHAIN_CONFIG;
  return {
    address: ch.WNATIVE,
    symbol: ch.WNATIVE_SYMBOL,
    name: ch.WNATIVE_NAME,
    decimals: 18,
    logoURI: ch.WNATIVE_LOGO,
    isNative: false,
  };
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const WETH_ABI = [
  ...ERC20_ABI,
  "function deposit() payable",
  "function withdraw(uint256)",
];
const FACTORY_ABI = [
  "function getPair(address,address) view returns (address)",
  "function allPairs(uint256) view returns (address)",
  "function allPairsLength() view returns (uint256)",
];
const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const ROUTER_ABI = [
  "function WETH() view returns (address)",
  "function getAmountsOut(uint256,address[]) view returns (uint256[])",
  "function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])",
  "function swapExactTokensForETH(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[])",
  "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) returns (uint256,uint256,uint256)",
  "function addLiquidityETH(address,uint256,uint256,uint256,address,uint256) payable returns (uint256,uint256,uint256)",
  "function removeLiquidity(address,address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
  "function removeLiquidityETH(address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)",
];

// ─── PROVIDERS ───────────────────────────────────────────────────────────────
const readProvider = new ethers.JsonRpcProvider(CHAIN_CONFIG.rpc);
const readProv = () => readProvider;
const router = (sp) =>
  new ethers.Contract(CHAIN().ROUTER, ROUTER_ABI, sp || readProv());
const factory = (sp) =>
  new ethers.Contract(CHAIN().FACTORY, FACTORY_ABI, sp || readProv());
const erc20 = (a, sp) => new ethers.Contract(a, ERC20_ABI, sp || readProv());
const wethC = (sp) =>
  new ethers.Contract(CHAIN().WNATIVE, WETH_ABI, sp || readProv());
const pairC = (a, sp) => new ethers.Contract(a, PAIR_ABI, sp || readProv());

async function waitForConfirmedTx(tx, label = "Transaction") {
  const receipt = await tx.wait();
  if (!receipt || Number(receipt.status) !== 1)
    throw new Error(`${label} failed on-chain.`);
  return receipt;
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
function short(a) {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
}
function fmt(bn, dec = 18, dp = 6) {
  if (!bn) return "0";
  try {
    const n = parseFloat(ethers.formatUnits(bn, dec));
    if (n === 0) return "0";
    if (n < 0.000001) return "<0.000001";
    return n.toFixed(dp).replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}
function fmtExact(bn, dec = 18) {
  if (bn == null || bn === 0n) return "0";
  try {
    const value = ethers.formatUnits(bn, dec);
    return value.includes(".")
      ? value.replace(/0+$/, "").replace(/\.$/, "")
      : value;
  } catch {
    return "0";
  }
}
function parse(v, dec = 18) {
  try {
    return ethers.parseUnits(String(v || "0"), dec);
  } catch {
    return 0n;
  }
}
function ddl() {
  return Math.floor(Date.now() / 1000) + S.deadline * 60;
}
function minAmt(bn) {
  const bps = Math.floor(10000 - S.slippage * 100);
  return (bn * BigInt(bps)) / 10000n;
}
function minAmtLiq(bn) {
  const bps = Math.floor(10000 - S.liqSlippage * 100);
  return (bn * BigInt(bps)) / 10000n;
}
function isWrapUnwrapPair(tA, tB) {
  if (!tA || !tB) return false;
  const wnLower = CHAIN().WNATIVE.toLowerCase();
  const aIsNative = tA.isNative;
  const bIsNative = tB.isNative;
  const aIsWrapped = !tA.isNative && tA.address.toLowerCase() === wnLower;
  const bIsWrapped = !tB.isNative && tB.address.toLowerCase() === wnLower;
  return (aIsNative && bIsWrapped) || (aIsWrapped && bIsNative);
}

// ─── UI HELPERS ──────────────────────────────────────────────────────────────
function $(id) {
  return document.getElementById(id);
}
function updateDexInfoUI() {
  const network = $("infoNetwork");
  const native = $("infoNative");
  const slip = $("infoSlippage");

  if (network) network.textContent = CHAIN_CONFIG.name;
  if (native) native.textContent = CHAIN_CONFIG.symbol;
  if (slip) {
    const value = Number(S.slippage);
    slip.textContent = Number.isFinite(value)
      ? value.toFixed(value < 1 ? 2 : 2) + "%"
      : "0.50%";
  }
}
function showTx(t, s, chainOverride = null) {
  clearToast();
  const title = $("txTitle");
  const msg = $("txMsg");
  const chain = $("txChain");
  const displayChain = chainOverride || CHAIN();
  if (title) title.textContent = t || "Processing…";
  if (msg) msg.textContent = s || "Konfirmasi di dompet Anda";
  if (chain)
    chain.textContent = `${displayChain.shortName} · ${displayChain.name}`;
  $("txMask").classList.add("show");
}
function hideTx() {
  $("txMask").classList.remove("show");
}
function clearToast() {
  if (S.toastTimer) {
    clearTimeout(S.toastTimer);
    S.toastTimer = null;
  }
  const el = S.toastEl;
  S.toastEl = null;
  if (el) {
    el.classList.remove("show");
    el.remove();
  }
}

function toast(msg, type = "info", ms = 4000) {
  const stack = $("toastStack");
  if (!stack) return;

  // Toasts are intentionally single-slot. Process/status information must never
  // stack into a wall of competing messages, especially during chain switching.
  clearToast();

  const el = document.createElement("div");
  el.className = "toast " + type;
  const icon =
    type === "ok" ? "✓" : type === "err" ? "!" : type === "warn" ? "⚠" : "i";
  const title =
    type === "ok"
      ? "Berhasil"
      : type === "err"
        ? "Transaksi gagal"
        : type === "warn"
          ? "Attention"
          : "RECEH DEX";
  el.innerHTML = `<span class="ti">${icon}</span><span class="toast-copy"><strong>${title}</strong><span>${escHtml(msg)}</span></span><button class="toast-close" aria-label="Close">×</button><i class="toast-progress"></i>`;
  el.querySelector(".toast-close")?.addEventListener("click", clearToast);
  el.style.setProperty("--toast-ms", `${ms}ms`);
  stack.appendChild(el);
  S.toastEl = el;
  requestAnimationFrame(() => el.classList.add("show"));
  S.toastTimer = setTimeout(
    () => {
      if (S.toastEl !== el) return;
      el.classList.add("leaving");
      S.toastTimer = setTimeout(() => {
        if (S.toastEl === el) {
          S.toastEl = null;
          el.remove();
        }
        S.toastTimer = null;
      }, 320);
    },
    Math.max(0, ms),
  );
}

function openModal(id) {
  $(id).classList.add("open");
}
function closeModal(id) {
  $(id).classList.remove("open");
}
function escHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// ─── BACKGROUND CANVAS ───────────────────────────────────────────────────────
function initCanvas() {
  const c = $("bgCanvas");
  if (!c) return;
  const ctx = c.getContext("2d");
  let W,
    H,
    particles = [];
  function resize() {
    W = c.width = window.innerWidth;
    H = c.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);
  for (let i = 0; i < 60; i++)
    particles.push({
      x: Math.random() * 1920,
      y: Math.random() * 1080,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      c: Math.random() > 0.5 ? "rgba(0,200,255," : "rgba(148,0,255,",
    });
  function draw() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c + "0.7)";
      ctx.fill();
    });
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const d = Math.hypot(
          particles[i].x - particles[j].x,
          particles[i].y - particles[j].y,
        );
        if (d < 120) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0,200,255,${0.15 * (1 - d / 120)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── BASE TOKEN INIT ─────────────────────────────────────────────────────────
function initBaseTokens() {
  const native = makeNativeToken();
  const wrapped = makeWrappedToken();
  S.allTokens = [native, wrapped];
  const seen = new Set([
    native.address.toLowerCase(),
    wrapped.address.toLowerCase(),
  ]);
  S.customTokens.forEach((t) => {
    if (!seen.has(t.address.toLowerCase())) {
      S.allTokens.push(t);
      seen.add(t.address.toLowerCase());
    }
  });
}

// ─── TOKEN LIST ──────────────────────────────────────────────────────────────
async function applyTradeDeepLink() {
  const qs = new URLSearchParams(window.location.search);
  const input = qs.get("inputCurrency");
  const output = qs.get("outputCurrency");
  if (!input || !output) return;

  const resolve = async (value) => {
    if (value === "NATIVE") return makeNativeToken();
    if (value.toLowerCase() === CHAIN_CONFIG.WNATIVE.toLowerCase())
      return makeWrappedToken();
    let t = S.allTokens.find(
      (x) => x.address && x.address.toLowerCase() === value.toLowerCase(),
    );
    if (t) return t;
    if (ethers.isAddress(value)) {
      const c = erc20(value);
      try {
        const [name, symbol, decimals] = await Promise.all([
          c.name(),
          c.symbol(),
          c.decimals(),
        ]);
        t = {
          address: value,
          name,
          symbol,
          decimals: Number(decimals),
          logoURI: "",
          isNative: false,
        };
        S.allTokens.push(t);
        return t;
      } catch {}
    }
    return null;
  };

  const [tin, tout] = await Promise.all([resolve(input), resolve(output)]);
  if (!tin || !tout || tin.address.toLowerCase() === tout.address.toLowerCase())
    return;
  S.tIn = tin;
  S.tOut = tout;
  updateInUI();
  updateOutUI();
}

async function loadTokenList() {
  const url = CHAIN_CONFIG.TOKEN_LIST_URL;
  if (!url) return;
  const urls = [
    url,
    "https://corsproxy.io/?" + encodeURIComponent(url),
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  ];
  let data = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-cache" });
      if (!res.ok) continue;
      data = await res.json();
      if (data && Array.isArray(data.tokens)) break;
      data = null;
    } catch (e) {
      data = null;
    }
  }
  if (!data || !Array.isArray(data.tokens)) return;
  const ch = CHAIN_CONFIG;
  const wnLower = ch.WNATIVE.toLowerCase();
  const seen = new Set(S.allTokens.map((t) => t.address.toLowerCase()));
  data.tokens
    .filter((t) => !t.chainId || Number(t.chainId) === ch.id)
    .forEach((t) => {
      const addr = (t.address || "").toLowerCase();
      if (!addr || addr === wnLower || seen.has(addr)) return;
      S.allTokens.push({
        address: t.address,
        symbol: t.symbol || "???",
        name: t.name || t.symbol || "???",
        decimals: t.decimals ?? 18,
        logoURI: t.logoURI || "",
        isNative: false,
      });
      seen.add(addr);
    });
  if ($("tokModalWrap").classList.contains("open"))
    renderTokList($("tokSearch").value);
}

// ─── WALLET / REOWN APPKIT ─────────────────────────────────────────────────────
function getWalletProvider() {
  return window.__RECEH_REOWN__?.getProvider?.() || S.provider || null;
}

async function bindWalletProvider(provider, accountHint = null) {
  if (!provider) return false;
  try {
    S.provider = new ethers.BrowserProvider(provider);
    S.signer = await S.provider.getSigner();
    const accounts = await provider.request({ method: "eth_accounts" });
    const account = accountHint || accounts?.[0] || null;
    if (!account) {
      S.signer = null;
      S.account = null;
      S.chainOk = false;
      return false;
    }
    S.account = account;
    const network = await S.provider.getNetwork();
    S.chainOk = Number(network.chainId) === CHAIN().id;
    updateWalletUI();
    updateSwapBtn();
    updateAddLiqBtn();
    if (S.chainOk) {
      await refreshBals();
      await updateWdBal();
      if (document.getElementById("page-pool")?.classList.contains("active"))
        await loadPositions();
    }
    return true;
  } catch (e) {
    console.error("Failed to bind Reown wallet:", e);
    S.provider = null;
    S.signer = null;
    S.account = null;
    S.chainOk = false;
    updateWalletUI();
    updateSwapBtn();
    return false;
  }
}

async function connectWallet() {
  try {
    const bridge = window.__RECEH_REOWN__;
    if (!bridge?.open) {
      toast("Penghubung dompet belum siap. Coba lagi.", "err");
      return;
    }

    // AppKit can finish the WalletConnect approval while the DEX UI is still
    // waiting for its provider event. Reconcile that state before opening a
    // second Connect flow, otherwise AppKit can show a grey/loading modal for
    // the already-connected session.
    const appKitConnected = Boolean(bridge.appKit?.getIsConnected?.());
    if (appKitConnected) {
      const provider = await bridge.sync?.();
      if (provider) return;
    }

    // AppKit owns the mobile deep/universal-link handoff. Do not start a
    // parallel connection or poll the wallet provider while the modal is open.
    bridge.open();
  } catch (e) {
    console.error("Reown connect failed:", e);
    if (e?.code === 4001) toast("Connection rejected.", "warn");
    else toast("Gagal menghubungkan dompet: " + (e?.message || e), "err");
  }
}

window.connectWallet = connectWallet;

async function ensureChain() {
  if (!S.provider || !S.account) {
    S.chainOk = false;
    return false;
  }
  try {
    const network = await S.provider.getNetwork();
    S.chainOk = Number(network.chainId) === CHAIN_CONFIG.id;
    return S.chainOk;
  } catch {
    S.chainOk = false;
    return false;
  }
}

async function disconnectWallet() {
  const bridge = window.__RECEH_REOWN__;
  try {
    await bridge?.disconnect?.();
  } catch (e) {
    console.warn("Reown disconnect failed:", e);
  }
  S.provider = null;
  S.signer = null;
  S.account = null;
  S.chainOk = false;
  updateWalletUI();
  closeModal("wdWrap");
  updateSwapBtn();
  updateAddLiqBtn();
  $("balIn").textContent = "Saldo: —";
  $("balOut").textContent = "Saldo: —";
  $("wdBal").textContent = "0 " + CHAIN().symbol;
  toast("Disconnected.", "info");
}

function updateWalletUI() {
  const wpText = $("wpText");
  if (S.account) {
    wpText.textContent = short(S.account);
    $("wdAddr").textContent = short(S.account);
    $("wdExplorer").href = CHAIN().explorer + "address/" + S.account;
    updateWdBal();
    const mwa = $("mobWalletArea");
    mwa.innerHTML = `<div class="mob-wallet-info"><span class="mob-addr">${short(S.account)}</span><span class="mob-act">Connected</span></div><button class="ghost-btn" id="mobDisconnectBtn">Disconnect</button>`;
    $("mobDisconnectBtn")?.addEventListener("click", () => {
      disconnectWallet();
      closeMobMenu();
    });
  } else {
    wpText.textContent = "Hubungkan";
    $("mobWalletArea").innerHTML =
      `<button class="action-btn" id="mobConnectBtn">Connect Wallet</button>`;
    $("mobConnectBtn")?.addEventListener("click", () => {
      connectWallet();
      closeMobMenu();
    });
  }
}

async function updateWdBal() {
  if (!S.account || !S.provider) return;
  try {
    const b = await S.provider.getBalance(S.account);
    $("wdBal").textContent =
      parseFloat(ethers.formatEther(b)).toFixed(4) + " " + CHAIN().symbol;
  } catch {}
}

function closeMobMenu() {
  $("mobMenu").classList.remove("open");
  $("mobOverlay").classList.remove("show");
  $("burgerBtn").classList.remove("open");
}

// ─── TOKEN MODAL ─────────────────────────────────────────────────────────────
function openTokModal(ctx) {
  S.modalCtx = ctx;
  $("tokSearch").value = "";
  $("clearSearch").style.display = "none";
  renderTokList("");
  openModal("tokModalWrap");

  // Keep the token list visible on touch/mobile browsers.
  // The search field is focused only on pointer-based desktop devices.
  const isTouchMobile = window.matchMedia?.(
    "(max-width: 768px), (hover: none) and (pointer: coarse)",
  )?.matches;
  if (!isTouchMobile) {
    requestAnimationFrame(() => $("tokSearch")?.focus({ preventScroll: true }));
  }
}
function closeTokModal() {
  closeModal("tokModalWrap");
  S.modalCtx = null;
}
function renderTokList(q) {
  const all = allToks();
  const search = q.trim().toLowerCase();
  const list = search
    ? all.filter(
        (t) =>
          t.symbol.toLowerCase().includes(search) ||
          t.name.toLowerCase().includes(search) ||
          t.address.toLowerCase().includes(search),
      )
    : all;
  let otherAddr = null;
  const ctx = S.modalCtx;
  if (ctx === "in" && S.tOut) otherAddr = S.tOut.address.toLowerCase();
  if (ctx === "out" && S.tIn) otherAddr = S.tIn.address.toLowerCase();
  if (ctx === "liqA" && S.liqB) otherAddr = S.liqB.address.toLowerCase();
  if (ctx === "liqB" && S.liqA) otherAddr = S.liqA.address.toLowerCase();
  if (ctx === "importA" && S.importB)
    otherAddr = S.importB.address.toLowerCase();
  if (ctx === "importB" && S.importA)
    otherAddr = S.importA.address.toLowerCase();
  const chips = $("commonChips");
  chips.innerHTML = "";
  all.slice(0, 8).forEach((t) => {
    const disabled = otherAddr && t.address.toLowerCase() === otherAddr;
    const b = document.createElement("button");
    b.className = "tok-chip" + (disabled ? " disabled" : "");
    b.disabled = !!disabled;
    const imageUrl = safeImageUrl(t.logoURI);
    const logoHtml = imageUrl
      ? `<img src="${escHtml(imageUrl)}" onerror="this.style.display='none'" alt=""/>`
      : "";
    b.innerHTML = logoHtml + escHtml(t.symbol);
    if (!disabled) b.addEventListener("click", () => selectTok(t));
    chips.appendChild(b);
  });
  const inner = $("tokListInner");
  inner.innerHTML = "";
  if (
    search.startsWith("0x") &&
    search.length === 42 &&
    !all.find((x) => x.address.toLowerCase() === search)
  )
    fetchAddrToken(search);
  if (!list.length) {
    inner.innerHTML = '<div class="loading-row">No tokens found</div>';
    return;
  }
  list.forEach((t) => {
    const disabled = otherAddr && t.address.toLowerCase() === otherAddr;
    const safeId = "tbal_" + t.address.replace(/[^a-zA-Z0-9]/g, "_");
    const row = document.createElement("div");
    row.className = "tok-item" + (disabled ? " tok-disabled" : "");
    const imageUrl = safeImageUrl(t.logoURI);
    const ico = imageUrl
      ? `<div class="tok-ico"><img src="${escHtml(imageUrl)}" alt="" onerror="this.style.display='none'"/></div>`
      : `<div class="tok-ico">${escHtml(t.symbol.slice(0, 2))}</div>`;
    row.innerHTML = `${ico}<div class="tok-inf"><div class="tok-sym">${escHtml(t.symbol)}${disabled ? ' <span class="tok-used">Selected</span>' : ""}</div><div class="tok-name">${escHtml(t.name)}</div></div><div class="tok-bal" id="${safeId}">—</div>`;
    if (!disabled) row.addEventListener("click", () => selectTok(t));
    inner.appendChild(row);
    if (S.account && !disabled)
      getBal(t, S.account)
        .then((b) => {
          const el = document.getElementById(safeId);
          if (el) el.textContent = fmt(b, t.decimals, 4);
        })
        .catch(() => {});
  });
}
async function fetchAddrToken(addr) {
  try {
    const c = erc20(addr);
    const [name, sym, dec] = await Promise.all([
      c.name(),
      c.symbol(),
      c.decimals(),
    ]);
    const t = {
      address: addr,
      name,
      symbol: sym,
      decimals: Number(dec),
      logoURI: "",
      isNative: false,
    };
    if (
      !S.allTokens.find((x) => x.address.toLowerCase() === addr.toLowerCase())
    )
      S.allTokens.push(t);
    const inner = $("tokListInner");
    if (!inner) return;
    const row = document.createElement("div");
    row.className = "tok-item";
    row.innerHTML = `<div class="tok-ico">${escHtml(sym.slice(0, 2))}</div><div class="tok-inf"><div class="tok-sym">${escHtml(sym)} <span style="font-size:10px;color:var(--yellow);margin-left:4px">Custom</span></div><div class="tok-name">${escHtml(name)} · ${short(addr)}</div></div>`;
    row.addEventListener("click", () => {
      if (
        !S.customTokens.find(
          (x) => x.address.toLowerCase() === addr.toLowerCase(),
        )
      ) {
        S.customTokens.push(t);
        save("custom", S.customTokens);
      }
      selectTok(t);
    });
    inner.insertBefore(row, inner.firstChild);
  } catch (e) {
    console.warn("fetchAddrToken failed:", e);
  }
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function setTokUI(logoId, symId, t) {
  const logo = $(logoId),
    sym = $(symId);
  if (!t) {
    if (sym) sym.textContent = "Select";
    if (logo) {
      logo.src = "";
      logo.style.display = "none";
    }
    return;
  }
  if (sym) sym.textContent = t.symbol;
  if (logo) {
    const imageUrl = safeImageUrl(t.logoURI);
    if (imageUrl) {
      logo.src = imageUrl;
      logo.style.display = "";
    } else {
      logo.src = "";
      logo.style.display = "none";
    }
  }
}

function detectWrapMode() {
  S.isWrapMode = isWrapUnwrapPair(S.tIn, S.tOut);
  const wrapBanner = $("wrapBanner");
  if (!wrapBanner) return;
  if (S.isWrapMode) {
    const wrapping = S.tIn && S.tIn.isNative;
    wrapBanner.textContent = wrapping
      ? `This will WRAP ${CHAIN().symbol} → ${CHAIN().WNATIVE_SYMBOL} (1:1, no fee)`
      : `This will UNWRAP ${CHAIN().WNATIVE_SYMBOL} → ${CHAIN().symbol} (1:1, no fee)`;
    wrapBanner.style.display = "block";
  } else {
    wrapBanner.style.display = "none";
  }
}
async function getBal(t, addr) {
  if (!addr) return 0n;
  const p = S.provider || readProv();
  return t.isNative ? p.getBalance(addr) : erc20(t.address, p).balanceOf(addr);
}
async function refreshBals() {
  if (!S.account) return;
  const account = S.account;
  const checks = [
    [S.tIn, $("balIn")],
    [S.tOut, $("balOut")],
    [S.liqA, $("liqBalA")],
    [S.liqB, $("liqBalB")],
  ];
  await Promise.all(
    checks.map(async ([token, el]) => {
      if (!token || !el) return;
      try {
        const balance = await getBal(token, account);
        if (account !== S.account) return;
        el.textContent = "Balance: " + fmt(balance, token.decimals, 6);
      } catch {}
    }),
  );
}
async function getQuote() {
  const seq = ++S.quoteSeq;
  S.quoteBusy = true;
  updateSwapBtn();
  const tokenIn = S.tIn;
  const tokenOut = S.tOut;
  const amtStr = $("amountIn").value;
  if (S.isWrapMode) {
    if (amtStr && parseFloat(amtStr) > 0) {
      $("amountOut").value = amtStr;
      $("swapRate").textContent = `1 ${S.tIn.symbol} = 1 ${S.tOut.symbol}`;
      $("priceImpact").textContent = "0%";
      $("priceImpact").className = "imp-low";
      $("minRcv").textContent = amtStr + " " + S.tOut.symbol;
      $("lpFee").textContent = "0 (wrap/unwrap)";
      $("swapRoute").textContent = `${S.tIn.symbol} → ${S.tOut.symbol}`;
      $("swapDetails").style.display = "flex";
    } else {
      $("amountOut").value = "";
      $("swapDetails").style.display = "none";
    }
    S.quoteBusy = false;
    updateSwapBtn();
    return;
  }
  if (!S.tIn || !S.tOut || !amtStr || parseFloat(amtStr) <= 0) {
    $("amountOut").value = "";
    $("swapDetails").style.display = "none";
    S.quoteBusy = false;
    updateSwapBtn();
    return;
  }
  try {
    const prov = S.provider || readProv();
    const r = router(prov);
    const amtIn = parse(amtStr, S.tIn.decimals);
    const path = [routeAddr(S.tIn), routeAddr(S.tOut)];
    const outs = await r.getAmountsOut(amtIn, path);
    if (seq !== S.quoteSeq || tokenIn !== S.tIn || tokenOut !== S.tOut) return;
    const amtOut = outs[outs.length - 1];
    $("amountOut").value = fmt(amtOut, S.tOut.decimals, 8);
    const rateNum =
      parseFloat(ethers.formatUnits(amtOut, S.tOut.decimals)) /
      parseFloat(amtStr);
    $("swapRate").textContent =
      `1 ${S.tIn.symbol} = ${rateNum.toFixed(6)} ${S.tOut.symbol}`;
    try {
      const f = factory(prov);
      const pa = await f.getPair(routeAddr(S.tIn), routeAddr(S.tOut));
      if (pa !== ethers.ZeroAddress) {
        const pr = pairC(pa, prov);
        const [r0, r1] = await pr.getReserves();
        const t0 = await pr.token0();
        const rIn =
          routeAddr(S.tIn).toLowerCase() === t0.toLowerCase() ? r0 : r1;
        const rOut =
          routeAddr(S.tIn).toLowerCase() === t0.toLowerCase() ? r1 : r0;
        const spotOut = (amtIn * rOut) / rIn;
        const actualOut = amtOut;
        const impact =
          spotOut > 0n
            ? Math.max(
                0,
                (1 -
                  Number(ethers.formatUnits(actualOut, S.tOut.decimals)) /
                    Number(ethers.formatUnits(spotOut, S.tOut.decimals))) *
                  100,
              )
            : 0;
        const el = $("priceImpact");
        el.textContent = impact.toFixed(2) + "%";
        el.className =
          impact < 1 ? "imp-low" : impact < 5 ? "imp-mid" : "imp-high";
      }
    } catch {}
    $("minRcv").textContent =
      `${fmt(minAmt(amtOut), S.tOut.decimals, 6)} ${S.tOut.symbol}`;
    $("lpFee").textContent =
      `${(parseFloat(amtStr) * 0.003).toFixed(6)} ${S.tIn.symbol}`;
    $("swapRoute").textContent = `${S.tIn.symbol} → ${S.tOut.symbol}`;
    $("swapDetails").style.display = "flex";
    S.quoteBusy = false;
    updateSwapBtn();
  } catch (e) {
    if (seq !== S.quoteSeq || tokenIn !== S.tIn || tokenOut !== S.tOut) {
      if (seq === S.quoteSeq) S.quoteBusy = false;
      return;
    }
    $("amountOut").value = "";
    $("swapDetails").style.display = "none";
    S.quoteBusy = false;
    if (e.message && e.message.includes("INSUFFICIENT_LIQUIDITY"))
      toast("No liquidity for this pair.", "warn");
    updateSwapBtn();
  }
}
function updateSwapBtn() {
  const btn = $("swapBtn");
  const amtIn = $("amountIn").value,
    amtOut = $("amountOut").value;
  btn.onclick = null;
  btn.className = "action-btn";
  if (S.actionBusy) {
    btn.textContent = "Transaction in Progress…";
    btn.disabled = true;
    return;
  }
  if (!S.account) {
    btn.textContent = "Hubungkan Dompet";
    btn.disabled = false;
    btn.onclick = () => connectWallet();
    return;
  }
  if (!S.tIn || !S.tOut) {
    btn.textContent = "Select Tokens";
    btn.disabled = true;
    return;
  }
  if (S.quoteBusy) {
    btn.textContent = "Updating Quote…";
    btn.disabled = true;
    return;
  }
  if (!amtIn || +amtIn <= 0) {
    btn.textContent = "Enter Amount";
    btn.disabled = true;
    return;
  }
  if (!amtOut || +amtOut <= 0) {
    btn.textContent = "Insufficient Liquidity";
    btn.disabled = true;
    return;
  }
  if (S.isWrapMode) {
    const isWrapping = S.tIn.isNative;
    btn.textContent = isWrapping
      ? `Wrap ${CHAIN().symbol} → ${CHAIN().WNATIVE_SYMBOL}`
      : `Unwrap ${CHAIN().WNATIVE_SYMBOL} → ${CHAIN().symbol}`;
    btn.disabled = false;
    btn.onclick = doWrapUnwrap;
    return;
  }
  const imp = $("priceImpact");
  if (imp && imp.classList.contains("imp-high")) {
    btn.textContent = `Swap Anyway (High Impact)`;
    btn.className = "action-btn warn";
  } else {
    btn.textContent = `Swap ${S.tIn.symbol} → ${S.tOut.symbol}`;
  }
  btn.disabled = false;
  btn.onclick = doSwap;
}
async function getLiveGasPrice() {
  const urls = [CHAIN_CONFIG.rpc, "https://seed-richechain.com/"];
  for (const url of urls) {
    try {
      const provider =
        url === CHAIN_CONFIG.rpc ? readProv() : new ethers.JsonRpcProvider(url);
      const hex = await provider.send("eth_gasPrice", []);
      const gasPrice = BigInt(hex);
      if (gasPrice > 0n) return gasPrice;
    } catch {}
  }
  return 0n;
}

async function ensureNativeGasForTx(contractMethod, args = [], overrides = {}) {
  const gasPrice = await getLiveGasPrice();
  if (!gasPrice) throw new Error("GAS_PRICE_UNAVAILABLE");
  const gas = await contractMethod.estimateGas(...args, overrides);
  const cost = (gas * gasPrice * 120n) / 100n;
  const bal = await getBal({ isNative: true }, S.account);
  if (bal < cost) throw new Error("INSUFFICIENT_NATIVE_FOR_GAS");
  return { gas, cost, gasPrice };
}

async function doWrapUnwrap() {
  if (S.actionBusy) return;
  if (!S.signer) {
    connectWallet();
    return;
  }
  await ensureChain();
  if (!S.chainOk) {
    toast(
      `Wallet harus berada di ${CHAIN().name} untuk melanjutkan.`,
      "warn",
      5000,
    );
    return;
  }
  const amtStr = $("amountIn").value;
  if (!amtStr || parseFloat(amtStr) <= 0) return;
  const amt = parse(amtStr, 18);
  const isWrapping = S.tIn.isNative;
  const w = wethC(S.signer);
  S.actionBusy = true;
  updateSwapBtn();
  try {
    if (isWrapping) {
      const bal = await getBal(S.tIn, S.account);
      if (amt > bal) throw new Error("INSUFFICIENT_BALANCE");
      const gasPrice = await getLiveGasPrice();
      if (!gasPrice) throw new Error("GAS_PRICE_UNAVAILABLE");
      const gas = await w.deposit.estimateGas({ value: amt });
      if (bal - amt < (gas * gasPrice * 120n) / 100n)
        throw new Error("INSUFFICIENT_NATIVE_FOR_GAS");
      showTx(`Wrap ${CHAIN().symbol}`, "Konfirmasi di dompet Anda");
      const tx = await w.deposit({ value: amt });
      addTx(
        tx.hash,
        `Wrap ${amtStr} ${CHAIN().symbol} → ${CHAIN().WNATIVE_SYMBOL}`,
        "pending",
      );
      showTx("Submitted", "Waiting…");
      const rc = await waitForConfirmedTx(tx, "Transaction");
      hideTx();
      if (rc.status === 1) {
        updTx(tx.hash, "ok");
        toast(
          `✓ Wrapped ${amtStr} ${CHAIN().symbol} → ${CHAIN().WNATIVE_SYMBOL}`,
          "ok",
          6000,
        );
        $("amountIn").value = "";
        $("amountOut").value = "";
        $("swapDetails").style.display = "none";
        refreshBals();
      } else {
        updTx(tx.hash, "fail");
        toast("Wrap failed.", "err");
      }
    } else {
      const bal = await getBal(S.tIn, S.account);
      if (amt > bal) throw new Error("INSUFFICIENT_BALANCE");
      showTx(`Unwrap ${CHAIN().WNATIVE_SYMBOL}`, "Konfirmasi di dompet Anda");
      const tx = await w.withdraw(amt);
      addTx(
        tx.hash,
        `Unwrap ${amtStr} ${CHAIN().WNATIVE_SYMBOL} → ${CHAIN().symbol}`,
        "pending",
      );
      showTx("Submitted", "Waiting…");
      const rc = await waitForConfirmedTx(tx, "Transaction");
      hideTx();
      if (rc.status === 1) {
        updTx(tx.hash, "ok");
        toast(
          `✓ Unwrapped ${amtStr} ${CHAIN().WNATIVE_SYMBOL} → ${CHAIN().symbol}`,
          "ok",
          6000,
        );
        $("amountIn").value = "";
        $("amountOut").value = "";
        $("swapDetails").style.display = "none";
        refreshBals();
      } else {
        updTx(tx.hash, "fail");
        toast("Unwrap failed.", "err");
      }
    }
  } catch (e) {
    hideTx();
    const x = String(
      e?.reason || e?.shortMessage || e?.message || e || "",
    ).toLowerCase();
    if (
      x.includes("insufficient_native_for_gas") ||
      x.includes("insufficient funds")
    )
      toast(
        "Sisakan RIC untuk biaya gas. Kurangi jumlah yang digunakan.",
        "warn",
        6000,
      );
    else if (x.includes("insufficient_balance"))
      toast(`Saldo ${S.tIn.symbol} tidak cukup.`, "err");
    else if (e.code === 4001 || e.code === "ACTION_REJECTED")
      toast("Rejected.", "warn");
    else
      toast(
        "Error: " + (e.reason || e.shortMessage || e.message || "Unknown"),
        "err",
        6000,
      );
  } finally {
    S.actionBusy = false;
    updateSwapBtn();
  }
}
async function getNativeGasReserve() {
  if (!S.signer || !S.account || !S.tIn?.isNative) return 0n;
  try {
    const bal = await getBal({ isNative: true }, S.account);
    if (bal <= 0n) return 0n;
    const gasPrice = await getLiveGasPrice();
    if (!gasPrice) return 0n;
    const path = [routeAddr(S.tIn), routeAddr(S.tOut)];
    const r = router(S.signer);
    const sampleAmount = (bal * 90n) / 100n;
    if (sampleAmount <= 0n) return 0n;
    const gasEstimate = await r.swapExactETHForTokens.estimateGas(
      0n,
      path,
      S.account,
      ddl(),
      { value: sampleAmount },
    );
    return (gasEstimate * gasPrice * 120n) / 100n;
  } catch {
    try {
      const gasPrice = await getLiveGasPrice();
      if (!gasPrice) return 0n;
      return (220000n * gasPrice * 120n) / 100n;
    } catch {
      return 0n;
    }
  }
}

async function getMaxInputAmount(token, pct) {
  const bal = await getBal(token, S.account).catch(() => 0n);
  if (!token?.isNative) return (bal * BigInt(pct)) / 100n;

  // For RIC, reserve gas only when using the full balance. Percent buttons
  // below 100% already leave room for gas in normal use.
  if (pct < 100) return (bal * BigInt(pct)) / 100n;

  const reserve = await getNativeGasReserve();
  if (bal <= reserve) return 0n;
  return bal - reserve;
}

async function estimateGasCost(contractMethod, args, overrides = {}) {
  const gasPrice = await getLiveGasPrice();
  if (!gasPrice) throw new Error("GAS_PRICE_UNAVAILABLE");
  const gas = await contractMethod.estimateGas(...args, overrides);
  return { gas, cost: (gas * gasPrice * 120n) / 100n };
}

function friendlySwapError(e) {
  const raw = String(
    e?.reason || e?.shortMessage || e?.message || e || "Unknown",
  );
  const x = raw.toLowerCase();
  if (x.includes("insufficient funds") || x.includes("insufficient_funds"))
    return "Saldo RIC tidak cukup untuk membayar gas. Kurangi jumlah swap.";
  if (
    x.includes("user rejected") ||
    x.includes("user denied") ||
    e?.code === 4001 ||
    e?.code === "ACTION_REJECTED"
  )
    return "Transaksi dibatalkan di wallet.";
  if (x.includes("insufficient_output_amount") || x.includes("slippage"))
    return "Harga berubah. Naikkan slippage atau coba lagi.";
  if (
    x.includes("transfer amount exceeds balance") ||
    x.includes("exceeds balance")
  )
    return "Saldo token tidak mencukupi untuk jumlah swap.";
  if (x.includes("execution reverted"))
    return "Swap ditolak oleh router. Cek likuiditas, slippage, dan saldo gas.";
  return raw.length > 180 ? raw.slice(0, 177) + "…" : raw;
}

async function doSwap() {
  if (S.actionBusy) return;
  if (!S.signer) {
    connectWallet();
    return;
  }
  await ensureChain();
  if (!S.chainOk) {
    toast(
      `Wallet harus berada di ${CHAIN().name} untuk melakukan swap.`,
      "warn",
      5000,
    );
    return;
  }
  // Always refresh the quote immediately before signing. This removes the
  // MAX → getQuote race where a very fast click could submit an old quote.
  await getQuote();
  const amtInStr = $("amountIn").value,
    amtOutStr = $("amountOut").value;
  if (!amtInStr || !amtOutStr) {
    toast("Quote belum siap. Coba lagi.", "warn");
    return;
  }
  const amtIn = parse(amtInStr, S.tIn.decimals),
    amtOut = parse(amtOutStr, S.tOut.decimals);
  if (amtIn <= 0n || amtOut <= 0n) {
    toast("Jumlah swap tidak valid atau likuiditas tidak tersedia.", "warn");
    return;
  }

  // Re-check the real wallet balance immediately before submitting.
  const currentBal = await getBal(S.tIn, S.account).catch(() => 0n);
  if (amtIn > currentBal) {
    toast(`Saldo ${S.tIn.symbol} tidak cukup untuk jumlah swap.`, "err");
    return;
  }

  if (S.tIn.isNative) {
    const gasReserve = await getNativeGasReserve();
    if (currentBal - amtIn < gasReserve) {
      toast(
        "Sisakan RIC untuk gas. Gunakan tombol MAX agar jumlah dihitung otomatis.",
        "warn",
        6000,
      );
      return;
    }
  }

  const minOut = minAmt(amtOut),
    dl = ddl();
  const path = [routeAddr(S.tIn), routeAddr(S.tOut)];
  const r = router(S.signer);
  S.actionBusy = true;
  updateSwapBtn();
  try {
    showTx("Preparing Swap…", "Checking allowance");
    if (!S.tIn.isNative) {
      const tok = erc20(S.tIn.address, S.signer);
      const al = await tok.allowance(S.account, CHAIN().ROUTER);
      if (al < amtIn) {
        showTx("Approve " + S.tIn.symbol, "Confirm approval in wallet");
        const tx = await tok.approve(CHAIN().ROUTER, ethers.MaxUint256);
        showTx("Approving…", "Waiting for confirmation");
        await waitForConfirmedTx(tx, "Transaction");
      }
    }
    // Re-check balances after approval because the wallet state may have
    // changed while the approval transaction was mined.
    const latestInBal = await getBal(S.tIn, S.account);
    if (amtIn > latestInBal) throw new Error("INSUFFICIENT_BALANCE");

    // Estimate the exact final transaction before opening the wallet prompt.
    // This catches gas/balance problems before the user signs.
    let gasCost = 0n;
    if (S.tIn.isNative) {
      const est = await estimateGasCost(
        r.swapExactETHForTokens,
        [minOut, path, S.account, dl],
        { value: amtIn },
      );
      gasCost = est.cost;
      if (gasCost > 0n && latestInBal - amtIn < gasCost)
        throw new Error("INSUFFICIENT_NATIVE_FOR_GAS");
    } else if (S.tOut.isNative) {
      const est = await estimateGasCost(r.swapExactTokensForETH, [
        amtIn,
        minOut,
        path,
        S.account,
        dl,
      ]);
      gasCost = est.cost;
      const nativeBal = await getBal(makeNativeToken(), S.account);
      if (gasCost > 0n && nativeBal < gasCost)
        throw new Error("INSUFFICIENT_NATIVE_FOR_GAS");
    } else {
      const est = await estimateGasCost(r.swapExactTokensForTokens, [
        amtIn,
        minOut,
        path,
        S.account,
        dl,
      ]);
      gasCost = est.cost;
      const nativeBal = await getBal(makeNativeToken(), S.account);
      if (gasCost > 0n && nativeBal < gasCost)
        throw new Error("INSUFFICIENT_NATIVE_FOR_GAS");
    }

    showTx("Confirm Swap", "Approve in wallet");
    let tx;
    if (S.tIn.isNative)
      tx = await r.swapExactETHForTokens(minOut, path, S.account, dl, {
        value: amtIn,
      });
    else if (S.tOut.isNative)
      tx = await r.swapExactTokensForETH(amtIn, minOut, path, S.account, dl);
    else
      tx = await r.swapExactTokensForTokens(amtIn, minOut, path, S.account, dl);
    showTx("Submitted", "Hash: " + short(tx.hash));
    addTx(
      tx.hash,
      `Swap ${amtInStr} ${S.tIn.symbol} → ${amtOutStr} ${S.tOut.symbol}`,
      "pending",
    );
    const rc = await waitForConfirmedTx(tx, "Transaction");
    hideTx();
    if (rc.status === 1) {
      updTx(tx.hash, "ok");
      toast(
        `✓ Swapped ${amtInStr} ${S.tIn.symbol} → ${amtOutStr} ${S.tOut.symbol}`,
        "ok",
        6000,
      );
      $("amountIn").value = "";
      $("amountOut").value = "";
      $("swapDetails").style.display = "none";
      refreshBals();
    } else {
      updTx(tx.hash, "fail");
      toast("Swap failed.", "err");
    }
    updateSwapBtn();
  } catch (e) {
    hideTx();
    const raw = String(
      e?.reason || e?.shortMessage || e?.message || e || "",
    ).toLowerCase();
    const kind =
      e?.code === 4001 || e?.code === "ACTION_REJECTED" ? "warn" : "err";
    if (raw.includes("insufficient_native_for_gas"))
      toast(
        "Saldo RIC tidak cukup untuk biaya gas. Kurangi jumlah swap.",
        "warn",
        6000,
      );
    else if (raw.includes("insufficient_balance"))
      toast(`Saldo ${S.tIn.symbol} tidak cukup untuk swap.`, "err", 6000);
    else toast(friendlySwapError(e), kind, 6000);
  } finally {
    S.actionBusy = false;
    updateSwapBtn();
  }
}
function updateLiqUI() {
  const a = S.liqA,
    b = S.liqB;
  if (a) {
    $("liqSymA").textContent = a.symbol;
    setLogo("liqLogoA", a);
    $("liqSymA2").textContent = a.symbol;
    setLogo("liqLogoA2", a);
    $("liqLblA").textContent = a.symbol + " Amount";
  } else {
    $("liqSymA").textContent = "Pilih Token";
    $("liqSymA2").textContent = "—";
  }
  if (b) {
    $("liqSymB").textContent = b.symbol;
    setLogo("liqLogoB", b);
    $("liqSymB2").textContent = b.symbol;
    setLogo("liqLogoB2", b);
    $("liqLblB").textContent = b.symbol + " Amount";
  } else {
    $("liqSymB").textContent = "Pilih Token";
    $("liqSymB2").textContent = "—";
  }
  if (a && b) {
    $("liqPrompt").classList.add("hidden");
    $("liqForm").classList.remove("hidden");
    checkPoolInfo();
    checkLiqApprovals();
  } else {
    $("liqPrompt").classList.remove("hidden");
    $("liqForm").classList.add("hidden");
  }
  updateAddLiqBtn();
}
function setLogo(id, t) {
  const el = $(id);
  if (!el) return;
  const imageUrl = safeImageUrl(t && t.logoURI);
  if (imageUrl) {
    el.src = imageUrl;
    el.style.display = "";
  } else {
    el.src = "";
    el.style.display = "none";
  }
}
async function checkPoolInfo() {
  if (!S.liqA || !S.liqB) return;
  const tokenA = S.liqA;
  const tokenB = S.liqB;
  try {
    const f = factory();
    const pa = await f.getPair(routeAddr(tokenA), routeAddr(tokenB));
    if (tokenA !== S.liqA || tokenB !== S.liqB) return;
    if (pa === ethers.ZeroAddress) {
      $("liqStatus").textContent = "New Pool";
      $("liqStatus").style.color = "var(--yellow)";
      $("liqRate").textContent = "—";
      $("liqShare").textContent = "100%";
    } else {
      const pr = pairC(pa);
      const [r0, r1] = await pr.getReserves();
      const t0 = await pr.token0();
      if (tokenA !== S.liqA || tokenB !== S.liqB) return;
      const aIs0 = routeAddr(tokenA).toLowerCase() === t0.toLowerCase();
      const rA = aIs0 ? r0 : r1,
        rB = aIs0 ? r1 : r0;
      if (rA === 0n || rB === 0n) {
        $("liqRate").textContent = "—";
        $("liqStatus").textContent = "Pool Empty";
        return;
      }
      const rate =
        parseFloat(ethers.formatUnits(rB, tokenB.decimals)) /
        parseFloat(ethers.formatUnits(rA, tokenA.decimals));
      $("liqRate").textContent =
        `1 ${tokenA.symbol} = ${rate.toFixed(6)} ${tokenB.symbol}`;
      $("liqStatus").textContent = "Pool Exists";
      $("liqStatus").style.color = "var(--green)";
      const amtA = $("liqAmtA").value;
      if (amtA && +amtA > 0) {
        const inA = parse(amtA, tokenA.decimals);
        const sh =
          (parseFloat(inA.toString()) /
            (parseFloat(rA.toString()) + parseFloat(inA.toString()))) *
          100;
        $("liqShare").textContent = sh.toFixed(4) + "%";
      }
    }
  } catch {}
}
async function onLiqAmtAChange() {
  if (!S.liqA || !S.liqB) return;
  const tokenA = S.liqA;
  const tokenB = S.liqB;
  const amtA = $("liqAmtA").value;
  if (!amtA || +amtA <= 0) return;
  try {
    const f = factory();
    const pa = await f.getPair(routeAddr(tokenA), routeAddr(tokenB));
    if (tokenA !== S.liqA || tokenB !== S.liqB) return;
    if (pa !== ethers.ZeroAddress) {
      const pr = pairC(pa);
      const [r0, r1] = await pr.getReserves();
      const t0 = await pr.token0();
      if (tokenA !== S.liqA || tokenB !== S.liqB) return;
      const aIs0 = routeAddr(tokenA).toLowerCase() === t0.toLowerCase();
      const rA = aIs0 ? r0 : r1,
        rB = aIs0 ? r1 : r0;
      const inA = parse(amtA, tokenA.decimals);
      if (rA === 0n) return;
      const inB = (inA * rB) / rA;
      $("liqAmtB").value = fmt(inB, tokenB.decimals, 8);
    }
    checkPoolInfo();
  } catch {}
  updateAddLiqBtn();
  checkLiqApprovals();
}
async function checkLiqApprovals() {
  S.liqApprovalsReady = false;
  S.liqApprovalToken = null;
  if (!S.account || !S.liqA || !S.liqB) {
    updateAddLiqBtn();
    return;
  }
  const account = S.account;
  const tokenA = S.liqA;
  const tokenB = S.liqB;
  const amtA = $("liqAmtA").value;
  const amtB = $("liqAmtB").value;
  if (!amtA || !amtB) {
    updateAddLiqBtn();
    return;
  }
  const approvalSeq = (S.liqApprovalSeq || 0) + 1;
  S.liqApprovalSeq = approvalSeq;

  // Only expose ONE approval action at a time. If both tokens need approval,
  // the first one is approved, then the button automatically changes to the second.
  for (const [tok, amt] of [
    [tokenA, amtA],
    [tokenB, amtB],
  ]) {
    if (tok.isNative) continue;
    try {
      const c = erc20(tok.address, S.provider || readProv());
      const al = await c.allowance(account, CHAIN().ROUTER);
      if (
        approvalSeq !== S.liqApprovalSeq ||
        account !== S.account ||
        tokenA !== S.liqA ||
        tokenB !== S.liqB
      )
        return;
      if (al < parse(amt, tok.decimals)) {
        S.liqApprovalToken = tok;
        break;
      }
    } catch {
      // Keep the action unavailable until allowance can be verified.
      S.liqApprovalToken = null;
      break;
    }
  }
  if (
    approvalSeq === S.liqApprovalSeq &&
    account === S.account &&
    tokenA === S.liqA &&
    tokenB === S.liqB
  ) {
    S.liqApprovalsReady = !S.liqApprovalToken;
    updateAddLiqBtn();
  }
}

async function approveTok(tok, btn) {
  if (!S.signer || S.actionBusy) return;
  await ensureChain();
  if (!S.chainOk) {
    toast(
      `Wallet harus berada di ${CHAIN().name} untuk menyetujui ${tok.symbol}.`,
      "warn",
      5000,
    );
    return;
  }
  S.actionBusy = true;
  updateSwapBtn();
  try {
    const c = erc20(tok.address, S.signer);
    await ensureNativeGasForTx(c.approve, [CHAIN().ROUTER, ethers.MaxUint256]);
    showTx(`Approve ${tok.symbol}`, "Confirm in wallet");
    const tx = await c.approve(CHAIN().ROUTER, ethers.MaxUint256);
    await waitForConfirmedTx(tx, "Transaction");
    hideTx();
    toast(`${tok.symbol} approved!`, "ok");
    S.actionBusy = false;
    await checkLiqApprovals();
  } catch (e) {
    hideTx();
    const x = String(
      e?.reason || e?.shortMessage || e?.message || e || "",
    ).toLowerCase();
    if (
      x.includes("insufficient_native_for_gas") ||
      x.includes("insufficient funds")
    )
      toast("Saldo RIC tidak cukup untuk gas approval.", "warn", 6000);
    else if (e?.code === 4001 || e?.code === "ACTION_REJECTED")
      toast("Rejected.", "warn");
    else toast("Approval failed.", "err");
  } finally {
    S.actionBusy = false;
    updateSwapBtn();
    updateAddLiqBtn();
  }
}

function updateAddLiqBtn() {
  const btn = $("addLiqBtn");
  btn.onclick = null;
  if (S.actionBusy) {
    btn.textContent = "Transaction in Progress…";
    btn.disabled = true;
    return;
  }
  if (!S.account) {
    btn.textContent = "Hubungkan Dompet";
    btn.disabled = false;
    btn.onclick = () => connectWallet();
    return;
  }
  if (!S.liqA || !S.liqB) {
    btn.textContent = "Select Tokens";
    btn.disabled = true;
    return;
  }
  const a = $("liqAmtA").value,
    b = $("liqAmtB").value;
  if (!a || !b || +a <= 0 || +b <= 0) {
    btn.textContent = "Enter Amounts";
    btn.disabled = true;
    return;
  }
  if (!S.liqApprovalsReady) {
    const tok = S.liqApprovalToken;
    btn.textContent = tok ? `Approve ${tok.symbol}` : "Checking Approval…";
    btn.disabled = !tok;
    if (tok) btn.onclick = () => approveTok(tok, btn);
    return;
  }
  btn.textContent = "Tambah Likuiditas";
  btn.disabled = false;
  btn.onclick = doAddLiq;
}
async function doAddLiq() {
  if (S.actionBusy) return;
  if (!S.signer) {
    connectWallet();
    return;
  }
  await ensureChain();
  if (!S.chainOk) {
    toast(
      `Wallet harus berada di ${CHAIN().name} untuk menambah likuiditas.`,
      "warn",
      5000,
    );
    return;
  }
  const amtAStr = $("liqAmtA").value,
    amtBStr = $("liqAmtB").value;
  const amtA = parse(amtAStr, S.liqA.decimals),
    amtB = parse(amtBStr, S.liqB.decimals);
  const minA = minAmtLiq(amtA),
    minB = minAmtLiq(amtB);
  const r = router(S.signer),
    dl = ddl();
  S.actionBusy = true;
  updateAddLiqBtn();
  try {
    const balA = await getBal(S.liqA, S.account);
    const balB = await getBal(S.liqB, S.account);
    if (amtA > balA) throw new Error(`INSUFFICIENT_${S.liqA.symbol}`);
    if (amtB > balB) throw new Error(`INSUFFICIENT_${S.liqB.symbol}`);

    let nativeAmount = 0n;
    let gasCost = 0n;
    let gasMethod,
      gasArgs,
      gasOverrides = {};
    if (S.liqA.isNative) {
      nativeAmount = amtA;
      gasMethod = r.addLiquidityETH;
      gasArgs = [routeAddr(S.liqB), amtB, minB, minA, S.account, dl];
      gasOverrides = { value: amtA };
    } else if (S.liqB.isNative) {
      nativeAmount = amtB;
      gasMethod = r.addLiquidityETH;
      gasArgs = [routeAddr(S.liqA), amtA, minA, minB, S.account, dl];
      gasOverrides = { value: amtB };
    } else {
      gasMethod = r.addLiquidity;
      gasArgs = [
        routeAddr(S.liqA),
        routeAddr(S.liqB),
        amtA,
        amtB,
        minA,
        minB,
        S.account,
        dl,
      ];
    }
    const est = await estimateGasCost(gasMethod, gasArgs, gasOverrides);
    gasCost = est.cost;
    const nativeBal = await getBal(makeNativeToken(), S.account);
    if (nativeAmount > 0n && gasCost > 0n && nativeBal - nativeAmount < gasCost)
      throw new Error("INSUFFICIENT_NATIVE_FOR_GAS");
    if (nativeAmount === 0n && gasCost > 0n && nativeBal < gasCost)
      throw new Error("INSUFFICIENT_NATIVE_FOR_GAS");

    showTx("Adding Liquidity…", "Konfirmasi di dompet Anda");
    let tx;
    if (S.liqA.isNative) {
      tx = await r.addLiquidityETH(
        routeAddr(S.liqB),
        amtB,
        minB,
        minA,
        S.account,
        dl,
        { value: amtA },
      );
    } else if (S.liqB.isNative) {
      tx = await r.addLiquidityETH(
        routeAddr(S.liqA),
        amtA,
        minA,
        minB,
        S.account,
        dl,
        { value: amtB },
      );
    } else {
      tx = await r.addLiquidity(
        routeAddr(S.liqA),
        routeAddr(S.liqB),
        amtA,
        amtB,
        minA,
        minB,
        S.account,
        dl,
      );
    }
    addTx(
      tx.hash,
      `Add Liquidity ${S.liqA.symbol}/${S.liqB.symbol}`,
      "pending",
    );
    showTx("Submitted…", "Waiting for confirmation");
    const rc = await waitForConfirmedTx(tx, "Transaction");
    hideTx();
    if (rc.status === 1) {
      updTx(tx.hash, "ok");
      toast(`Liquidity added! ${S.liqA.symbol}/${S.liqB.symbol}`, "ok", 6000);
      $("liqAmtA").value = "";
      $("liqAmtB").value = "";
      refreshBals();
      loadPositions();
    } else {
      updTx(tx.hash, "fail");
      toast("Failed.", "err");
    }
  } catch (e) {
    hideTx();
    const raw = String(
      e?.reason || e?.shortMessage || e?.message || e || "",
    ).toLowerCase();
    if (
      raw.includes("insufficient_native_for_gas") ||
      raw.includes("insufficient funds")
    )
      toast(
        "Saldo RIC tidak cukup untuk biaya gas. Kurangi jumlah RIC yang ditambahkan.",
        "warn",
        6000,
      );
    else if (e.code === 4001 || e.code === "ACTION_REJECTED")
      toast("Rejected.", "warn");
    else
      toast(
        "Error: " + (e.reason || e.shortMessage || e.message || "Unknown"),
        "err",
        6000,
      );
  } finally {
    S.actionBusy = false;
    updateAddLiqBtn();
  }
}
async function loadPositions() {
  const account = S.account;
  if (!account) {
    $("poolList").innerHTML =
      '<div class="cyber-card empty-pool"><div class="ep-icon">◈</div><p>Connect wallet</p><span>to see your positions</span></div>';
    return;
  }
  $("poolList").innerHTML =
    '<div class="cyber-card empty-pool"><div class="ep-icon" style="animation:spin 1s linear infinite">◈</div><p>Loading…</p></div>';
  const f = factory();
  const prov = readProv();
  const positions = [];
  const seenPairs = new Set();
  const native = makeNativeToken();
  const erc20Toks = allToks().filter(
    (t) =>
      !t.isNative && t.address.toLowerCase() !== CHAIN().WNATIVE.toLowerCase(),
  );
  const tryPair = async (tA, tB) => {
    try {
      const pa = await f.getPair(routeAddr(tA), routeAddr(tB));
      if (pa === ethers.ZeroAddress) return;
      const paLower = pa.toLowerCase();
      if (seenPairs.has(paLower)) return;
      seenPairs.add(paLower);
      const pr = pairC(pa, prov);
      const lpBal = await pr.balanceOf(account);
      if (lpBal === 0n) return;
      const [ts, reserves, t0addr] = await Promise.all([
        pr.totalSupply(),
        pr.getReserves(),
        pr.token0(),
      ]);
      const [r0, r1] = reserves;
      const aIs0 = routeAddr(tA).toLowerCase() === t0addr.toLowerCase();
      const rA = aIs0 ? r0 : r1,
        rB = aIs0 ? r1 : r0;
      const myA = ts === 0n ? 0n : (rA * lpBal) / ts;
      const myB = ts === 0n ? 0n : (rB * lpBal) / ts;
      const sh = ts === 0n ? 0n : (lpBal * 10000n) / ts;
      const displayA = tA.isNative ? native : tA;
      const displayB = tB.isNative ? native : tB;
      positions.push({
        tA: displayA,
        tB: displayB,
        lpBal,
        ts,
        pa,
        myA,
        myB,
        sh,
      });
    } catch (e) {
      console.warn("tryPair error:", e);
    }
  };
  for (const t of erc20Toks) await tryPair(native, t);
  for (let i = 0; i < erc20Toks.length; i++)
    for (let j = i + 1; j < erc20Toks.length; j++)
      await tryPair(erc20Toks[i], erc20Toks[j]);
  if (account !== S.account) return;
  S.positions = positions;
  renderPositions(positions);
}
function renderPositions(pos) {
  const el = $("poolList");
  if (!pos.length) {
    el.innerHTML =
      '<div class="cyber-card empty-pool"><div class="ep-icon">◈</div><p>No positions found</p><span>Add liquidity to get started</span></div>';
    return;
  }
  el.innerHTML = "";
  pos.forEach((p, i) => {
    const d = document.createElement("div");
    d.className = "pool-pos";
    const sh = (Number(p.sh) / 100).toFixed(4);
    d.innerHTML = `<div class="pos-hd"><span class="pos-pair">${escHtml(p.tA.symbol)}/${escHtml(p.tB.symbol)}</span><div class="pos-acts"><button type="button" class="pos-add" data-add="${i}">Add</button><button type="button" class="pos-rm" data-remove="${i}">Remove</button></div></div><div class="pos-data"><div class="pos-row"><span>Your ${escHtml(p.tA.symbol)}</span><span class="mono">${fmt(p.myA, p.tA.decimals, 6)}</span></div><div class="pos-row"><span>Your ${escHtml(p.tB.symbol)}</span><span class="mono">${fmt(p.myB, p.tB.decimals, 6)}</span></div><div class="pos-row"><span>Pool Share</span><span class="mono">${sh}%</span></div><div class="pos-row"><span>LP Tokens</span><span class="mono">${fmt(p.lpBal, 18, 8)}</span></div><div class="pos-row"><span>Pair</span><span class="mono"><a href="${CHAIN().explorer}address/${encodeURIComponent(p.pa)}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);text-decoration:none">${short(p.pa)} 🔍</a></span></div></div>`;
    const addBtn = d.querySelector("[data-add]");
    const removeBtn = d.querySelector("[data-remove]");
    addBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      goAddLiq(Number(e.currentTarget.dataset.add));
    });
    removeBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openRemove(Number(e.currentTarget.dataset.remove));
    });
    el.appendChild(d);
  });
}
window.goAddLiq = (i) => {
  const p = S.positions[i];
  if (!p) return;
  S.liqA = p.tA;
  S.liqB = p.tB;
  navTo("liquidity");
  setTimeout(updateLiqUI, 50);
};
window.openRemove = (i) => {
  S.currentPos = i;
  const p = S.positions[i];
  if (!p) return;
  $("rmSymA").textContent = p.tA.symbol;
  $("rmSymB").textContent = p.tB.symbol;
  updateRemoveOutput(50);
  openModal("removeMWrap");
  void updateRemoveAction();
};
function updateRemoveOutput(pct) {
  S.removePct = pct;
  const p = S.positions[S.currentPos];
  if (!p) return;
  $("rmPctVal").textContent = pct + "%";
  $("rmAmtA").textContent = fmt((p.myA * BigInt(pct)) / 100n, p.tA.decimals, 6);
  $("rmAmtB").textContent = fmt((p.myB * BigInt(pct)) / 100n, p.tB.decimals, 6);
  const sl = $("rmSlider");
  sl.style.background = `linear-gradient(to right,var(--cyan) ${pct}%,var(--bg3) ${pct}%)`;
  void updateRemoveAction();
}

async function updateRemoveAction() {
  const btn = $("removeLiqBtn");
  const p = S.positions[S.currentPos];
  if (!btn || !p || !S.account) return;
  btn.onclick = null;
  if (S.actionBusy) {
    btn.textContent = "Transaction in Progress…";
    btn.disabled = true;
    return;
  }
  try {
    const lp = pairC(p.pa, S.provider || readProv());
    const allowance = await lp.allowance(S.account, CHAIN().ROUTER);
    const lpAmount = (p.lpBal * BigInt(S.removePct)) / 100n;
    if (allowance < lpAmount) {
      btn.textContent = "Approve LP Token";
      btn.disabled = false;
      btn.onclick = approveLP;
    } else {
      btn.textContent = "Hapus Likuiditas";
      btn.disabled = lpAmount <= 0n;
      btn.onclick = () => doRemoveLiq(S.removePct);
    }
  } catch {
    btn.textContent = "Checking Approval…";
    btn.disabled = true;
  }
}

async function approveLP() {
  const p = S.positions[S.currentPos];
  if (!p || !S.signer || S.actionBusy) return;
  await ensureChain();
  if (!S.chainOk) {
    toast(
      `Wallet harus berada di ${CHAIN().name} untuk menyetujui LP.`,
      "warn",
      5000,
    );
    return;
  }
  S.actionBusy = true;
  updateRemoveAction();
  try {
    const c = pairC(p.pa, S.signer);
    await ensureNativeGasForTx(c.approve, [CHAIN().ROUTER, ethers.MaxUint256]);
    showTx("Approve LP Token", "Konfirmasi di dompet Anda");
    const tx = await c.approve(CHAIN().ROUTER, ethers.MaxUint256);
    await waitForConfirmedTx(tx, "Transaction");
    hideTx();
    toast("LP token approved. You can now remove liquidity.", "ok", 5000);
    await updateRemoveAction();
  } catch (e) {
    hideTx();
    const x = String(
      e?.reason || e?.shortMessage || e?.message || e || "",
    ).toLowerCase();
    if (
      x.includes("insufficient_native_for_gas") ||
      x.includes("insufficient funds")
    )
      toast("Saldo RIC tidak cukup untuk gas approval.", "warn", 6000);
    else if (e?.code === 4001 || e?.code === "ACTION_REJECTED")
      toast("Approval dibatalkan.", "warn");
    else toast("LP approval failed.", "err");
  } finally {
    S.actionBusy = false;
    await updateRemoveAction();
  }
}

async function doRemoveLiq(pct) {
  const p = S.positions[S.currentPos];
  if (!p || !S.signer || S.actionBusy) return;
  await ensureChain();
  if (!S.chainOk) {
    toast(
      `Wallet harus berada di ${CHAIN().name} untuk menghapus likuiditas.`,
      "warn",
      5000,
    );
    return;
  }
  // Final allowance guard: never let a user accidentally execute Remove before approval.
  const lpAmt = (p.lpBal * BigInt(pct)) / 100n;
  const lpCheck = pairC(p.pa, S.provider || readProv());
  const allowance = await lpCheck
    .allowance(S.account, CHAIN().ROUTER)
    .catch(() => 0n);
  if (allowance < lpAmt) {
    toast(
      "Approve LP Token terlebih dahulu. Tombol akan berubah otomatis setelah approval.",
      "warn",
      5000,
    );
    await updateRemoveAction();
    return;
  }
  const minA = minAmtLiq((p.myA * BigInt(pct)) / 100n),
    minB = minAmtLiq((p.myB * BigInt(pct)) / 100n);
  const r = router(S.signer),
    dl = ddl();
  S.actionBusy = true;
  updateRemoveAction();
  try {
    let tx;
    if (p.tA.isNative || p.tB.isNative) {
      const tok = p.tA.isNative ? p.tB : p.tA,
        mt = p.tA.isNative ? minB : minA,
        me = p.tA.isNative ? minA : minB;
      await ensureNativeGasForTx(r.removeLiquidityETH, [
        routeAddr(tok),
        lpAmt,
        mt,
        me,
        S.account,
        dl,
      ]);
      showTx("Removing Liquidity…", "Konfirmasi di dompet Anda");
      tx = await r.removeLiquidityETH(
        routeAddr(tok),
        lpAmt,
        mt,
        me,
        S.account,
        dl,
      );
    } else {
      await ensureNativeGasForTx(r.removeLiquidity, [
        routeAddr(p.tA),
        routeAddr(p.tB),
        lpAmt,
        minA,
        minB,
        S.account,
        dl,
      ]);
      showTx("Removing Liquidity…", "Konfirmasi di dompet Anda");
      tx = await r.removeLiquidity(
        routeAddr(p.tA),
        routeAddr(p.tB),
        lpAmt,
        minA,
        minB,
        S.account,
        dl,
      );
    }
    addTx(tx.hash, `Remove Liq ${p.tA.symbol}/${p.tB.symbol}`, "pending");
    showTx("Submitted", "Waiting for confirmation…");
    const rc = await waitForConfirmedTx(tx, "Transaction");
    hideTx();
    if (rc.status === 1) {
      updTx(tx.hash, "ok");
      toast("Liquidity removed successfully.", "ok", 6000);
      closeModal("removeMWrap");
      refreshBals();
      loadPositions();
    } else {
      updTx(tx.hash, "fail");
      toast("Liquidity removal failed.", "err");
    }
  } catch (e) {
    hideTx();
    const x = String(
      e?.reason || e?.shortMessage || e?.message || e || "",
    ).toLowerCase();
    if (
      x.includes("insufficient_native_for_gas") ||
      x.includes("insufficient funds")
    )
      toast("Saldo RIC tidak cukup untuk gas.", "warn", 6000);
    else if (e?.code === 4001 || e?.code === "ACTION_REJECTED")
      toast("Transaksi dibatalkan.", "warn");
    else
      toast(
        "Error: " + (e?.reason || e?.shortMessage || e?.message || "Unknown"),
        "err",
      );
  } finally {
    S.actionBusy = false;
    await updateRemoveAction();
  }
}

async function checkImport() {
  if (!S.importA || !S.importB) return;
  const tokenA = S.importA;
  const tokenB = S.importB;
  const d = $("importDetails"),
    btn = $("confirmImportBtn");
  d.style.display = "flex";
  d.innerHTML =
    '<div class="detail-row"><span style="color:var(--txt2)">Searching for pool…</span></div>';
  btn.disabled = true;
  try {
    const f = factory();
    const pa = await f.getPair(routeAddr(tokenA), routeAddr(tokenB));
    if (tokenA !== S.importA || tokenB !== S.importB) return;
    if (pa === ethers.ZeroAddress) {
      d.innerHTML = `<div class="detail-row"><span style="color:var(--yellow)">Pool not found</span><span style="font-size:11px;color:var(--txt3)">Add liquidity to create</span></div>`;
      btn.disabled = true;
    } else {
      const pr = pairC(pa);
      const [reserves, ts, t0addr] = await Promise.all([
        pr.getReserves(),
        pr.totalSupply(),
        pr.token0(),
      ]);
      const [r0, r1] = reserves;
      if (tokenA !== S.importA || tokenB !== S.importB) return;
      const aIs0 = routeAddr(tokenA).toLowerCase() === t0addr.toLowerCase();
      const rA = aIs0 ? r0 : r1,
        rB = aIs0 ? r1 : r0;
      let myLP = "—";
      if (S.account) {
        try {
          myLP = fmt(await pr.balanceOf(S.account), 18, 8);
          if (tokenA !== S.importA || tokenB !== S.importB) return;
        } catch {}
      }
      d.innerHTML = `<div class="detail-row"><span>Address</span><span><a href="${CHAIN().explorer}address/${encodeURIComponent(pa)}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan);text-decoration:none">${short(pa)} 🔍</a></span></div><div class="detail-row"><span>${escHtml(tokenA.symbol)} Reserve</span><span>${fmt(rA, tokenA.decimals, 4)}</span></div><div class="detail-row"><span>${escHtml(tokenB.symbol)} Reserve</span><span>${fmt(rB, tokenB.decimals, 4)}</span></div><div class="detail-row"><span>Total LP Supply</span><span>${fmt(ts, 18, 4)}</span></div><div class="detail-row"><span>Your LP Balance</span><span>${myLP}</span></div>`;
      btn.disabled = false;
    }
  } catch (e) {
    if (tokenA !== S.importA || tokenB !== S.importB) return;
    d.innerHTML = `<div class="detail-row" style="color:var(--red)"><span>Error: ${escHtml(e.reason || e.message || "Unknown")}</span></div>`;
  }
}
function addTx(h, l, s) {
  S.txns.unshift({ h, l, s, t: Date.now() });
  if (S.txns.length > 8) S.txns.pop();
  save("txns", S.txns);
  renderTxns();
}
function updTx(h, s) {
  const t = S.txns.find((x) => x.h === h);
  if (t) {
    t.s = s;
    save("txns", S.txns);
    renderTxns();
  }
}
function renderTxns() {
  const el = $("txsList");
  if (!S.txns.length) {
    el.innerHTML = '<p class="empty-msg">No transactions</p>';
    return;
  }
  el.innerHTML = "";
  S.txns.slice(0, 6).forEach((tx) => {
    const d = document.createElement("div");
    d.className = "tx-item";
    const ico =
      tx.s === "ok" ? "tx-ok" : tx.s === "fail" ? "tx-fail" : "tx-pend";
    const sym = tx.s === "ok" ? "✓" : tx.s === "fail" ? "✕" : "⏳";
    const txChain = CHAIN_CONFIG;
    d.innerHTML = `<span class="tx-txt">${escHtml(tx.l)}</span><span class="${ico}">${sym}</span><a class="tx-link" href="${txChain.explorer}tx/${encodeURIComponent(tx.h)}" target="_blank" rel="noopener noreferrer" title="Open on ${escHtml(txChain.name)}">🔍</a>`;
    el.appendChild(d);
  });
}
async function fetchCustomPreview(addr) {
  if (!addr.startsWith("0x") || addr.length !== 42) {
    $("customPreview").classList.add("hidden");
    return null;
  }
  try {
    const c = erc20(addr);
    const [name, sym, dec] = await Promise.all([
      c.name(),
      c.symbol(),
      c.decimals(),
    ]);
    $("prevName").textContent = `${name} (${sym})`;
    $("prevAddr").textContent = addr;
    $("prevLogo").src = "";
    $("customPreview").classList.remove("hidden");
    return {
      address: addr,
      name,
      symbol: sym,
      decimals: Number(dec),
      logoURI: "",
      isNative: false,
    };
  } catch {
    $("customPreview").classList.add("hidden");
    return null;
  }
}
function renderCustomToks() {
  const el = $("customTokList");
  const chainToks = S.customTokens;
  if (!chainToks.length) {
    el.innerHTML = '<p class="empty-msg">None added</p>';
    return;
  }
  el.innerHTML = "";
  chainToks.forEach((t) => {
    const globalIdx = S.customTokens.indexOf(t);
    const d = document.createElement("div");
    d.className = "tok-item";
    d.innerHTML = `<div class="tok-ico">${escHtml(String(t.symbol).slice(0, 2))}</div><div class="tok-inf"><div class="tok-sym">${escHtml(t.symbol)}</div><div class="tok-name">${escHtml(t.name)}</div></div><button class="del-tok" data-i="${globalIdx}" title="Remove">✕</button>`;
    d.querySelector(".del-tok").addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.i);
      const removed = S.customTokens.splice(idx, 1)[0];
      save("custom", S.customTokens);
      S.allTokens = S.allTokens.filter(
        (x) => x.address.toLowerCase() !== removed.address.toLowerCase(),
      );
      renderCustomToks();
      toast(`${removed.symbol} removed.`, "info");
    });
    el.appendChild(d);
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Single stable public URL: chain/page state never changes window.location.
  initCanvas();

  initBaseTokens();
  renderTxns();
  renderCustomToks();

  await loadTokenList();
  await applyTradeDeepLink();

  S.customTokens.forEach((t) => {
    const a = t.address.toLowerCase();
    if (!S.allTokens.find((x) => x.address.toLowerCase() === a))
      S.allTokens.push(t);
  });

  document
    .querySelectorAll(".nav-link[data-page],.mob-link[data-page]")
    .forEach((el) => {
      el.addEventListener("click", () => {
        navTo(el.dataset.page);
        closeMobMenu();
      });
    });

  $("burgerBtn").addEventListener("click", () => {
    const open = $("mobMenu").classList.toggle("open");
    $("mobOverlay").classList.toggle("show", open);
    $("burgerBtn").classList.toggle("open", open);
  });

  $("mobOverlay").addEventListener("click", closeMobMenu);

  $("walletBtn").addEventListener("click", () => {
    if (S.account) openModal("wdWrap");
    else connectWallet();
  });

  $("closeWdModal").addEventListener("click", () => closeModal("wdWrap"));
  $("disconnectBtn").addEventListener("click", disconnectWallet);
  $("closeTokModal").addEventListener("click", closeTokModal);

  $("tokSearch").addEventListener("input", (e) => {
    const v = e.target.value;
    $("clearSearch").style.display = v ? "" : "none";
    renderTokList(v);
  });

  $("clearSearch").addEventListener("click", () => {
    $("tokSearch").value = "";
    $("clearSearch").style.display = "none";
    renderTokList("");
  });

  $("manageBtn").addEventListener("click", () => {
    closeTokModal();
    renderCustomToks();
    openModal("manageMWrap");
  });

  $("pickIn").addEventListener("click", () => openTokModal("in"));
  $("pickOut").addEventListener("click", () => openTokModal("out"));

  $("flipBtn").addEventListener("click", () => {
    const tmp = S.tIn;
    S.tIn = S.tOut;
    S.tOut = tmp;
    updateInUI();
    updateOutUI();
    const v = $("amountOut").value;
    $("amountIn").value = v || "";
    $("amountOut").value = "";
    getQuote();
    refreshBals();
  });

  $("amountIn").addEventListener("input", () => {
    clearTimeout(S.quoteTimer);
    S.quoteTimer = setTimeout(getQuote, 500);
  });

  document.querySelectorAll(".pct[data-p]").forEach((b) => {
    b.addEventListener("click", async () => {
      if (!S.account || !S.tIn) return;
      const pct = parseInt(b.dataset.p);
      const amount = await getMaxInputAmount(S.tIn, pct);
      if (pct === 100 && S.tIn.isNative && amount <= 0n) {
        toast(
          "Saldo RIC terlalu kecil untuk menyisakan biaya gas.",
          "warn",
          5000,
        );
        $("amountIn").value = "";
        $("amountOut").value = "";
        updateSwapBtn();
        return;
      }
      // MAX must preserve the token's full on-chain precision; fmt() is
      // intentionally display-rounded and can silently reduce the amount.
      $("amountIn").value = fmtExact(amount, S.tIn.decimals);
      await getQuote();
    });
  });

  $("refreshBtn").addEventListener("click", () => {
    $("refreshBtn").classList.add("spin");
    getQuote().finally(() =>
      setTimeout(() => $("refreshBtn").classList.remove("spin"), 600),
    );
  });

  $("settingsBtn").addEventListener("click", () =>
    $("settPanel").classList.toggle("open"),
  );

  document.querySelectorAll(".slip-b[data-s]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll(".slip-b[data-s]")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.slippage = parseFloat(b.dataset.s);
      updateDexInfoUI();
      $("customSlip").value = "";
      save("slip", S.slippage);
    });
  });

  $("customSlip").addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    if (v > 0 && v <= 50) {
      S.slippage = v;
      document
        .querySelectorAll(".slip-b[data-s]")
        .forEach((b) => b.classList.remove("active"));
      updateDexInfoUI();
      save("slip", S.slippage);
    }
  });

  updateDexInfoUI();

  $("txDeadline").value = S.deadline;
  $("txDeadline").addEventListener("input", (e) => {
    S.deadline = parseInt(e.target.value) || 20;
    save("ddl", S.deadline);
  });

  $("clearTxs").addEventListener("click", () => {
    S.txns = [];
    save("txns", S.txns);
    renderTxns();
  });

  $("liqPickA").addEventListener("click", () => openTokModal("liqA"));
  $("liqPickB").addEventListener("click", () => openTokModal("liqB"));
  $("liqPickA2").addEventListener("click", () => openTokModal("liqA"));
  $("liqPickB2").addEventListener("click", () => openTokModal("liqB"));

  $("liqAmtA").addEventListener("input", () => {
    clearTimeout(S.quoteTimer);
    S.quoteTimer = setTimeout(onLiqAmtAChange, 500);
  });

  $("liqAmtB").addEventListener("input", () => {
    updateAddLiqBtn();
    checkLiqApprovals();
  });

  $("liqSettBtn").addEventListener("click", () =>
    $("liqSettPanel").classList.toggle("open"),
  );

  document.querySelectorAll(".slip-b[data-ls]").forEach((b) => {
    b.addEventListener("click", () => {
      document
        .querySelectorAll(".slip-b[data-ls]")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      S.liqSlippage = parseFloat(b.dataset.ls);
    });
  });

  $("liqBalA").addEventListener("click", async () => {
    if (!S.account || !S.liqA) return;
    const b = await getBal(S.liqA, S.account).catch(() => 0n);
    $("liqAmtA").value = fmt(b, S.liqA.decimals, 8);
    onLiqAmtAChange();
  });

  $("liqBalB").addEventListener("click", async () => {
    if (!S.account || !S.liqB) return;
    const b = await getBal(S.liqB, S.account).catch(() => 0n);
    $("liqAmtB").value = fmt(b, S.liqB.decimals, 8);
    updateAddLiqBtn();
  });

  $("goAddLiqBtn").addEventListener("click", () => navTo("liquidity"));

  $("refreshPoolBtn").addEventListener("click", () => {
    $("refreshPoolBtn").classList.add("spin");
    loadPositions().finally(() =>
      setTimeout(() => $("refreshPoolBtn").classList.remove("spin"), 800),
    );
  });

  $("importPoolBtn").addEventListener("click", () => openModal("importMWrap"));
  $("closeRemoveM").addEventListener("click", () => closeModal("removeMWrap"));

  $("rmSlider").addEventListener("input", (e) =>
    updateRemoveOutput(parseInt(e.target.value)),
  );

  document.querySelectorAll(".pct[data-rp]").forEach((b) => {
    b.addEventListener("click", () => {
      const pct = parseInt(b.dataset.rp);
      $("rmSlider").value = pct;
      updateRemoveOutput(pct);
    });
  });

  $("closeImportM").addEventListener("click", () => closeModal("importMWrap"));
  $("importPickA").addEventListener("click", () => openTokModal("importA"));
  $("importPickB").addEventListener("click", () => openTokModal("importB"));

  $("confirmImportBtn").addEventListener("click", () => {
    if (S.importA && S.importB) {
      toast(`Pool ${S.importA.symbol}/${S.importB.symbol} imported!`, "ok");
      closeModal("importMWrap");
      loadPositions();
    }
  });

  $("closeManageM").addEventListener("click", () => closeModal("manageMWrap"));

  let customTimer;
  $("customAddr").addEventListener("input", (e) => {
    clearTimeout(customTimer);
    customTimer = setTimeout(() => fetchCustomPreview(e.target.value), 600);
  });

  $("importCustomBtn").addEventListener("click", async () => {
    const addr = $("customAddr").value.trim();
    if (!addr.startsWith("0x") || addr.length !== 42) {
      toast("Enter a valid contract address.", "err");
      return;
    }
    if (addr.toLowerCase() === CHAIN().WNATIVE.toLowerCase()) {
      toast(`${CHAIN().WNATIVE_SYMBOL} is already a built-in token.`, "warn");
      return;
    }
    const t = await fetchCustomPreview(addr);
    if (!t) {
      toast("Cannot fetch token. Check address.", "err");
      return;
    }
    if (
      S.customTokens.find((x) => x.address.toLowerCase() === addr.toLowerCase())
    ) {
      toast("Already added.", "warn");
      return;
    }
    if (
      S.allTokens.find((x) => x.address.toLowerCase() === addr.toLowerCase())
    ) {
      toast("Already in list.", "warn");
      return;
    }
    S.customTokens.push(t);
    S.allTokens.push(t);
    save("custom", S.customTokens);
    toast(`${t.symbol} added!`, "ok");
    $("customAddr").value = "";
    $("customPreview").classList.add("hidden");
    renderCustomToks();
  });

  document.querySelectorAll(".modal-wrap").forEach((w) => {
    w.addEventListener("click", (e) => {
      if (e.target === w) {
        w.classList.remove("open");
        S.modalCtx = null;
      }
    });
  });

  // ========== REOWN APPKIT WALLET EVENTS ==========
  const syncReownWallet = async (detail = {}) => {
    const seq = ++S.walletSyncSeq;
    const provider = detail.provider || getWalletProvider();
    if (!provider) {
      S.provider = null;
      S.signer = null;
      S.account = null;
      S.chainOk = false;
      updateWalletUI();
      updateSwapBtn();
      updateAddLiqBtn();
      return;
    }
    try {
      const accounts = await provider.request({ method: "eth_accounts" });
      const account = detail.address || accounts?.[0] || null;
      const chainHex =
        detail.chainId != null
          ? typeof detail.chainId === "string"
            ? detail.chainId
            : "0x" + Number(detail.chainId).toString(16)
          : await provider.request({ method: "eth_chainId" });
      if (seq !== S.walletSyncSeq) return;
      if (!account) {
        S.provider = null;
        S.signer = null;
        S.account = null;
        S.chainOk = false;
        updateWalletUI();
        updateSwapBtn();
        updateAddLiqBtn();
        return;
      }
      const chainId = parseInt(String(chainHex), 16);
      S.provider = new ethers.BrowserProvider(provider);
      S.signer = await S.provider.getSigner();
      S.account = account;
      S.chainOk = chainId === CHAIN_CONFIG.id;
      updateWalletUI();
      updateSwapBtn();
      updateAddLiqBtn();
      await refreshBals();
      if (S.chainOk) {
        await updateWdBal();
        if (document.getElementById("page-pool")?.classList.contains("active"))
          await loadPositions();
      }
      if (!S.chainOk)
        toast(
          "Wallet terhubung, tetapi jaringan wallet harus Riche Chain (RICHE).",
          "warn",
          7000,
        );
    } catch (e) {
      console.warn("Reown wallet sync failed:", e);
    }
  };

  window.addEventListener("receh:appkit-wallet", (e) => {
    void syncReownWallet(e.detail || {});
  });

  const bridge = window.__RECEH_REOWN__;
  const initialReownProvider = await bridge?.sync?.();
  if (initialReownProvider)
    await syncReownWallet({ provider: initialReownProvider });

  // Browser history is intentionally untouched by the DEX UI.
});
