import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * InfoCircle — Interactive information helper badge (ⓘ).
 * Displays a concise description of what the feature does, its role in the command center,
 * and future REST API integration (INCOIS / ERDDAP / NetCDF).
 *
 * Rendered using a React Portal directly into document.body to ensure it floats above
 * all panels, 3D Canvas, HUD layers, and is never clipped by parent overflow:hidden containers.
 *
 * @param {Object} props
 * @param {string} props.title - Feature title
 * @param {string} props.whatItDoes - Brief description of what this UI control does
 * @param {string} props.futureApiUse - How it interfaces with live APIs / backend
 * @param {string} [props.position='bottom'] - Preferred popover position ('bottom', 'top', 'left', 'right')
 * @param {string} [props.badgeText='ⓘ'] - Custom badge label
 */
export function InfoCircle({
  title,
  whatItDoes,
  futureApiUse,
  position = 'bottom',
  badgeText = 'ⓘ',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, actualPosition: position });

  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Measure and position the popover cleanly near buttonRef
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 330;
    const popoverHeight = popoverRef.current ? popoverRef.current.offsetHeight : 210;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = 0;
    let left = 0;
    let actualPos = position;

    if (position === 'top') {
      top = rect.top - popoverHeight - gap;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      // If overflows top, flip to bottom
      if (top < 10) {
        top = rect.bottom + gap;
        actualPos = 'bottom';
      }
    } else if (position === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - popoverWidth / 2;
      // If overflows bottom, flip to top
      if (top + popoverHeight > vh - 10) {
        top = rect.top - popoverHeight - gap;
        actualPos = 'top';
      }
    } else if (position === 'right') {
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      // If overflows right edge, flip to left
      if (left + popoverWidth > vw - 10) {
        left = rect.left - popoverWidth - gap;
        actualPos = 'left';
      }
    } else if (position === 'left') {
      left = rect.left - popoverWidth - gap;
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      // If overflows left edge, flip to right
      if (left < 10) {
        left = rect.right + gap;
        actualPos = 'right';
      }
    }

    // Clamp inside viewport
    left = Math.max(10, Math.min(left, vw - popoverWidth - 10));
    top = Math.max(10, Math.min(top, vh - popoverHeight - 10));

    setCoords({ top, left, actualPosition: actualPos });
  }, [position]);

  // Open with hover
  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    updatePosition();
    setIsOpen(true);
  };

  // Grace period when moving mouse away
  const handleMouseLeave = () => {
    if (isPinned) return; // Don't close if user clicked to pin
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 220);
  };

  // Toggle pin on click
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
      setIsPinned(true);
    } else if (!isPinned) {
      setIsPinned(true);
    } else {
      setIsPinned(false);
      setIsOpen(false);
    }
  };

  // Close helper
  const handleClose = () => {
    setIsPinned(false);
    setIsOpen(false);
  };

  // Reposition on resize/scroll while open
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => updatePosition();
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Re-measure after mounted to guarantee exact height placement
  useEffect(() => {
    if (isOpen && popoverRef.current) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setIsOpen(false);
        setIsPinned(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsPinned(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      className="info-circle-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`info-circle-btn ${isOpen ? 'info-circle-btn--active' : ''} ${isPinned ? 'info-circle-btn--pinned' : ''}`}
        onClick={handleClick}
        title="Click to pin / Hover for feature info & API details"
        aria-label={`Information about ${title}`}
      >
        {badgeText}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className={`info-circle-portal-popover info-circle-portal-popover--${coords.actualPosition}`}
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="info-circle-popover__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="info-circle-popover__icon">ℹ️</span>
                <span className="info-circle-popover__title">{title}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isPinned && <span className="info-circle-popover__pinned-tag">PINNED</span>}
                <button
                  type="button"
                  className="info-circle-popover__close-btn"
                  onClick={handleClose}
                  title="Close"
                  aria-label="Close information card"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="info-circle-popover__body">
              {whatItDoes && (
                <div className="info-circle-section">
                  <span className="info-circle-section__tag">What it does:</span>
                  <p className="info-circle-section__text">{whatItDoes}</p>
                </div>
              )}

              {futureApiUse && (
                <div className="info-circle-section info-circle-section--api">
                  <span className="info-circle-section__tag info-circle-section__tag--api">Future API Use:</span>
                  <p className="info-circle-section__text">{futureApiUse}</p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default InfoCircle;
