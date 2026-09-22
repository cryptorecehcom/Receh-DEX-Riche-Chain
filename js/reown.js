import { createAppKit } from "@reown/appkit";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { defineChain } from "@reown/appkit/networks";

const projectId =
  import.meta.env.VITE_REOWN_PROJECT_ID || "f75e0c5fbfa5a4349b83c28145f6d7dd";

const riche = defineChain({
  id: 132026,
  caipNetworkId: "eip155:132026",
  chainNamespace: "eip155",
  name: "Riche Chain",
  nativeCurrency: { name: "RIC", symbol: "RIC", decimals: 18 },
  rpcUrls: { default: { http: ["https://seed-richechain.com/"] } },
  blockExplorers: {
    default: { name: "RicheScan", url: "https://richescan.com" },
  },
});

const isLocalDev =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [riche],
  defaultNetwork: riche,
  projectId,
  metadata: {
    name: "RECEH DEX",
    description:
      "Aplikasi tukar token dan likuiditas terdesentralisasi di Riche Chain",
    url: isLocalDev ? window.location.origin : "https://receh.web.id/dex/",
    icons: ["https://receh.web.id/favicon.png"],
  },
  chainImages: {
    132026:
      "https://raw.githubusercontent.com/recehdex/token-logo/refs/heads/main/WRIC.webp",
  },
  enableNetworkSwitch: true,
  enableReconnect: true,
  enableMobileFullScreen: true,
  // Prefer universal links on mobile so WalletConnect handoff uses the wallet's verified app link.
  experimental_preferUniversalLinks: true,
  features: { analytics: false, email: false, socials: [] },
});

let lastProvider = null;
let lastAddress = null;
let lastChainId = 132026;

function getProvider() {
  try {
    const p =
      appKit.getWalletProvider?.() ||
      appKit.getProviders?.()?.eip155 ||
      lastProvider ||
      null;
    if (p) lastProvider = p;
    return p;
  } catch {
    return lastProvider;
  }
}
function getAddress() {
  try {
    return appKit.getAddress?.() || lastAddress || null;
  } catch {
    return lastAddress;
  }
}
function getChainId() {
  try {
    return appKit.getChainId?.() || lastChainId || null;
  } catch {
    return lastChainId;
  }
}

async function sync(state = {}) {
  const provider =
    state?.isConnected === false ? null : state?.provider || getProvider();
  if (!provider) {
    lastProvider = null;
    lastAddress = null;
    window.dispatchEvent(
      new CustomEvent("receh:appkit-wallet", {
        detail: {
          provider: null,
          address: null,
          chainId: null,
          isConnected: false,
        },
      }),
    );
    return null;
  }
  let address = state?.address || getAddress() || null;
  let chainId = state?.chainId ?? getChainId() ?? null;
  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    if (!address) address = accounts?.[0] || null;
  } catch {}
  try {
    const chainHex = await provider.request({ method: "eth_chainId" });
    chainId = parseInt(String(chainHex), 16);
  } catch {}
  lastProvider = provider;
  lastAddress = address;
  lastChainId = Number(chainId) || 132026;
  const isConnected = Boolean(address);
  window.dispatchEvent(
    new CustomEvent("receh:appkit-wallet", {
      detail: { provider, address, chainId: lastChainId, isConnected },
    }),
  );
  return provider;
}

async function disconnect() {
  try {
    await appKit.disconnect?.();
  } catch (e) {
    console.warn("AppKit disconnect failed:", e);
  }
  lastProvider = null;
  lastAddress = null;
  window.dispatchEvent(
    new CustomEvent("receh:appkit-wallet", {
      detail: {
        provider: null,
        address: null,
        chainId: null,
        isConnected: false,
      },
    }),
  );
}

try {
  appKit.subscribeProvider?.(sync);
} catch (e) {
  console.warn("AppKit provider subscription unavailable:", e);
}
try {
  appKit.subscribeProviders?.((providers = {}) => {
    const provider = providers?.eip155 || null;
    void sync({ provider, isConnected: Boolean(provider) });
  });
} catch (e) {
  console.warn("AppKit providers subscription unavailable:", e);
}

window.__RECEH_REOWN__ = {
  appKit,
  getProvider,
  getAddress,
  getChainId,
  getNetwork: () => riche,
  switchNetwork: async () => {
    if (typeof appKit.switchNetwork !== "function")
      throw new Error("Reown network switching is unavailable.");
    return appKit.switchNetwork(riche);
  },
  open: () => appKit.open({ view: "Connect" }),
  disconnect,
  sync,
};

queueMicrotask(() => {
  void sync();
});
