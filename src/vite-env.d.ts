/// <reference types="vite/client" />

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

declare global {
  interface Window {
    __zelle?: {
      ready: boolean;
      setTime: (time: number) => void;
      getTime: () => number;
      setPlaying: (playing: boolean) => void;
      isPlaying: () => boolean;
      setSpeed: (speed: number) => void;
      getSpeed: () => number;
      resetView: () => void;
      setCinema: (on: boolean) => void;
      getOpacity: () => number;
      isWorkpieceVisible: () => boolean;
      getWorkpieceCenter: () => Vec3;
      getLocalQuaternion: (name: string) => { x: number; y: number; z: number; w: number } | null;
      getLocalPosition: (name: string) => Vec3 | null;
      getWorldPosition: (name: string) => Vec3 | null;
      getCamera: () => { position: Vec3; target: Vec3 };
      getClip: () => { name: string; duration: number; tracks: string[] };
      parentChain: (name: string) => string[];
    };
  }
}

export {};
