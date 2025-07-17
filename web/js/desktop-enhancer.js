/**
 * SwissKnife Web Desktop - Enhanced Features
 * Window Snapping, Aero Effects, and Dynamic Backgrounds
 */

class DesktopEnhancer {
    constructor() {
        this.snapZones = new Map();
        this.isSnapping = false;
        this.currentBackground = null;
        this.backgroundImages = [];
        this.isDragging = false;
        
        this.init();
    }
    
    async init() {
        this.createSnapZones();
        this.setupBackgroundSelector();
        await this.loadBackgroundImages();
        this.setupResizeHandler();
        this.setupAeroEffects();
    }
    
    // Window Snapping System
    createSnapZones() {
        const zones = ['left', 'right', 'top', 'bottom', 'maximize'];
        
        zones.forEach(zone => {
            const element = document.createElement('div');
            element.className = `snap-zone ${zone}`;
            element.id = `snap-zone-${zone}`;
            document.body.appendChild(element);
            this.snapZones.set(zone, element);
        });
    }
    
    enableWindowSnapping(windowElement) {
        const titlebar = windowElement.querySelector('.window-titlebar');
        let snapTimeout = null;
        
        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('window-control')) return;
            this.isDragging = true;
            this.clearWindowSnap(windowElement);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            clearTimeout(snapTimeout);
            snapTimeout = setTimeout(() => {
                this.checkSnapZones(e.clientX, e.clientY);
            }, 50);
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.performSnap(windowElement);
                this.hideAllSnapZones();
            }
        });
    }
    
    checkSnapZones(x, y) {
        const snapThreshold = 20;
        const windowHeight = window.innerHeight - 48; // Account for taskbar
        
        this.hideAllSnapZones();
        
        // Left edge
        if (x < snapThreshold) {
            this.showSnapZone('left');
        }
        // Right edge
        else if (x > window.innerWidth - snapThreshold) {
            this.showSnapZone('right');
        }
        // Top edge
        else if (y < snapThreshold) {
            this.showSnapZone('maximize');
        }
        // Top half
        else if (y < windowHeight / 2 && x > snapThreshold && x < window.innerWidth - snapThreshold) {
            this.showSnapZone('top');
        }
        // Bottom half
        else if (y > windowHeight / 2 && x > snapThreshold && x < window.innerWidth - snapThreshold) {
            this.showSnapZone('bottom');
        }
    }
    
    showSnapZone(zone) {
        const element = this.snapZones.get(zone);
        if (element) {
            element.classList.add('active');
            this.isSnapping = zone;
        }
    }
    
    hideAllSnapZones() {
        this.snapZones.forEach(element => {
            element.classList.remove('active');
        });
        this.isSnapping = false;
    }
    
    performSnap(windowElement) {
        if (!this.isSnapping) return;
        
        this.clearWindowSnap(windowElement);
        windowElement.classList.add(`snapped-${this.isSnapping}`);
        
        if (this.isSnapping === 'maximize') {
            windowElement.classList.add('maximized');
        }
        
        // Add aero glow effect
        windowElement.classList.add('aero-glow');
        setTimeout(() => {
            windowElement.classList.remove('aero-glow');
        }, 300);
    }
    
    clearWindowSnap(windowElement) {
        const snapClasses = ['snapped-left', 'snapped-right', 'snapped-top', 'snapped-bottom', 'maximized'];
        snapClasses.forEach(cls => windowElement.classList.remove(cls));
    }
    
    // Dynamic Background System
    async loadBackgroundImages() {
        // Creative Commons background sources
        const sources = [
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop', // Mountain landscape
            'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1920&h=1080&fit=crop', // Forest
            'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=1920&h=1080&fit=crop', // Ocean
            'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?w=1920&h=1080&fit=crop', // Sunset
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop', // Space
            'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop', // Abstract
            'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&h=1080&fit=crop', // Clouds
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop', // City
            'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1920&h=1080&fit=crop'  // Nature
        ];
        
        this.backgroundImages = sources.map((url, index) => ({
            id: index,
            url: url,
            thumbnail: url.replace('w=1920&h=1080', 'w=150&h=90'),
            name: `Background ${index + 1}`
        }));
        
        // Set default background
        this.setBackground(this.backgroundImages[0]);
    }
    
    setupBackgroundSelector() {
        const selector = document.createElement('div');
        selector.className = 'background-selector';
        selector.id = 'background-selector';
        selector.innerHTML = `
            <h3>🖼️ Backgrounds</h3>
            <div class="background-grid" id="background-grid"></div>
            <div style="margin-top: 12px; text-align: center;">
                <button id="bg-random-btn" style="
                    background: rgba(74, 144, 226, 0.3);
                    border: 1px solid rgba(74, 144, 226, 0.6);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 11px;
                    backdrop-filter: blur(10px);
                ">🎲 Random</button>
            </div>
        `;
        
        document.body.appendChild(selector);
        
        // Toggle visibility with right-click on desktop
        document.addEventListener('contextmenu', (e) => {
            if (e.target.classList.contains('desktop-background')) {
                e.preventDefault();
                selector.classList.toggle('visible');
            }
        });
        
        // Setup random button
        document.getElementById('bg-random-btn').addEventListener('click', () => {
            this.setRandomBackground();
        });
    }
    
    populateBackgroundGrid() {
        const grid = document.getElementById('background-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        this.backgroundImages.forEach((bg, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'background-thumb';
            thumb.style.backgroundImage = `url(${bg.thumbnail})`;
            thumb.title = bg.name;
            thumb.dataset.bgIndex = index;
            
            if (this.currentBackground && this.currentBackground.id === bg.id) {
                thumb.classList.add('active');
            }
            
            thumb.addEventListener('click', () => {
                this.setBackground(bg);
                this.updateBackgroundGrid();
            });
            
            grid.appendChild(thumb);
        });
    }
    
    setBackground(backgroundData) {
        const desktop = document.querySelector('.desktop-background');
        if (!desktop) return;
        
        // Add loading state
        desktop.classList.add('loading');
        
        const img = new Image();
        img.onload = () => {
            desktop.style.backgroundImage = `url(${backgroundData.url})`;
            desktop.classList.remove('loading');
            this.currentBackground = backgroundData;
        };
        img.onerror = () => {
            desktop.classList.remove('loading');
            console.warn('Failed to load background:', backgroundData.url);
        };
        img.src = backgroundData.url;
    }
    
    setRandomBackground() {
        const randomIndex = Math.floor(Math.random() * this.backgroundImages.length);
        this.setBackground(this.backgroundImages[randomIndex]);
        this.updateBackgroundGrid();
    }
    
    updateBackgroundGrid() {
        document.querySelectorAll('.background-thumb').forEach((thumb, index) => {
            thumb.classList.toggle('active', 
                this.currentBackground && this.currentBackground.id === index
            );
        });
    }
    
    // Responsive handling
    setupResizeHandler() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 250);
        });
    }
    
    handleResize() {
        // Update snap zones for new window size
        this.updateSnapZones();
        
        // Adjust mobile layout
        if (window.innerWidth <= 768) {
            this.enableMobileMode();
        } else {
            this.disableMobileMode();
        }
    }
    
    updateSnapZones() {
        // Snap zones are CSS-based and will automatically adjust
        // This method can be extended for complex responsive behavior
    }
    
    enableMobileMode() {
        document.body.classList.add('mobile-mode');
        // Force all windows to full screen on mobile
        document.querySelectorAll('.window').forEach(window => {
            this.clearWindowSnap(window);
            window.style.width = '100%';
            window.style.height = 'calc(100vh - 56px)';
            window.style.top = '0';
            window.style.left = '0';
        });
    }
    
    disableMobileMode() {
        document.body.classList.remove('mobile-mode');
    }
    
    // Aero visual effects
    setupAeroEffects() {
        // Add subtle parallax effect to windows
        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) return;
            
            const windows = document.querySelectorAll('.window');
            windows.forEach(window => {
                const rect = window.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                
                const deltaX = (e.clientX - centerX) * 0.01;
                const deltaY = (e.clientY - centerY) * 0.01;
                
                window.style.transform = `perspective(1000px) rotateY(${deltaX}deg) rotateX(${-deltaY}deg)`;
            });
        });
        
        // Reset transform when mouse leaves
        document.addEventListener('mouseleave', () => {
            document.querySelectorAll('.window').forEach(window => {
                window.style.transform = '';
            });
        });
    }
    
    // Public API for integration with main desktop
    getBackgroundImages() {
        return this.backgroundImages;
    }
    
    getCurrentBackground() {
        return this.currentBackground;
    }
    
    // Initialize background grid after backgrounds are loaded
    async ready() {
        await new Promise(resolve => {
            if (this.backgroundImages.length > 0) {
                resolve();
            } else {
                setTimeout(() => this.ready().then(resolve), 100);
            }
        });
        this.populateBackgroundGrid();
    }
}

// Export for use in main desktop
export default DesktopEnhancer;
