/**
 * Shared geometry helper for the route drawn on top of the descent photo.
 * The public site and the admin editor must produce byte-identical paths,
 * so the conversion lives in one module only.
 */

const ROUTE_VIEWBOX = 1000;

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Turns normalised 0..1 points into a smooth cubic path.
 * Uses a Catmull-Rom spline converted to Bezier segments so the line follows the
 * road without the operator having to place dozens of points.
 * Pass the real viewBox height so one user unit is the same length on both axes.
 */
export function buildRoutePathData(points, viewWidth = ROUTE_VIEWBOX, viewHeight = viewWidth) {
  if (!Array.isArray(points) || points.length < 2) return '';
  const scaled = points.map((point) => ({ x: point.x * viewWidth, y: point.y * viewHeight }));
  if (scaled.length === 2) {
    return `M${round(scaled[0].x)} ${round(scaled[0].y)}L${round(scaled[1].x)} ${round(scaled[1].y)}`;
  }

  let data = `M${round(scaled[0].x)} ${round(scaled[0].y)}`;
  for (let index = 0; index < scaled.length - 1; index += 1) {
    const previous = scaled[index - 1] || scaled[index];
    const current = scaled[index];
    const next = scaled[index + 1];
    const following = scaled[index + 2] || next;
    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = current.y + (next.y - previous.y) / 6;
    const c2x = next.x - (following.x - current.x) / 6;
    const c2y = next.y - (following.y - current.y) / 6;
    data += `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(next.x)} ${round(next.y)}`;
  }
  return data;
}

/** Percentage offsets so HTML markers can sit on the path without an SVG transform. */
export function pointToPercent(point) {
  return { left: `${point.x * 100}%`, top: `${point.y * 100}%` };
}

export { ROUTE_VIEWBOX };

/**
 * Builds a tapered ribbon along the route so the line reads as perspective:
 * wide where the road is close to the camera, narrow towards the horizon.
 *
 * Width is driven by the point's own vertical position rather than by progress
 * along the line, so the taper stays correct no matter which end is the start.
 *
 * @param {SVGPathElement} path   a path that already carries the smooth `d`
 * @param {object} options
 * @param {number} options.near   half-width in user units at the bottom edge
 * @param {number} options.far    half-width in user units at the top edge
 * @param {number} options.height viewBox height, used to normalise y
 * @param {number} options.samples number of sample points along the path
 * @returns {string} a closed path describing the ribbon
 */
export function buildRibbonPathData(path, { near = 26, far = 5, height = 1000, samples = 96 } = {}) {
  if (!path || typeof path.getTotalLength !== 'function') return '';
  const total = path.getTotalLength();
  if (!(total > 0)) return '';

  const centre = [];
  for (let index = 0; index <= samples; index += 1) {
    const point = path.getPointAtLength((index / samples) * total);
    centre.push({ x: point.x, y: point.y });
  }

  const halfWidthAt = (y) => {
    const depth = Math.min(1, Math.max(0, y / height));
    // Squared easing: perspective narrows faster near the horizon.
    return far + (near - far) * (depth * depth);
  };

  const left = [];
  const right = [];
  for (let index = 0; index < centre.length; index += 1) {
    const previous = centre[Math.max(0, index - 1)];
    const next = centre[Math.min(centre.length - 1, index + 1)];
    let dx = next.x - previous.x;
    let dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const half = halfWidthAt(centre[index].y);
    // Normal is the tangent rotated by 90 degrees.
    const nx = -dy * half;
    const ny = dx * half;
    left.push({ x: centre[index].x + nx, y: centre[index].y + ny });
    right.push({ x: centre[index].x - nx, y: centre[index].y - ny });
  }

  const round = (value) => Math.round(value * 10) / 10;
  const forward = left.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join('');
  const back = right.reverse().map((point) => `L${round(point.x)} ${round(point.y)}`).join('');
  return `${forward}${back}Z`;
}

export const ROUTE_WIDTH_LIMITS = Object.freeze({ near: [8, 60], far: [1, 24] });

/**
 * Same tapered geometry as the ribbon, but emitted as a run of separate dashes.
 *
 * Dash and gap lengths scale with the local width, so the dashes get shorter and
 * tighter towards the horizon exactly like real road markings seen in perspective.
 * Everything is returned as one path with many closed subpaths, which keeps it to
 * a single DOM node no matter how many dashes there are.
 */
export function buildDashPathData(path, {
  near = 26,
  far = 5,
  height = 1000,
  dashFactor = 2.8,
  gapFactor = 2.1,
  maxDashes = 320,
  // Outline pass: widen every dash without changing where the dashes fall, so
  // the outline and the fill stay perfectly registered.
  widthScale = 1,
  widthPad = 0
} = {}) {
  if (!path || typeof path.getTotalLength !== 'function') return '';
  const total = path.getTotalLength();
  if (!(total > 0)) return '';

  const baseHalfAt = (y) => {
    const depth = Math.min(1, Math.max(0, y / height));
    return far + (near - far) * (depth * depth);
  };
  const halfAt = (y) => baseHalfAt(y) * widthScale + widthPad;

  // Edge points perpendicular to the direction of travel at a given distance.
  const edgesAt = (distance) => {
    const clamped = Math.min(total, Math.max(0, distance));
    const point = path.getPointAtLength(clamped);
    const ahead = path.getPointAtLength(Math.min(total, clamped + 1.5));
    const behind = path.getPointAtLength(Math.max(0, clamped - 1.5));
    let dx = ahead.x - behind.x;
    let dy = ahead.y - behind.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const half = halfAt(point.y);
    return {
      left: { x: point.x - dy * half, y: point.y + dx * half },
      right: { x: point.x + dy * half, y: point.y - dx * half }
    };
  };

  const round = (value) => Math.round(value * 10) / 10;
  let data = '';
  let distance = 0;
  let dashes = 0;

  while (distance < total && dashes < maxDashes) {
    // Rhythm always comes from the base width, never from the outline padding.
    const rhythmHalf = baseHalfAt(path.getPointAtLength(distance).y);
    const dashLength = Math.max(5, rhythmHalf * dashFactor);
    const gapLength = Math.max(4, rhythmHalf * gapFactor);
    const end = Math.min(total, distance + dashLength);
    const start = edgesAt(distance);
    const finish = edgesAt(end);
    data += `M${round(start.left.x)} ${round(start.left.y)}`
      + `L${round(finish.left.x)} ${round(finish.left.y)}`
      + `L${round(finish.right.x)} ${round(finish.right.y)}`
      + `L${round(start.right.x)} ${round(start.right.y)}Z`;
    distance = end + gapLength;
    dashes += 1;
  }
  return data;
}
