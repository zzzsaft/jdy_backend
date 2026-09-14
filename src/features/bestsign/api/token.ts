/** Provider tokens are held exclusively by Connect. */
export const bestSignToken = {
  async get_token(_forceRefresh = false): Promise<never> { throw new Error("Provider tokens are managed by Connect"); },
  invalidateToken() {},
};
