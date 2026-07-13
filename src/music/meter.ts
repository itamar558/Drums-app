/** A supported time signature and how it maps onto our 16th-note step grid. */
export interface MeterOption {
  id: string;
  label: string;
  numerator: number;
  denominator: number;
  /** Total 16th-note slots in one bar of this meter. */
  stepsPerBar: number;
  /** 16th-note length of each felt pulse in the bar (used for the metronome/count-in), summing to stepsPerBar. */
  pulseGroups: number[];
  /** Value to assign to Tone.Transport.timeSignature (quarter-note-equivalent beats per bar). */
  transportTimeSignature: number;
}

function meter(numerator: number, denominator: number, pulseGroups: number[]): MeterOption {
  const stepsPerBar = pulseGroups.reduce((a, b) => a + b, 0);
  return {
    id: `${numerator}/${denominator}`,
    label: `${numerator}/${denominator}`,
    numerator,
    denominator,
    stepsPerBar,
    pulseGroups,
    transportTimeSignature: stepsPerBar / 4,
  };
}

export const METERS: MeterOption[] = [
  meter(4, 4, [4, 4, 4, 4]),
  meter(2, 4, [4, 4]),
  meter(3, 4, [4, 4, 4]),
  meter(5, 4, [4, 4, 4, 4, 4]),
  meter(6, 8, [6, 6]),
  meter(7, 8, [4, 4, 6]),
  meter(9, 8, [6, 6, 6]),
  meter(12, 8, [6, 6, 6, 6]),
];

export const DEFAULT_METER = METERS[0];

export function findMeter(id: string): MeterOption {
  return METERS.find((m) => m.id === id) ?? DEFAULT_METER;
}

/** Rescale a step index authored against a 16-slot (4/4) bar onto an arbitrary meter's grid. */
export function scaleStep(origStep: number, targetStepsPerBar: number): number {
  const scaled = Math.round((origStep / 16) * targetStepsPerBar);
  return Math.min(targetStepsPerBar - 1, Math.max(0, scaled));
}

const DURATION_TO_SIXTEENTHS: Record<string, number> = {
  "16n": 1,
  "8n": 2,
  "4n": 4,
  "2n": 8,
  "1n": 16,
};

/** Rescale a duration string (authored against a 16-slot bar) into a 16th-note count for the target meter. */
export function scaleDurationSixteenths(duration: string, targetStepsPerBar: number): number {
  const origSixteenths = DURATION_TO_SIXTEENTHS[duration] ?? 1;
  return Math.max(1, Math.round((origSixteenths / 16) * targetStepsPerBar));
}
