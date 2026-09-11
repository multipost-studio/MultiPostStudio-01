CREATE TABLE "ConversationPresence" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isTyping" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationPresence_pkey" PRIMARY KEY ("conversationId","userId")
);

ALTER TABLE "ConversationPresence" ADD CONSTRAINT "ConversationPresence_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationPresence" ADD CONSTRAINT "ConversationPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
