import { nanoid } from 'nanoid';
import {
  Room as RoomShared,
  PlayerSlot,
  TEAM_COLORS,
  WHEEL_POS,
  GamePhase,
} from '@wheel-race/shared';

export type Room = RoomShared;

const rooms = new Map<string, Room>();

// 짧고 헷갈리지 않는 방 코드 알파벳 (O, 0, I, 1 등 제외)
function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function makeEmptySlots(): PlayerSlot[] {
  const slots: PlayerSlot[] = [];
  for (const team of TEAM_COLORS) {
    for (const wheel of WHEEL_POS) {
      slots.push({
        slotToken: nanoid(12),
        team,
        wheel,
        joined: false,
      });
    }
  }
  return slots;
}

export function createRoom(): Room {
  const code = generateRoomCode();
  const room: Room = {
    code,
    createdAt: Date.now(),
    hostToken: nanoid(20),
    phase: 'lobby',
    slots: makeEmptySlots(),
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function findRoomBySlotToken(slotToken: string): { room: Room; slot: PlayerSlot } | undefined {
  for (const room of rooms.values()) {
    const slot = room.slots.find((s) => s.slotToken === slotToken);
    if (slot) return { room, slot };
  }
  return undefined;
}

export function setPhase(room: Room, phase: GamePhase) {
  room.phase = phase;
}

export function joinSlot(slotToken: string, name?: string): { room: Room; slot: PlayerSlot } | undefined {
  const found = findRoomBySlotToken(slotToken);
  if (!found) return undefined;
  found.slot.joined = true;
  if (name) found.slot.name = name;
  return found;
}

export function summary(room: Room) {
  return {
    code: room.code,
    phase: room.phase,
    joinedCount: room.slots.filter((s) => s.joined).length,
  };
}

export function allRooms(): Iterable<Room> {
  return rooms.values();
}
