import type { Category, CategoryType } from '@/domain/types';

import { bool, type CategoryRow, toCategory } from '../rows';
import type { SqlExecutor } from '../sqlDatabase';

export async function listCategories(db: SqlExecutor): Promise<Category[]> {
  const rows = await db.all<CategoryRow>(
    'SELECT * FROM categories ORDER BY type, sort_order, name',
  );
  return rows.map(toCategory);
}

export async function insertCategory(db: SqlExecutor, c: Category): Promise<void> {
  await db.run(
    `INSERT INTO categories (id, name, type, icon, color, sort_order, is_archived) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [c.id, c.name, c.type, c.icon, c.color, c.sortOrder, bool(c.isArchived)],
  );
}

export async function updateCategory(db: SqlExecutor, c: Category): Promise<void> {
  await db.run(
    'UPDATE categories SET name = ?, icon = ?, color = ?, sort_order = ?, is_archived = ? WHERE id = ?',
    [c.name, c.icon, c.color, c.sortOrder, bool(c.isArchived), c.id],
  );
}

export async function nextCategorySortOrder(db: SqlExecutor, type: CategoryType): Promise<number> {
  const row = await db.first<{ next: number }>(
    'SELECT IFNULL(MAX(sort_order), -1) + 1 AS next FROM categories WHERE type = ?',
    [type],
  );
  return row?.next ?? 0;
}

export async function reorderCategories(
  db: SqlExecutor,
  orderedIds: readonly string[],
): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    await db.run('UPDATE categories SET sort_order = ? WHERE id = ?', [index, id]);
  }
}
