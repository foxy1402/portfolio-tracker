// Portfolio Tracker - Interactive Donut Chart

class PortfolioChart {
    constructor(canvasId, tooltipId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = document.getElementById(tooltipId);

        // Chart configuration
        this.centerX = 0;
        this.centerY = 0;
        this.outerRadius = 0;
        this.innerRadius = 0;

        // Data
        this.segments = [];
        this.hoveredSegment = null;

        // Colors
        this.colors = {
            crypto: { gradient: ['#f7931a', '#ff6b00'], solid: '#f7931a' },
            stocks: { gradient: ['#00d4aa', '#00a080'], solid: '#00d4aa' },
            gold: { gradient: ['#ffd700', '#ffaa00'], solid: '#ffd700' }
        };

        // Setup
        this.setupCanvas();
        this.bindEvents();
    }

    setupCanvas() {
        // High DPI support
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        // Calculate dimensions
        const size = Math.min(rect.width, rect.height);
        this.centerX = rect.width / 2;
        this.centerY = rect.height / 2;
        this.outerRadius = size / 2 - 10;
        this.innerRadius = this.outerRadius * 0.6;
    }

    bindEvents() {
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.draw();
        });
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if hovering over a segment
        const segment = this.getSegmentAtPoint(x, y);

        if (segment !== this.hoveredSegment) {
            this.hoveredSegment = segment;
            this.draw();
        }

        if (segment) {
            this.showTooltip(e.clientX, e.clientY, segment);
        } else {
            this.hideTooltip();
        }
    }

    handleMouseLeave() {
        this.hoveredSegment = null;
        this.hideTooltip();
        this.draw();
    }

    getSegmentAtPoint(x, y) {
        const dx = x - this.centerX;
        const dy = y - this.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if within donut ring
        if (distance < this.innerRadius || distance > this.outerRadius) {
            return null;
        }

        // Calculate angle
        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) {
            angle += Math.PI * 2;
        }
        angle += Math.PI / 2; // Adjust for starting at top
        if (angle > Math.PI * 2) angle -= Math.PI * 2;

        // Find segment at this angle
        for (const segment of this.segments) {
            let startAngle = segment.startAngle + Math.PI / 2;
            let endAngle = segment.endAngle + Math.PI / 2;

            if (startAngle < 0) startAngle += Math.PI * 2;
            if (endAngle < 0) endAngle += Math.PI * 2;

            if (angle >= startAngle && angle <= endAngle) {
                return segment;
            }
        }

        return null;
    }

    showTooltip(x, y, segment, forceCenter = false) {
        if (!this.tooltip) return;

        // Build tooltip content
        const colorStyle = `background: linear-gradient(135deg, ${this.colors[segment.category].gradient.join(', ')})`;

        // Sort assets by value (or percentage) descending
        const sortedAssets = [...segment.assets].sort((a, b) => b.categoryPercentage - a.categoryPercentage);

        let assetsHtml = '';
        sortedAssets.forEach(asset => {
            assetsHtml += `
        <div class="tooltip-asset">
          <span>${asset.name}</span>
          <span class="tooltip-asset-value">${PortfolioApp.formatPercent(asset.categoryPercentage)}</span>
        </div>
      `;
        });

        this.tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-color" style="${colorStyle}"></span>
        <span>${this.getCategoryLabel(segment.category)} - ${PortfolioApp.formatPercent(segment.percentage)}</span>
      </div>
      <div class="tooltip-assets">
        ${assetsHtml || '<div class="tooltip-asset">No assets</div>'}
      </div>
    `;

        // Always use centered mode as requested for both desktop and mobile
        // This provides the "cool animation" consistently

        this.tooltip.classList.add('mobile-center');
        // Remove inline styles for positioning
        this.tooltip.style.left = '';
        this.tooltip.style.top = '';

        this.tooltip.classList.add('visible');

        // Add click listener to close if NOT hovering (e.g. triggered by legend click)
        // If triggered by hover, handleMouseLeave will hide it.
        // If triggered by legend click (forceCenter=true), we need click-outside to close.

        // However, if we are in "hover mode", we rely on mouseleave.
        // If we are in "click mode" (forceCenter), we rely on click-outside.

        if (forceCenter && !this._hasCloseListener) {
            // Remove any existing listener first just in case
            if (this._closeHandler) {
                document.removeEventListener('click', this._closeHandler);
            }

            this._closeHandler = (e) => {
                if (!this.tooltip.contains(e.target) && !e.target.closest('.legend-item')) {
                    this.hideTooltip();
                    document.removeEventListener('click', this._closeHandler);
                    this._hasCloseListener = false;
                    this._closeHandler = null;
                }
            };
            // Delay adding listener to avoid immediate closing from the trigger click
            setTimeout(() => {
                document.addEventListener('click', this._closeHandler);
                this._hasCloseListener = true;
            }, 10);
        }
    }

    showTooltipForCategory(category) {
        const segment = this.segments.find(s => s.category === category);
        if (segment) {
            // Force center for legend clicks on all devices
            this.showTooltip(0, 0, segment, true);
        }
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.classList.remove('visible');
        }
    }

    getCategoryLabel(category) {
        const labels = {
            crypto: 'Crypto',
            stocks: 'USA Stocks',
            gold: 'Gold'
        };
        return labels[category] || category;
    }

    createGradient(colors, startAngle, endAngle) {
        const midAngle = (startAngle + endAngle) / 2;
        const x1 = this.centerX + Math.cos(midAngle) * this.innerRadius;
        const y1 = this.centerY + Math.sin(midAngle) * this.innerRadius;
        const x2 = this.centerX + Math.cos(midAngle) * this.outerRadius;
        const y2 = this.centerY + Math.sin(midAngle) * this.outerRadius;

        const gradient = this.ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(1, colors[1]);
        return gradient;
    }

    update(data) {
        this.segments = [];

        const categories = ['crypto', 'stocks', 'gold'];
        let currentAngle = -Math.PI / 2; // Start at top

        categories.forEach(cat => {
            const catData = data.categories[cat];
            if (catData.percentage > 0) {
                const sweepAngle = (catData.percentage / 100) * Math.PI * 2;

                this.segments.push({
                    category: cat,
                    startAngle: currentAngle,
                    endAngle: currentAngle + sweepAngle,
                    percentage: catData.percentage,
                    total: catData.total,
                    assets: catData.assets
                });

                currentAngle += sweepAngle;
            }
        });

        // Sort segments by value descending to match guide
        this.segments.sort((a, b) => b.total - a.total);

        // Re-calculate angles based on sorted order for visual consistency
        // Note: We need to re-calculate angles because sorting breaks the contiguous sweep
        let angle = -Math.PI / 2;
        this.segments.forEach(seg => {
            const sweep = seg.endAngle - seg.startAngle;
            seg.startAngle = angle;
            seg.endAngle = angle + sweep;
            angle += sweep;
        });

        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.segments.length === 0) {
            this.drawEmptyState();
            return;
        }

        // Draw segments
        this.segments.forEach(segment => {
            const isHovered = this.hoveredSegment === segment;
            const radius = isHovered ? this.outerRadius + 5 : this.outerRadius;

            ctx.beginPath();
            ctx.arc(this.centerX, this.centerY, radius, segment.startAngle, segment.endAngle);
            ctx.arc(this.centerX, this.centerY, this.innerRadius, segment.endAngle, segment.startAngle, true);
            ctx.closePath();

            // Fill with gradient
            const gradient = this.createGradient(
                this.colors[segment.category].gradient,
                segment.startAngle,
                segment.endAngle
            );
            ctx.fillStyle = gradient;
            ctx.fill();

            // Add glow effect on hover
            if (isHovered) {
                ctx.shadowColor = this.colors[segment.category].solid;
                ctx.shadowBlur = 20;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        });

        // Draw segment separators
        ctx.strokeStyle = '#0a0a0f';
        ctx.lineWidth = 2;

        this.segments.forEach(segment => {
            if (segment.percentage < 100) {
                ctx.beginPath();
                ctx.moveTo(
                    this.centerX + Math.cos(segment.startAngle) * this.innerRadius,
                    this.centerY + Math.sin(segment.startAngle) * this.innerRadius
                );
                ctx.lineTo(
                    this.centerX + Math.cos(segment.startAngle) * this.outerRadius,
                    this.centerY + Math.sin(segment.startAngle) * this.outerRadius
                );
                ctx.stroke();
            }
        });
    }

    drawEmptyState() {
        const ctx = this.ctx;

        // Draw empty ring
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.outerRadius, 0, Math.PI * 2);
        ctx.arc(this.centerX, this.centerY, this.innerRadius, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();

        // Draw dashed outline
        ctx.beginPath();
        ctx.arc(this.centerX, this.centerY, this.outerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// Make it globally available
window.PortfolioChart = PortfolioChart;
