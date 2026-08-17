'use client'

import Konva from 'konva'
import { useEffect, useMemo, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Path, Rect, Stage, Text } from 'react-konva'

import { buckleSilhouettePath } from '@/lib/render/buckle-shape'
import {
  fitFontSizeToWidth,
  layoutTextOnArc,
  straightTextBaselineY,
  straightTextX,
  type MeasureText,
} from '@/lib/render/curvedText'
import type {
  BuckleShape,
  CenterImageZoneConstraints,
  CenterImageZoneGeometry,
  CornerOrnamentZoneGeometry,
  TextZoneGeometry,
  ZoneConstraints,
  ZoneGeometry,
  ZoneType,
} from '@/lib/schema/zone'

/**
 * The single buckle renderer.
 *
 * Three callers share it and none reimplement its drawing: the customer's live preview, the
 * admin's zone editor (which layers drag handles on top via `overlay`), and the server-side
 * proof render. Because it is one component, what Marley approves cannot drift from what the
 * customer saw.
 *
 * Everything is drawn in the template artwork's pixel space and the Stage is scaled to fit,
 * so zone coordinates never depend on the size of the screen showing them.
 */

export type RenderZone = {
  id: string
  zoneType: ZoneType
  label: string
  sortOrder: number
  geometry: ZoneGeometry
  constraints: ZoneConstraints
}

export type ZoneRenderValue =
  | { kind: 'text'; text: string; fontFamily: string; fontSizePx: number }
  | { kind: 'image'; url: string }
  | { kind: 'ornament'; url: string | null; label: string }

/** Keyed by zone id. A missing entry renders the zone's empty state. */
export type ZoneRenderValues = Record<string, ZoneRenderValue | undefined>

/**
 * Fraction of the font size above the baseline.
 *
 * Deliberately a constant rather than a measured `fontBoundingBoxAscent`: font metrics differ
 * subtly between the browser and node-canvas, and a drifting baseline would put the proof
 * image out of step with the customer's preview. A fixed ratio is identical everywhere.
 */
const ASCENT_RATIO = 0.8

/** Floor for auto-shrinking: below this an engraved letter is too fine to strike. */
const MIN_RENDERED_FONT_SIZE = 10

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

let sharedMeasureContext: CanvasRenderingContext2D | null = null

function measureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!sharedMeasureContext) {
    sharedMeasureContext = document.createElement('canvas').getContext('2d')
  }
  return sharedMeasureContext
}

/** The font is re-applied on every call so interleaved zones cannot measure with each other's. */
function makeMeasure(fontFamily: string, fontSizePx: number): MeasureText {
  const context = measureContext()
  if (!context) return (text) => Array.from(text).length * fontSizePx * 0.5
  const font = `${fontSizePx}px ${fontFamily}`
  return (text) => {
    context.font = font
    return context.measureText(text).width
  }
}

/** Re-render once webfonts have loaded, otherwise text is measured with a fallback face. */
function useFontsReady(): boolean {
  // Starts true where the Font Loading API is unavailable, so there is nothing to wait for and
  // no in-effect state change; otherwise flips to true when fonts finish loading.
  const [ready, setReady] = useState(
    () => typeof document === 'undefined' || !document.fonts,
  )
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return
    let active = true
    document.fonts.ready.then(() => {
      if (active) setReady(true)
    })
    return () => {
      active = false
    }
  }, [])
  return ready
}

/** Loads an image element for a URL, or null while loading / on error / when there is no URL. */
function useImage(url: string | null | undefined): HTMLImageElement | null {
  // Keyed by url so a url change discards the previous image in the same render, rather than
  // via a setState inside the effect (which flashes the stale image and trips lint).
  const [loaded, setLoaded] = useState<{ url: string; image: HTMLImageElement } | null>(null)

  useEffect(() => {
    if (!url) return
    const element = new window.Image()
    // Needed so the canvas stays exportable when artwork is served from another origin.
    element.crossOrigin = 'anonymous'
    let active = true
    element.onload = () => {
      if (active) setLoaded({ url, image: element })
    }
    element.src = url
    return () => {
      active = false
    }
  }, [url])

  return url && loaded?.url === url ? loaded.image : null
}

// ---------------------------------------------------------------------------
// Zone rendering
// ---------------------------------------------------------------------------

function TextZone({
  geometry,
  value,
  fontsReady,
}: {
  geometry: TextZoneGeometry
  value: Extract<ZoneRenderValue, { kind: 'text' }>
  fontsReady: boolean
}) {
  const { text, fontFamily, fontSizePx } = value

  const layout = useMemo(() => {
    if (text.length === 0) return null
    // Referencing fontsReady here ties the memo to font loading: text measured with a fallback
    // face before the webfont arrives must be recomputed once it has.
    void fontsReady

    /*
     * The chosen size is a ceiling, not a guarantee: a long name has to be set smaller to stay
     * inside the area being engraved, rather than running off the edge of the buckle.
     */
    const size = fitFontSizeToWidth({
      fontSize: fontSizePx,
      maxWidth: geometry.width,
      minFontSize: MIN_RENDERED_FONT_SIZE,
      measureAt: (candidate) => makeMeasure(fontFamily, candidate)(text),
    })

    const measure = makeMeasure(fontFamily, size)
    const ascent = size * ASCENT_RATIO

    if (geometry.kind === 'arc' && geometry.curveRadius) {
      const arc = layoutTextOnArc({
        text,
        radius: geometry.curveRadius,
        fontSize: size,
        box: geometry,
        align: geometry.align,
        measure,
      })
      return { kind: 'arc' as const, arc, ascent, size }
    }

    const totalWidth = measure(text)
    return {
      kind: 'straight' as const,
      x: straightTextX(geometry, totalWidth, geometry.align),
      baselineY: straightTextBaselineY(geometry, size),
      ascent,
      size,
    }
  }, [text, fontFamily, fontSizePx, geometry, fontsReady])

  if (!layout) return null

  if (layout.kind === 'straight') {
    return (
      <Text
        text={text}
        x={layout.x}
        y={layout.baselineY - layout.ascent}
        fontFamily={fontFamily}
        fontSize={layout.size}
        fill="#1c1917"
        listening={false}
      />
    )
  }

  return (
    <>
      {layout.arc.glyphs.map((glyph, index) => (
        <Text
          // Index-keyed by necessity: the same character can repeat within a line.
          key={`${index}-${glyph.char}`}
          text={glyph.char}
          x={glyph.x}
          y={glyph.y}
          rotation={glyph.rotationDeg}
          // Shifts the rotation origin to the glyph's baseline centre.
          offsetX={glyph.advance / 2}
          offsetY={layout.ascent}
          fontFamily={fontFamily}
          fontSize={layout.size}
          fill="#1c1917"
          listening={false}
        />
      ))}
    </>
  )
}

function CenterImageZone({
  geometry,
  constraints,
  value,
  showEmptyState,
}: {
  geometry: CenterImageZoneGeometry
  constraints: CenterImageZoneConstraints
  value: Extract<ZoneRenderValue, { kind: 'image' }> | undefined
  showEmptyState: boolean
}) {
  const image = useImage(value?.url)

  if (image) {
    const clip =
      geometry.clip === 'ellipse'
        ? {
            clipFunc: (context: Konva.Context) => {
              context.beginPath()
              context.ellipse(
                geometry.x + geometry.width / 2,
                geometry.y + geometry.height / 2,
                geometry.width / 2,
                geometry.height / 2,
                0,
                0,
                Math.PI * 2,
              )
              context.closePath()
            },
          }
        : geometry.clip === 'rect'
          ? { clip: geometry }
          : {}

    return (
      <Group {...clip} listening={false}>
        <KonvaImage
          image={image}
          x={geometry.x}
          y={geometry.y}
          width={geometry.width}
          height={geometry.height}
          /*
           * Generated artwork arrives as black line art on white — the model cannot produce a
           * transparent background. Multiplying drops the white into the metal beneath and
           * leaves only the linework, which is what an engraving looks like. It works because
           * the buckle face is drawn into this same layer.
           */
          globalCompositeOperation="multiply"
        />
      </Group>
    )
  }

  if (!showEmptyState) return null

  return (
    <Group listening={false}>
      <Rect
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        stroke="#a8a29e"
        strokeWidth={2}
        dash={[10, 8]}
        cornerRadius={6}
      />
      <Text
        text={constraints.promptHint ?? 'Your design goes here'}
        x={geometry.x + 16}
        y={geometry.y + geometry.height / 2 - 12}
        width={geometry.width - 32}
        align="center"
        fontSize={Math.max(14, geometry.width * 0.045)}
        fontFamily="sans-serif"
        fill="#78716c"
      />
    </Group>
  )
}

function OrnamentZone({
  geometry,
  value,
  showEmptyState,
  lineArt,
}: {
  geometry: CornerOrnamentZoneGeometry
  value: Extract<ZoneRenderValue, { kind: 'ornament' }> | undefined
  showEmptyState: boolean
  lineArt: boolean
}) {
  const image = useImage(value?.url)

  if (image) {
    return (
      <KonvaImage
        image={image}
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        rotation={geometry.rotation}
        listening={false}
      />
    )
  }

  // Chosen but with no artwork uploaded yet: show a marker so the slot reads as filled.
  if (value) {
    return (
      <Group listening={false}>
        <Rect
          x={geometry.x}
          y={geometry.y}
          width={geometry.width}
          height={geometry.height}
          fill={lineArt ? undefined : '#d6d3d1'}
          stroke={lineArt ? '#111111' : '#78716c'}
          strokeWidth={lineArt ? 3 : 1.5}
          cornerRadius={geometry.width / 2}
        />
        <Text
          text={value.label.slice(0, 2).toUpperCase()}
          x={geometry.x}
          y={geometry.y + geometry.height / 2 - geometry.height * 0.16}
          width={geometry.width}
          align="center"
          fontSize={geometry.height * 0.32}
          fontFamily="sans-serif"
          fill={lineArt ? '#111111' : '#44403c'}
        />
      </Group>
    )
  }

  if (!showEmptyState) return null

  return (
    <Rect
      x={geometry.x}
      y={geometry.y}
      width={geometry.width}
      height={geometry.height}
      stroke="#a8a29e"
      strokeWidth={1.5}
      dash={[6, 6]}
      cornerRadius={geometry.width / 2}
      listening={false}
    />
  )
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

/**
 * `metal` draws the buckle as it will look made, for the customer's live preview.
 * `line-art` draws the black-outline proof Marley approves and the engraver works from — the
 * same composition, so the two can never disagree about what was ordered.
 */
export type BuckleRenderMode = 'metal' | 'line-art'

export type BuckleCanvasProps = {
  artwork: {
    url: string | null
    /** Black-outline version of the blank; falls back to the silhouette when absent. */
    lineArtUrl?: string | null
    width: number
    height: number
  }
  shape: BuckleShape
  zones: RenderZone[]
  values: ZoneRenderValues
  /** Rendered width in CSS pixels; the artwork space is scaled to fit. */
  displayWidth: number
  /** Dashed guides for unfilled zones. On in the editor, off for a clean customer preview. */
  showEmptyZones?: boolean
  /** Extra `<Layer>` drawn above the composite — the editor's drag handles. */
  overlay?: React.ReactNode
  renderMode?: BuckleRenderMode
  onStageReady?: (stage: Konva.Stage | null) => void
}

export default function BuckleCanvas({
  artwork,
  shape,
  zones,
  values,
  displayWidth,
  showEmptyZones = false,
  overlay,
  renderMode = 'metal',
  onStageReady,
}: BuckleCanvasProps) {
  const fontsReady = useFontsReady()
  const isLineArt = renderMode === 'line-art'
  const backgroundImage = useImage(isLineArt ? artwork.lineArtUrl : artwork.url)

  const scale = displayWidth / artwork.width
  const displayHeight = artwork.height * scale

  const ordered = useMemo(
    () => [...zones].sort((a, b) => a.sortOrder - b.sortOrder),
    [zones],
  )

  const silhouette = useMemo(
    () => buckleSilhouettePath(shape, artwork.width, artwork.height),
    [shape, artwork.width, artwork.height],
  )

  return (
    <Stage
      width={displayWidth}
      height={displayHeight}
      scaleX={scale}
      scaleY={scale}
      ref={(stage) => onStageReady?.(stage)}
    >
      {/*
        The buckle face and everything drawn on it share one layer so that blend modes work:
        the generated centre artwork multiplies against the metal beneath it, and a separate
        layer would be a separate canvas with nothing to blend into.
      */}
      <Layer listening={false}>
        {/* A white ground, so the proof is ink on paper rather than on transparency. */}
        <Rect width={artwork.width} height={artwork.height} fill="#ffffff" />

        {backgroundImage ? (
          <KonvaImage
            image={backgroundImage}
            width={artwork.width}
            height={artwork.height}
          />
        ) : (
          // No artwork yet: draw the silhouette so zones have a buckle to sit on.
          <Path
            data={silhouette}
            fill={isLineArt ? '#ffffff' : '#f5f5f4'}
            stroke={isLineArt ? '#111111' : '#a8a29e'}
            strokeWidth={isLineArt ? 5 : 3}
          />
        )}

        {ordered.map((zone) => {
          const value = values[zone.id]

          switch (zone.zoneType) {
            case 'top_text':
            case 'bottom_text':
              return value?.kind === 'text' ? (
                <TextZone
                  key={zone.id}
                  geometry={zone.geometry as TextZoneGeometry}
                  value={value}
                  fontsReady={fontsReady}
                />
              ) : null

            case 'center_image':
              return (
                <CenterImageZone
                  key={zone.id}
                  geometry={zone.geometry as CenterImageZoneGeometry}
                  constraints={zone.constraints as CenterImageZoneConstraints}
                  value={value?.kind === 'image' ? value : undefined}
                  showEmptyState={showEmptyZones}
                />
              )

            case 'corner_ornament':
              return (
                <OrnamentZone
                  key={zone.id}
                  geometry={zone.geometry as CornerOrnamentZoneGeometry}
                  value={value?.kind === 'ornament' ? value : undefined}
                  showEmptyState={showEmptyZones}
                  lineArt={isLineArt}
                />
              )
          }
        })}
      </Layer>

      {overlay}
    </Stage>
  )
}
