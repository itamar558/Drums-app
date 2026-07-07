import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import type { Song } from '../dsp/types';
import { buildSheetLayout } from '../notation/layout';
import type { BeamGlyph, MeasureLayout, NoteGlyph, StemGlyph } from '../notation/layout';
import {
  MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  NOTEHEAD_RADIUS,
  STAFF_HEIGHT,
  STAFF_LINE_GAP,
  SYSTEM_LEFT_MARGIN,
} from '../notation/constants';

function Notehead({ note }: { note: NoteGlyph }) {
  if (note.isX) {
    const r = NOTEHEAD_RADIUS;
    return (
      <G>
        <Line x1={note.x - r} y1={note.y - r} x2={note.x + r} y2={note.y + r} stroke="#111" strokeWidth={1.6} />
        <Line x1={note.x - r} y1={note.y + r} x2={note.x + r} y2={note.y - r} stroke="#111" strokeWidth={1.6} />
      </G>
    );
  }
  return <Circle cx={note.x} cy={note.y} r={NOTEHEAD_RADIUS} fill="#111" />;
}

function Stem({ stem }: { stem: StemGlyph }) {
  return <Line x1={stem.x} y1={stem.bottomY} x2={stem.x} y2={stem.topY} stroke="#111" strokeWidth={1.4} />;
}

function Beam({ beam }: { beam: BeamGlyph }) {
  return (
    <G>
      <Line x1={beam.fromX} y1={beam.y} x2={beam.toX} y2={beam.y} stroke="#111" strokeWidth={2.6} />
      {beam.doubled && (
        <Line x1={beam.fromX} y1={beam.y + 4} x2={beam.toX} y2={beam.y + 4} stroke="#111" strokeWidth={2.6} />
      )}
    </G>
  );
}

function RepeatMark({ x }: { x: number }) {
  const cx = x + MEASURE_WIDTH / 2;
  const cy = STAFF_HEIGHT / 2;
  return (
    <G>
      <Line x1={cx - 8} y1={cy + 8} x2={cx + 8} y2={cy - 8} stroke="#111" strokeWidth={1.8} />
      <Circle cx={cx - 5} cy={cy - 5} r={2.2} fill="#111" />
      <Circle cx={cx + 5} cy={cy + 5} r={2.2} fill="#111" />
    </G>
  );
}

function FillMark({ x }: { x: number }) {
  const cy = STAFF_HEIGHT / 2;
  const slashXs = [0.2, 0.4, 0.6, 0.8].map((f) => x + MEASURE_WIDTH * f);
  return (
    <G>
      {slashXs.map((sx, i) => (
        <Line key={i} x1={sx - 5} y1={cy + 9} x2={sx + 5} y2={cy - 9} stroke="#111" strokeWidth={2} />
      ))}
      <SvgText x={x + MEASURE_WIDTH / 2} y={-8} fontSize={9} fontStyle="italic" fill="#111" textAnchor="middle">
        Drum Fill
      </SvgText>
    </G>
  );
}

function StaffLines({ width }: { width: number }) {
  return (
    <G>
      {[0, 1, 2, 3, 4].map((i) => (
        <Line
          key={i}
          x1={0}
          y1={i * STAFF_LINE_GAP}
          x2={width}
          y2={i * STAFF_LINE_GAP}
          stroke="#111"
          strokeWidth={1}
        />
      ))}
    </G>
  );
}

function PercussionClef() {
  return (
    <G>
      <Line x1={4} y1={STAFF_HEIGHT * 0.3} x2={4} y2={STAFF_HEIGHT * 0.7} stroke="#111" strokeWidth={2.5} />
      <Line x1={9} y1={STAFF_HEIGHT * 0.3} x2={9} y2={STAFF_HEIGHT * 0.7} stroke="#111" strokeWidth={2.5} />
    </G>
  );
}

function TimeSignature({ x }: { x: number }) {
  return (
    <G>
      <SvgText x={x} y={STAFF_LINE_GAP * 1.4} fontSize={16} fontWeight="bold" fill="#111">
        4
      </SvgText>
      <SvgText x={x} y={STAFF_LINE_GAP * 3.4} fontSize={16} fontWeight="bold" fill="#111">
        4
      </SvgText>
    </G>
  );
}

function MeasureView({ measure, isFirstOfSystem }: { measure: MeasureLayout; isFirstOfSystem: boolean }) {
  return (
    <G>
      {isFirstOfSystem && (
        <SvgText x={measure.x} y={-6} fontSize={9} fontStyle="italic" fill="#111">
          {measure.measureNumber}
        </SvgText>
      )}
      {measure.isFill ? (
        <FillMark x={measure.x} />
      ) : measure.isRepeat ? (
        <RepeatMark x={measure.x} />
      ) : (
        <G>
          {measure.beams.map((beam, i) => (
            <Beam key={i} beam={beam} />
          ))}
          {measure.stems.map((stem, i) => (
            <Stem key={i} stem={stem} />
          ))}
          {measure.notes.map((note, i) => (
            <Notehead key={i} note={note} />
          ))}
        </G>
      )}
      <Line
        x1={measure.x + measure.width}
        y1={0}
        x2={measure.x + measure.width}
        y2={STAFF_HEIGHT}
        stroke="#111"
        strokeWidth={1}
      />
    </G>
  );
}

/** Renders a transcribed Song as SVG drum notation, scaled to fill the
 * available width via viewBox (the layout math in notation/layout.ts is
 * unit-based, not pixel-based). */
export function DrumSheet({ song, width }: { song: Song; width: number }) {
  const layout = useMemo(() => buildSheetLayout(song), [song]);
  const scale = width / layout.totalWidth;
  const renderedHeight = layout.totalHeight * scale;

  return (
    <View>
      <Svg width={width} height={renderedHeight} viewBox={`0 0 ${layout.totalWidth} ${layout.totalHeight}`}>
        {layout.systems.map((system, si) => (
          <G key={si} y={system.y}>
            {system.sectionLabel && (
              <SvgText x={SYSTEM_LEFT_MARGIN} y={-22} fontSize={13} fontWeight="bold" fill="#111">
                {system.sectionLabel}
              </SvgText>
            )}
            {system.isFirstSystem && (
              <SvgText
                x={layout.totalWidth - SYSTEM_LEFT_MARGIN}
                y={-24}
                fontSize={10}
                fill="#111"
                textAnchor="end"
              >
                {`♩ = ${layout.bpm} bpm`}
              </SvgText>
            )}
            <G x={SYSTEM_LEFT_MARGIN}>
              <StaffLines width={MEASURES_PER_SYSTEM * MEASURE_WIDTH} />
              {system.isFirstSystem && <PercussionClef />}
              {system.isFirstSystem && <TimeSignature x={20} />}
              {system.measures.map((measure, mi) => (
                <MeasureView key={mi} measure={measure} isFirstOfSystem={mi === 0} />
              ))}
            </G>
          </G>
        ))}
      </Svg>
    </View>
  );
}
