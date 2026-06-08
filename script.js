let currentBuffer = null;
const recorder = new AudioRecorder();
const sampleRate = 44100;
let audioCtx = null;
let sourceNode = null;

// UI Elements
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const playBtn = document.getElementById('playBtn');
const loadBtn = document.getElementById('loadBtn');
const loadFile = document.getElementById('loadFile');
const saveBtn = document.getElementById('saveBtn');
const waveform = document.getElementById('waveform');
const canvasCtx = waveform.getContext('2d');

// EQ Bands (20 Bands)
const frequencies = [
    31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 
    315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500
];
const eqBandsContainer = document.getElementById('eq-bands');
const bandGains = frequencies.map(() => 0);

frequencies.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'eq-band';
    div.innerHTML = `
        <input type="range" min="-12" max="12" value="0" step="1" data-index="${i}">
        <label>${f < 1000 ? f : (f/1000)+'k'}</label>
    `;
    div.querySelector('input').oninput = (e) => {
        bandGains[i] = parseFloat(e.target.value);
    };
    eqBandsContainer.appendChild(div);
});

// Main Controls
recordBtn.onclick = async () => {
    await recorder.start();
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    recordBtn.classList.add('active');
    drawLive();
};

stopBtn.onclick = () => {
    currentBuffer = recorder.stop();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    playBtn.disabled = false;
    saveBtn.disabled = false;
    recordBtn.classList.remove('active');
    drawBuffer();
};

playBtn.onclick = () => {
    if (!currentBuffer) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (sourceNode) sourceNode.stop();

    const buffer = audioCtx.createBuffer(1, currentBuffer.length, sampleRate);
    buffer.copyToChannel(currentBuffer, 0);
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = buffer;
    
    // Apply real-time gain and rate
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = parseFloat(document.getElementById('gainSlider').value);
    sourceNode.playbackRate.value = parseFloat(document.getElementById('rateSlider').value);
    
    sourceNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    sourceNode.start();
};

loadBtn.onclick = () => loadFile.click();
loadFile.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    if (!audioCtx) audioCtx = new AudioContext();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    currentBuffer = decoded.getChannelData(0);
    playBtn.disabled = false;
    saveBtn.disabled = false;
    drawBuffer();
};

saveBtn.onclick = () => {
    if (!currentBuffer) return;
    const blob = AudioRecorder.encodeMP3(currentBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recording.mp3';
    a.click();
};

// Effects Wiring
const applyEffect = async (fn, ...args) => {
    if (!currentBuffer) return;
    currentBuffer = await fn(currentBuffer, ...args);
    drawBuffer();
};

document.getElementById('fadeInBtn').onclick = () => applyEffect(AudioEffects.fadeIn, 2, sampleRate);
document.getElementById('fadeOutBtn').onclick = () => applyEffect(AudioEffects.fadeOut, 2, sampleRate);
document.getElementById('normalizeBtn').onclick = () => applyEffect(AudioEffects.normalize);
document.getElementById('reverseBtn').onclick = () => applyEffect(AudioEffects.reverse);
document.getElementById('invertBtn').onclick = () => applyEffect(AudioEffects.invert);
document.getElementById('removeSilenceBtn').onclick = () => applyEffect(AudioEffects.removeSilence, 0.01);
document.getElementById('compressorBtn').onclick = () => applyEffect(AudioEffects.applyCompressor, sampleRate);
document.getElementById('reverbBtn').onclick = () => applyEffect(AudioEffects.applyReverb, sampleRate);
document.getElementById('delayBtn').onclick = () => applyEffect(AudioEffects.applyDelay, sampleRate);
document.getElementById('distortionBtn').onclick = () => applyEffect(AudioEffects.applyDistortion, sampleRate);

document.getElementById('limiterBtn').onclick = () => applyEffect(async (buf) => {
    const out = new Float32Array(buf.length);
    for(let i=0; i<buf.length; i++) {
        out[i] = Math.max(-0.8, Math.min(0.8, buf[i]));
    }
    return out;
});

document.getElementById('noiseRedBtn').onclick = () => applyEffect(async (buf) => {
    // Simple Noise Gate as a proxy for Noise Reduction
    const out = new Float32Array(buf.length);
    const threshold = 0.02;
    for(let i=0; i<buf.length; i++) {
        out[i] = Math.abs(buf[i]) < threshold ? 0 : buf[i];
    }
    return out;
});

// EQ Apply (runs on all bands)
const eqBtn = document.createElement('button');
eqBtn.innerText = 'Apply EQ';
eqBtn.className = 'btn-fx full-width';
eqBtn.onclick = () => {
    const bands = frequencies.map((f, i) => ({ f, g: bandGains[i] }));
    applyEffect(AudioEffects.applyEQ, sampleRate, bands);
};
document.querySelector('.eq-container').appendChild(eqBtn);

// Visualization
function drawBuffer() {
    if (!currentBuffer) return;
    const width = waveform.width = waveform.offsetWidth;
    const height = waveform.height = waveform.offsetHeight;
    canvasCtx.fillStyle = '#000';
    canvasCtx.fillRect(0, 0, width, height);
    canvasCtx.strokeStyle = '#4CAF50';
    canvasCtx.beginPath();
    
    const step = Math.ceil(currentBuffer.length / width);
    const amp = height / 2;
    for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
            const datum = currentBuffer[(i * step) + j];
            if (datum < min) min = datum;
            if (datum > max) max = datum;
        }
        canvasCtx.lineTo(i, (1 + min) * amp);
        canvasCtx.lineTo(i, (1 + max) * amp);
    }
    canvasCtx.stroke();
}

function drawLive() {
    if (!recorder.recording) return;
    // Basic live feedback could be added here using AnalyserNode
    requestAnimationFrame(drawLive);
}

// Initial Canvas Size
window.onresize = drawBuffer;
drawBuffer();
