import { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Maximize2 } from 'lucide-react';
import { FileItem } from '../../api/files.api';
import { Button } from '../ui';

interface ImageViewerProps {
  file: FileItem;
}

export function ImageViewer({ file }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const imageUrl = `/api/files/${file.id}/download`;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        setRotation(prev => (prev + 90) % 360);
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  };

  const handleFitToScreen = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (scale === 1) {
      setScale(2);
    } else {
      handleFitToScreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center bg-black relative overflow-hidden"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <img
        ref={imageRef}
        src={imageUrl}
        alt={file.name}
        className="max-w-full max-h-full object-contain select-none"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
          cursor: isDragging ? 'grabbing' : scale > 1 ? 'grab' : 'default',
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        draggable={false}
      />

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 rounded-lg p-2">
        <Button onClick={handleZoomOut} variant="secondary" size="sm">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-white text-sm px-2">
          {Math.round(scale * 100)}%
        </span>
        <Button onClick={handleZoomIn} variant="secondary" size="sm">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <div className="w-px h-6 bg-surface-600 mx-1" />
        <Button onClick={() => setRotation(prev => (prev + 90) % 360)} variant="secondary" size="sm">
          <RotateCw className="w-4 h-4" />
        </Button>
        <Button onClick={handleFitToScreen} variant="secondary" size="sm">
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
