import { Server as HttpServer } from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import { prisma as prismaClient } from '../lib/prisma.js';
import { filterProfanity } from '../utils/profanity-filter.js';

const prisma = prismaClient as any;

let io: IOServer | null = null;

interface JoinPayload {
  storeSlug: string;
  sessionId: string;
}

interface SendMessagePayload {
  content: string;
}

interface SocketData {
  storeId?: string;
  storeSlug?: string;
  sessionId?: string;
  participantId?: string;
  nickname?: string;
  profanityFilterEnabled?: boolean;
}

function roomName(storeId: string) {
  return `store:${storeId}`;
}

export function initChatSocket(server: HttpServer) {
  io = new IOServer(server, {
    path: '/socket.io',
    cors: {
      origin: true, // Express CORS가 먼저 처리하므로 여기선 관대하게
      credentials: true,
    },
  });

  const chat = io.of('/chat');

  chat.on('connection', (socket: Socket) => {
    const data: SocketData = {};
    (socket as any).data = data;

    socket.on('join', async (payload: JoinPayload) => {
      try {
        if (!payload?.storeSlug || !payload?.sessionId) {
          socket.emit('error', { message: 'invalid join payload' });
          return;
        }

        const store = await prisma.store.findUnique({
          where: { slug: payload.storeSlug },
          select: { id: true, slug: true, chatSetting: true },
        });
        if (!store) {
          socket.emit('error', { message: 'store not found' });
          return;
        }

        const participant = await prisma.chatParticipant.findUnique({
          where: { storeId_sessionId: { storeId: store.id, sessionId: payload.sessionId } },
        });
        if (!participant) {
          socket.emit('error', { message: 'participant not found. join via REST first' });
          return;
        }

        data.storeId = store.id;
        data.storeSlug = store.slug;
        data.sessionId = payload.sessionId;
        data.participantId = participant.id;
        data.nickname = participant.nickname;
        data.profanityFilterEnabled = store.chatSetting?.profanityFilterEnabled !== false;

        socket.join(roomName(store.id));

        // lastSeenAt 업데이트 (fire-and-forget)
        prisma.chatParticipant
          .update({ where: { id: participant.id }, data: { lastSeenAt: new Date() } })
          .catch(() => {});

        const count = await countRoomParticipants(store.id);
        chat.to(roomName(store.id)).emit('participants:count', { count });

        socket.emit('joined', { participantId: participant.id, nickname: participant.nickname });
      } catch (err) {
        console.error('[ChatSocket] join error:', err);
        socket.emit('error', { message: 'join failed' });
      }
    });

    socket.on('message:send', async (payload: SendMessagePayload) => {
      try {
        if (!data.storeId || !data.participantId || !data.nickname) {
          socket.emit('error', { message: 'not joined' });
          return;
        }
        const rawContent = (payload?.content ?? '').toString().trim();
        if (!rawContent || rawContent.length > 500) {
          socket.emit('error', { message: 'invalid content' });
          return;
        }

        const content = data.profanityFilterEnabled ? filterProfanity(rawContent) : rawContent;

        const msg = await prisma.chatMessage.create({
          data: {
            storeId: data.storeId,
            senderType: 'USER',
            participantId: data.participantId,
            nickname: data.nickname,
            content,
          },
        });

        chat.to(roomName(data.storeId)).emit('message:new', {
          id: msg.id,
          senderType: msg.senderType,
          nickname: msg.nickname,
          content: msg.content,
          createdAt: msg.createdAt.toISOString(),
        });
      } catch (err) {
        console.error('[ChatSocket] message:send error:', err);
        socket.emit('error', { message: 'send failed' });
      }
    });

    socket.on('disconnect', async () => {
      if (!data.storeId) return;
      try {
        const count = await countRoomParticipants(data.storeId);
        chat.to(roomName(data.storeId)).emit('participants:count', { count });
      } catch {}
    });
  });

  console.log('[ChatSocket] /chat namespace initialized');
}

async function countRoomParticipants(storeId: string): Promise<number> {
  if (!io) return 0;
  const chat = io.of('/chat');
  const sockets = await chat.in(roomName(storeId)).fetchSockets();
  return sockets.length;
}

// 외부 브로드캐스트 헬퍼 (routes에서 사용)
export function broadcastStoreMessage(storeId: string, message: {
  id: string;
  senderType: string;
  nickname: string;
  content: string;
  createdAt: string;
}) {
  if (!io) return;
  io.of('/chat').to(roomName(storeId)).emit('message:new', message);
}

export function broadcastPost(storeId: string, post: {
  id: string;
  title: string | null;
  content: string;
  imageUrl: string | null;
  isPinned: boolean;
  createdAt: string;
}) {
  if (!io) return;
  io.of('/chat').to(roomName(storeId)).emit('post:new', post);
}

export function broadcastPostUpdate(storeId: string, post: {
  id: string;
  title: string | null;
  content: string;
  imageUrl: string | null;
  isPinned: boolean;
}) {
  if (!io) return;
  io.of('/chat').to(roomName(storeId)).emit('post:update', post);
}

export function broadcastPostDelete(storeId: string, postId: string) {
  if (!io) return;
  io.of('/chat').to(roomName(storeId)).emit('post:delete', { id: postId });
}

export function broadcastMessageDelete(storeId: string, messageId: string) {
  if (!io) return;
  io.of('/chat').to(roomName(storeId)).emit('message:delete', { id: messageId });
}

export function broadcastRoomReset(storeId: string, welcomeMessage: string | null) {
  if (!io) return;
  io.of('/chat').to(roomName(storeId)).emit('room:reset', { welcomeMessage });
}
