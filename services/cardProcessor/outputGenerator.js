const { PDFDocument, pushGraphicsState, popGraphicsState, clip, endPath, moveTo, lineTo } = require('pdf-lib');
const pdfRenderer = require('./pdfRenderer');

/**
 * Converts physical dimensions to PDF points (1/72 inch).
 * 
 * @param {Number} value - dimension value
 * @param {String} unit - 'mm' or 'inch'
 * @returns {Number} - points
 */
const convertToPoints = (value, unit) => {
  if (unit === 'inch') {
    return value * 72;
  }
  // Default to mm
  return (value / 25.4) * 72;
};

/**
 * Applies a rectangular clip path to PDF page graphics state (sharp rectangular border)
 */
const applyRectClipPath = (targetPage, x, y, w, h) => {
  targetPage.pushOperators(pushGraphicsState());
  targetPage.pushOperators(moveTo(x, y));
  targetPage.pushOperators(lineTo(x + w, y));
  targetPage.pushOperators(lineTo(x + w, y + h));
  targetPage.pushOperators(lineTo(x, y + h));
  targetPage.pushOperators(clip());
  targetPage.pushOperators(endPath());
};

/**
 * Generates the print-ready output PDF by cropping the target page of source PDF
 * and embedding/scaling it to target output dimensions.
 * 
 * @param {Buffer} sourcePdfBuffer - original PDF buffer
 * @param {Object} config - profile configuration containing crop, output, source details
 * @returns {Promise<Buffer>} - output PDF buffer
 */
exports.generateCardPdf = async (sourcePdfBuffer, config) => {
  // Validate basic inputs
  if (!sourcePdfBuffer) {
    throw new Error('Invalid PDF file.');
  }
  if (!config) {
    throw new Error('Unable to process this PDF.');
  }

  const { pageNumber = 1, pageWidth: sampleWidth = 595.27, pageHeight: sampleHeight = 841.89 } = config.source || {};
  const { x, y, width, height } = config.crop || {};
  const { width: outWidth, height: outHeight, unit } = config.output || {};
  const isDouble = config.layoutMode === 'double';

  if (outWidth <= 0 || outHeight <= 0) {
    throw new Error('Unable to process this PDF.');
  }

  // 1. Create target document and configure single A4 Landscape page
  const targetPdfDoc = await PDFDocument.create();
  const A4_WIDTH_PTS = 595.27;
  const A4_HEIGHT_PTS = 841.89;

  const targetPage = targetPdfDoc.addPage([A4_WIDTH_PTS, A4_HEIGHT_PTS]);
  targetPage.setMediaBox(0, 0, A4_WIDTH_PTS, A4_HEIGHT_PTS);
  targetPage.setCropBox(0, 0, A4_WIDTH_PTS, A4_HEIGHT_PTS);

  const cardW = convertToPoints(outWidth, unit);
  const cardH = convertToPoints(outHeight, unit);
  const hasBackSide = isDouble && config.cropBack && config.cropBack.width > 5;

  let x1, y1, x2, y2;
  const gap = 20; // 20 points consistent gap between front and back cards
  const topMargin = 40; // Reduced top margin for the A4 portrait sheet layout

  if (hasBackSide) {
    const totalCardsWidth = (cardW * 2) + gap;
    // Center horizontally
    const startX = (A4_WIDTH_PTS - totalCardsWidth) / 2;
    // Position vertically with top margin
    const startY = A4_HEIGHT_PTS - topMargin - cardH;

    x1 = startX;
    y1 = startY;

    x2 = startX + cardW + gap;
    y2 = startY;
  } else {
    // Single sided layout
    const startX = (A4_WIDTH_PTS - cardW) / 2;
    const startY = A4_HEIGHT_PTS - topMargin - cardH;

    x1 = startX;
    y1 = startY;
  }

  // 2. Render and embed Front Side page
  const docFront = await pdfRenderer.loadPdf(sourcePdfBuffer);
  if (pageNumber < 1 || pageNumber > docFront.getPageCount()) {
    throw new Error('Selected page does not exist.');
  }
  const pageFront = docFront.getPage(pageNumber - 1);
  const { width: pageW, height: pageH } = pageFront.getSize();

  // Determine actual coordinates for front page
  let actualX, actualY, actualWidth, actualHeight;
  const mode = config.cropMappingMode || 'normalized';

  if (mode === 'fixed') {
    actualX = x;
    actualY = y;
    actualWidth = width;
    actualHeight = height;
  } else {
    // normalized mapping
    let normX = config.normalizedCrop?.x;
    let normY = config.normalizedCrop?.y;
    let normWidth = config.normalizedCrop?.width;
    let normHeight = config.normalizedCrop?.height;

    // Fallback calculation for backward compatibility
    if (normX === undefined) {
      const sW = sampleWidth || 595.27;
      const sH = sampleHeight || 841.89;
      normX = x / sW;
      normY = y / sH;
      normWidth = width / sW;
      normHeight = height / sH;
    }

    actualX = normX * pageW;
    actualY = normY * pageH;
    actualWidth = normWidth * pageW;
    actualHeight = normHeight * pageH;
  }

  // Validate front crop is within bounds (with a 0.5 epsilon margin)
  const epsilon = 0.5;
  if (
    actualX < -epsilon ||
    actualY < -epsilon ||
    actualWidth <= 1 ||
    actualHeight <= 1 ||
    (actualX + actualWidth) > (pageW + epsilon) ||
    (actualY + actualHeight) > (pageH + epsilon)
  ) {
    throw new Error('Crop configuration is outside the PDF page.');
  }

  // Clamp safely
  const rx = Math.max(0, Math.min(pageW - 2, actualX));
  const ry = Math.max(0, Math.min(pageH - 2, actualY));
  const rw = Math.max(2, Math.min(pageW - rx, actualWidth));
  const rh = Math.max(2, Math.min(pageH - ry, actualHeight));

  // Embed the front page
  const [embeddedFront] = await targetPdfDoc.embedPages([pageFront]);

  // Compute scaling and offsets to draw ONLY the cropped front region inside [x1, y1, cardW, cardH]
  const scaleX = cardW / rw;
  const scaleY = cardH / rh;
  const dx = x1 - rx * scaleX;
  const dy = y1 - ry * scaleY;
  const dw = pageW * scaleX;
  const dh = pageH * scaleY;

  // Clip target path to Front Card boundaries (sharp rectangular)
  applyRectClipPath(targetPage, x1, y1, cardW, cardH);


  targetPage.drawPage(embeddedFront, {
    x: dx,
    y: dy,
    width: dw,
    height: dh,
  });

  targetPage.pushOperators(popGraphicsState());

  // STEP 8 — TEMPORARY DEBUG LOGGING (Front)
  console.log('PROFILE:');
  console.log('frontCrop:', config.crop);
  console.log('backCrop:', config.cropBack);
  console.log('OUTPUT:');
  console.log('front crop applied:', { x: rx, y: ry, width: rw, height: rh });

  // 3. Render and embed Back Side page if double-sided layout is configured
  if (hasBackSide) {
    const backPageNum = config.cropBack.pageNumber || pageNumber;
    const docBack = await pdfRenderer.loadPdf(sourcePdfBuffer);
    if (backPageNum < 1 || backPageNum > docBack.getPageCount()) {
      throw new Error('Selected page does not exist.');
    }
    const pageBack = docBack.getPage(backPageNum - 1);
    const { width: bPageW, height: bPageH } = pageBack.getSize();

    const { x: bx, y: by, width: bw, height: bh } = config.cropBack;

    let actualBackX, actualBackY, actualBackWidth, actualBackHeight;

    if (mode === 'fixed') {
      actualBackX = bx;
      actualBackY = by;
      actualBackWidth = bw;
      actualBackHeight = bh;
    } else {
      let normBX = config.normalizedCropBack?.x;
      let normBY = config.normalizedCropBack?.y;
      let normBWidth = config.normalizedCropBack?.width;
      let normBHeight = config.normalizedCropBack?.height;

      // Fallback calculation for backward compatibility
      if (normBX === undefined) {
        const sW = sampleWidth || 595.27;
        const sH = sampleHeight || 841.89;
        normBX = bx / sW;
        normBY = by / sH;
        normBWidth = bw / sW;
        normBHeight = bh / sH;
      }

      actualBackX = normBX * bPageW;
      actualBackY = normBY * bPageH;
      actualBackWidth = normBWidth * bPageW;
      actualBackHeight = normBHeight * bPageH;
    }

    if (
      actualBackX < -epsilon ||
      actualBackY < -epsilon ||
      actualBackWidth <= 1 ||
      actualBackHeight <= 1 ||
      (actualBackX + actualBackWidth) > (bPageW + epsilon) ||
      (actualBackY + actualBackHeight) > (bPageH + epsilon)
    ) {
      throw new Error('Crop configuration is outside the PDF page.');
    }

    const rbx = Math.max(0, Math.min(bPageW - 2, actualBackX));
    const rby = Math.max(0, Math.min(bPageH - 2, actualBackY));
    const rbw = Math.max(2, Math.min(bPageW - rbx, actualBackWidth));
    const rbh = Math.max(2, Math.min(bPageH - rby, actualBackHeight));

    // Embed the back page
    const [embeddedBack] = await targetPdfDoc.embedPages([pageBack]);

    // Compute scaling and offsets to draw ONLY the cropped back region inside [x2, y2, cardW, cardH]
    const bScaleX = cardW / rbw;
    const bScaleY = cardH / rbh;
    const bdx = x2 - rbx * bScaleX;
    const bdy = y2 - rby * bScaleY;
    const bdw = bPageW * bScaleX;
    const bdh = bPageH * bScaleY;

    // Clip target path to Back Card boundaries (sharp rectangular)
    applyRectClipPath(targetPage, x2, y2, cardW, cardH);


    targetPage.drawPage(embeddedBack, {
      x: bdx,
      y: bdy,
      width: bdw,
      height: bdh,
    });

    targetPage.pushOperators(popGraphicsState());

    console.log('back crop applied:', { x: rbx, y: rby, width: rbw, height: rbh });
  }

  // Verify expected page count (strictly 1 page containing A4 sheet)
  if (targetPdfDoc.getPageCount() !== 1) {
    throw new Error('Unexpected output PDF page count');
  }

  console.log('FINAL DOCUMENT:');
  console.log('page count:', targetPdfDoc.getPageCount());
  console.log('page dimensions:', `${A4_WIDTH_PTS} x ${A4_HEIGHT_PTS} pts`);
  console.log('layout mode:', config.layoutMode);

  // 4. Save and return target PDF buffer
  return Buffer.from(await targetPdfDoc.save());
};

exports.convertToPoints = convertToPoints;
