// Voice Test - Enhanced Speech Synthesizer with Phoneme Support
// Uses Web Audio API with formant synthesis for more realistic speech

// Initialize audio context
const ctx = new (window.AudioContext || window.webkitAudioContext)();

// Formant frequencies for vowels and diphthongs (F1, F2, F3)
const phonemeFormants = {
    a: [730, 1090, 2440],
    e: [530, 1840, 2480],
    i: [270, 2290, 3010],
    o: [570, 840, 2410],
    u: [300, 870, 2240],
    ay: [660, 1720, 2410],
    ey: [530, 1840, 2480],
    ow: [570, 920, 2560],
    oi: [550, 1000, 2400],
    ee: [270, 2290, 3010],
    oo: [300, 870, 2240],
    ou: [570, 920, 2560],
    ai: [660, 1720, 2410],
    ea: [270, 2290, 3010],
    oa: [570, 840, 2410],
    aw: [730, 1090, 2440],
    er: [490, 1350, 1690],
    ar: [700, 1220, 2600],
    or: [570, 840, 2410],
    ur: [490, 1350, 1690],
    ir: [490, 1350, 1690]
};

// Phoneme patterns to recognize
const phonemePatterns = [
    { pattern: "ough", phonemes: ["ow"] },
    { pattern: "augh", phonemes: ["aw"] },
    { pattern: "eigh", phonemes: ["ay"] },
    { pattern: "tion", phonemes: ["sh", "u", "n"] },
    { pattern: "sion", phonemes: ["zh", "u", "n"] },
    { pattern: "ou", phonemes: ["ow"] },
    { pattern: "ow", phonemes: ["ow"] },
    { pattern: "oi", phonemes: ["oi"] },
    { pattern: "oy", phonemes: ["oi"] },
    { pattern: "ay", phonemes: ["ay"] },
    { pattern: "ey", phonemes: ["ey"] },
    { pattern: "ai", phonemes: ["ay"] },
    { pattern: "ea", phonemes: ["ee"] },
    { pattern: "ee", phonemes: ["ee"] },
    { pattern: "oo", phonemes: ["oo"] },
    { pattern: "oa", phonemes: ["oa"] },
    { pattern: "aw", phonemes: ["aw"] },
    { pattern: "er", phonemes: ["er"] },
    { pattern: "ar", phonemes: ["ar"] },
    { pattern: "or", phonemes: ["or"] },
    { pattern: "ur", phonemes: ["ur"] },
    { pattern: "ir", phonemes: ["ir"] },
    { pattern: "th", phonemes: ["th"] },
    { pattern: "sh", phonemes: ["sh"] },
    { pattern: "ch", phonemes: ["ch"] },
    { pattern: "ph", phonemes: ["f"] },
    { pattern: "wh", phonemes: ["w"] },
    { pattern: "ng", phonemes: ["ng"] },
    { pattern: "ck", phonemes: ["k"] },
    { pattern: "gh", phonemes: [] }
];

// Base pitch tracking
let basePitch = 120;

function envelope(gainNode, duration, peak, shape) {
    duration = duration || 0.15;
    peak = peak || 0.4;
    shape = shape || "normal";
    
    const now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0, now);
    
    if (shape === "normal") {
        gainNode.gain.linearRampToValueAtTime(peak, now + duration * 0.3);
        gainNode.gain.linearRampToValueAtTime(0, now + duration);
    } else if (shape === "consonant") {
        gainNode.gain.linearRampToValueAtTime(peak, now + duration * 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    }
}

function createFormantFilter(frequency, q) {
    q = q || 10;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    return filter;
}

function playPhoneme(phoneme, pitch, duration, prevPhoneme, nextPhoneme, stress) {
    pitch = pitch || basePitch;
    duration = duration || 0.15;
    stress = stress || 1.0;
    
    const formants = phonemeFormants[phoneme] || phonemeFormants.a;
    duration = duration * stress;
    const amplitudeMod = stress;
    
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = pitch;
    
    const vibrato = ctx.createOscillator();
    vibrato.type = "sine";
    vibrato.frequency.value = 5;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = pitch * 0.01;
    vibrato.connect(vibratoGain).connect(osc.frequency);
    
    const formant1 = createFormantFilter(formants[0], 10);
    const formant2 = createFormantFilter(formants[1], 15);
    const formant3 = createFormantFilter(formants[2], 20);
    
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();
    const gain3 = ctx.createGain();
    
    gain1.gain.value = 0;
    gain2.gain.value = 0;
    gain3.gain.value = 0;
    
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    
    osc.connect(formant1).connect(gain1).connect(masterGain);
    osc.connect(formant2).connect(gain2).connect(masterGain);
    osc.connect(formant3).connect(gain3).connect(masterGain);
    masterGain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (prevPhoneme && isVowelPhoneme(prevPhoneme)) {
        const prevFormants = phonemeFormants[prevPhoneme];
        formant1.frequency.setValueAtTime(prevFormants[0], now);
        formant2.frequency.setValueAtTime(prevFormants[1], now);
        formant3.frequency.setValueAtTime(prevFormants[2], now);
        
        formant1.frequency.linearRampToValueAtTime(formants[0], now + duration * 0.4);
        formant2.frequency.linearRampToValueAtTime(formants[1], now + duration * 0.4);
        formant3.frequency.linearRampToValueAtTime(formants[2], now + duration * 0.4);
    }
    
    if (nextPhoneme && isVowelPhoneme(nextPhoneme)) {
        const nextFormants = phonemeFormants[nextPhoneme];
        formant1.frequency.linearRampToValueAtTime(nextFormants[0], now + duration);
        formant2.frequency.linearRampToValueAtTime(nextFormants[1], now + duration);
        formant3.frequency.linearRampToValueAtTime(nextFormants[2], now + duration);
    }
    
    envelope(gain1, duration, 0.3 * amplitudeMod);
    envelope(gain2, duration, 0.2 * amplitudeMod);
    envelope(gain3, duration, 0.1 * amplitudeMod);
    envelope(masterGain, duration, 0.25 * amplitudeMod);
    
    vibrato.start();
    osc.start();
    osc.stop(now + duration);
    vibrato.stop(now + duration);
}

function playNoiseBurst(duration, filterFreq, amplitude) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * amplitude;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = filterFreq;
    
    const gain = ctx.createGain();
    gain.gain.value = 0;
    
    noise.connect(filter).connect(gain).connect(ctx.destination);
    envelope(gain, duration, amplitude, "consonant");
    
    noise.start();
}

function playNasalSound(duration, phoneme, amplitudeMod) {
    amplitudeMod = amplitudeMod || 1.0;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    
    const freq = phoneme === "m" ? 220 : phoneme === "ng" ? 280 : 250;
    osc.frequency.value = freq;
    
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq + 50;
    filter.Q.value = 5;
    
    const gain = ctx.createGain();
    gain.gain.value = 0;
    
    osc.connect(filter).connect(gain).connect(ctx.destination);
    envelope(gain, duration, 0.2 * amplitudeMod);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
}

function playConsonant(phoneme, type, duration, stress) {
    type = type || "normal";
    duration = duration || 0.06;
    stress = stress || 1.0;
    
    const amplitudeMod = stress;
    
    if (phoneme === "s" || phoneme === "z") {
        playNoiseBurst(duration * 1.5, 7000, 0.25 * amplitudeMod);
    } else if (phoneme === "sh" || phoneme === "zh") {
        playNoiseBurst(duration * 1.5, 4500, 0.28 * amplitudeMod);
    } else if (phoneme === "f" || phoneme === "v") {
        playNoiseBurst(duration * 1.4, 6000, 0.22 * amplitudeMod);
    } else if (phoneme === "th") {
        playNoiseBurst(duration * 1.3, 5500, 0.20 * amplitudeMod);
    } else if (phoneme === "h") {
        playNoiseBurst(duration * 1.2, 3000, 0.18 * amplitudeMod);
    } else if (type === "plosive") {
        const freq = (phoneme === "p" || phoneme === "b") ? 1500 :
                     (phoneme === "t" || phoneme === "d") ? 3500 : 2500;
        playNoiseBurst(duration * 0.4, freq, 0.5 * amplitudeMod);
    } else if (type === "nasal") {
        playNasalSound(duration, phoneme, amplitudeMod);
    } else if (type === "affricate") {
        playNoiseBurst(duration * 0.3, 2500, 0.5 * amplitudeMod);
        setTimeout(function() {
            playNoiseBurst(duration * 0.7, 6000, 0.3 * amplitudeMod);
        }, duration * 300);
    } else {
        const freq = 3500 + Math.random() * 1000;
        playNoiseBurst(duration, freq, 0.32 * amplitudeMod);
    }
}

function getConsonantType(phoneme) {
    const plosives = ["p", "b", "t", "d", "k", "g"];
    const fricatives = ["f", "v", "s", "z", "h", "sh", "th", "zh"];
    const nasals = ["m", "n", "ng"];
    const affricates = ["ch", "j"];
    
    if (plosives.indexOf(phoneme) !== -1) return "plosive";
    if (fricatives.indexOf(phoneme) !== -1) return "fricative";
    if (nasals.indexOf(phoneme) !== -1) return "nasal";
    if (affricates.indexOf(phoneme) !== -1) return "affricate";
    return "normal";
}

function textToPhonemes(text) {
    const phonemes = [];
    let i = 0;
    
    while (i < text.length) {
        let matched = false;
        
        for (let p = 0; p < phonemePatterns.length; p++) {
            const pattern = phonemePatterns[p].pattern;
            const patternPhonemes = phonemePatterns[p].phonemes;
            
            if (text.substring(i, i + pattern.length) === pattern) {
                for (let j = 0; j < patternPhonemes.length; j++) {
                    phonemes.push(patternPhonemes[j]);
                }
                i += pattern.length;
                matched = true;
                break;
            }
        }
        
        if (!matched) {
            const char = text[i];
            if (char.match(/[aeiou]/)) {
                phonemes.push(char);
            } else if (char.match(/[a-z]/)) {
                phonemes.push(char);
            } else if (char.match(/[.!?]/)) {
                phonemes.push(".");
            } else if (char === ",") {
                phonemes.push(",");
            } else if (char === " ") {
                phonemes.push(" ");
            }
            i++;
        }
    }
    
    return phonemes;
}

function getPitchForPosition(index, totalLength, isQuestion) {
    const position = index / totalLength;
    
    if (isQuestion) {
        return basePitch + (position * 40);
    } else {
        if (position < 0.3) {
            return basePitch + 10;
        } else if (position > 0.7) {
            return basePitch - 20;
        }
        return basePitch;
    }
}

function isVowelPhoneme(phoneme) {
    return phoneme in phonemeFormants;
}

function speakFallback(text) {
    let t = 0;
    const lowerText = text.toLowerCase();
    const isQuestion = text.trim().endsWith("?");
    
    const phonemes = textToPhonemes(lowerText);
    const totalPhonemes = phonemes.filter(function(p) {
        return p !== " " && p !== "." && p !== ",";
    }).length;
    let phonemeIndex = 0;
    
    for (let i = 0; i < phonemes.length; i++) {
        const phoneme = phonemes[i];
        const prevPhoneme = i > 0 ? phonemes[i - 1] : null;
        const nextPhoneme = i < phonemes.length - 1 ? phonemes[i + 1] : null;
        
        const pitch = getPitchForPosition(phonemeIndex, totalPhonemes, isQuestion);
        const stress = (prevPhoneme === " " || prevPhoneme === null) ? 1.15 : 1.0;
        
        if (phoneme === " ") {
            t += 80;
        } else if (phoneme === ".") {
            t += 400;
        } else if (phoneme === ",") {
            t += 250;
        } else if (isVowelPhoneme(phoneme)) {
            let duration = 0.11;
            
            if (nextPhoneme === " " || nextPhoneme === "." || nextPhoneme === ",") {
                duration *= 1.2;
            }
            
            duration *= stress;
            
            setTimeout((function(ph, pi, dur, prev, next, str) {
                return function() {
                    playPhoneme(ph, pi, dur, prev, next, str);
                };
            })(phoneme, pitch, duration, prevPhoneme, nextPhoneme, stress), t);
            
            t += duration * 1000;
            phonemeIndex++;
        } else {
            const consonantType = getConsonantType(phoneme);
            let duration = 0.06;
            
            if (consonantType === "fricative" || phoneme === "s" || phoneme === "z" || phoneme === "sh") {
                duration = 0.095;
            } else if (consonantType === "affricate") {
                duration = 0.085;
            } else if (consonantType === "plosive") {
                duration = 0.045;
            } else if (consonantType === "nasal") {
                duration = 0.08;
            }
            
            if (nextPhoneme && !isVowelPhoneme(nextPhoneme) && nextPhoneme !== " ") {
                duration *= 0.85;
            }
            
            setTimeout((function(ph, ct, dur, str) {
                return function() {
                    playConsonant(ph, ct, dur, str);
                };
            })(phoneme, consonantType, duration, stress), t);
            
            t += duration * 1000;
            phonemeIndex++;
        }
    }
    
    if (text.match(/[.!?]$/)) {
        t += 350;
    }
    
    return t;
}

document.addEventListener("DOMContentLoaded", function() {
    const textInput = document.getElementById("text-input");
    const speakBtn = document.getElementById("speak-btn");
    const exampleBtns = document.querySelectorAll(".example-btn");

    speakBtn.addEventListener("click", function() {
        const text = textInput.value.trim();
        
        if (!text) {
            alert("Please enter some text to synthesize.");
            return;
        }

        if (ctx.state === "suspended") {
            ctx.resume();
        }

        speakBtn.disabled = true;
        speakBtn.textContent = "🔊 Speaking...";

        const duration = speakFallback(text);

        setTimeout(function() {
            speakBtn.disabled = false;
            speakBtn.textContent = "🔊 Speak";
        }, duration);
    });

    exampleBtns.forEach(function(btn) {
        btn.addEventListener("click", function() {
            const exampleText = btn.getAttribute("data-text");
            textInput.value = exampleText;
            speakBtn.click();
        });
    });

    textInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            speakBtn.click();
        }
    });
});
