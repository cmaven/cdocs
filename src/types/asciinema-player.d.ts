/**
 * asciinema-player.d.ts: asciinema-player 모듈 타입 선언
 * 생성일: 2026-04-08
 */

declare module 'asciinema-player' {
  interface PlayerOptions {
    rows?: number;
    cols?: number;
    autoPlay?: boolean;
    loop?: boolean;
    speed?: number;
    idleTimeLimit?: number;
    theme?: string;
    poster?: string;
    fit?: 'width' | 'height' | 'both' | 'none';
  }

  interface Player {
    dispose(): void;
    play(): void;
    pause(): void;
    getCurrentTime(): number;
  }

  export function create(
    src: string,
    element: HTMLElement,
    options?: PlayerOptions,
  ): Player;
}
