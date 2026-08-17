'use client'

import type Konva from 'konva'
import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Rect, Text, Transformer } from 'react-konva'

import { BucklePreview, type RenderZone, type ZoneRenderValues } from '@/components/preview/BucklePreview'
import { useElementWidth } from '@/components/preview/useElementWidth'
import { ZONE_TYPE_LABELS } from '@/lib/labels'
import type { BuckleShape, TextZoneConstraints } from '@/lib/schema/zone'
import type { FormState } from '@/server/actions/types'

/** Box a zone occupies, the only part this editor changes. */
type Box = { x: number; y: number; width: number; height: number; rotation: number }

export type LayoutZone = RenderZone & { isRequired: boolean }

/**
 * Drag-and-drop zone positioning over the buckle artwork.
 *
 * Draws through the same `BucklePreview` a customer sees and adds an interactive layer on top,
 * so what Marley arranges here is literally the thing being previewed — there is no second
 * renderer that could disagree with it.
 */
export function ZoneLayoutEditor({
  action,
  artwork,
  shape,
  zones,
  sampleText,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>
  artwork: { url: string | null; width: number; height: number }
  shape: BuckleShape
  zones: LayoutZone[]
  /** Placeholder wording drawn in text zones so their size can be judged. */
  sampleText: Record<string, string>
}) {
  const [boxes, setBoxes] = useState<Record<string, Box>>(() =>
    Object.fromEntries(
      zones.map((zone) => [
        zone.id,
        {
          x: zone.geometry.x,
          y: zone.geometry.y,
          width: zone.geometry.width,
          height: zone.geometry.height,
          rotation: zone.geometry.rotation,
        },
      ]),
    ),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [state, formAction] = useActionState(action, undefined)

  const [containerRef, containerWidth] = useElementWidth<HTMLDivElement>()
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const rectRefs = useRef<Record<string, Konva.Rect | null>>({})

  // Attach the resize handles to whichever zone is selected.
  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer) return
    const node = selectedId ? rectRefs.current[selectedId] : null
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedId, containerWidth])

  const displayWidth = Math.max(0, containerWidth - 32)

  /** Feed the renderer sample content so zones are visible while being positioned. */
  const renderValues = useMemo<ZoneRenderValues>(() => {
    const values: ZoneRenderValues = {}
    for (const zone of zones) {
      if (zone.zoneType === 'top_text' || zone.zoneType === 'bottom_text') {
        const constraints = zone.constraints as TextZoneConstraints
        values[zone.id] = {
          kind: 'text',
          text: sampleText[zone.id] ?? 'SAMPLE',
          fontFamily: 'Georgia, serif',
          fontSizePx: constraints.defaultFontSizePx,
        }
      }
    }
    return values
  }, [zones, sampleText])

  // Positions are applied to the geometry passed to the renderer, so dragging updates the draw.
  const previewZones = useMemo<RenderZone[]>(
    () =>
      zones.map((zone) => ({
        ...zone,
        geometry: { ...zone.geometry, ...boxes[zone.id] },
      })),
    [zones, boxes],
  )

  const dirty = zones.some((zone) => {
    const box = boxes[zone.id]
    return (
      box.x !== zone.geometry.x ||
      box.y !== zone.geometry.y ||
      box.width !== zone.geometry.width ||
      box.height !== zone.geometry.height ||
      box.rotation !== zone.geometry.rotation
    )
  })

  const selected = zones.find((zone) => zone.id === selectedId)

  return (
    <div className="space-y-4">
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-stone-200 bg-white p-4"
      >
        {displayWidth > 0 ? (
          <BucklePreview
            artwork={artwork}
            shape={shape}
            zones={previewZones}
            values={renderValues}
            displayWidth={displayWidth}
            showEmptyZones
            overlay={
              <Layer>
                {zones.map((zone) => {
                  const box = boxes[zone.id]
                  const isSelected = zone.id === selectedId
                  return (
                    <Rect
                      key={zone.id}
                      ref={(node) => {
                        rectRefs.current[zone.id] = node
                      }}
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      rotation={box.rotation}
                      fill={isSelected ? 'rgba(28,25,23,0.10)' : 'rgba(28,25,23,0.04)'}
                      stroke={isSelected ? '#1c1917' : '#78716c'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      dash={isSelected ? undefined : [8, 6]}
                      draggable
                      onMouseDown={() => setSelectedId(zone.id)}
                      onTap={() => setSelectedId(zone.id)}
                      onDragEnd={(event) =>
                        setBoxes((current) => ({
                          ...current,
                          [zone.id]: {
                            ...current[zone.id],
                            x: event.target.x(),
                            y: event.target.y(),
                          },
                        }))
                      }
                      onTransformEnd={(event) => {
                        const node = event.target as Konva.Rect
                        /*
                         * Konva reports a resize as a scale factor. Fold it back into width and
                         * height and reset the scale, so the stored geometry stays plain pixels.
                         */
                        const nextWidth = Math.max(4, node.width() * node.scaleX())
                        const nextHeight = Math.max(4, node.height() * node.scaleY())
                        node.scaleX(1)
                        node.scaleY(1)
                        setBoxes((current) => ({
                          ...current,
                          [zone.id]: {
                            x: node.x(),
                            y: node.y(),
                            width: nextWidth,
                            height: nextHeight,
                            rotation: node.rotation(),
                          },
                        }))
                      }}
                    />
                  )
                })}

                {zones.map((zone) => {
                  const box = boxes[zone.id]
                  return (
                    <Text
                      key={`${zone.id}-label`}
                      text={zone.label}
                      x={box.x}
                      y={box.y - 22}
                      fontSize={16}
                      fontFamily="sans-serif"
                      fill={zone.id === selectedId ? '#1c1917' : '#78716c'}
                      listening={false}
                    />
                  )
                })}

                <Transformer
                  ref={transformerRef}
                  rotateEnabled
                  keepRatio={false}
                  ignoreStroke
                  boundBoxFunc={(_oldBox, newBox) => ({
                    ...newBox,
                    // Refuse degenerate boxes; the schema would reject them on save anyway.
                    width: Math.max(8, newBox.width),
                    height: Math.max(8, newBox.height),
                  })}
                />
              </Layer>
            }
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-stone-600">
          {selected
            ? `Selected: ${selected.label} (${ZONE_TYPE_LABELS[selected.zoneType]}) — ${Math.round(
                boxes[selected.id].width,
              )}x${Math.round(boxes[selected.id].height)} at ${Math.round(
                boxes[selected.id].x,
              )},${Math.round(boxes[selected.id].y)}`
            : 'Click a zone to move or resize it.'}
        </p>
        {selectedId ? (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="text-sm text-stone-500 hover:underline"
          >
            Deselect
          </button>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input
          type="hidden"
          name="layout"
          value={JSON.stringify(
            zones.map((zone) => ({ zoneId: zone.id, ...boxes[zone.id] })),
          )}
        />
        <button
          type="submit"
          disabled={!dirty}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {dirty ? 'Save positions' : 'No changes to save'}
        </button>
        {state?.error ? (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
        {state?.success ? (
          <p role="status" className="text-sm text-green-700">
            {state.success}
          </p>
        ) : null}
      </form>
    </div>
  )
}
