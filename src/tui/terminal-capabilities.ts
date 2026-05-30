// Terminal capability detection for inline image protocols

export type ImageProtocol = "iterm2" | "kitty" | "sixel" | "none";

export interface TerminalCapabilities {
  imageProtocol: ImageProtocol;
  termProgram: string;
  term: string;
  tmux: boolean;
  passthrough: boolean;
}

let cached: TerminalCapabilities | undefined;

/**
 * Detect terminal capabilities (cached after first call)
 * 
 * Note for tmux users: To enable inline images in tmux, add to ~/.tmux.conf:
 *   set -g allow-passthrough on
 */
export function detectTerminalCapabilities(): TerminalCapabilities {
  if (cached) return cached;

  const termProgram = (process.env.TERM_PROGRAM ?? "").toLowerCase();
  const term = (process.env.TERM ?? "").toLowerCase();
  const tmux = process.env.TMUX !== undefined || termProgram === "tmux" || term.startsWith("tmux");
  const passthrough = tmux;

  let imageProtocol: ImageProtocol = "none";

  if (
    termProgram === "kitty" ||
    termProgram === "ghostty" ||
    process.env.KITTY_WINDOW_ID !== undefined
  ) {
    imageProtocol = "kitty";
  }
  // 2. iTerm2 (also check ITERM_SESSION_ID for tmux passthrough)
  else if (
    termProgram === "iterm.app" ||
    process.env.ITERM_SESSION_ID !== undefined
  ) {
    imageProtocol = "iterm2";
  }
  // 3. WezTerm (supports both iTerm2 and Kitty, prefer iTerm2 for simplicity)
  else if (
    termProgram === "wezterm" ||
    process.env.WEZTERM_PANE !== undefined
  ) {
    imageProtocol = "iterm2";
  }
  // 4. Tabby, Hyper (supports iTerm2 protocol)
  else if (termProgram === "tabby" || termProgram === "hyper") {
    imageProtocol = "iterm2";
  }
  else if (termProgram === "foot" || term === "foot" || term.includes("sixel")) {
    imageProtocol = "sixel";
  }

  cached = { imageProtocol, termProgram, term, tmux, passthrough };
  return cached;
}

/**
 * Check if terminal supports inline images
 */
export function supportsInlineImages(): boolean {
  const protocol = detectTerminalCapabilities().imageProtocol;
  return protocol === "iterm2" || protocol === "kitty" || protocol === "sixel";
}

/**
 * Get the detected image protocol
 */
export function getImageProtocol(): ImageProtocol {
  return detectTerminalCapabilities().imageProtocol;
}
