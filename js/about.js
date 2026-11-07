// Qui sommes-nous : la signature sonore. Le son ne part que sur clic, jamais tout seul.
// Les barres s'allument une par une, calées sur les 5 notes du jingle.
const btn = document.getElementById('sig-btn');
const audio = document.getElementById('sig-audio');
const notes = [...document.querySelectorAll('.note')];
const label = btn.querySelector('.sig-label');
// Début de chaque note dans jingle-court.mp3 (secondes) ; le do est tenu jusqu'à ~5,3 s.
const ONSETS = [3.0, 3.14, 3.28, 3.42, 3.56];
const LAST_END = 5.3;
let raf = 0;

function light(i) { notes.forEach((n, j) => n.classList.toggle('on', j === i)); }

function tick() {
  const t = audio.currentTime;
  let i = -1;
  for (let k = 0; k < ONSETS.length; k++) if (t >= ONSETS[k]) i = k;
  if (i === ONSETS.length - 1 && t > LAST_END) i = -1;
  light(i);
  if (!audio.paused) raf = requestAnimationFrame(tick);
}

function reset() {
  cancelAnimationFrame(raf);
  light(-1);
  btn.setAttribute('aria-pressed', 'false');
  label.textContent = 'ÉCOUTER LES 5 NOTES';
}

btn.addEventListener('click', async () => {
  if (!audio.paused) { audio.pause(); audio.currentTime = 0; reset(); return; }
  try {
    audio.currentTime = 0;
    await audio.play();
    btn.setAttribute('aria-pressed', 'true');
    label.textContent = 'ARRÊTER';
    raf = requestAnimationFrame(tick);
  } catch (e) { reset(); }
});
audio.addEventListener('ended', reset);
audio.addEventListener('pause', () => { if (audio.currentTime === 0 || audio.ended) reset(); });
