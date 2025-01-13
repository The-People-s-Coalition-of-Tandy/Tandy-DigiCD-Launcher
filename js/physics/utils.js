// Detect mobile devices through user agent and screen size
export const isMobile = (() => {
    // Check if user agent indicates mobile device
    const ua = navigator.userAgent.toLowerCase();
    const isMobileUA = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua);
    
    // Check screen size as fallback (some tablets might report as desktop)
    const isSmallScreen = window.innerWidth <= 768;
    
    // Check if device has touch capability
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    
    // Return true if any mobile indicators are present
    return isMobileUA || (isSmallScreen && hasTouch);
})();

// Optional: Add performance tier detection
export const getDeviceTier = () => {
    const gpu = getGPUTier();
    if (isMobile) {
        return gpu.tier < 2 ? 'low' : 'medium';
    }
    return gpu.tier < 2 ? 'medium' : 'high';
};

// Helper function to estimate GPU capability
function getGPUTier() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
        return { tier: 0 };
    }
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    
    // Simple GPU tier estimation
    const tier = renderer.toLowerCase().includes('apple') ? 2 : // Apple GPUs are usually powerful
                 renderer.toLowerCase().includes('intel') ? 1 : // Intel integrated GPUs
                 2; // Dedicated GPUs
    
    return { tier, renderer };
} 