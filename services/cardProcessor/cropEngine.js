/**
 * Validates that the crop box is completely within the native page dimensions.
 * All coordinates are in native PDF points (bottom-left origin).
 * 
 * @param {Object} crop - { x, y, width, height }
 * @param {Object} pageDimensions - { width: number, height: number }
 * @returns {Boolean}
 */
exports.isCropInBounds = (crop, pageDimensions) => {
  if (!crop || !pageDimensions) return false;
  const { x, y, width, height } = crop;
  const { width: pageWidth, height: pageHeight } = pageDimensions;

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    return false;
  }

  const epsilon = 0.5;

  return (
    x >= -epsilon &&
    y >= -epsilon &&
    width > 0 &&
    height > 0 &&
    (x + width) <= (pageWidth + epsilon) &&
    (y + height) <= (pageHeight + epsilon)
  );
};

/**
 * Normalizes coordinates or performs conversions if required.
 * Currently, frontend maps coordinates to native PDF points directly.
 */
exports.normalizeCrop = (crop) => {
  return {
    x: Math.max(0, parseFloat(crop.x)),
    y: Math.max(0, parseFloat(crop.y)),
    width: parseFloat(crop.width),
    height: parseFloat(crop.height),
  };
};
