import { Cc98Client } from "../api/client.js";
import type { WebVpnOptions } from "../api/types.js";
import { TokenStore } from "../storage/token-store.js";
import { VpnStore } from "../storage/vpn-store.js";

export async function createCliContext(options: { account?: string } = {}): Promise<{ client: Cc98Client; tokenStore: TokenStore }> {
  const tokenStore = new TokenStore().withAccount(options.account);
  const vpnConfig = await new VpnStore().getConfig();
  const webVpn = getWebVpnOptions(vpnConfig);
  const client = new Cc98Client({ tokenStore, webVpn });
  if (webVpn) {
    await client.initWebVpn();
  }
  return { client, tokenStore };
}

function getWebVpnOptions(config: Awaited<ReturnType<VpnStore["getConfig"]>>): WebVpnOptions | undefined {
  if (config.mode === "direct") {
    return { mode: "direct" };
  }
  if (config.mode === "vpn" || config.cookies) {
    return {
      mode: config.mode,
      cookies: config.cookies,
    };
  }
  return undefined;
}
