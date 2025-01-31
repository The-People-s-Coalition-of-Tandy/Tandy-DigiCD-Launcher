// Constants
const PNG_HEADER = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const DIGCD_CHUNK_TYPE = 'juLi';
const SILENT_AUDIO = "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

import { physicsScene } from '../physics/scene.js';

// DOM Elements
const elements = {
    fileInput: document.getElementById('fileInput'),
    previewImage: document.getElementById('previewImage'),
    albumCover: document.getElementById('albumCover'),
    audioPlayer: document.getElementById('audioPlayer'),
    playButton: document.getElementById('playButton'),
    uploadLabel: document.getElementById('uploadLabel')
};

const corruptionBackupFiles = {
    '777': {music: './assets/backups/777.mp3', midi: './assets/backups/777.mid'},
    '909': {music: './assets/backups/909.mp3', midi: './assets/backups/909.mid'}
}

let isPlaying = false;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Add after the constants section
const ORIGINAL_WIDTH = 1419;
const ORIGINAL_HEIGHT = 1412;
const COLOR_POSITIONS = [
    {x: 624/ORIGINAL_WIDTH, y: 848/ORIGINAL_HEIGHT},
    {x: 669/ORIGINAL_WIDTH, y: 876/ORIGINAL_HEIGHT},
    {x: 719/ORIGINAL_WIDTH, y: 877/ORIGINAL_HEIGHT},
    {x: 767/ORIGINAL_WIDTH, y: 867/ORIGINAL_HEIGHT},
    {x: 813/ORIGINAL_WIDTH, y: 855/ORIGINAL_HEIGHT}
];

// Add new constant for MIDI chunk
const MIDI_CHUNK_TYPE = 'miDi';

// File Reading Utilities
async function readFileAsBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = event => resolve(new Uint8Array(event.target.result));
        reader.onerror = error => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

function getBigEndian(buffer, offset) {
    return buffer.slice(offset, offset + 4).reduce((val, byte) => (val << 8) | byte, 0);
}

// PNG Processing
function validatePNGHeader(buffer) {
    const header = buffer.slice(0, 8);
    return header.every((byte, i) => byte === PNG_HEADER[i]);
}

// Modify extractMP3FromPNG to handle both audio and MIDI data
async function extractDataFromPNG(buffer) {
    let position = 8; // Skip PNG header
    const data = { audio: null, midi: null };
    console.log('Starting PNG extraction, buffer length:', buffer.length);

    while (position < buffer.length) {
        const chunkLength = getBigEndian(buffer, position);
        position += 4;
        
        const chunkType = String.fromCharCode(...buffer.slice(position, position + 4));
        position += 4;

        console.log(`Found chunk: ${chunkType}, length: ${chunkLength}`);

        if (chunkType === DIGCD_CHUNK_TYPE) {
            console.log('Found DigiCD audio chunk');
            data.audio = buffer.slice(position, position + chunkLength);
        } else if (chunkType === MIDI_CHUNK_TYPE) {
            console.log('Found MIDI chunk');
            data.midi = buffer.slice(position, position + chunkLength);
        }

        position += chunkLength + 4; // Skip chunk data and CRC
    }

    console.log('Extraction complete. Found:', {
        hasAudio: !!data.audio,
        audioLength: data.audio?.length,
        hasMidi: !!data.midi,
        midiLength: data.midi?.length
    });

    if (!data.audio && !data.midi) {
        throw new Error('No DigiCD data found in this file');
    }

    return data;
}

// Audio Processing
async function processAudioData(audioData) {
    const blob = new Blob([audioData], { type: 'audio/mp3' });
    const audioUrl = URL.createObjectURL(blob);
    
    elements.audioPlayer.src = audioUrl;
    await extractAlbumArt(blob);
    
    return audioUrl;
}

async function extractAlbumArt(audioBlob) {
    return new Promise((resolve) => {
        window.jsmediatags.read(audioBlob, {
            onSuccess: (tag) => {
                const picture = tag.tags.picture;
                if (picture) {
                    const base64String = picture.data.reduce((str, byte) => str + String.fromCharCode(byte), '');
                    const imageUri = `data:${picture.format};base64,${window.btoa(base64String)}`;
                    elements.albumCover.src = imageUri;
                    elements.albumCover.style.display = 'block';
                }
                resolve();
            },
            onError: () => resolve() // Silently fail if no album art
        });
    });
}

// UI Handlers
function updateUIForPlayback(isPlaying) {
    elements.previewImage.classList.toggle('playing', isPlaying);
    elements.albumCover.classList.toggle('playing', isPlaying);
}

// Add these new utility functions
function getClosestColor(r, g, b) {
    const threshold = 80;
    const difference = 20;
    
    const redGreenDiff = Math.abs(r - g);
    const redBlueDiff = Math.abs(r - b);
    const greenBlueDiff = Math.abs(g - b);
    
    const isRed = r > threshold && redGreenDiff > difference && redBlueDiff > difference;
    const isGreen = g > threshold && redGreenDiff > difference && greenBlueDiff > difference;
    const isBlue = b > threshold && redBlueDiff > difference && greenBlueDiff > difference;
    
    const isGrayish = Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30;
    if (isGrayish) return 'black';
    
    if (isRed) return 'red';
    if (isGreen) return 'green';
    if (isBlue) return 'blue';
    
    const max = Math.max(r, g, b);
    if (max === r) return 'red';
    if (max === g) return 'green';
    if (max === b) return 'blue';
    
    return 'black';
}

async function decodeNumber(imageUrl) {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    return new Promise((resolve) => {
        img.onload = function() {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const colors = ['red', 'green', 'blue', 'black'];
            let base4 = '';

            COLOR_POSITIONS.forEach(pos => {
                const x = Math.round(pos.x * img.width);
                const y = Math.round(pos.y * img.height);
                
                const pixel = ctx.getImageData(x, y, 1, 1).data;
                const color = getClosestColor(pixel[0], pixel[1], pixel[2]);
                base4 += colors.indexOf(color);
            });

            const number = parseInt(base4, 4);
            resolve(number);
        };
        img.src = imageUrl;
    });
}

// Modify handleFilePreview to use the new extraction function
async function handleFilePreview() {
    const file = elements.fileInput.files[0];
    if (!file) {
        elements.playButton.classList.remove('visible');
        return;
    }

    console.log('Processing file:', file.name);

    try {
        let decodedNumber = null;

        const imageLoadPromise = new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                elements.previewImage.src = e.target.result;
                elements.previewImage.style.display = 'block';
                elements.audioPlayer.pause();
                updateUIForPlayback(false);

                try {
                    decodedNumber = await decodeNumber(e.target.result);
                    console.log('Decoded Tandy number:', decodedNumber);
                    resolve(decodedNumber);
                } catch (error) {
                    console.log('No Tandy number found or error decoding:', error);
                    resolve(null);
                }
            };
            reader.readAsDataURL(file);
        });

        decodedNumber = await imageLoadPromise;

        try {
            const buffer = await readFileAsBuffer(file);
            console.log('File buffer loaded, size:', buffer.length);

            if (!validatePNGHeader(buffer)) {
                throw new Error('Please insert a valid PNG file');
            }

            // Extract both audio and MIDI data
            console.log('Starting data extraction from PNG...');
            const { audio: audioData, midi: midiData } = await extractDataFromPNG(buffer);

            // Handle audio
            if (audioData) {
                console.log('Processing audio data, length:', audioData.length);
                await processAudioData(audioData);
            } else if (decodedNumber && corruptionBackupFiles[decodedNumber]?.music) {
                console.log('Using backup audio file for number:', decodedNumber);
                elements.audioPlayer.src = corruptionBackupFiles[decodedNumber].music;
            }

            // Handle MIDI with multiple fallbacks
            let midiLoaded = false;
            
            // Try embedded MIDI first
            if (midiData) {
                console.log('Processing MIDI data, length:', midiData.length);
                const midiBlob = new Blob([midiData], { type: 'audio/midi' });
                const midiUrl = URL.createObjectURL(midiBlob);
                console.log('Created MIDI blob URL:', midiUrl);
                await physicsScene.loadMidi(file.name, midiUrl);
                midiLoaded = true;
            }
            
            // Try encoded number backup
            if (!midiLoaded && decodedNumber && corruptionBackupFiles[decodedNumber]?.midi) {
                console.log('Using backup MIDI file for number:', decodedNumber);
                await physicsScene.loadMidi(file.name, corruptionBackupFiles[decodedNumber].midi);
                midiLoaded = true;
            }
            
            // Try filename-based MIDI as final fallback
            if (!midiLoaded) {
                const midiFileName = `./assets/midi/${file.name.replace('.png', '.mid')}`;
                console.log('Attempting to load MIDI from filename:', midiFileName);
                try {
                    await physicsScene.loadMidi(file.name, midiFileName);
                    midiLoaded = true;
                } catch (error) {
                    console.log('No filename-based MIDI found:', error);
                }
            }

            if (!midiLoaded) {
                console.log('No MIDI data found in any source');
            }

            elements.uploadLabel.classList.remove('visible');
            elements.playButton.classList.add('visible');

        } catch (error) {
            console.error('Error processing file:', error);
            // If both audio and MIDI extraction fails, check for backups
            if (decodedNumber && corruptionBackupFiles[decodedNumber]) {
                console.log('Extraction failed, using backups for number:', decodedNumber);
                if (corruptionBackupFiles[decodedNumber].music) {
                    elements.audioPlayer.src = corruptionBackupFiles[decodedNumber].music;
                }
                if (corruptionBackupFiles[decodedNumber].midi) {
                    await physicsScene.loadMidi(file.name, corruptionBackupFiles[decodedNumber].midi);
                }
                elements.uploadLabel.classList.remove('visible');
                elements.playButton.classList.add('visible');
            } else {
                // Try filename-based MIDI as last resort
                const midiFileName = `./assets/midi/${file.name.replace('.png', '.mid')}`;
                console.log('Final attempt to load MIDI from filename:', midiFileName);
                try {
                    await physicsScene.loadMidi(file.name, midiFileName);
                    elements.uploadLabel.classList.remove('visible');
                    elements.playButton.classList.add('visible');
                } catch (error) {
                    console.log('No MIDI found in any source');
                    elements.playButton.classList.remove('visible');
                    throw new Error('No valid DigiCD data found');
                }
            }
        }
    } catch (error) {
        console.error('Error previewing file:', error);
        elements.playButton.classList.remove('visible');
        alert(error.message);
    }
}

function playDigiCD() {
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (!isPlaying) {
        elements.audioPlayer.play();
        physicsScene.startMidiPlayback();
        isPlaying = true;
        elements.playButton.disabled = true;
        updateUIForPlayback(true);
        elements.playButton.classList.remove('visible');
        elements.uploadLabel.classList.add('visible');
    } else {
        elements.audioPlayer.pause();
        physicsScene.stopMidiPlayback();
        isPlaying = false;
        elements.playButton.disabled = false;
        updateUIForPlayback(false);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Get the logo image
    const logoImage = document.querySelector('.header-logo');

    // Hide logo initially
    logoImage.style.opacity = '0';
    
    // Function to start all animations
    const startAnimations = () => {
        // Reset and start logo animation
        logoImage.style.animationPlayState = 'running';

        setTimeout(() => {
            document.querySelector('.main-content').style.setProperty('--animationState', 'running');
        }, 1300);
        
        // Make fade-in elements visible and reset their animations
        document.querySelectorAll('.fade-in').forEach(el => {
            setTimeout(() => {
                el.style.animationPlayState = 'running';
            }, 1300);
        });
        
        // Initialize audio player with silent audio
        elements.audioPlayer.src = SILENT_AUDIO;
    };
    
    // Check if logo is already loaded
    if (logoImage.complete) {
        startAnimations();
    } else {
        // Wait for logo to load
        logoImage.onload = startAnimations;
    }

    // Add all other event listeners
    elements.fileInput.addEventListener('change', handleFilePreview);
    elements.playButton.addEventListener('click', playDigiCD);
    elements.audioPlayer.addEventListener('ended', () => {
        updateUIForPlayback(false);
        physicsScene.stopMidiPlayback();
        isPlaying = false;
    });
});

// Export player function for global access
window.playerrr = playDigiCD;