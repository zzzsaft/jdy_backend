// Legacy import compatibility: provider credentials and tokens are owned by Connect.
export const dahua_token = {
  async get_token(): Promise<string> {
    throw new Error("Dahua authentication is managed by Connect");
  },
};
