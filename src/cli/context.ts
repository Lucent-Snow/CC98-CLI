import { Cc98Client } from "../api/client.js";
import { TokenStore } from "../storage/token-store.js";

export function createCliContext(options: { account?: string } = {}): { client: Cc98Client; tokenStore: TokenStore } {
  const tokenStore = new TokenStore().withAccount(options.account);
  const client = new Cc98Client({ tokenStore });
  return { client, tokenStore };
}
