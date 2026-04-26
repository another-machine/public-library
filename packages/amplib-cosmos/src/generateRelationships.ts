import { AllPlanetPositions, angularSeparation } from "./generateCoordinates";
import { createNumberValue, formatWithUnits, NumberValue } from "./utilities";

const DEG = Math.PI / 180;

export interface Relationships {
  /** Moon-Sun phase angle (0-360°): 0=new moon, 180=full moon */
  moonSunPhaseAngle: NumberValue;
  /** Angular separations between key planet pairs (degrees, 0-180) */
  aspects: {
    jupiterSaturn: NumberValue;
    venusJupiter: NumberValue;
    marsSaturn: NumberValue;
    mercuryVenus: NumberValue;
    marsJupiter: NumberValue;
  };
}

export function generateRelationships(
  allPositions: AllPlanetPositions,
  moonSunPhaseAngleDeg: number
): Relationships {
  const planets = allPositions.planets;

  // moonSunPhaseAngleDeg is already the Moon-Sun phase angle (0-360°, 0=new, 180=full)
  const phaseAngle = ((moonSunPhaseAngleDeg % 360) + 360) % 360;

  function separation(a: string, b: string): number {
    const posA = planets[a];
    const posB = planets[b];
    if (!posA || !posB) return 0;
    return angularSeparation(posA, posB);
  }

  function aspectValue(
    a: string,
    b: string,
    description: string
  ): NumberValue {
    const sep = separation(a, b);
    return createNumberValue({
      value: sep,
      unitRange: sep / 180,
      description: `${description}: ${formatWithUnits(sep, "degrees")}`,
    });
  }

  return {
    moonSunPhaseAngle: createNumberValue({
      value: phaseAngle,
      unitRange: phaseAngle / 360,
      bipolarRange: Math.cos(phaseAngle * DEG), // +1 at new/full, -1 at quarters
      description: `Moon-Sun phase angle: ${formatWithUnits(phaseAngle, "degrees")} (0=new, 180=full)`,
    }),
    aspects: {
      jupiterSaturn: aspectValue(
        "jupiter",
        "saturn",
        "Jupiter-Saturn angular separation"
      ),
      venusJupiter: aspectValue(
        "venus",
        "jupiter",
        "Venus-Jupiter angular separation"
      ),
      marsSaturn: aspectValue(
        "mars",
        "saturn",
        "Mars-Saturn angular separation"
      ),
      mercuryVenus: aspectValue(
        "mercury",
        "venus",
        "Mercury-Venus angular separation"
      ),
      marsJupiter: aspectValue(
        "mars",
        "jupiter",
        "Mars-Jupiter angular separation"
      ),
    },
  };
}
