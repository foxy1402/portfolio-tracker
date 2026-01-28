// DOM Utilities - Safe HTML Rendering (XSS Protection)

const DOMUtils = {
  /**
   * Create an element with safe text content
   * @param {string} tag - HTML tag name
   * @param {Object} options - Element options
   * @returns {HTMLElement}
   */
  createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.className) {
      element.className = options.className;
    }

    if (options.id) {
      element.id = options.id;
    }

    if (options.text) {
      element.textContent = options.text; // Safe - auto-escaped
    }

    if (options.html) {
      // Only allow if explicitly marked as safe
      if (options.html.safe === true) {
        element.innerHTML = options.html.content;
      } else {
        console.warn('Unsafe HTML blocked. Use text instead or mark as safe.');
      }
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    if (options.styles) {
      Object.assign(element.style, options.styles);
    }

    if (options.events) {
      Object.entries(options.events).forEach(([event, handler]) => {
        element.addEventListener(event, handler);
      });
    }

    if (options.children) {
      options.children.forEach(child => {
        if (child instanceof HTMLElement) {
          element.appendChild(child);
        }
      });
    }

    return element;
  },

  /**
   * Create asset item card (safe)
   */
  createAssetItem(asset, options = {}) {
    const item = this.createElement('div', {
      className: 'asset-item'
    });

    // 1. Icon (Far Left)
    const icon = this.createAssetIcon(asset);
    icon.style.marginRight = '6px';
    item.appendChild(icon);

    // 2. Main Info Column (Symbol+Qty / Value)
    const leftCol = this.createElement('div', {
      className: 'asset-col-left',
      styles: { display: 'flex', flexDirection: 'column', gap: '4px', flex: '1.5', minWidth: '0' }
    });

    // Row 1: Symbol + Qty
    const topRow = this.createElement('div', {
      styles: { display: 'flex', alignItems: 'center', gap: '6px' }
    });

    topRow.appendChild(this.createElement('span', {
      text: asset.symbol || asset.name,
      styles: { fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }
    }));

    topRow.appendChild(this.createElement('span', {
      text: new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(asset.balance),
      styles: { fontSize: '0.9rem', color: 'var(--text-secondary)' }
    }));

    // Row 2: Total Value
    const bottomRow = this.createElement('div', {
      text: PortfolioApp.formatCurrency(asset.value),
      styles: { fontWeight: '500', fontSize: '0.95rem', color: 'var(--text-muted)' }
    });

    leftCol.appendChild(topRow);
    leftCol.appendChild(bottomRow);
    item.appendChild(leftCol);

    // 3. Middle Column: PnL (Unrealized)
    if (asset.costBasis > 0 && options.showPnL !== false) {
      const midCol = this.createElement('div', {
        className: 'asset-col-mid',
        styles: { flex: '1.2', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: '4px' }
      });

      const isPositive = asset.profitLoss >= 0;
      const sign = isPositive ? '+' : '';
      const color = isPositive ? 'var(--profit-text)' : 'var(--loss-text)';
      const badgeBg = isPositive ? 'var(--profit-bg)' : 'var(--loss-bg)';

      // PnL $
      const pnlUsd = this.createElement('div', {
        text: `${sign}${PortfolioApp.formatCurrency(asset.profitLoss)}`,
        styles: { color: color, fontWeight: '600', fontSize: '0.9rem' }
      });

      // PnL % Badge
      const pnlBadge = this.createElement('div', {
        styles: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '2px',
          background: badgeBg,
          padding: '2px 6px',
          borderRadius: '4px',
          color: color,
          fontSize: '0.8rem',
          fontWeight: '500'
        },
        text: `${isPositive ? '▲' : '▼'} ${Math.abs(asset.profitLossPercent).toFixed(2)}%`
      });

      midCol.appendChild(pnlUsd);
      midCol.appendChild(pnlBadge);
      item.appendChild(midCol);
    } else {
      item.appendChild(this.createElement('div', { styles: { flex: '1' } }));
    }

    // 4. Right Column: Price
    if (options.showValue !== false) {
      const rightCol = this.createElement('div', {
        className: 'asset-col-right',
        styles: { flex: '0.8', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }
      });

      const price = this.createElement('div', {
        text: PortfolioApp.formatCurrency(asset.currentPrice),
        styles: { fontWeight: '600', fontSize: '1rem', color: 'var(--text-primary)' }
      });

      rightCol.appendChild(price);
      item.appendChild(rightCol);
    }

    return item;
  },

  /**
   * Create asset icon (safe)
   */
  createAssetIcon(asset) {
    // New Wrapper with background
    const wrapper = this.createElement('div', {
      className: `asset-icon-wrapper ${asset.category}-bg`
    });

    if (asset.iconUrl) {
      const img = this.createElement('img', {
        attributes: {
          src: asset.iconUrl,
          alt: asset.symbol || asset.name
        },
        className: 'asset-icon-img'
      });

      // Fallback to text if image fails
      img.onerror = () => {
        img.style.display = 'none';
        wrapper.textContent = asset.symbol
          ? asset.symbol.substring(0, 2).toUpperCase()
          : '??';
        wrapper.style.fontSize = '0.8rem';
        wrapper.style.fontWeight = '700';
      };

      wrapper.appendChild(img);
    } else {
      wrapper.textContent = asset.symbol
        ? asset.symbol.substring(0, 2).toUpperCase()
        : '??';
      wrapper.style.fontSize = '0.8rem';
      wrapper.style.fontWeight = '700';
    }

    return wrapper;
  },

  /**
   * Create profit/loss badge (safe)
   */
  createProfitLossBadge(asset) {
    const pnlContainer = this.createElement('div', {
      className: 'asset-pnl'
    });

    const isPositive = asset.profitLoss >= 0;
    const sign = isPositive ? '+' : '';
    const badgeClass = isPositive ? 'positive' : 'negative';

    const percentBadge = this.createElement('span', {
      className: `profit-badge ${badgeClass}`,
      text: `${sign}${PortfolioApp.formatPercent(asset.profitLossPercent)}`
    });

    const dollarBadge = this.createElement('span', {
      className: `profit-badge ${badgeClass}`,
      text: `${sign}${PortfolioApp.formatCurrency(asset.profitLoss)}`
    });

    pnlContainer.appendChild(percentBadge);
    pnlContainer.appendChild(dollarBadge);

    return pnlContainer;
  },

  /**
   * Create admin asset item (safe)
   */
  createAdminAssetItem(asset, handlers = {}) {
    const item = this.createElement('div', {
      className: 'admin-asset-item'
    });

    // Info section
    const info = this.createElement('div', {
      className: 'asset-info'
    });

    const icon = this.createAssetIcon(asset);
    info.appendChild(icon);

    const details = this.createElement('div');

    const name = this.createElement('div', {
      className: 'asset-name'
    });
    name.textContent = asset.name;
    if (asset.notes) {
      name.textContent += ' 📝';
    }

    const symbolText = [
      asset.symbol || '',
      asset.coinstatsId ? `ID: ${asset.coinstatsId}` : '',
      asset.manualPrice ? `Manual: $${asset.manualPrice}` : ''
    ].filter(Boolean).join(' • ');

    const symbol = this.createElement('div', {
      className: 'asset-symbol',
      text: symbolText
    });

    // Add purchase date and buy price info
    const buyPriceInfo = asset.buyPrice ? `Buy: $${asset.buyPrice}` : 'No buy price';
    const purchaseDateInfo = asset.purchaseDate ? `Bought: ${asset.purchaseDate}` : 'No purchase date'; // ✨ NEW

    const balance = this.createElement('div', {
      className: 'asset-balance',
      text: `Balance: ${asset.balance} • ${buyPriceInfo} • ${purchaseDateInfo}`, // ✨ UPDATED
      styles: { marginTop: '4px' }
    });

    details.appendChild(name);
    details.appendChild(symbol);
    details.appendChild(balance);
    info.appendChild(details);
    item.appendChild(info);

    // Actions
    const actions = this.createElement('div', {
      className: 'admin-asset-actions'
    });

    const editBtn = this.createElement('button', {
      className: 'btn btn-secondary btn-icon',
      text: '✏️',
      attributes: {
        title: 'Edit'
      },
      events: {
        click: () => handlers.onEdit?.(asset.id)
      }
    });

    const deleteBtn = this.createElement('button', {
      className: 'btn btn-danger btn-icon',
      text: '🗑️',
      attributes: {
        title: 'Delete'
      },
      events: {
        click: () => handlers.onDelete?.(asset.id)
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    return item;
  },

  /**
   * Create result item for rebalance page (safe)
   */
  createRebalanceResultItem(asset) {
    const item = this.createElement('div', {
      className: `asset-result ${asset.excluded ? 'excluded' : ''}`
    });

    // Info section
    const info = this.createElement('div', {
      className: 'asset-result-info'
    });

    const icon = this.createAssetIcon(asset);
    icon.className = `asset-result-icon ${asset.category}`;
    info.appendChild(icon);

    const details = this.createElement('div');

    const name = this.createElement('div', {
      className: 'asset-result-name'
    });
    name.textContent = asset.name;
    if (asset.excluded) {
      const excludedSpan = this.createElement('span', {
        text: ' (excluded)',
        styles: { color: 'var(--text-muted)' }
      });
      name.appendChild(excludedSpan);
    }

    const detailsText = this.createElement('div', {
      className: 'asset-result-details'
    });

    let detailLines = [`Current: ${asset.balance} ${asset.symbol || ''} (${PortfolioApp.formatCurrency(asset.value)})`];

    if (asset.targetPercent !== undefined) {
      detailLines.push(`Target: ${asset.targetPercent.toFixed(0)}% → ${PortfolioApp.formatCurrency(asset.targetValue)}`);
    } else if (asset.excluded) {
      detailLines.push('Not included');
    }

    detailsText.innerHTML = detailLines.join('<br>');

    details.appendChild(name);
    details.appendChild(detailsText);
    info.appendChild(details);
    item.appendChild(info);

    // Action section
    const actionContainer = this.createElement('div', {
      className: 'asset-result-action'
    });

    const actionClass = asset.action;
    const actionLabel = asset.action === 'buy'
      ? `Buy ${PortfolioApp.formatCurrency(Math.abs(asset.usdChange))}`
      : asset.action === 'sell'
        ? `Sell ${PortfolioApp.formatCurrency(Math.abs(asset.usdChange))}`
        : 'Hold';

    const actionBadge = this.createElement('div', {
      className: `action-badge ${actionClass}`,
      text: actionLabel
    });

    actionContainer.appendChild(actionBadge);

    if (Math.abs(asset.amountChange) > 0.000001) {
      const amountText = `${asset.action === 'buy' ? '+' : ''}${asset.amountChange.toFixed(6)} ${asset.symbol || 'units'}`;
      const amountEl = this.createElement('div', {
        className: 'action-amount',
        text: amountText
      });
      actionContainer.appendChild(amountEl);
    }

    item.appendChild(actionContainer);

    return item;
  },

  /**
   * Get category label
   */
  getCategoryLabel(category) {
    const labels = {
      crypto: 'Crypto',
      stocks: 'Stocks',
      gold: 'Gold'
    };
    return labels[category] || category;
  },

  /**
   * Clear and render items safely
   */
  renderItems(container, items, createItemFn) {
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }

    if (!container) {
      console.error('Container not found');
      return;
    }

    // Clear existing content
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Render items
    items.forEach(item => {
      const element = createItemFn(item);
      container.appendChild(element);
    });
  },

  /**
   * Show empty state
   */
  showEmptyState(container, message, actionLink) {
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }

    const emptyState = this.createElement('div', {
      className: 'empty-state'
    });

    const icon = this.createElement('div', {
      className: 'empty-state-icon',
      text: '📭'
    });

    const text = this.createElement('p', {
      text: message
    });

    emptyState.appendChild(icon);
    emptyState.appendChild(text);

    if (actionLink) {
      const linkText = this.createElement('p', {
        styles: { fontSize: '0.9rem', marginTop: '0.5rem' }
      });

      const link = this.createElement('a', {
        text: actionLink.text,
        attributes: {
          href: actionLink.href
        },
        styles: { color: 'var(--accent-crypto)' }
      });

      linkText.appendChild(link);
      emptyState.appendChild(linkText);
    }

    container.innerHTML = '';
    container.appendChild(emptyState);
  }
};

window.DOMUtils = DOMUtils;