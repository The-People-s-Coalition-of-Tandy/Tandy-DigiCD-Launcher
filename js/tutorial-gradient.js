class TutorialGradient {
    static COLORS = [
        ['#d46d00', 'rgba(228, 182, 155, .65)'],
        // ['#0078d4', 'rgba(155, 196, 228, .65)'],
        ['#9ED2C6', 'rgba(155, 196, 228, .65)'],
        ['#ff31dd', 'rgba(247, 185, 231, .65)'],
        ['#ffffff', 'rgba(255, 255, 255, .65)'],
        ['#6d00d4', 'rgba(182, 155, 228, .65)'],
    ];

    constructor() {
        this.canvas = document.getElementById('gradientCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentColorIndex = 0;
        this.angle = 135;
        this.transitionProgress = 1;
        this.animationDuration = 2000; // 1 second transition
        
        this.setupCanvas();
        this.bindEvents();
        this.render();
    }

    setupCanvas() {
        this.resizeCanvas();
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.render();
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

    nextColor() {
        this.prevColorIndex = this.currentColorIndex;
        this.currentColorIndex = (this.currentColorIndex + 1) % TutorialGradient.COLORS.length;
        this.transitionProgress = 0;
        this.startTime = performance.now();
        this.animate();
    }

    animate() {
        if (this.transitionProgress < 1) {
            const currentTime = performance.now();
            this.transitionProgress = Math.min(
                (currentTime - this.startTime) / this.animationDuration,
                1
            );
            
            // Add easing
            const easedProgress = this.easeOutCubic(this.transitionProgress);
            this.render(easedProgress);
            requestAnimationFrame(() => this.animate());
        }
    }

    easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
    }

    render(progress = 1) {
        const currentColors = TutorialGradient.COLORS[this.prevColorIndex || this.currentColorIndex];
        const nextColors = TutorialGradient.COLORS[this.currentColorIndex];
        
        const color1 = this.interpolateColor(
            currentColors[0],
            nextColors[0],
            progress
        );
        const color2 = this.interpolateColor(
            currentColors[1],
            nextColors[1],
            progress
        );

        const radians = this.angle * Math.PI / 180;
        const gradient = this.ctx.createLinearGradient(
            this.canvas.width / 2 - Math.cos(radians) * this.canvas.width,
            this.canvas.height / 2 - Math.sin(radians) * this.canvas.height,
            this.canvas.width / 2 + Math.cos(radians) * this.canvas.width,
            this.canvas.height / 2 + Math.sin(radians) * this.canvas.height
        );

        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
} 