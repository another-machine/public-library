export const worker = /* js */ `
let nextTick = 0;
let timeoutId = null;
let isRunning = false;
let startTime = 0;
let beatIndex = 0;
let bpm = 120;
let swing = 0;  // 0-1 range
let subdivision = 8;

const getTime = () => performance.now();

const calculateSwingOffset = (beatIndex) => {
  // Allow all beats to trigger, don't return early if swing is 0
  const isSwingBeat = beatIndex % 2 === 1;
  if (!isSwingBeat) return 0;
  
  const baseInterval = (60 / bpm) * (4 / subdivision) * 1000;
  // At swing = 1, offset will be 66% of the interval
  return swing * 0.66 * baseInterval;
};

const calculateNextTick = (now) => {
  const baseIntervalMs = (60 / bpm) * (4 / subdivision) * 1000;
  const swingOffset = calculateSwingOffset(beatIndex);
  const expectedTime = startTime + (beatIndex * baseIntervalMs) + swingOffset;
  
  if (Math.abs(now - expectedTime) > 100) {
    startTime = now;
    beatIndex = 0;
    return now + baseIntervalMs;
  }
  
  return expectedTime + baseIntervalMs + 
         (beatIndex % 2 === 0 ? calculateSwingOffset(beatIndex + 1) : 0);
};

const scheduleNextTick = () => {
  if (!isRunning) return;

  const now = getTime();
  nextTick = calculateNextTick(now);
  const delay = Math.max(0, nextTick - now);

  if (delay > 25) {
    timeoutId = setTimeout(() => requestAnimationFrame(tick), delay - 16);
  } else {
    requestAnimationFrame(tick);
  }
};

const tick = () => {
  if (!isRunning) return;

  const now = getTime();
  
  if (now >= nextTick - 16) {
    self.postMessage({ 
      type: 'tick',
      timestamp: now,
      beatIndex,
    });
    
    beatIndex++;
    scheduleNextTick();
  } else {
    requestAnimationFrame(tick);
  }
};

self.onmessage = (e) => {
  switch (e.data.command) {
    case 'start':
      if (isRunning) return;
      bpm = e.data.bpm || 120;
      swing = e.data.swing ?? 0;
      subdivision = e.data.subdivision ?? 8;
      isRunning = true;
      startTime = getTime();
      beatIndex = 0;
      scheduleNextTick();
      break;
      
    case 'stop':
      isRunning = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      break;
      
    case 'set-bpm':
      bpm = e.data.bpm;
      startTime = getTime();
      beatIndex = 0;
      break;
      
    case 'set-swing':
      swing = Math.min(1, Math.max(0, e.data.swing));
      subdivision = e.data.subdivision ?? subdivision;
      console.log('Swing set to:', swing); // Debug log
      break;
  }
};
`;
