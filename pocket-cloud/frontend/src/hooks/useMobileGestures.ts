import { useGesture } from '@use-gesture/react';
import { useSpring, animated } from '@react-spring/web';
import { useState, useRef, useCallback } from 'react';

export interface GestureHandlers {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onLongPress?: () => void;
  onPinch?: (scale: number) => void;
  onPullToRefresh?: () => Promise<void>;
}

export interface MobileGestureState {
  isSwipeActionsVisible: boolean;
  isMultiSelectMode: boolean;
  isPullToRefreshActive: boolean;
  pinchScale: number;
}

export function useMobileGestures(handlers: GestureHandlers = {}) {
  const [state, setState] = useState<MobileGestureState>({
    isSwipeActionsVisible: false,
    isMultiSelectMode: false,
    isPullToRefreshActive: false,
    pinchScale: 1
  });

  const longPressTimer = useRef<NodeJS.Timeout>();
  const isLongPressing = useRef(false);

  // Swipe animation for file rows
  const [swipeSpring, swipeApi] = useSpring(() => ({
    x: 0,
    opacity: 1,
    config: { tension: 300, friction: 30 }
  }));

  // Pull to refresh animation
  const [pullSpring, pullApi] = useSpring(() => ({
    y: 0,
    rotate: 0,
    config: { tension: 300, friction: 30 }
  }));

  // Pinch zoom animation
  const [pinchSpring, pinchApi] = useSpring(() => ({
    scale: 1,
    config: { tension: 300, friction: 30 }
  }));

  const showSwipeActions = useCallback(() => {
    setState(prev => ({ ...prev, isSwipeActionsVisible: true }));
    swipeApi.start({ x: -80, opacity: 0.9 });
  }, [swipeApi]);

  const hideSwipeActions = useCallback(() => {
    setState(prev => ({ ...prev, isSwipeActionsVisible: false }));
    swipeApi.start({ x: 0, opacity: 1 });
  }, [swipeApi]);

  const enterMultiSelectMode = useCallback(() => {
    setState(prev => ({ ...prev, isMultiSelectMode: true }));
    // Haptic feedback on supported devices
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setState(prev => ({ ...prev, isMultiSelectMode: false }));
  }, []);

  // File row gesture handler
  const fileRowGesture = useGesture({
    onDrag: ({ offset: [ox], direction: [dx], velocity: [vx], active, cancel }) => {
      // Swipe right to reveal actions
      if (dx > 0 && ox > 50 && vx > 0.3) {
        showSwipeActions();
        handlers.onSwipeRight?.();
        cancel();
      }
      // Swipe left to dismiss actions
      else if (dx < 0 && ox < -20 && state.isSwipeActionsVisible) {
        hideSwipeActions();
        handlers.onSwipeLeft?.();
        cancel();
      }
      // Update position during drag
      else if (active) {
        swipeApi.start({ x: Math.max(-100, Math.min(100, ox)) });
      }
      // Snap back when released
      else {
        swipeApi.start({ x: state.isSwipeActionsVisible ? -80 : 0 });
      }
    },
    onPointerDown: () => {
      // Start long press timer
      longPressTimer.current = setTimeout(() => {
        isLongPressing.current = true;
        enterMultiSelectMode();
        handlers.onLongPress?.();
      }, 500);
    },
    onPointerUp: () => {
      // Clear long press timer
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      isLongPressing.current = false;
    }
  }, {
    drag: {
      axis: 'x',
      filterTaps: true,
      rubberband: true
    }
  });

  // Pull to refresh gesture handler
  const pullToRefreshGesture = useGesture({
    onDrag: ({ offset: [, oy], direction: [, dy], velocity: [, vy], active, cancel }) => {
      // Only allow pull down at top of scroll
      if (dy < 0) return;

      const pullDistance = Math.max(0, Math.min(120, oy));
      
      if (active) {
        setState(prev => ({ ...prev, isPullToRefreshActive: pullDistance > 60 }));
        pullApi.start({ 
          y: pullDistance,
          rotate: pullDistance * 3 // Rotate refresh icon
        });
      } else {
        if (pullDistance > 60 && vy > 0.2) {
          // Trigger refresh
          setState(prev => ({ ...prev, isPullToRefreshActive: true }));
          handlers.onPullToRefresh?.().finally(() => {
            setState(prev => ({ ...prev, isPullToRefreshActive: false }));
            pullApi.start({ y: 0, rotate: 0 });
          });
        } else {
          // Snap back
          setState(prev => ({ ...prev, isPullToRefreshActive: false }));
          pullApi.start({ y: 0, rotate: 0 });
        }
      }
    }
  }, {
    drag: {
      axis: 'y',
      filterTaps: true,
      rubberband: true
    }
  });

  // Pinch zoom gesture handler (for image viewer)
  const pinchZoomGesture = useGesture({
    onPinch: ({ offset: [scale], active }) => {
      const clampedScale = Math.max(0.5, Math.min(3, scale));
      
      setState(prev => ({ ...prev, pinchScale: clampedScale }));
      
      if (active) {
        pinchApi.start({ scale: clampedScale });
      } else {
        // Snap to nearest zoom level
        const snapScale = clampedScale < 0.75 ? 0.5 : 
                         clampedScale > 2 ? 3 : 
                         clampedScale < 1.25 ? 1 : 2;
        
        setState(prev => ({ ...prev, pinchScale: snapScale }));
        pinchApi.start({ scale: snapScale });
        handlers.onPinch?.(snapScale);
      }
    }
  });

  // Touch feedback for buttons
  const buttonGesture = useGesture({
    onPointerDown: ({ currentTarget }) => {
      // Add pressed state
      (currentTarget as HTMLElement).style.transform = 'scale(0.95)';
      (currentTarget as HTMLElement).style.opacity = '0.8';
    },
    onPointerUp: ({ currentTarget }) => {
      // Remove pressed state
      (currentTarget as HTMLElement).style.transform = 'scale(1)';
      (currentTarget as HTMLElement).style.opacity = '1';
    },
    onPointerLeave: ({ currentTarget }) => {
      // Remove pressed state if pointer leaves
      (currentTarget as HTMLElement).style.transform = 'scale(1)';
      (currentTarget as HTMLElement).style.opacity = '1';
    }
  });

  return {
    state,
    actions: {
      showSwipeActions,
      hideSwipeActions,
      enterMultiSelectMode,
      exitMultiSelectMode
    },
    gestures: {
      fileRowGesture,
      pullToRefreshGesture,
      pinchZoomGesture,
      buttonGesture
    },
    springs: {
      swipeSpring,
      pullSpring,
      pinchSpring
    },
    animated
  };
}

// Hook for scroll position detection (for pull-to-refresh)
export function useScrollPosition() {
  const [isAtTop, setIsAtTop] = useState(true);
  const [scrollY, setScrollY] = useState(0);

  const handleScroll = useCallback((event: Event) => {
    const target = event.target as HTMLElement;
    const scrollTop = target.scrollTop;
    
    setScrollY(scrollTop);
    setIsAtTop(scrollTop <= 5);
  }, []);

  return {
    isAtTop,
    scrollY,
    handleScroll
  };
}

// Hook for haptic feedback
export function useHapticFeedback() {
  const light = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(25);
    }
  }, []);

  const medium = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, []);

  const heavy = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  }, []);

  const success = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 25, 50]);
    }
  }, []);

  const error = useCallback(() => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100, 50, 100]);
    }
  }, []);

  return {
    light,
    medium,
    heavy,
    success,
    error
  };
}