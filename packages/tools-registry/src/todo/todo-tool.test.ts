/**
 * TodoWrite Tool Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  createCreateTodoTool,
  createUpdateTodoTool,
  createListTodosTool,
  createDeleteTodoTool,
  todoStore,
  type Todo,
} from './todo-tool.js';

describe('TodoWrite Tool', () => {
  beforeEach(() => {
    // Clear the store before each test
    todoStore.clearTodos();
  });

  describe('createCreateTodoTool', () => {
    it('should create a todo with correct structure', async () => {
      const tool = createCreateTodoTool();
      const result = await tool.invoke({
        content: 'Test todo item',
        priority: 'high',
      });

      expect(result).toContain('Todo created');
      expect(result).toContain('Test todo item');
      expect(result).toContain('high');
    });

    it('should include notes when provided', async () => {
      const tool = createCreateTodoTool();
      const result = await tool.invoke({
        content: 'Test todo with notes',
        notes: 'Additional context here',
      });

      expect(result).toContain('**Notes:**');
    });
  });

  describe('createUpdateTodoTool', () => {
    it('should update todo status', async () => {
      // First create a todo
      const createTool = createCreateTodoTool();
      const createResult = await createTool.invoke({ content: 'Test todo' });

      // Extract the todo ID
      const idMatch = createResult.match(/\*\*ID:\*\* ([a-f0-9-]+)/);
      expect(idMatch).toBeTruthy();

      // Update the todo
      const updateTool = createUpdateTodoTool();
      const updateResult = await updateTool.invoke({
        todo_id: idMatch![1],
        status: 'completed',
      });

      expect(updateResult).toContain('completed');
    });

    it('should return error for non-existent todo', async () => {
      const tool = createUpdateTodoTool();
      const result = await tool.invoke({
        todo_id: 'non-existent-id',
        status: 'completed',
      });

      expect(result).toContain('not found');
    });
  });

  describe('createListTodosTool', () => {
    it('should list all todos', async () => {
      // Create some todos
      const createTool = createCreateTodoTool();
      await createTool.invoke({ content: 'Todo 1', priority: 'high' });
      await createTool.invoke({ content: 'Todo 2', priority: 'low' });

      const listTool = createListTodosTool();
      const result = await listTool.invoke({});

      expect(result).toContain('Todo 1');
      expect(result).toContain('Todo 2');
      expect(result).toContain('2 pending');
    });

    it('should show empty list when no todos', async () => {
      const tool = createListTodosTool();
      const result = await tool.invoke({});

      expect(result).toContain('No todos');
    });
  });

  describe('createDeleteTodoTool', () => {
    it('should delete a todo', async () => {
      // Create a todo
      const createTool = createCreateTodoTool();
      const createResult = await createTool.invoke({ content: 'To be deleted' });

      // Extract the ID
      const idMatch = createResult.match(/\*\*ID:\*\* ([a-f0-9-]+)/);
      expect(idMatch).toBeTruthy();

      // Delete it
      const deleteTool = createDeleteTodoTool();
      const deleteResult = await deleteTool.invoke({
        todo_id: idMatch![1],
      });

      expect(deleteResult).toContain('deleted');
    });
  });

  describe('TodoStore', () => {
    it('should track todo statistics', () => {
      todoStore.createTodo('Todo 1');
      todoStore.createTodo('Todo 2');

      const stats = todoStore.getStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
    });

    it('should filter todos by status', async () => {
      const createTool = createCreateTodoTool();
      await createTool.invoke({ content: 'Pending todo', status: 'pending' });

      // We need to manually update one to test filtering
      const todo = todoStore.createTodo('Completed todo');
      todoStore.updateTodo(todo.id, { status: 'completed' });

      const listTool = createListTodosTool();
      const completedResult = await listTool.invoke({ status: 'completed' });
      expect(completedResult).toContain('Completed todo');
      expect(completedResult).not.toContain('Pending todo');
    });
  });
});
