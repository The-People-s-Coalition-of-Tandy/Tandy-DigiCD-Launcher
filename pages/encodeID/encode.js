async function encodeFile() {
    const mp3Input = document.getElementById('mp3Input');
    const mp3 = mp3Input.files[0];

    const midiInput = document.getElementById('midiInput');
    const midi = midiInput.files[0];

    const CDCoverInput = document.getElementById('CDCover');
    const CDCover = CDCoverInput.files[0];
    console.log(CDCover);
    let pngBuffer;

    if (CDCover) {
        pngBuffer = await processImage(CDCover)
    } else {
        pngBuffer = await fetchAndReadPngAsArrayBuffer('./cd.png');
    }

    let final;
    if (mp3) {
        const mp3Buffer = await readFile(mp3);
        final = await checkChunks(pngBuffer, pngBuffer.length, mp3Buffer, midi ? await readFile(midi) : null);
    } else if (midi) {
        const midiBuffer = await readFile(midi);
        final = await checkChunks(pngBuffer, pngBuffer.length, null, midiBuffer);
    }
    console.log(final);

    const blob = new Blob([final], {
        type: 'image/png'
    });

    // Download the new PNG file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'new.png';
    a.click();

    // previewImage();
    const cdBurner = document.getElementById('cd-burner');
    document.addEventListener('DOMContentLoaded', () => {
        const cdBurnerImg = document.querySelector('.cd-burner img');
        cdBurnerImg.addEventListener('animationend', () => {
            cdBurnerImg.style.transform = 'translateY(50%) rotate(720deg)';

            cdBurnerImg.style.animation = 'none';
        });
    });
    const cd = document.createElement('img');
    cd.src = url;
    cdBurner.appendChild(cd);
}

async function fetchAndReadPngAsArrayBuffer(url) {
    try {
        const response = await fetch(url);
        console.log(response);
        const blob = await response.blob();
        console.log(blob);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                // Convert the blob to a Uint8Array
                const png = new Uint8Array(e.target.result);
                resolve(png);
            };
            reader.onerror = function (e) {
                reject(new Error("Failed to read the blob as an ArrayBuffer"));
            };
            reader.readAsArrayBuffer(blob);
        });
    } catch (error) {
        console.error("Failed to fetch or read the PNG file:", error);
        throw error; // Re-throw the error if you want to handle it outside
    }
}

async function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            resolve(new Uint8Array(event.target.result));
        };

        reader.onerror = (error) => {
            reject(error);
        };

        reader.readAsArrayBuffer(file);
    });
}

function checkHeader(buffer) {
    const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    validatePNG(compareBuffers(buffer.slice(0, 8), header), 'header');
}

function getBigEndian(buffer, offset) {
    let val = 0;
    for (let i = 0; i < 4; i++) {
        val = (val << 8) | buffer[offset + i];
    }
    return val;
}

// CRC table for CRC-32 (used in the PNG specification)
const crc32_table = new Array(256).fill(0).map((_, byte) => {
    let crc = byte;
    for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
    }
    return crc >>> 0;
});

function generate_crc32(data) {
    let crc = 0xFFFFFFFF;
    for (const byte of data) {
        crc = (crc >>> 8) ^ crc32_table[(crc ^ byte) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function write_custom_chunk(imageBuffer, pos, musicBuffer) {
    let newBuffer = new Uint8Array(imageBuffer.length + musicBuffer.length + 12); // Preallocate buffer
    newBuffer.set(imageBuffer.slice(0, pos), 0);

    const chunkLength = musicBuffer.length;
    const chunkType = 'juLi';

    // let crc = generate_crc32(chunkType, 4);
    // crc = generate_crc32(musicBuffer, 12) ^ crc;
    const chunkTypeArray = new TextEncoder().encode(chunkType);
    let crc = generate_crc32(new Uint8Array([...chunkTypeArray, ...musicBuffer]));

    console.log(`${crc} - ${crc.toString(16)}`);

    // Write chunk
    newBuffer.set([
        (chunkLength >> 24) & 0xFF,
        (chunkLength >> 16) & 0xFF,
        (chunkLength >> 8) & 0xFF,
        chunkLength & 0xFF
    ], pos);

    pos += 4;

    newBuffer.set(chunkType.split('').map(c => c.charCodeAt(0)), pos);
    pos += 4;

    newBuffer.set(musicBuffer, pos);
    pos += musicBuffer.length;

    newBuffer.set([
        (crc >> 24) & 0xFF,
        (crc >> 16) & 0xFF,
        (crc >> 8) & 0xFF,
        crc & 0xFF
    ], pos);

    return newBuffer;
}
function write_standard_chunk(imageBuffer, pos, musicBuffer) {
    let newBuffer = new Uint8Array(imageBuffer.length + musicBuffer.length + 12);
    newBuffer.set(imageBuffer.slice(0, pos), 0);

    const chunkLength = musicBuffer.length;
    const chunkType = 'tEXt'; // Use the "tEXt" ancillary chunk for better compatibility

    const chunkTypeArray = new TextEncoder().encode(chunkType);
    let crc = generate_crc32(new Uint8Array([...chunkTypeArray, ...musicBuffer]));

    // Write chunk length
    newBuffer.set([
        (chunkLength >> 24) & 0xFF,
        (chunkLength >> 16) & 0xFF,
        (chunkLength >> 8) & 0xFF,
        chunkLength & 0xFF
    ], pos);
    pos += 4;

    // Write chunk type as "tEXt"
    newBuffer.set(chunkTypeArray, pos);
    pos += 4;

    // Write music data
    newBuffer.set(musicBuffer, pos);
    pos += musicBuffer.length;

    // Write CRC
    newBuffer.set([
        (crc >> 24) & 0xFF,
        (crc >> 16) & 0xFF,
        (crc >> 8) & 0xFF,
        crc & 0xFF
    ], pos);

    return newBuffer;
}

function write_midi_chunk(imageBuffer, pos, midiBuffer) {
    console.log('Creating MIDI chunk buffer');
    let newBuffer = new Uint8Array(imageBuffer.length + midiBuffer.length + 12);
    newBuffer.set(imageBuffer.slice(0, pos), 0);

    const chunkLength = midiBuffer.length;
    const chunkType = 'miDi';

    const chunkTypeArray = new TextEncoder().encode(chunkType);
    let crc = generate_crc32(new Uint8Array([...chunkTypeArray, ...midiBuffer]));

    console.log('Writing MIDI chunk header:', {
        position: pos,
        chunkLength,
        chunkType,
        crc: crc.toString(16)
    });

    // Write chunk length
    newBuffer.set([
        (chunkLength >> 24) & 0xFF,
        (chunkLength >> 16) & 0xFF,
        (chunkLength >> 8) & 0xFF,
        chunkLength & 0xFF
    ], pos);
    pos += 4;

    // Write chunk type
    newBuffer.set(chunkType.split('').map(c => c.charCodeAt(0)), pos);
    pos += 4;

    // Write MIDI data
    newBuffer.set(midiBuffer, pos);
    pos += midiBuffer.length;

    // Write CRC
    newBuffer.set([
        (crc >> 24) & 0xFF,
        (crc >> 16) & 0xFF,
        (crc >> 8) & 0xFF,
        crc & 0xFF
    ], pos);

    return newBuffer;
}

async function debugChunks(buffer, size) {
    let pos = 8;
    console.log('Debug: Analyzing chunks in buffer of size:', size);

    while (pos < size) {
        const chunkLength = getBigEndian(buffer, pos);
        pos += 4;
        const chunkType = String.fromCharCode.apply(null, buffer.slice(pos, pos + 4));
        pos += 4;
        const crc = getBigEndian(buffer, pos + chunkLength);

        console.log(`Debug: Found chunk: ${chunkType} - len: ${chunkLength} - crc: ${crc.toString(16)}`);

        pos += chunkLength + 4;
    }
}

async function checkChunks(buffer, size, musicBuffer, midiBuffer) {
    let pos = 8;
    let digiCD = buffer;
    console.log('Starting chunk processing, buffer size:', size);

    while (pos < size) {
        const chunkLength = getBigEndian(buffer, pos);
        pos += 4;
        const chunkType = String.fromCharCode.apply(null, buffer.slice(pos, pos + 4));
        pos += 4;

        if (chunkType === 'IEND') {
            console.log('Found IEND chunk at position:', pos - 8);
            
            let currentPos = pos - 8;
            
            // Insert our custom chunks before IEND
            if (musicBuffer) {
                console.log('Adding MP3 chunk at position:', currentPos, 'length:', musicBuffer.length);
                digiCD = write_custom_chunk(digiCD, currentPos, musicBuffer);
                currentPos += musicBuffer.length + 12;
            }
            
            if (midiBuffer) {
                console.log('Adding MIDI chunk at position:', currentPos, 'length:', midiBuffer.length);
                digiCD = write_midi_chunk(digiCD, currentPos, midiBuffer);
                currentPos += midiBuffer.length + 12;
            }

            // Add IEND chunk at the very end
            console.log('Writing final IEND chunk at position:', currentPos);
            digiCD.set(buffer.slice(pos - 8, pos + 4), currentPos);
            break;
        }

        pos += chunkLength + 4;
        console.log(`Processing chunk: ${chunkType} - len: ${chunkLength} (${size - pos} bytes remaining)`);
    }

    // Verify final buffer
    console.log('Final buffer structure:');
    await debugChunks(digiCD, digiCD.length);
    
    return digiCD;
}

function validatePNG(val, msg) {
    if (!val) {
        console.error(`Invalid file: ${msg}`);
    } else {
        console.log(`Valid file: ${msg}`);
    }
}

// Usage: call encodeMP3InPNG() function in response to user action (e.g., button click)
const submitButton = document.getElementById('submitButton');
submitButton.addEventListener('click', async function () {
    await encodeFile();
});

async function processImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const uploadedImage = new Image();
            uploadedImage.onload = async function () {
                const canvas = document.getElementById('canvas2');
                const ctx = canvas.getContext('2d');
                canvas.width = uploadedImage.width;
                canvas.height = uploadedImage.height;

                // Blend the images
                await blendImages(uploadedImage);

                // Get the number from input
                const numberInput = document.getElementById('numberInput');
                const number = parseInt(numberInput.value) || 0;
                
                // write tandy text on the image
                drawTandyTextCurved(ctx, number);
                
                const image = canvas.toDataURL('image/png');
                resolve(await fetchAndReadPngAsArrayBuffer(image));
            };
            uploadedImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function encodeNumber(num) {
    // Ensure number is within valid range (0-1023 for 5 places with 4 colors)
    if (num < 0 || num > 1023) {
        throw new Error('Number must be between 0 and 1023');
    }

    const colors = ['red', 'green', 'blue', 'black'];
    const result = [];
    
    // Convert to base 4 and pad with leading zeros up to 5 digits
    let base4 = num.toString(4).padStart(5, '0');
    
    // Map each digit to a color
    for (let digit of base4) {
        result.push(colors[parseInt(digit)]);
    }

    return result;
}


function drawTandyTextCurved(ctx, number) {
    const text = 'Tandy';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const colors = encodeNumber(number);
    
    // Define color mapping with lighter variants
    const colorMap = {
        'red': 'rgba(255, 0, 0, 0.5)',     // Red with 80% opacity
        'green': 'rgba(0, 255, 0, 0.5)',   // Green with 80% opacity
        'blue': 'rgba(0, 0, 255, 0.5)',    // Blue with 80% opacity
        'black': 'rgba(0, 0, 0, 0.5)'      // Black with 80% opacity
    };

    // Define the circle parameters
    const radius = ctx.canvas.height / 8;
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const startAngle = Math.PI / 2 - .6;

    // Draw each character along the curve
    for (let i = 0; i < text.length; i++) {
        const angle = startAngle + (i / text.length) * Math.PI / 2.2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle - Math.PI/2);
        ctx.fillStyle = colorMap[colors[text.length - i - 1]];
        ctx.fillText(text[text.length - i - 1], 0, 0);
        ctx.restore();
    }
}

// Ensure that blendImages correctly handles the blending and waits for all operations to complete
async function blendImages(uploadedImage) {
    const canvas1 = document.getElementById('canvas1');
    const ctx1 = canvas1.getContext('2d');
    const canvas2 = document.getElementById('canvas2');
    const ctx2 = canvas2.getContext('2d');

    return new Promise((resolve) => {
        const cdCoverImage = new Image();
        cdCoverImage.onload = function () {
            canvas1.width = canvas2.width = cdCoverImage.width;
            canvas1.height = canvas2.height = cdCoverImage.height;
            ctx1.drawImage(uploadedImage, 0, 0, canvas1.width, canvas1.height);
            ctx1.globalCompositeOperation = 'hard-light';
            ctx1.drawImage(cdCoverImage, 0, 0);
            
            ctx2.drawImage(cdCoverImage, 0, 0);
            ctx2.globalCompositeOperation = 'source-in';
            ctx2.drawImage(canvas1, 0, 0);
            ctx1.globalCompositeOperation = 'source-over';
            ctx2.globalCompositeOperation = 'source-over';
            resolve();
        };
        cdCoverImage.src = 'cd.png';
    });
}

function downloadImage() {
    const canvas = document.getElementById('canvas2');
    const image = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'blended-cd-cover.png';
    link.href = image;
    link.click();
}