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

let isPlaying = false;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

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

async function extractMP3FromPNG(buffer) {
    let position = 8; // Skip PNG header

    while (position < buffer.length) {
        const chunkLength = getBigEndian(buffer, position);
        position += 4;
        
        const chunkType = String.fromCharCode(...buffer.slice(position, position + 4));
        position += 4;

        if (chunkType === DIGCD_CHUNK_TYPE) {
            return buffer.slice(position, position + chunkLength);
        }

        position += chunkLength + 4; // Skip chunk data and CRC
    }

    throw new Error('No DigiCD audio data found in this file');
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

async function handleFilePreview() {
    const file = elements.fileInput.files[0];
    if (!file) {
        elements.playButton.classList.remove('visible');
        return;
    }

    try {
        // Show CD preview
        const reader = new FileReader();
        reader.onload = (e) => {
            elements.previewImage.src = e.target.result;
            elements.previewImage.style.display = 'block';
            elements.audioPlayer.pause();
            updateUIForPlayback(false);
        };
        reader.readAsDataURL(file);

        // Load corresponding MIDI file
        await physicsScene.loadMidi(file.name);

        // Extract and prepare audio
        const buffer = await readFileAsBuffer(file);
        if (!validatePNGHeader(buffer)) {
            throw new Error('Please insert a valid PNG file');
        }

        // Check for DigiCD chunk and extract audio
        let position = 8;
        let isValidDigiCD = false;
        
        while (position < buffer.length) {
            const chunkLength = getBigEndian(buffer, position);
            position += 4;
            const chunkType = String.fromCharCode(...buffer.slice(position, position + 4));
            
            if (chunkType === DIGCD_CHUNK_TYPE) {
                isValidDigiCD = true;
                // Extract and prepare audio immediately
                const audioData = await extractMP3FromPNG(buffer);
                await processAudioData(audioData);
                break;
            }
            
            position += 4 + chunkLength + 4;
        }

        if (isValidDigiCD) {
            elements.uploadLabel.classList.remove('visible');
            elements.playButton.classList.add('visible');
        } else {
            elements.playButton.classList.remove('visible');
            throw new Error('This PNG file is not a valid DigiCD');
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