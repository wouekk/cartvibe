# Receipt image canvas: geometry and layout decisions

Purpose: why `app-image-canvas` and the receipt form's image pane behave as they do, so a refactor does not undo a
decision that looks arbitrary.

## The canvas (`src/shared-ui/image-canvas/`)

Four corner handles resize, drag pans, the wheel zooms at the cursor, double-click fits. It is generic and
presentational: it takes a resolved `src` and a `stageHeight`. The stage is a fixed viewport that clips the image, so
growing the image never moves the page. (Resizing the form/image panes with a splitter was tried and reverted: the
thing worth manipulating is the image, not the layout.)

- **One transform on one element** for scale and pan; that is what keeps drag distance equal to cursor distance.
- **No change detection during a drag.** The viewport is a plain field and the image and handle frame are positioned
  imperatively; `pointermove` is a native listener, not a host binding. A 120 Hz drag over the receipt form's large
  template stays cheap.
- **Handles sit inside the image box**, not centred on its corners: the stage clips with `overflow: hidden` and
  clipped pixels are not hit-testable, so a centred handle would lose half its target at a stage edge. Each grabs from
  an invisible 24px box.
- **The image floats.** It may be smaller than the stage, sit in a corner or hang over an edge; the only rule is that
  `MIN_VISIBLE_PX` (48) stays on the stage. A "centre it / no dead space" containment rule cannot coexist with a real
  corner handle (it throws away the anchor the drag set), so do not add one.
- **The resize floor is `minScale()`**, the scale at which the shorter side is `MIN_VISIBLE_PX`, not `fitScale()`;
  flooring at the fit made inward drags a no-op. `fitScale()` is what load and double-click use, and `fit()` centres
  the image itself.
- **The sliver outranks the anchor:** if the opposite corner is already off-stage, shrinking lets that invisible anchor
  drift rather than freezing the scale. Pinned by a spec.
- **A stage resize re-clamps the position only** (the `ResizeObserver`); the scale is the user's.
- **A handle stops `dblclick`.** The host binds `(dblclick)="fit()"`; `preventDefault` / `stopPropagation` on the
  pointer event do not suppress the separate `dblclick`, so two quick corner pulls used to reset the size.

## Wiring

`app-carousel` (`src/carousel/`, in-house, global stylesheet) passes `stageHeight` to `app-image-viewer`, which renders
the canvas. It renders every slide's viewer unconditionally and only hides inactive slides, because the header Zoom
In/Out reach the active viewer through `viewChildren(ImageViewerComponent)` indexed by the slide index; a conditional
viewer would compact the query and zoom the wrong slide. `carouselComponent` is an optional `viewChild` because the
header buttons render while the carousel may be hidden.

## Height chain on the receipt form

The stage is as tall as the Details pane beside it. Every link between the column and the canvas is `height: auto` or
an inline host, so the height is handed down, always gated on a class:

- `.cv-carousel--fill` (in `carousel.component.scss`, global) gives `display: block; height: 100%` to the carousel,
  the visible slide and `app-image-viewer`.
- `receipt-form.component.scss` makes `.cv-images-pane` a flex column; one `::ng-deep` reaches the classless content
  div `app-form-section` wraps around projected content (`.form-section-header + div`).
- `stageHeight="100%"` is an inline style, so no rule on the canvas and no `!important`.
- Under 768px the panes stack, so `.cv-images-pane__stage` gets an explicit `50vh`; without it the stacked stage
  collapses to its border.
- `app-upload-image` must not carry a full-height class in that column: once a flex parent blockifies it, the hidden
  file input takes the whole column.
- The gating matters because `#expandedImageTemplate` is declared in `receipt-form`, so its view carries that
  component's encapsulation attribute even inside the dialog overlay; an ungated rule reaches into the dialog.

## Fullscreen dialog

`expandImage()` opens `#expandedImageTemplate` (same carousel, `cv-carousel--fill`, `stageHeight="100%"`, a floating
close button) through `AppDialog` with `height: "100%"` and `autoFocus: "dialog"` (the close button is the only
tabbable control, and first-tabbable focus drew a ring over the image). Do not wrap it in `app-dialog`: its header and
padding eat the height. The spec pins that both carousels carry the fill class and `stageHeight="100%"`.

## Carousel arrows

The prev/next arrows are 2.75rem circles centred vertically and clear of the corners. Full-height strips would sit
above the canvas in hit-testing and kill pan, zoom and the corner handles on any receipt with two or more images.
