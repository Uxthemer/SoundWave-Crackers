import { useLayoutEffect, useRef, useState } from "react";

/** Room around the button for the glow to spread into, as in the design. */
const OFFSET = 100;

/**
 * A line of light that travels round its parent's border, with a soft glow
 * (index.css, .glow-*). Put it inside any positioned element with a border
 * radius -- the Chit Scheme menu button uses it.
 *
 * The outline is measured, not set in CSS: SVG rect geometry in CSS (x, y,
 * width, rx) works in Chrome but is ignored by Firefox and older Safari, and
 * the original script set the radius once, at load, which a menu that resizes
 * its text by screen width outgrows. A ResizeObserver redraws it whenever the
 * button changes size.
 */
export function GlowFrame() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0, radius: 0, borderTop: 0, borderLeft: 0 });

  useLayoutEffect(() => {
    const host = svgRef.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const style = getComputedStyle(host);
      setBox({
        width: host.offsetWidth,
        height: host.offsetHeight,
        radius: parseFloat(style.borderTopLeftRadius) || 0,
        // An absolute child is placed from inside the parent's border, so
        // the frame moves out by the border's width to sit on its edge.
        borderTop: parseFloat(style.borderTopWidth) || 0,
        borderLeft: parseFloat(style.borderLeftWidth) || 0,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const rect = {
    x: OFFSET / 2,
    y: OFFSET / 2,
    width: Math.max(box.width, 0),
    height: Math.max(box.height, 0),
    rx: box.radius,
    pathLength: 100,
    strokeLinecap: "round" as const,
  };

  return (
    <svg
      ref={svgRef}
      className="glow-container"
      aria-hidden="true"
      width={box.width + OFFSET}
      height={box.height + OFFSET}
      style={{ top: -OFFSET / 2 - box.borderTop, left: -OFFSET / 2 - box.borderLeft }}
    >
      {box.width > 0 && (
        <>
          <rect {...rect} className="glow-blur" />
          <rect {...rect} className="glow-line" />
        </>
      )}
    </svg>
  );
}
