import type { OrbitElements } from "./planets/types";

export const STATION_NAME = "Meridian Station";
export const STATION_RADIUS = 60;
export const DOCK_BAY_COUNT = 4;

export const STATION_ORBIT: OrbitElements = {
  semiMajorAxis: 52000,
  eccentricity: 0.03,
  periodSeconds: 7400,
  inclinationDeg: 2,
  argPeriapsisDeg: 60,
  initialMeanAnomalyDeg: 12,
};
