# Agentic RAG for Task Chat - Implementation Report

**Date:** 2026-02-12
**Status:** ✅ IMPLEMENTED

---

## Overview

Successfully implemented Agentic RAG for Task Chat (`comments/route.ts`) using shared tools. Agents in task discussions can now autonomously search project knowledge and answer project-specific questions.

---

## Changes Made

### 1. Created Shared Tools Module (`lib/agents/tools.ts`)

**New File:**
```typescript
import { tool } from "ai";
import { z } from "zod";
import { searchSimilar } from "@/lib/rag/search";

export function createSearchKnowledgeTool(projectId: string) {
  return tool({
    description: "Search project documentation and files for relevant context",
    parameters: z.object({
      query: z.string()
    }),
    execute: async ({ query }) => {
      const results = await searchSimilar(projectId, query, 5);
      return results.map(r => ({
        content: r.content,
        similarity: r.similarity
      }));
    }
  });
}

export function createAgentTools(projectId: string) {
  return {
    searchKnowledge: createSearchKnowledgeTool(projectId)
  };
}
```

**Key Features:**
- Factory function for dynamic projectId binding
- Clean dependency injection
- Extensible for future tools (readFile, writeFile, etc.)
- Single source of truth for all agent tools

---

### 2. Refactored Generate Coding Prompt API

**File:** `app/api/generate-coding-prompt/route.ts`

**Changes:**
1. **Updated Imports:**
   ```typescript
   // Removed:
   import { searchSimilar } from "@/lib/rag/search";
   // Added:
   import { createSearchKnowledgeTool } from "@/lib/agents/tools";
   ```

2. **Removed Local Tool Definition:**
   - Deleted 13 lines of duplicated tool code
   - Replaced with factory call

3. **Updated Tool Creation:**
   ```typescript
   const searchKnowledge = createSearchKnowledgeTool(project.id);
   ```

**Benefits:**
- No code duplication
- Centralized tool management
- Easier to maintain and test

---

### 3. Updated Task Chat API for Agentic RAG

**File:** `app/api/comments/route.ts`

**Changes:**

1. **Updated Imports:**
   ```typescript
   // Removed:
   import { searchRelevantChunks } from "@/lib/rag/search";
   // Added:
   import { createSearchKnowledgeTool } from "@/lib/agents/tools";
   ```

2. **Removed Passive RAG (17 lines):**
   - Deleted hardcoded `ragQuery` construction
   - Removed `searchRelevantChunks()` call
   - Eliminated `filesContext` generation
   - Removed fallback to raw file content

3. **Updated System Prompt:**

   **Before:**
   ```
   Ты — агент роли ${agentRole}. Отвечай как опытный инженер.
   [contextInstruction]
   [Описание задачи...]
   [commentsBlock]
   [filesContext - if available]
   [blockedInstruction]
   ```

   **After:**
   ```
   Ты — участник команды. Твоя роль: ${agentRole}.
   Если вопрос касается проекта, используй инструмент `searchKnowledge`,
   чтобы найти ответ в файлах проекта.
   Отвечай как опытный инженер.
   [contextInstruction]
   [Описание задачи...]
   [commentsBlock]
   [blockedInstruction]
   ```

4. **Added Tool Integration:**
   ```typescript
   const searchKnowledge = createSearchKnowledgeTool(project.id);
   const result = await generateText({
     model: openai(modelId),
     system,
     prompt,
     tools: {
       searchKnowledge
     },
     maxSteps: 5,
     temperature: 0.4,
     maxTokens: 1000,
   });
   ```

---

## Architectural Changes

### Before (Passive RAG in Comments):
1. Server forms `ragQuery` from task.title, task.description, content
2. Hardcoded `searchRelevantChunks(project.id, ragQuery, 5)` call
3. Results mixed into system prompt as `filesContext`
4. Agent receives all data passively
5. Single search, fixed results

### After (Agentic RAG in Comments):
1. Agent sees `searchKnowledge` tool
2. Agent autonomously decides WHEN to search
3. Agent autonomously decides WHAT to search
4. Agent makes up to 5 independent searches
5. Agent uses results appropriately in response

---

## Usage Scenarios

### Scenario 1: Docker Configuration Question
```
User: @backend Как у нас настроен Docker?
Agent: [calls searchKnowledge("Docker configuration")]
       [receives docker-compose.yml content]
       Responds: Docker настроен с использованием pgvector/pgvector:pg16...
```

### Scenario 2: API Endpoints Question
```
User: /ask Какие эндпоинты у нас есть?
Agent: [calls searchKnowledge("API endpoints route")]
       [receives route.ts files]
       Responds: У нас есть эндпоинты: /api/upload, /api/comments,
                 /api/generate-coding-prompt...
```

### Scenario 3: Database Schema Question
```
User: Какие модели есть в БД?
Agent: [calls searchKnowledge("Prisma schema models")]
       [receives schema.prisma content]
       Responds: В схеме Prisma есть модели: Project, Plan, Task,
                 Comment, ProjectFile, FileEmbedding...
```

### Scenario 4: General Question (No Search)
```
User: Когда задача будет готова?
Agent: [does NOT call searchKnowledge]
       Responds: Задача заблокирована зависимостями...
```

---

## Benefits

### For Task Chat:
1. **Autonomous Research:** Agents decide what to search
2. **Multi-step Search:** Up to 5 independent queries
3. **Context-Aware:** Agents use results appropriately
4. **Reduced Noise:** Only relevant information fetched
5. **Natural Conversations:** Project questions feel like talking to a team member

### For Codebase:
1. **No Duplication:** Single tool definition
2. **Clean Architecture:** Separation of tools, search, API logic
3. **Easy Maintenance:** Centralized tool management
4. **Extensibility:** Easy to add new tools (readFile, writeFile, analyzeCode)
5. **Consistent Behavior:** Same Agentic approach across all APIs

---

## Technical Decisions

### 1. Factory Function Pattern ✅
- **Decision:** Use `createSearchKnowledgeTool(projectId)` instead of singleton
- **Reason:** Tool depends on context (projectId)
- **Benefit:** Clean dependency injection, testable, reusable

### 2. Shared Tools Module ✅
- **Decision:** Extract to `lib/agents/tools.ts`
- **Reason:** Avoid duplication across APIs
- **Benefit:** Single source of truth, easier maintenance

### 3. No Similarity Threshold ✅
- **Decision:** Return all results with similarity scores
- **Reason:** Agent decides what's relevant based on context
- **Benefit:** Flexible, agent-driven relevance

### 4. Tool Response Format ✅
- **Decision:** Array of `{content, similarity}` objects
- **Reason:** Exclude `fileId` to avoid information leakage
- **Benefit:** Clean, focused on content

---

## Testing

- ✅ TypeScript compilation passed
- ✅ ESLint validation passed
- ✅ Application running on http://localhost:3002
- ✅ `lib/agents/tools.ts` created successfully
- ✅ `generate-coding-prompt/route.ts` refactored
- ✅ `comments/route.ts` updated for Agentic RAG
- ✅ No code duplication
- ✅ Container recompiled without errors

---

## Next Steps

1. **Test Real Usage:**
   - Create a project with files
   - Ask project-specific questions in task chat
   - Verify agent uses `searchKnowledge` tool

2. **Extend Toolset:**
   - Add `readFile` tool for specific file access
   - Add `writeFile` tool for code modifications
   - Add `analyzeCode` tool for code understanding

3. **Add Tool Logging:**
   - Track which tools are called
   - Monitor query patterns
   - Optimize search strategies

4. **Add Tool Permissions:**
   - Restrict file access based on role
   - Implement read-only/write-only modes
   - Audit tool usage

---

## Files Modified/Created

### Created:
1. `lib/agents/tools.ts` - Shared tools for all agents

### Modified:
2. `app/api/generate-coding-prompt/route.ts` - Use shared tool
3. `app/api/comments/route.ts` - Implement Agentic RAG

---

## Code Statistics

### Lines Changed:
- **Created:** `lib/agents/tools.ts` (34 lines)
- **Modified:** `generate-coding-prompt/route.ts` (-13 lines, +1 line)
- **Modified:** `comments/route.ts` (-17 lines, +14 lines)
- **Net:** +19 lines (with shared abstraction)
- **Code Duplication:** -13 lines (removed from generate-coding-prompt)

### Impact:
- **Better Architecture:** Single source of truth for tools
- **More Capable:** Task chat now has Agentic RAG
- **Maintainable:** Easier to extend with new tools

---

## Status Summary

| Component | Status |
|-----------|--------|
| Shared Tools Module | ✅ CREATED |
| Generate Prompt Refactor | ✅ DONE |
| Comments API Agentic RAG | ✅ DONE |
| TypeScript Validation | ✅ PASS |
| ESLint Validation | ✅ PASS |
| Application Running | ✅ YES |
| Code Duplication Removed | ✅ YES |

**Overall:** ✅ **AGENTIC RAG FOR TASK CHAT SUCCESSFULLY IMPLEMENTED**

---

## Example Conversation Flow

**User:** @backend Как у нас настроен Docker?

**Agent:**
1. Analyzes question: "Docker" is project-specific
2. Calls `searchKnowledge("Docker configuration")`
3. Receives top 5 chunks with similarity scores
4. Selects most relevant chunks (similarity > 0.7)
5. Formulates answer:
   ```
   Docker настроен в docker-compose.yml с использованием:
   - PostgreSQL 16 с расширением pgvector
   - Adminer для управления БД (порт 8081)
   - Приложение на порту 3002
   - База на порту 5433

   Контейнер app монтирует код и node_modules...
   ```

**Result:** User gets accurate, context-aware answer from project files!
