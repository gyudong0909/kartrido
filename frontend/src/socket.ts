import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@wheel-race/shared';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
});
