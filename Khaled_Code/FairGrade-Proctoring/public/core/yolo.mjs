export function iou(a, b) {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return w * h / Math.max(1e-8, a.width * a.height + b.width * b.height - w * h);
}

// Standard COCO YOLOv8 detect export, no embedded NMS: [1,84,N] or [1,N,84].
// YOLOv8 has class scores and NO separate objectness channel.
export function decodeYolo(data, shape, { size = 640, width, height, confidence = 0.55, nms = 0.45 } = {}) {
  if (shape.length !== 3 || shape[0] !== 1 || !(shape[1] === 84 || shape[2] === 84)) {
    throw Error(`Unsupported YOLO output ${shape.join('x')}; require COCO YOLOv8n, raw 84-channel output`);
  }
  const channelFirst = shape[1] === 84, count = channelFirst ? shape[2] : shape[1];
  const at = (row, channel) => data[channelFirst ? channel * count + row : row * 84 + channel];
  const scale = Math.min(size / width, size / height);
  const scaledWidth = Math.round(width * scale), scaledHeight = Math.round(height * scale);
  const px = Math.floor((size - scaledWidth) / 2), py = Math.floor((size - scaledHeight) / 2);
  const candidates = [];
  for (let i = 0; i < count; i++) {
    let cls = 0, score = at(i, 4);
    for (let c = 1; c < 80; c++) if (at(i, c + 4) > score) { cls = c; score = at(i, c + 4); }
    if ((cls !== 0 && cls !== 67) || score < confidence || !Number.isFinite(score)) continue;
    const x = Math.max(0, (at(i, 0) - at(i, 2) / 2 - px) / scale);
    const y = Math.max(0, (at(i, 1) - at(i, 3) / 2 - py) / scale);
    const right = Math.min(width, (at(i, 0) + at(i, 2) / 2 - px) / scale);
    const bottom = Math.min(height, (at(i, 1) + at(i, 3) / 2 - py) / scale);
    if (![x, y, right, bottom].every(Number.isFinite) || right <= x || bottom <= y) continue;
    candidates.push({ classId: cls, label: cls === 0 ? 'person' : 'cell phone', score, x, y, width: right - x, height: bottom - y });
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const box of candidates) {
    if (!kept.some(k => k.classId === box.classId && iou(k, box) > nms)) kept.push(box);
    if (kept.length >= 30) break;
  }
  return kept;
}
