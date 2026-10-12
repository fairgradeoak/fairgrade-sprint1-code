import { mkdir, writeFile, readFile, copyFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve('public'); const provenance = [];
async function download(url, relative) {
  const path = resolve(root, relative); await mkdir(dirname(path), { recursive: true });
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw Error(`Download ${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length) throw Error(`Empty download: ${url}`);
  await writeFile(path, bytes);
  provenance.push({ file: relative, source: url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  console.log(`Saved ${relative} (${bytes.length} bytes)`); return bytes;
}
try {
  await download('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs', 'vendor/vision_bundle.mjs');
  for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
    await download(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm/${file}`, `vendor/mediapipe-wasm/${file}`);
  }
  await download('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', 'vendor/tf.min.js');
  await download('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js', 'vendor/face-api.min.js');
  await download('https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite', 'models/face_detector.tflite');
  await download('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', 'models/face_landmarker.task');
  const identityBase = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/v0.22.2/weights';
  for (const name of ['tiny_face_detector', 'face_landmark_68_tiny', 'face_recognition']) {
    const manifestName = `${name}_model-weights_manifest.json`;
    const manifest = JSON.parse((await download(`${identityBase}/${manifestName}`, `models/identity/${manifestName}`)).toString());
    for (const file of new Set(manifest.flatMap(group => group.paths))) {
      if (file !== basename(file)) throw Error('Unexpected weight shard path');
      await download(`${identityBase}/${file}`, `models/identity/${file}`);
    }
  }
  const yoloIndex = process.argv.indexOf('--yolo-dir');
  if (yoloIndex >= 0 && process.argv[yoloIndex + 1]) {
    const inputDir = resolve(process.argv[yoloIndex + 1]), outputDir = resolve(root, 'models/yolov8n'); await mkdir(outputDir, { recursive: true });
    const model = JSON.parse(await readFile(resolve(inputDir, 'model.json'), 'utf8'));
    const paths = ['model.json', ...new Set(model.weightsManifest.flatMap(group => group.paths))];
    for (const file of paths) {
      if (file !== basename(file)) throw Error('Expected flat YOLO export directory');
      await copyFile(resolve(inputDir, file), resolve(outputDir, file));
      const bytes = await readFile(resolve(outputDir, file));
      provenance.push({ file: `models/yolov8n/${file}`, source: `local-yolov8n-export/${file}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  await mkdir(resolve(root, 'models'), { recursive: true });
  await writeFile(resolve(root, 'models/provenance.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), files: provenance }, null, 2));
  await stat(resolve(root, 'models/yolov8n/model.json')).catch(() => { throw Error('YOLO export missing. See docs/MODELS.md; rerun with --yolo-dir PATH_TO_EXPORT. Other assets have been saved.'); });
  console.log('Model assets present. Live browser inference still requires verification on your device.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
