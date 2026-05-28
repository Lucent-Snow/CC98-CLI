import { createCipheriv } from "node:crypto";

// WebVPN 配置
const WEBVPN_BASE = "https://webvpn.zju.edu.cn";
const MIRROR_URL = "https://mirrors.zju.edu.cn/api/is_campus_network";

// 加密密钥（来自 CC98-Desktop）
const URL_KEY = "wrdvpnisthebest!";  // 用于 URL 转换
const PWD_KEY = "wrdvpnisawesome!";   // 用于密码加密

export interface WebVpnLoginResult {
  success: boolean;
  message?: string;
  needCaptcha?: boolean;
  needConfirm?: boolean;
  captchaId?: string;
}

export interface WebVpnStatus {
  enabled: boolean;
  loggedIn: boolean;
  inCampusNetwork?: boolean;
}

export class WebVpnService {
  private cookies: Map<string, string> = new Map();
  private _loggedIn = false;
  private _enabled = false;

  constructor(cookies?: Record<string, string>) {
    if (cookies) {
      this.loadCookies(cookies);
    }
  }

  get isLoggedIn(): boolean {
    return this._loggedIn;
  }

  get isEnabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

  loadCookies(cookies: Record<string, string>): void {
    this.cookies.clear();
    for (const [name, value] of Object.entries(cookies)) {
      if (name && value) {
        this.cookies.set(name, value);
      }
    }
    this._loggedIn = this.cookies.size > 0;
  }

  getCookies(): Record<string, string> {
    return Object.fromEntries(this.cookies.entries());
  }

  /**
   * 检查是否在校园网内
   */
  async checkNetwork(): Promise<boolean> {
    try {
      const response = await fetch(MIRROR_URL, {
        headers: {
          "User-Agent": this.userAgent,
        },
      });
      const text = await response.text();
      return text === "1" || text === "2";
    } catch {
      return false;
    }
  }

  /**
   * WebVPN 登录
   */
  async login(username: string, password: string): Promise<WebVpnLoginResult> {
    try {
      // 1. 获取登录页面，提取 CSRF token
      const loginPage = await this.get(`${WEBVPN_BASE}/login`);
      const html = await loginPage.text();
      const { csrf, captchaId } = this.parseLoginPage(html);

      if (!csrf) {
        return { success: false, message: "获取 CSRF token 失败" };
      }

      // 2. 加密密码
      const encryptedPassword = this.buildPassword(PWD_KEY, password);

      // 3. 提交登录
      const formData = new URLSearchParams({
        _csrf: csrf,
        auth_type: "local",
        sms_code: "",
        captcha: "",
        needCaptcha: "false",
        captcha_id: captchaId || "",
        username,
        password: encryptedPassword,
      });

      const loginResponse = await this.post(`${WEBVPN_BASE}/do-login`, formData.toString(), {
        "Content-Type": "application/x-www-form-urlencoded",
      });

      const result = await loginResponse.json() as Record<string, unknown>;

      if (result.success) {
        this._loggedIn = true;
        return { success: true };
      }

      if (result.error === "NEED_CONFIRM") {
        return { success: false, needConfirm: true, message: "需要确认登录" };
      }

      if (result.error === "CAPTCHA_FAILED") {
        return { success: false, needCaptcha: true, captchaId: String(result.description || ""), message: "需要验证码" };
      }

      return { success: false, message: String(result.message || result.error || "登录失败") };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "登录出错" };
    }
  }

  /**
   * 确认登录（用于多设备确认）
   */
  async confirmLogin(): Promise<WebVpnLoginResult> {
    try {
      const response = await this.post(`${WEBVPN_BASE}/do-confirm-login`, "");
      const result = await response.json() as Record<string, unknown>;

      if (result.success) {
        this._loggedIn = true;
        return { success: true };
      }

      return { success: false, message: String(result.error || "确认失败") };
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : "确认出错" };
    }
  }

  /**
   * 注销
   */
  async logout(): Promise<void> {
    try {
      await this.get(`${WEBVPN_BASE}/logout`);
      this._loggedIn = false;
      this.cookies.clear();
    } catch {
      // 忽略错误
    }
  }

  /**
   * 将普通 URL 转换为 WebVPN URL
   */
  convertUrl(url: string): string {
    const uri = new URL(url);
    if (uri.origin === WEBVPN_BASE) {
      return url;
    }
    const scheme = uri.protocol.slice(0, -1); // "https:" → "https"
    const host = uri.hostname;
    const port = uri.port ? parseInt(uri.port) : 0;

    // 处理协议和端口
    const isSpecialPort = port > 0 &&
      !(scheme === "http" && port === 80) &&
      !(scheme === "https" && port === 443);

    const property = isSpecialPort ? `${scheme}-${port}` : scheme;

    // 加密 host
    const encryptedHost = this.buildPassword(URL_KEY, host);

    // 构建 WebVPN URL
    const pathSegments = [property, encryptedHost];
    const path = pathSegments.map(s => encodeURIComponent(s)).join("/");

    // 保留原始路径和查询参数
    const pathname = uri.pathname;
    const search = uri.search;

    return `${WEBVPN_BASE}/${path}${pathname}${search}`;
  }

  /**
   * 发送请求（自动处理 WebVPN URL 转换）
   */
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    return this.fetchWithRedirects(url, options, 0);
  }

  private async fetchWithRedirects(url: string, options: RequestInit, redirectCount: number): Promise<Response> {
    if (redirectCount > 10) {
      throw new Error("too many WebVPN redirects");
    }

    const targetUrl = this._enabled ? this.convertUrl(url) : url;
    const headers = new Headers(this.getHeaders());
    for (const [name, value] of new Headers(options.headers).entries()) {
      headers.set(name, value);
    }

    const response = await fetch(targetUrl, {
      ...options,
      headers,
      redirect: "manual",
    });

    // 处理重定向，手动跟踪以保留 cookies
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        this.updateCookies(response);
        const nextUrl = new URL(location, response.url || targetUrl).toString();
        return this.fetchWithRedirects(nextUrl, redirectOptions(options, response.status), redirectCount + 1);
      }
    }

    this.updateCookies(response);
    return response;
  }

  /**
   * 获取状态
   */
  getStatus(): WebVpnStatus {
    return {
      enabled: this._enabled,
      loggedIn: this._loggedIn,
    };
  }

  // ========== 私有方法 ==========

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgent,
      "Referer": WEBVPN_BASE,
    };

    // 添加 cookies
    if (this.cookies.size > 0) {
      const cookieStr = Array.from(this.cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
      headers["Cookie"] = cookieStr;
    }

    return headers;
  }

  private updateCookies(response: Response): void {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = headers.getSetCookie?.() || splitSetCookieHeader(headers.get("set-cookie"));
    for (const cookie of setCookies) {
      const [nameValue] = cookie.split(";");
      if (nameValue) {
        const separator = nameValue.indexOf("=");
        if (separator < 1) continue;
        const name = nameValue.slice(0, separator);
        const value = nameValue.slice(separator + 1);
        if (name && value) {
          this.cookies.set(name.trim(), value.trim());
        }
      }
    }
  }

  private get userAgent(): string {
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  }

  private async get(url: string): Promise<Response> {
    return this.fetch(url, { method: "GET" });
  }

  private async post(url: string, body: string, headers?: Record<string, string>): Promise<Response> {
    return this.fetch(url, {
      method: "POST",
      body,
      headers: headers || {},
    });
  }

  private parseLoginPage(html: string): { csrf: string; captchaId: string } {
    const csrfMatch = html.match(/name="_csrf"[^>]*value="([^"]+)"/);
    const captchaMatch = html.match(/name="captcha_id"[^>]*value="([^"]+)"/);

    return {
      csrf: csrfMatch?.[1] || "",
      captchaId: captchaMatch?.[1] || "",
    };
  }

  /**
   * AES-CFB 加密（与 CC98-Desktop 兼容）
   */
  private aesEncrypt(plaintext: string, key: string, iv: string): string {
    const keyBuffer = Buffer.from(key.padEnd(16, " ").slice(0, 16));
    const ivBuffer = Buffer.from(iv.padEnd(16, " ").slice(0, 16));

    // 补零到 16 字节倍数
    const plainBytes = Buffer.from(plaintext, "utf8");
    const padLen = 16 - (plainBytes.length % 16);
    const padded = padLen === 16 ? plainBytes : Buffer.concat([plainBytes, Buffer.alloc(padLen)]);

    const cipher = createCipheriv("aes-128-cfb", keyBuffer, ivBuffer, {
      // @ts-expect-error Node.js CFB 模式需要设置 segmentSize
      segmentSize: 128,
    });
    cipher.setAutoPadding(false);

    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
    return encrypted.toString("hex").toLowerCase();
  }

  /**
   * 构建加密密码（与 CC98-Desktop BuildPassword 兼容）
   */
  private buildPassword(prefix: string, plaintext: string): string {
    // 前缀转 ASCII hex
    const prefixHex = Buffer.from(prefix, "ascii").toString("hex");

    // 加密
    const fullEncrypted = this.aesEncrypt(plaintext, prefix, prefix);

    // 截取：2 * plaintext.length
    const sliceLength = 2 * plaintext.length;
    const encrypted = fullEncrypted.slice(0, Math.min(fullEncrypted.length, sliceLength));

    return prefixHex + encrypted;
  }
}

function splitSetCookieHeader(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]*)/);
}

function redirectOptions(options: RequestInit, status: number): RequestInit {
  const method = options.method?.toUpperCase();
  if ((status === 301 || status === 302 || status === 303) && method && method !== "GET" && method !== "HEAD") {
    const headers = new Headers(options.headers);
    headers.delete("content-type");
    headers.delete("content-length");
    return {
      ...options,
      method: "GET",
      body: undefined,
      headers,
    };
  }
  return options;
}

// 单例
let defaultService: WebVpnService | undefined;

export function getWebVpnService(): WebVpnService {
  if (!defaultService) {
    defaultService = new WebVpnService();
  }
  return defaultService;
}
