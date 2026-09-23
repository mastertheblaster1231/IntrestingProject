import React, { useState, useEffect, useRef } from "react";
import { useOceanStore } from "../useOceanStore.js";

export function SelectedLocationOverlay() {
  const activeInstrument = useOceanStore((state) => state.activeInstrument);
  const [location, setLocation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 14, y: 70 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 14, posY: 70 });

  // Listen for Argo float selections from World.js
  useEffect(() => {
    const handler = (e) => {
      e.detail;
    };
    window.addEventListener("argoLocationSelected", handler);
    return () => window.removeEventListener("argoLocationSelected", handler);
  }, []);

  // Also sync from Zustand activeInstrument
  useEffect(() => {
    if (activeInstrument && activeInstrument.lat && activeInstrument.lon) {
      setLocation((prev) => ({
        ...prev,
        floatId:
          activeInstrument.id ||
          activeInstrument.floatId ||
          prev?.floatId ||
          "",
        name: activeInstrument.name || prev?.name || "",
        sea: activeInstrument.sea || prev?.sea || "Indian Ocean",
        region: activeInstrument.region || prev?.region || "",
        lat: activeInstrument.lat,
        lon: activeInstrument.lon,
        depth:
          activeInstrument.depthMeters ||
          activeInstrument.depth ||
          prev?.depth ||
          0,
        status: activeInstrument.status || prev?.status || "active",
      }));
    }
  }, [activeInstrument]);

  const handlePointerDown = (e) => {
    if (
      e.target.closest(".overlay-controls") ||
      e.target.closest(".search-input")
    )
      return;
    e.target.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: dragRef.current.posX + (e.clientX - dragRef.current.startX),
      y: Math.max(
        0,
        dragRef.current.posY + (e.clientY - dragRef.current.startY),
      ),
    });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    try {
      e.target.releasePointerCapture(e.pointerId);
    } catch (ex) {}
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    // Search through Argo points and select the matching one
    if (window.selectStation) {
      window.selectStation(searchQuery.trim());
    }
    // Also try to find by sea/region name in argoPoints
    if (typeof window !== "undefined" && window.argoPoints) {
      const match = window.argoPoints.find(
        (p) =>
          (p.name &&
            p.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (p.sea && p.sea.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (p.id && p.id.toLowerCase().includes(searchQuery.toLowerCase())),
      );
      if (match && window.selectStation) {
        window.selectStation(match.id);
      }
    }
  };

  const formatCoord = (val, isLat) => {
    if (val == null || isNaN(val)) return "--";
    const abs = Math.abs(val).toFixed(4);
    const dir = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "E" : "W";
    return `${abs}° ${dir}`;
  };

  return (
    <div
      className="selected-location-overlay panel-glass"
      style={{
        position: "absolute",
        top: position.y,
        left: position.x,
        zIndex: 12,
        padding: isMinimized ? "8px 12px" : "12px 16px",
        borderRadius: "10px",
        fontFamily: "Inter, sans-serif",
        fontSize: "0.75rem",
        color: "#e2e8f0",
        width: "300px",
        background: "rgba(10, 15, 30, 0.85)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(100, 180, 255, 0.15)",
        boxShadow:
          "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isMinimized ? 0 : "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1rem" }}>📍</span>
          <h4
            style={{
              margin: 0,
              color: "#fff",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            {location ? location.sea || "Selected Location" : "No Selection"}
          </h4>
          {location?.status && (
            <span
              style={{
                fontSize: "0.55rem",
                padding: "2px 5px",
                borderRadius: "4px",
                background:
                  location.status === "active"
                    ? "rgba(74,222,128,0.15)"
                    : "rgba(250,204,21,0.15)",
                border: `1px solid ${location.status === "active" ? "#4ade80" : "#facc15"}`,
                color: location.status === "active" ? "#4ade80" : "#facc15",
                textTransform: "uppercase",
                fontWeight: "bold",
              }}
            >
              {location.status}
            </span>
          )}
        </div>
        <div
          className="overlay-controls"
          style={{ display: "flex", gap: "4px" }}
        >
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "none",
              color: "#fff",
              borderRadius: "4px",
              width: "20px",
              height: "20px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              fontSize: "0.8rem",
            }}
          >
            {isMinimized ? "+" : "−"}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Location Details */}
          {location ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "5px",
                cursor: "default",
                marginBottom: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Float ID:</span>
                <span
                  style={{
                    fontWeight: 600,
                    color: "#38bdf8",
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {location.floatId || "--"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Region:</span>
                <span style={{ fontWeight: 500 }}>
                  {location.region || location.sea || "--"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Latitude:</span>
                <span
                  style={{
                    fontWeight: 500,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {formatCoord(location.lat, true)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Longitude:</span>
                <span
                  style={{
                    fontWeight: 500,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                >
                  {formatCoord(location.lon, false)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Max Depth:</span>
                <span style={{ fontWeight: 500 }}>
                  {location.depth || "--"} m
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "12px 0",
                textAlign: "center",
                color: "#64748b",
                fontStyle: "italic",
                cursor: "default",
              }}
            >
              Click an Argo float to see its location data
            </div>
          )}

          {/* Search Bar */}
          <form onSubmit={handleSearch} style={{ cursor: "default" }}>
            <div className="search-input" style={{ position: "relative" }}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter Region to compare"
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 32px",
                  borderRadius: "6px",
                  border: "1px solid rgba(100, 180, 255, 0.2)",
                  background: "rgba(0, 0, 0, 0.3)",
                  color: "#e2e8f0",
                  fontSize: "0.75rem",
                  fontFamily: "Inter, sans-serif",
                  outline: "none",
                  cursor: "text",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "rgba(56, 189, 248, 0.5)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "rgba(100, 180, 255, 0.2)")
                }
              />
              <span
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "0.8rem",
                  opacity: 0.5,
                  pointerEvents: "none",
                }}
              >
                🔍
              </span>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
