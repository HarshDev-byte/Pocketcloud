import React, { useState, useEffect, useRef } from 'react';
import { useSpring, animated, config } from '@react-spring/web';
import { useGesture } from '@use-gesture/react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[]; // Percentages of screen height
  initialSnap?: number; // Index of initial snap point
  title?: string;
  showHandle?: boolean;
  backdrop?: boolean;
  className?: string;
}

export const MobileBottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  snapPoints = [40, 80],
  initialSnap = 0,
  title,
  showHandle = true,
  backdrop = true,
  className = ''
}) => {
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Convert snap points to pixel values
  const getSnapPosition = (snapIndex: number) => {
    const vh = window.innerHeight;
    return vh - (vh * snapPoints[snapIndex]) / 100;
  };

  // Backdrop animation
  const [backdropSpring, backdropApi] = useSpring(() => ({
    opacity: 0,
    pointerEvents: 'none' as const,
    config: config.default
  }));

  // Sheet animation
  const [sheetSpring, sheetApi] = useSpring(() => ({
    y: window.innerHeight,
    config: { tension: 300, friction: 30 }
  }));

  // Update animations when open state changes
  useEffect(() => {
    if (isOpen) {
      backdropApi.start({
        opacity: 1,
        pointerEvents: 'auto' as const
      });
      sheetApi.start({
        y: getSnapPosition(currentSnap)
      });
    } else {
      backdropApi.start({
        opacity: 0,
        pointerEvents: 'none' as const
      });
      sheetApi.start({
        y: window.innerHeight
      });
    }
  }, [isOpen, currentSnap, backdropApi, sheetApi]);

  // Gesture handling for drag
  const gesture = useGesture({
    onDrag: ({ offset: [, oy], velocity: [, vy], active, cancel }) => {
      setIsDragging(active);

      if (active) {
        // Update position during drag
        const newY = Math.max(getSnapPosition(snapPoints.length - 1), oy);
        sheetApi.start({ y: newY, immediate: true });
      } else {
        // Determine target snap point based on position and velocity
        const currentY = oy;
        let targetSnap = currentSnap;

        // If dragging down with velocity, close or go to lower snap
        if (vy > 0.5) {
          if (currentSnap === 0) {
            onClose();
            return;
          } else {
            targetSnap = Math.max(0, currentSnap - 1);
          }
        }
        // If dragging up with velocity, go to higher snap
        else if (vy < -0.5) {
          targetSnap = Math.min(snapPoints.length - 1, currentSnap + 1);
        }
        // Otherwise, snap to nearest point
        else {
          let minDistance = Infinity;
          snapPoints.forEach((_, index) => {
            const snapY = getSnapPosition(index);
            const distance = Math.abs(currentY - snapY);
            if (distance < minDistance) {
              minDistance = distance;
              targetSnap = index;
            }
          });

          // If dragged below lowest snap point, close
          if (currentY > getSnapPosition(0) + 100) {
            onClose();
            return;
          }
        }

        setCurrentSnap(targetSnap);
        sheetApi.start({ y: getSnapPosition(targetSnap) });
      }
    }
  }, {
    drag: {
      axis: 'y',
      bounds: {
        top: getSnapPosition(snapPoints.length - 1),
        bottom: window.innerHeight + 100
      },
      rubberband: true,
      filterTaps: true
    }
  });

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isOpen]);

  if (!isOpen && !backdropSpring.opacity.get()) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      {backdrop && (
        <animated.div
          style={backdropSpring}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={handleBackdropClick}
        />
      )}

      {/* Bottom Sheet */}
      <animated.div
        ref={sheetRef}
        style={sheetSpring}
        className={`absolute left-0 right-0 bottom-0 bg-white dark:bg-gray-800 rounded-t-xl shadow-2xl ${className}`}
        {...gesture()}
      >
        {/* Drag Handle */}
        {showHandle && (
          <div className="flex justify-center py-3">
            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>
        )}

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div 
          className="overflow-y-auto overscroll-contain"
          style={{ 
            maxHeight: `${snapPoints[snapPoints.length - 1]}vh`,
            paddingBottom: 'env(safe-area-inset-bottom)'
          }}
        >
          {children}
        </div>

        {/* Snap Point Indicators */}
        {snapPoints.length > 1 && (
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2 flex flex-col gap-2">
            {snapPoints.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  setCurrentSnap(index);
                  sheetApi.start({ y: getSnapPosition(index) });
                }}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentSnap
                    ? 'bg-blue-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            ))}
          </div>
        )}
      </animated.div>
    </div>
  );
};

// Hook for managing bottom sheet state
export function useBottomSheet(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [snapIndex, setSnapIndex] = useState(0);

  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const toggle = () => setIsOpen(prev => !prev);

  const snapTo = (index: number) => {
    setSnapIndex(index);
  };

  return {
    isOpen,
    snapIndex,
    open,
    close,
    toggle,
    snapTo
  };
}

export default MobileBottomSheet;