import { generateEarth } from "./generateEarth";
import { generateMoon } from "./generateMoon";
import { generateObserver } from "./generateObserver";
import { generatePlanets } from "./generatePlanets";
import { generateSun } from "./generateSun";

export function generate({
  latitude = 0,
  longitude = 0,
  timestamp = Date.now(),
}: {
  latitude: number;
  longitude: number;
  timestamp: number;
}) {
  return {
    observer: generateObserver({ timestamp, latitude, longitude }),
    earth: generateEarth({ timestamp, latitude }),
    moon: generateMoon({ timestamp, latitude, longitude }),
    sun: generateSun({ timestamp, latitude, longitude }),
    planets: generatePlanets({ timestamp, latitude, longitude }),
  };
}
