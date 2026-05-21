export type RouteFilter = "all" | "fastest" | "cheapest";

export type MockTransitRoute = {
  id: string;
  transfers: number;
  estimatedMinutes: number;
  farePhp: number;
  /** For simple filter demo */
  tags: RouteFilter[];
  summary: string;
};

/** Placeholder routes for the current map area until a real transit API is wired. */
export const MOCK_TRANSIT_ROUTES: MockTransitRoute[] = [
  {
    id: "1",
    transfers: 1,
    estimatedMinutes: 28,
    farePhp: 55,
    tags: ["all", "cheapest"],
    summary: "Jeepney + MRT",
  },
  {
    id: "2",
    transfers: 0,
    estimatedMinutes: 18,
    farePhp: 85,
    tags: ["all", "fastest"],
    summary: "Direct bus",
  },
  {
    id: "3",
    transfers: 2,
    estimatedMinutes: 35,
    farePhp: 48,
    tags: ["all", "cheapest"],
    summary: "2 jeepney hops",
  },
  {
    id: "4",
    transfers: 1,
    estimatedMinutes: 22,
    farePhp: 72,
    tags: ["all", "fastest"],
    summary: "Bus + walk",
  },
];

export function filterMockRoutes(
  routes: MockTransitRoute[],
  filter: RouteFilter
): MockTransitRoute[] {
  if (filter === "all") return routes;
  if (filter === "fastest") {
    return [...routes].sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);
  }
  return [...routes].sort((a, b) => a.farePhp - b.farePhp);
}
