/**
 * TodoWrite Tool - Task List Management
 *
 * Provides a structured todo list for tracking tasks:
 * - create_todo: Create a new todo item
 * - update_todo: Update todo status/content
 * - list_todos: List all todos
 * - delete_todo: Delete a todo item
 */

import { z } from 'zod';
import { PiTool } from '../../runtime/pi/tool.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

export interface Todo {
  id: string;
  content: string;
  status: TodoStatus;
  priority?: 'low' | 'medium' | 'high';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// In-memory Todo Store
// ============================================================================

class TodoStore {
  private todos: Map<string, Todo> = new Map();
  private planTodos: Map<string, Map<string, Todo>> = new Map();

  createTodo(content: string, planId?: string, priority?: 'low' | 'medium' | 'high', notes?: string): Todo {
    const todo: Todo = {
      id: randomUUID(),
      content,
      status: 'pending',
      priority: priority ?? 'medium',
      notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (planId) {
      if (!this.planTodos.has(planId)) {
        this.planTodos.set(planId, new Map());
      }
      this.planTodos.get(planId)!.set(todo.id, todo);
    } else {
      this.todos.set(todo.id, todo);
    }

    return todo;
  }

  updateTodo(todoId: string, updates: Partial<Pick<Todo, 'content' | 'status' | 'priority' | 'notes'>>, planId?: string): boolean {
    const todoMap = planId ? this.planTodos.get(planId) : this.todos;
    if (!todoMap) return false;

    const todo = todoMap.get(todoId);
    if (!todo) return false;

    Object.assign(todo, updates, { updatedAt: new Date().toISOString() });
    return true;
  }

  getTodo(todoId: string, planId?: string): Todo | undefined {
    const todoMap = planId ? this.planTodos.get(planId) : this.todos;
    return todoMap?.get(todoId);
  }

  listTodos(planId?: string): Todo[] {
    const todoMap = planId ? this.planTodos.get(planId) : this.todos;
    if (!todoMap) return [];
    return Array.from(todoMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  deleteTodo(todoId: string, planId?: string): boolean {
    const todoMap = planId ? this.planTodos.get(planId) : this.todos;
    if (!todoMap) return false;
    return todoMap.delete(todoId);
  }

  clearTodos(planId?: string): void {
    if (planId) {
      this.planTodos.delete(planId);
    } else {
      this.todos.clear();
    }
  }

  getStats(planId?: string): { total: number; pending: number; inProgress: number; completed: number; failed: number } {
    const todos = this.listTodos(planId);
    return {
      total: todos.length,
      pending: todos.filter(t => t.status === 'pending').length,
      inProgress: todos.filter(t => t.status === 'in_progress').length,
      completed: todos.filter(t => t.status === 'completed').length,
      failed: todos.filter(t => t.status === 'failed' || t.status === 'cancelled').length,
    };
  }
}

// Global store
const todoStore = new TodoStore();

// ============================================================================
// Tool Schemas
// ============================================================================

export const CREATE_TODO_DESCRIPTION = `
Create a new todo item for tracking tasks.

## When to Use

- Track a task or action item
- Break down work into trackable items
- Keep track of follow-up actions

## Options

- **content**: What needs to be done (required)
- **priority**: low | medium | high (default: medium)
- **notes**: Additional context or details (optional)
- **plan_id**: Associate with a plan (optional)

## Example

Create a high priority todo:
- content: "Review PR #123 for security issues"
- priority: "high"
- notes: "Check for SQL injection vulnerabilities"
`;

export const CreateTodoSchema = z.object({
  content: z.string().describe('What needs to be done'),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium').describe('Priority level'),
  notes: z.string().optional().describe('Additional context or details'),
  plan_id: z.string().optional().describe('Associate with a plan'),
});

export const UPDATE_TODO_DESCRIPTION = `
Update an existing todo item.

## When to Use

- Mark a todo as completed
- Change status when working on it
- Update the content or notes

## Options

- **todo_id**: The todo ID to update (required)
- **status**: New status (optional)
- **content**: Updated content (optional)
- **priority**: Changed priority (optional)
- **notes**: Updated notes (optional)
- **plan_id**: Plan ID if todo is associated with a plan (optional)

## Status Values

- **pending**: Not started
- **in_progress**: Currently working on
- **completed**: Done successfully
- **failed**: Failed to complete
- **cancelled**: Cancelled

## Example

Mark todo as completed:
- todo_id: "todo-uuid-123"
- status: "completed"
`;

export const UpdateTodoSchema = z.object({
  todo_id: z.string().describe('The todo ID to update'),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).optional().describe('New status'),
  content: z.string().optional().describe('Updated content'),
  priority: z.enum(['low', 'medium', 'high']).optional().describe('Changed priority'),
  notes: z.string().optional().describe('Updated notes'),
  plan_id: z.string().optional().describe('Plan ID if todo is associated with a plan'),
});

export const LIST_TODOS_DESCRIPTION = `
List all todos with their status and priority.

## When to Use

- Review outstanding tasks
- Check overall progress
- See all tracked items

## Options

- **plan_id**: Filter by plan (optional)
- **status**: Filter by status (optional)

## Example

List all pending todos:
- status: "pending"
`;

export const ListTodosSchema = z.object({
  plan_id: z.string().optional().describe('Filter by plan'),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).optional().describe('Filter by status'),
});

export const DELETE_TODO_DESCRIPTION = `
Delete a todo item.

## When to Use

- Remove an item that's no longer relevant
- Clear completed items
- Clean up the todo list

## Options

- **todo_id**: The todo ID to delete (required)
- **plan_id**: Plan ID if todo is associated with a plan (optional)
`;

export const DeleteTodoSchema = z.object({
  todo_id: z.string().describe('The todo ID to delete'),
  plan_id: z.string().optional().describe('Plan ID if todo is associated with a plan'),
});

// ============================================================================
// Tool Factories
// ============================================================================

/**
 * Create the CreateTodo tool
 */
export function createCreateTodoTool(): PiTool {
  return new PiTool({
    name: 'create_todo',
    description: CREATE_TODO_DESCRIPTION,
    schema: CreateTodoSchema,
    async func(input): Promise<string> {
      const todo = todoStore.createTodo(input.content, input.plan_id, input.priority, input.notes);
      const stats = todoStore.getStats(input.plan_id);

      return `Todo created.

**ID:** ${todo.id}
**Content:** ${todo.content}
**Priority:** ${todo.priority}
${todo.notes ? `**Notes:** ${todo.notes}\n` : ''}
**Status:** pending

Stats: ${stats.pending} pending, ${stats.inProgress} in progress, ${stats.completed} done`;
    },
  });
}

/**
 * Create the UpdateTodo tool
 */
export function createUpdateTodoTool(): PiTool {
  return new PiTool({
    name: 'update_todo',
    description: UPDATE_TODO_DESCRIPTION,
    schema: UpdateTodoSchema,
    async func(input): Promise<string> {
      const success = todoStore.updateTodo(
        input.todo_id,
        {
          content: input.content,
          status: input.status,
          priority: input.priority,
          notes: input.notes,
        },
        input.plan_id
      );

      if (!success) {
        return `Todo not found: ${input.todo_id}`;
      }

      const todo = todoStore.getTodo(input.todo_id, input.plan_id);
      const stats = todoStore.getStats(input.plan_id);

      return `Todo updated.

**ID:** ${todo!.id}
**Content:** ${todo!.content}
**Priority:** ${todo!.priority}
**Status:** ${todo!.status}
${todo!.notes ? `**Notes:** ${todo!.notes}\n` : ''}

Stats: ${stats.pending} pending, ${stats.inProgress} in progress, ${stats.completed} done`;
    },
  });
}

/**
 * Create the ListTodos tool
 */
export function createListTodosTool(): PiTool {
  return new PiTool({
    name: 'list_todos',
    description: LIST_TODOS_DESCRIPTION,
    schema: ListTodosSchema,
    async func(input): Promise<string> {
      let todos = todoStore.listTodos(input.plan_id);

      // Filter by status if specified
      if (input.status) {
        todos = todos.filter(t => t.status === input.status);
      }

      const stats = todoStore.getStats(input.plan_id);
      const lines: string[] = [];

      lines.push(`**Todo List**${input.plan_id ? ` (Plan: ${input.plan_id})` : ''}`);
      lines.push('');
      lines.push(`**Stats:** ${stats.pending} pending, ${stats.inProgress} in progress, ${stats.completed} done, ${stats.failed} failed`);
      lines.push('');
      lines.push('**Items:**');

      if (todos.length === 0) {
        lines.push('  (No todos)');
      } else {
        todos.forEach((todo) => {
          const statusIcon = getStatusIcon(todo.status);
          const priorityIcon = getPriorityIcon(todo.priority ?? 'medium');
          const planNote = todo.notes ? `\n    Notes: ${todo.notes}` : '';
          lines.push(`  ${statusIcon} ${priorityIcon} ${todo.content}${planNote}`);
          lines.push(`    ID: ${todo.id} | Status: ${todo.status} | Updated: ${formatDate(todo.updatedAt)}`);
        });
      }

      return lines.join('\n');
    },
  });
}

/**
 * Create the DeleteTodo tool
 */
export function createDeleteTodoTool(): PiTool {
  return new PiTool({
    name: 'delete_todo',
    description: DELETE_TODO_DESCRIPTION,
    schema: DeleteTodoSchema,
    async func(input): Promise<string> {
      const todo = todoStore.getTodo(input.todo_id, input.plan_id);
      const success = todoStore.deleteTodo(input.todo_id, input.plan_id);

      if (!success) {
        return `Todo not found: ${input.todo_id}`;
      }

      const stats = todoStore.getStats(input.plan_id);

      return `Todo deleted.

**Removed:** ${todo?.content ?? input.todo_id}

Stats: ${stats.pending} pending, ${stats.inProgress} in progress, ${stats.completed} done`;
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusIcon(status: TodoStatus): string {
  switch (status) {
    case 'pending': return '○';
    case 'in_progress': return '◐';
    case 'completed': return '✅';
    case 'failed': return '❌';
    case 'cancelled': return '🚫';
    default: return '○';
  }
}

function getPriorityIcon(priority: 'low' | 'medium' | 'high'): string {
  switch (priority) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '🟡';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// Exports
// ============================================================================

export { todoStore };
