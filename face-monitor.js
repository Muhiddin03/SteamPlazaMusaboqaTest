// ─── YUZ KUZATUVI (telefonning o'zida ishlaydi, video serverga yuborilmaydi) ───
// MediaPipe Face Detector: yuz bor-yo'qligi, nechta yuz, bosh burilishi, pastga qarash.
// Qo'shimcha: kadrlar farqi bo'yicha ortiqcha harakatni aniqlash.

const MP_VERSION = '1.0.1';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const SAMPLE_MS = 400;         // sekundiga ~2.5 marta tekshiriladi
const CALIBRATION_SAMPLES = 6; // boshida o'quvchining odatiy holati o'rganiladi
const YAW_LIMIT = 0.32;        // bosh yon tomonga burilishi (ko'z orasi masofasiga nisbatan)
const EAR_YAW_LIMIT = 0.35;   // quloq–ko'z masofalari nisbati bo'yicha burilish
// Kuchli burilish (qog'ozda ishlash rejimida faqat shu hisobga olinadi — biroz yonga qarash kechiriladi)
const STRONG_YAW_LIMIT = 0.55;
const STRONG_EAR_YAW_LIMIT = 0.6;
const PITCH_LIMIT = 0.16;      // pastga qarash
const MOTION_LIMIT = 22;       // kadrlar orasidagi o'rtacha yorqinlik farqi (0–255)

async function createDetector() {
  const { FilesetResolver, FaceDetector } = await import(`${MP_BASE}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
  const make = delegate => FaceDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.5
  });
  try {
    return await make('GPU');
  } catch {
    return make('CPU');
  }
}

// Model ~10 MB — o'quvchi qoidalarni o'qiyotganda oldindan yuklab qo'yiladi
let detectorPromise = null;
export function preloadFaceModel() {
  if (!detectorPromise) {
    detectorPromise = createDetector().catch(err => {
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

const median = arr => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];

// BlazeFace nuqtalari: 0 o'ng ko'z, 1 chap ko'z, 2 burun uchi, 3 og'iz, 4-5 quloqlar
function pose(det) {
  const k = det.keypoints || [];
  if (k.length < 4) return null;
  const [re, le, nose, mouth, rEar, lEar] = k;
  const eyeX = (re.x + le.x) / 2;
  const eyeY = (re.y + le.y) / 2;
  const eyeDist = Math.hypot(le.x - re.x, le.y - re.y) || 1e-6;
  const faceH = Math.max(mouth.y - eyeY, 1e-6);
  // Quloq–ko'z masofalari: bosh burilganda bir tomoni qisqaradi, ikkinchisi uzayadi
  let earYaw = 0;
  if (rEar && lEar) {
    const dr = Math.abs(re.x - rEar.x);
    const dl = Math.abs(lEar.x - le.x);
    earYaw = (dr - dl) / Math.max(dr + dl, 1e-6);
  }
  return {
    yaw: (nose.x - eyeX) / eyeDist,       // 0 atrofida — to'g'ri qaragan
    earYaw,                               // -1..1, 0 atrofida — to'g'ri qaragan
    pitch: (nose.y - eyeY) / faceH        // kattalashsa — pastga egilgan
  };
}

/**
 * video elementni kuzatadi va har tekshiruvda onSample({ faces, turned, down, motion }) chaqiradi.
 * Qaytaradi: { stop() }
 */
export async function startFaceMonitor(video, onSample) {
  const detector = await preloadFaceModel();

  const small = document.createElement('canvas');
  small.width = 32;
  small.height = 24;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  let prevGray = null;

  const calib = { yaw: [], earYaw: [], pitch: [] };
  let base = null;
  let timer = null;
  let stopped = false;
  let lastTs = 0;

  function motionLevel() {
    sctx.drawImage(video, 0, 0, small.width, small.height);
    const px = sctx.getImageData(0, 0, small.width, small.height).data;
    const gray = new Uint8Array(small.width * small.height);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) gray[j] = (px[i] * 3 + px[i + 1] * 6 + px[i + 2]) / 10;
    let diff = 0;
    if (prevGray) for (let j = 0; j < gray.length; j++) diff += Math.abs(gray[j] - prevGray[j]);
    const level = prevGray ? diff / gray.length : 0;
    prevGray = gray;
    return level;
  }

  function tick() {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        let ts = performance.now();
        if (ts <= lastTs) ts = lastTs + 1;
        lastTs = ts;
        const result = detector.detectForVideo(video, ts);
        const faces = (result.detections || []).filter(d => (d.categories?.[0]?.score ?? 1) >= 0.5);
        const sample = { faces: faces.length, turned: false, strongTurn: false, down: false, motion: motionLevel() > MOTION_LIMIT };

        if (faces.length === 1) {
          const p = pose(faces[0]);
          sample.pose = p;
          if (p) {
            if (!base) {
              calib.yaw.push(p.yaw);
              calib.earYaw.push(p.earYaw);
              calib.pitch.push(p.pitch);
              if (calib.yaw.length >= CALIBRATION_SAMPLES) {
                base = { yaw: median(calib.yaw), earYaw: median(calib.earYaw), pitch: median(calib.pitch) };
              }
            } else {
              const dYaw = Math.abs(p.yaw - base.yaw);
              const dEar = Math.abs(p.earYaw - base.earYaw);
              sample.turned = dYaw > YAW_LIMIT || dEar > EAR_YAW_LIMIT;
              sample.strongTurn = dYaw > STRONG_YAW_LIMIT || dEar > STRONG_EAR_YAW_LIMIT;
              sample.down = p.pitch - base.pitch > PITCH_LIMIT;
            }
          }
        }
        onSample(sample);
      }
    } catch (err) {
      console.warn('Yuz kuzatuvi xatosi:', err);
    }
    timer = setTimeout(tick, SAMPLE_MS);
  }

  tick();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      try { detector.close(); } catch { /* ignore */ }
      detectorPromise = null;
    }
  };
}
