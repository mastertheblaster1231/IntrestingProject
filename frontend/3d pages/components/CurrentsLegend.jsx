import React, { useState, useEffect, useRef } from "react";
import { useOceanStore } from "../useOceanStore.js";

export function CurrentsLegend() {
  return null;
  const { currentField, currentStatus, currentSourceMode, currentLastUpdated, currentDepth, fetchCurrentField } = useOceanStore();

  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 14, y: window.innerHeight - 340 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 14, posY: window.innerHeight - 340 });

  // Fetch on mount if not loaded
  useEffect(() => {
    if (currentStatus === "idle") {
      fetchCurrentField();
    }
  }, [currentStatus, fetchCurrentField]);

  // Handle window resize to keep it on screen
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 200),
        y: Math.min(prev.y, window.innerHeight - 50)
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);



  const modeColors = {
    live: "#4ade80",
    cached: "#facc15",
    unavailable: "#f87171"
  };

  const mode = currentStatus === "error" || currentSourceMode === "unavailable" 
      ? "unavailable" 
      : currentSourceMode || "unavailable";

  const handlePointerDown = (e) => {
    if (e.target.closest('.legend-controls')) return; // Don't drag if clicking buttons
    e.target.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPosition({
      x: dragRef.current.posX + dx,
      y: Math.max(0, dragRef.current.posY + dy)
    });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="currents-legend panel-glass"
      style={{
        position: "absolute",
        top: position.y,
        left: position.x,
        zIndex: 10,
        padding: isMinimized ? "8px 12px" : "12px 16px",
        borderRadius: "8px",
        fontFamily: "Inter, sans-serif",
        fontSize: "0.75rem",
        color: "#e2e8f0",
        width: "280px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none"
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMinimized ? 0 : "8px" }}>
        <h4 style={{ margin: 0, color: "#fff", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>Ocean Currents</span>
          <span 
            style={{ 
              fontSize: "0.6rem", 
              padding: "2px 6px", 
              borderRadius: "4px", 
              background: "rgba(0,0,0,0.4)",
              border: `1px solid ${modeColors[mode]}`,
              color: modeColors[mode],
              textTransform: "uppercase",
              fontWeight: "bold"
            }}
          >
            {mode}
          </span>
        </h4>
        <div className="legend-controls" style={{ display: "flex", gap: "4px" }}>
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            style={{ 
              background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", 
              borderRadius: "4px", width: "20px", height: "20px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 0
            }}
          >
            {isMinimized ? "+" : "−"}
          </button>
        </div>
      </div>
      
      {!isMinimized && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", cursor: "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>Source:</span>
              <span style={{ fontWeight: 500 }}>Copernicus Marine</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>Variables:</span>
              <span style={{ fontWeight: 500 }}>uo (east), vo (north)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>Units:</span>
              <span style={{ fontWeight: 500 }}>m/s</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#94a3b8" }}>Depth:</span>
              <span style={{ fontWeight: 500 }}>{currentDepth} m</span>
            </div>
            
            {currentField && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Field time:</span>
                <span style={{ fontWeight: 500 }}>
                  {new Date(currentField.timestamp).toISOString().replace("T", " ").substring(0, 16)} UTC
                </span>
              </div>
            )}

            {currentLastUpdated && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Updated:</span>
                <span style={{ fontWeight: 500 }}>
                  {new Date(currentLastUpdated).toISOString().replace("T", " ").substring(0, 16)} UTC
                </span>
              </div>
            )}
          </div>

          <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "8px", cursor: "default" }}>
            <div style={{ marginBottom: "4px", color: "#94a3b8" }}>Color: current speed (m/s)</div>
            <div style={{ 
              height: "6px", 
              width: "100%", 
              background: "linear-gradient(90deg, #1e3a8a, #06b6d4, #fef08a, #ffffff)",
              borderRadius: "3px",
              marginBottom: "4px"
            }} />
            <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "0.65rem" }}>
              <span>0.0</span>
              <span>1.5+</span>
            </div>
          </div>

          <div style={{ marginTop: "8px", fontSize: "0.65rem", color: "#64748b", fontStyle: "italic", textAlign: "center", cursor: "default" }}>
            Animation visually accelerated; magnitudes remain in m/s.
          </div>
          
          {mode === "cached" && (
            <div style={{ marginTop: "6px", color: "#facc15", fontSize: "0.65rem", fontWeight: "bold", textAlign: "center", cursor: "default" }}>
              LIVE DATA UNAVAILABLE — displaying last successful current field
            </div>
          )}
          {mode === "unavailable" && (
            <div style={{ marginTop: "6px", color: "#f87171", fontSize: "0.65rem", fontWeight: "bold", textAlign: "center", cursor: "default" }}>
              Current vectors unavailable
            </div>
          )}
        </>
      )}
    </div>
  );
}
