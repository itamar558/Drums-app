/** Shared layout units for the drum staff. All values are in abstract SVG
 * units; the component scales the whole sheet to fit the device width via
 * viewBox, so these don't need to match device pixels. */

export const STAFF_LINE_GAP = 10;
export const STAFF_HEIGHT = STAFF_LINE_GAP * 4; // 5 lines, 4 gaps
export const NOTEHEAD_RADIUS = 4.2;

export const MEASURE_WIDTH = 210;
export const MEASURES_PER_SYSTEM = 2;
// Reserves room for the percussion clef + time signature at the start of
// every system's staff, even on systems that don't draw them, so all
// systems' first measures line up at the same x.
export const SYSTEM_LEFT_MARGIN = 46;
export const MEASURE_SLOT_PADDING_START = 10;
export const MEASURE_SLOT_PADDING_END = 6;

export const SYSTEM_VERTICAL_GAP = 92;
export const FIRST_SYSTEM_TOP_MARGIN = 74;
export const SECTION_LABEL_OFFSET_ABOVE_STAFF = 20;

export const STEM_LENGTH = 30;

// Voice notehead Y offsets, relative to the staff's top line (0) with lines
// at 0, 10, 20, 30, 40 (top to bottom). Matches the conventional GM drum-kit
// staff mapping: hi-hat/crash use x-noteheads above the staff, snare sits on
// the middle line, kick sits in the space just below the staff.
export const VOICE_Y: Record<'crash' | 'hihat' | 'snare' | 'kick', number> = {
  crash: STAFF_LINE_GAP * -1.5,
  hihat: STAFF_LINE_GAP * -0.5,
  snare: STAFF_LINE_GAP * 2,
  kick: STAFF_LINE_GAP * 4.5,
};

export const VOICE_USES_X_NOTEHEAD: Record<'crash' | 'hihat' | 'snare' | 'kick', boolean> = {
  crash: true,
  hihat: true,
  snare: false,
  kick: false,
};

export const SIXTEENTHS_PER_BEAT = 4;
export const BEATS_PER_MEASURE = 4;
