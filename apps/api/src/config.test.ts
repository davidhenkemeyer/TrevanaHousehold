import { describe, expect, it } from "vitest";
import { lanRank } from "./config.js";

describe("lanRank (which address phones use to reach local photo storage)", () => {
  it("prefers home network ranges and skips VPN addresses", () => {
    const addresses = ["100.89.75.7", "172.30.128.1", "192.168.86.64", "10.0.0.5"];
    const best = addresses.filter((a) => lanRank(a) > 0).sort((a, b) => lanRank(b) - lanRank(a));
    expect(best).toEqual(["192.168.86.64", "10.0.0.5", "172.30.128.1"]);
    expect(lanRank("100.89.75.7")).toBe(0);
    expect(lanRank("172.15.0.1")).toBe(0);
  });
});
