import type { NetAdapter } from "../net/adapterTypes";
import type { ChatChannel } from "../sim/events";

export interface ChatPanel {
  setChannel(channel: ChatChannel): void;
  append(channel: ChatChannel, displayName: string, text: string): void;
  toggle(): void;
  readonly open: boolean;
  dispose(): void;
}

const CHANNELS: { id: ChatChannel; label: string }[] = [
  { id: "group", label: "Group" },
  { id: "system", label: "System" },
  { id: "nearby", label: "Nearby" },
  { id: "global", label: "Global" },
];

export function createChatPanel(net: NetAdapter): ChatPanel {
  let open = false;
  let channel: ChatChannel = "system";

  const root = document.createElement("div");
  root.className =
    "fixed bottom-24 left-4 z-40 flex w-80 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b0f18]/92 font-sans text-[#f4f1e8] shadow-lg backdrop-blur-md";
  root.style.display = "none";

  const tabs = document.createElement("div");
  tabs.className = "flex shrink-0 border-b border-white/10";
  const tabBtns = new Map<ChatChannel, HTMLButtonElement>();

  const log = document.createElement("div");
  log.className = "flex max-h-48 min-h-[120px] flex-col gap-1 overflow-y-auto px-3 py-2 text-xs";

  const form = document.createElement("form");
  form.className = "flex shrink-0 gap-2 border-t border-white/10 p-2";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 280;
  input.placeholder = "Message…";
  input.className =
    "min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-[#f4f1e8] outline-none focus:border-[#e8623a]/50";
  const sendBtn = document.createElement("button");
  sendBtn.type = "submit";
  sendBtn.textContent = "Send";
  sendBtn.className =
    "shrink-0 rounded-lg bg-[#e8623a] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white";
  form.append(input, sendBtn);

  root.append(tabs, log, form);
  document.body.appendChild(root);

  const renderTabs = () => {
    for (const ch of CHANNELS) {
      let btn = tabBtns.get(ch.id);
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = ch.label;
        btn.className = "flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-[#f4f1e8]/45";
        btn.addEventListener("click", () => setChannel(ch.id));
        tabs.appendChild(btn);
        tabBtns.set(ch.id, btn);
      }
      btn.className = ch.id === channel
        ? "flex-1 border-b-2 border-[#e8623a] bg-white/[0.04] px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-[#f4f1e8]"
        : "flex-1 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-[#f4f1e8]/45 hover:text-[#f4f1e8]/70";
    }
  };

  const renderLog = () => {
    log.innerHTML = "";
    for (const entry of net.getChatLog(channel).slice(-40)) {
      const row = document.createElement("div");
      row.innerHTML = `<span class="font-semibold text-[#e8623a]">${entry.displayName}</span> ${entry.text}`;
      log.appendChild(row);
    }
    log.scrollTop = log.scrollHeight;
  };

  const setChannel = (ch: ChatChannel) => {
    channel = ch;
    renderTabs();
    renderLog();
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    await net.requestEvent({ type: "chat.send", channel, text });
    renderLog();
  });

  net.onEvent((ev) => {
    if (ev.type === "chat.message") append(ev.channel, ev.displayName, ev.text);
  });

  const append = (ch: ChatChannel, displayName: string, text: string) => {
    if (ch === channel) {
      const row = document.createElement("div");
      row.innerHTML = `<span class="font-semibold text-[#e8623a]">${displayName}</span> ${text}`;
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    }
  };

  const toggle = () => {
    open = !open;
    root.style.display = open ? "flex" : "none";
    if (open) renderLog();
  };

  window.addEventListener("keydown", (e) => {
    if (e.code === "Enter" && e.shiftKey) {
      e.preventDefault();
      toggle();
    }
  });

  renderTabs();

  return {
    setChannel,
    append,
    toggle,
    get open() { return open; },
    dispose: () => root.remove(),
  };
}
