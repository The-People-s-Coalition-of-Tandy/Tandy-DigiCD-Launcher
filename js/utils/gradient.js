/**
 * GradientAnimator - Creates an animated gradient background
 * with smooth color transitions and rotation
 */
class GradientAnimator {
    // Color pairs for gradient transitions
    static COLORS = [
        ['#6d00d4', 'rgba(182, 155, 228, .65)'],
        ['#0078d4', 'rgba(155, 196, 228, .65)'],
        ['#d46d00', 'rgba(228, 182, 155, .65)'],
        ['#ff31dd', 'rgba(247, 185, 231, .65)'],
        ['#00d4a5', 'rgba(155, 228, 207, .65)']
    ];

    constructor() {
        // Ensure COLORS is initialized before proceeding
        if (!GradientAnimator.COLORS || !GradientAnimator.COLORS.length) {
            throw new Error('Colors not initialized');
        }

        this.canvas = document.getElementById('gradientCanvas');
        if (!this.canvas) {
            throw new Error('Canvas element not found');
        }

        this.ctx = this.canvas.getContext('2d');
        this.angle = 135;
        this.duration = 2000;
        this.transitionDuration = 600;
        this.startTime = performance.now();

        // Logo pattern properties
        this.logoImage = new Image();
        this.logoImage.src = './assets/images/ui/tandyWhite.png';
        this.logoWidth = 72;
        this.logoHeight = 82;
        this.spacing = 0;
        this.rows = [];
        this.speed = 0.5;

        this.setupCanvas();
        this.bindEvents();
        
        // Start animation on next frame to ensure everything is ready
        requestAnimationFrame(() => this.animate());

        // Add animation state
        this.isAnimating = false;
        this.animationStartTime = 0;
        this.animationDuration = 3400;
        
        // Add gradient animation state
        this.gradientAnimating = false;
        
        // Bind to file input
        const fileInput = document.getElementById('fileButton');
        const playButton = document.getElementById('playButton');
        if (fileInput) {
            fileInput.addEventListener('mouseenter', () => {
                this.toggleAnimation();
            });
        }
        if (playButton) {
            playButton.addEventListener('click', () => {
                this.gradientAnimating = !this.gradientAnimating;
            });
        }
    }

    setupCanvas() {
        this.resizeCanvas();
        this.initRows();
    }

initRows() {
    const totalRows = Math.ceil(this.canvas.height / (this.logoWidth + this.spacing));
    this.rows = [];
    
    for (let i = 0; i < totalRows; i++) {
        this.rows.push({
            offset: 0,
                direction: i % 2 === 0 ? 1 : -1
            });
        }
    }

    drawLogos() {
        const totalWidth = this.canvas.width + this.logoWidth + this.spacing;
        
        this.ctx.fillStyle = 'transparent';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
        this.rows.forEach((row, index) => {
            const y = index * this.logoHeight;
            // Add staggered offset for even rows to create checkered pattern
            const staggeredOffset = index % 2 === 0 ? 0 : this.logoWidth / 2;

            if (this.isAnimating) {
                const elapsed = performance.now() - this.animationStartTime;
                const progress = Math.min(elapsed / this.animationDuration, 1);
                const eased = this.easeOutExpo(progress);
                
                // Calculate speed based on easing
                const currentSpeed = this.speed * (1 - eased) * 10;
                row.offset += currentSpeed * row.direction;
                
                // Stop animation when duration is reached
                if (progress === 1) {
                    this.isAnimating = false;
                }
            }
            
            // Adjust wrapping logic
            if (row.direction > 0 && row.offset > this.logoWidth) {
                row.offset = -totalWidth;
            } else if (row.direction < 0 && row.offset < -totalWidth) {
                row.offset = this.logoWidth + 10;
            }
            
            // Draw logos with staggered offset
            for (let x = -totalWidth; x < totalWidth * 2; x += this.logoWidth + 3) {
                // draw the logo with 50% opacity
                // this.ctx.globalAlpha = 0.85;
                this.ctx.drawImage(
                    this.logoImage,
                    x + row.offset + staggeredOffset,
                    y,
                    this.logoWidth,
                    this.logoHeight
                );
                // reset opacity
                this.ctx.globalAlpha = 1;
            }
        });
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    interpolateColor(color1, color2, factor) {
        const getRGBA = (color) => {
            if (color.startsWith('#')) {
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                return [r, g, b, 1];
            }
            return color.match(/[\d.]+/g).map(Number);
        };

        const [r1, g1, b1, a1] = getRGBA(color1);
        const [r2, g2, b2, a2] = getRGBA(color2);

        return `rgba(${
            Math.round(r1 + (r2 - r1) * factor)
        }, ${
            Math.round(g1 + (g2 - g1) * factor)
        }, ${
            Math.round(b1 + (b2 - b1) * factor)
        }, ${
            a1 + (a2 - a1) * factor
        })`;
    }

    sharpEasing(t) {
        const transitionRatio = this.transitionDuration / this.duration;
        if (t < (1 - transitionRatio)) return 0;
        
        const transitionT = (t - (1 - transitionRatio)) / transitionRatio;
        return Math.pow(transitionT, 0.5);
    }

    render(timestamp) {
        const elapsed = timestamp - this.startTime;
        const totalDuration = this.duration * GradientAnimator.COLORS.length;
        const normalizedTime = (elapsed % totalDuration) / this.duration;
        const currentIndex = Math.floor(normalizedTime) % GradientAnimator.COLORS.length;
        const nextIndex = (currentIndex + 1) % GradientAnimator.COLORS.length;
        
        const progress = this.sharpEasing(normalizedTime % 1);
        this.renderGradient(currentIndex, nextIndex, progress);
    }

    renderGradient(currentIndex, nextIndex, progress) {
        // If not animating, use static angled white gradient
        if (!this.gradientAnimating) {
            const gradient = this.ctx.createLinearGradient(
                0, 0,  // Start from top-left corner
                this.canvas.width, this.canvas.height  // End at bottom-right corner
            );
            // gradient.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
            // gradient.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0.45)');

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.drawLogos();
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }

        // Original animated gradient code
        const color1 = this.interpolateColor(
            GradientAnimator.COLORS[currentIndex][0],
            GradientAnimator.COLORS[nextIndex][0],
            progress
        );
        const color2 = this.interpolateColor(
            GradientAnimator.COLORS[currentIndex][1],
            GradientAnimator.COLORS[nextIndex][1],
            progress
        );

        this.angle = (this.angle + 0.2) % 360;
        const radians = this.angle * Math.PI / 180;
        const gradient = this.ctx.createLinearGradient(
            this.canvas.width / 2 - Math.cos(radians) * this.canvas.width,
            this.canvas.height / 2 - Math.sin(radians) * this.canvas.height,
            this.canvas.width / 2 + Math.cos(radians) * this.canvas.width,
            this.canvas.height / 2 + Math.sin(radians) * this.canvas.height
        );

        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawLogos();
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    animate() {
        if (!this.ctx || !this.canvas) return;
        
        const frame = (timestamp) => {
            if (!GradientAnimator.COLORS || !GradientAnimator.COLORS.length) return;
            this.render(timestamp);
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    // Add bezier easing function
    easeOutExpo(x) {
        return x === 1 ? 1 : 1 - Math.pow(2, -8 * x);
    }

    toggleAnimation() {
        this.isAnimating = !this.isAnimating;
        if (this.isAnimating) {
            this.animationStartTime = performance.now();
        }
    }
}

// Initialize gradient animation on page load
window.addEventListener('load', () => new GradientAnimator()); 