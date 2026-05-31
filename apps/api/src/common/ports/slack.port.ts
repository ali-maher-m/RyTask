/** Slack egress port (§8). M3 wires the real Slack adapter (OAuth, signature verify). */
export interface SlackPort {
  postMessage(channel: string, text: string): Promise<void>;
}

export const noopSlack: SlackPort = {
  async postMessage(channel: string, text: string): Promise<void> {
    console.log(`[slack:noop] ${channel}: ${text}`);
  },
};
