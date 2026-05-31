/** Port for Redis health/queue/cache access (ports & adapters, §14.5). */
export interface RedisPort {
  ping(): Promise<boolean>;
}
