// Pictures in replies, shared by the add-ons that show them (sandbox, svg): an SVG as an inert image.

// An SVG as a data: URL, base64 so any text in it survives.
export function svgUrl(svg) {
  const bytes = new TextEncoder().encode(svg);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}
